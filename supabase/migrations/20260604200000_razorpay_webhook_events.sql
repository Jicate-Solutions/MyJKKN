-- Inbound Razorpay webhook event log.
--
-- This is the INBOUND payment-webhook audit trail. It is intentionally separate
-- from public.webhook_logs, which is the unrelated OUTBOUND user/application
-- sync-webhook log (table_name / record_id / http_status shape). The Razorpay
-- dispatcher previously wrote to webhook_logs and the insert silently failed on
-- the schema mismatch; this table is its correct target.

CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL DEFAULT 'razorpay',
  event_type   text NOT NULL,
  raw_payload  jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_received_at
  ON public.razorpay_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_event_type
  ON public.razorpay_webhook_events (event_type);

-- Service-role only: the webhook route dispatches with the service-role client,
-- which bypasses RLS. Enabling RLS with no policies blocks anon/authenticated.
ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.razorpay_webhook_events IS
  'Inbound Razorpay webhook event audit log (written by dispatchRazorpayWebhook via service role). Separate from webhook_logs (outbound sync log).';
