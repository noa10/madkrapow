-- Migration: daily-unique display codes for orders (MK-NNN with length expansion)
--
-- Design:
--   * Codes are unique per Asia/Kuala_Lumpur calendar day, stored as a per-day string.
--   * Base format is "MK-NNN" (3 digits, 0–999). When a day's 3-digit pool fills up, the
--     generator expands to MK-NNNN, then MK-NNNNN, etc. Expansion is automatic and
--     reconsidered on every INSERT, so the prior day's expansion never leaks into today.
--   * Storage is a thin reservation table `order_display_codes(code_date, code)` with
--     a UNIQUE constraint — that constraint is the atomic check-and-set. Concurrent
--     inserts that race on the same value collide on the unique key; the loser retries.
--   * Orders get a `display_code TEXT` column populated by a BEFORE INSERT trigger
--     calling `reserve_order_display_code(today_kl)`. Application code doesn't need to
--     generate or know the format.
--
-- Rollout:
--   * Existing rows are backfilled using the legacy FNV-1a daily hash logic so the
--     stored code matches whatever the UI would have rendered on their creation day.
--   * TTL-driven cleanup keeps the reservation table small: any code older than 3 days
--     is safe to purge (the day it was unique for has long since rolled over).

CREATE TABLE IF NOT EXISTS order_display_codes (
    code_date DATE NOT NULL,
    code      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (code_date, code)
);

CREATE INDEX IF NOT EXISTS idx_order_display_codes_created_at
    ON order_display_codes (created_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_code TEXT;

-- Helper: today's KL calendar date, used by the trigger default.
CREATE OR REPLACE FUNCTION kl_today()
RETURNS DATE
LANGUAGE SQL
STABLE
AS $$
    SELECT (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
$$;

-- Core generator. Returns the reserved MK-NNN code for the given date.
-- Grows the digit length whenever the current-length pool is exhausted for that day.
CREATE OR REPLACE FUNCTION reserve_order_display_code(target_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    digit_length INTEGER := 3;
    max_digit_length INTEGER := 10; -- MK-9999999999; 10B codes/day upper bound
    pool_size BIGINT;
    used_at_current INTEGER;
    attempts INTEGER;
    max_attempts INTEGER;
    candidate TEXT;
    random_int BIGINT;
BEGIN
    LOOP
        -- How many codes exist at this length for target_date already?
        SELECT COUNT(*) INTO used_at_current
        FROM order_display_codes
        WHERE code_date = target_date
          AND length(code) = 3 + digit_length; -- 'MK-' is 3 chars

        pool_size := power(10, digit_length)::bigint;

        IF used_at_current >= pool_size THEN
            -- This length is exhausted for the day; expand and retry.
            RAISE WARNING 'order display code pool exhausted for % at length %; expanding',
                target_date, digit_length;
            digit_length := digit_length + 1;
            IF digit_length > max_digit_length THEN
                RAISE EXCEPTION 'order display code length exceeded maximum (%) for %',
                    max_digit_length, target_date;
            END IF;
            CONTINUE;
        END IF;

        -- Bounded random probing. Cap attempts so a nearly-full pool still expands
        -- promptly rather than spinning forever on collisions.
        max_attempts := LEAST(pool_size::int * 2, 2000);
        attempts := 0;

        WHILE attempts < max_attempts LOOP
            random_int := floor(random() * pool_size)::bigint;
            candidate := 'MK-' || lpad(random_int::text, digit_length, '0');

            BEGIN
                INSERT INTO order_display_codes (code_date, code)
                VALUES (target_date, candidate);
                RETURN candidate;
            EXCEPTION WHEN unique_violation THEN
                attempts := attempts + 1;
            END;
        END LOOP;

        -- Too many collisions at this length — expand.
        digit_length := digit_length + 1;
        IF digit_length > max_digit_length THEN
            RAISE EXCEPTION 'order display code length exceeded maximum (%) for %',
                max_digit_length, target_date;
        END IF;
    END LOOP;
END;
$$;

-- Trigger: assign a display_code on INSERT if not already set.
CREATE OR REPLACE FUNCTION orders_assign_display_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.display_code IS NULL THEN
        NEW.display_code := reserve_order_display_code(kl_today());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_assign_display_code ON orders;
CREATE TRIGGER trg_orders_assign_display_code
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION orders_assign_display_code();

-- Backfill existing rows using the legacy FNV-1a daily hash (MK-NNN) so the stored
-- value matches whatever the UI would have shown on the order's creation day.
-- This does NOT populate order_display_codes — old codes are frozen per-row and the
-- reservation table only needs to guard new inserts.
CREATE OR REPLACE FUNCTION legacy_fnv1a_display_code(order_id TEXT, code_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    input TEXT := order_id || to_char(code_date, 'YYYY-MM-DD');
    hash BIGINT := x'811c9dc5'::bigint;
    fnv_prime BIGINT := x'01000193'::bigint;
    mask BIGINT := x'FFFFFFFF'::bigint;
    i INTEGER;
BEGIN
    FOR i IN 1 .. length(input) LOOP
        hash := (hash # ascii(substr(input, i, 1)))::bigint;
        hash := (hash * fnv_prime) & mask;
    END LOOP;
    RETURN 'MK-' || lpad((hash % 1000)::text, 3, '0');
END;
$$;

UPDATE orders
SET display_code = legacy_fnv1a_display_code(
        id::text,
        (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    )
WHERE display_code IS NULL;

ALTER TABLE orders ALTER COLUMN display_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_display_code ON orders (display_code);

-- Optional: cleanup helper. Safe to schedule via pg_cron every day.
CREATE OR REPLACE FUNCTION cleanup_order_display_codes(retention_days INTEGER DEFAULT 3)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM order_display_codes
    WHERE code_date < (kl_today() - retention_days);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
