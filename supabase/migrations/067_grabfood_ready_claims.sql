-- A claim is durable before any Mark Ready request leaves the server. A
-- pending claim is deliberately not automatically retried after a crash.
CREATE TABLE public.grabfood_ready_claims (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('pending', 'sent', 'failed', 'uncertain')),
  claim_token uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grabfood_ready_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_grabfood_ready_claims ON public.grabfood_ready_claims
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Preserve the once-only history from deployments that used order_events.
-- A success always wins over earlier uncertain/failed attempts.
INSERT INTO public.grabfood_ready_claims (order_id, state, claim_token, updated_at)
SELECT order_id,
  CASE WHEN bool_or(event_type = 'grabfood_ready_sent') THEN 'sent'
       WHEN bool_or(event_type = 'grabfood_ready_uncertain') THEN 'uncertain'
       ELSE 'failed' END,
  gen_random_uuid(), now()
FROM public.order_events
WHERE event_type IN ('grabfood_ready_sent', 'grabfood_ready_uncertain', 'grabfood_ready_failed')
GROUP BY order_id;
