-- Indexes for customer_addresses and customer_contacts (fixes slow RLS + queries)

-- customer_id indexes (used by fetchProfile queries and RLS policy subqueries)
CREATE INDEX idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX idx_customer_contacts_customer_id ON customer_contacts(customer_id);

-- is_default indexes (used by ORDER BY is_default DESC and set-default queries)
CREATE INDEX idx_customer_addresses_is_default ON customer_addresses(customer_id, is_default) WHERE is_default = true;
CREATE INDEX idx_customer_contacts_is_default ON customer_contacts(customer_id, is_default) WHERE is_default = true;

-- ── RPC: Atomic set-default for addresses ──────────────────────────
CREATE OR REPLACE FUNCTION set_default_address(p_customer_id UUID, p_address_id UUID)
RETURNS void AS $$
BEGIN
  -- Unset current default(s) for this customer
  UPDATE customer_addresses
  SET is_default = false, updated_at = NOW()
  WHERE customer_id = p_customer_id AND is_default = true;

  -- Set the new default
  UPDATE customer_addresses
  SET is_default = true, updated_at = NOW()
  WHERE id = p_address_id AND customer_id = p_customer_id;

  -- Safety: if no row was updated (wrong address_id/customer_id pair), raise
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Address % not found for customer %', p_address_id, p_customer_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: Atomic set-default for contacts ────────────────────────────
CREATE OR REPLACE FUNCTION set_default_contact(p_customer_id UUID, p_contact_id UUID)
RETURNS void AS $$
BEGIN
  -- Unset current default(s) for this customer
  UPDATE customer_contacts
  SET is_default = false, updated_at = NOW()
  WHERE customer_id = p_customer_id AND is_default = true;

  -- Set the new default
  UPDATE customer_contacts
  SET is_default = true, updated_at = NOW()
  WHERE id = p_contact_id AND customer_id = p_customer_id;

  -- Safety: if no row was updated (wrong contact_id/customer_id pair), raise
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found for customer %', p_contact_id, p_customer_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
