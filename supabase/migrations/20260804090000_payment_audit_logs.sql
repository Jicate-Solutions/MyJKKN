-- payment_audit_logs — dedicated audit trail for payment security events.
--
-- WHY A NEW TABLE (production incident, 2026-07-27):
-- PaymentAuditService wrote every payment security event to user_activity_logs.
-- That table's user_id is NOT NULL with an FK to profiles(id), but the service
-- passes learners_profiles.id (0 of 6,973 learner ids exist in profiles) and
-- falls back to an all-zeros "system" id that does not exist either. So EVERY
-- payment audit insert failed with 23503 and was swallowed by the service's
-- catch block. Net effect: 0 audit rows ever written, and therefore no forensic
-- trail at all when a captured Razorpay payment silently failed to finalize.
--
-- A second, independent failure on the same path: user_activity_logs.ip_address
-- is inet, but the payment callback writes the literal string 'unknown' when it
-- cannot determine the client IP → 22P02.
--
-- Payment events are also raised from contexts with NO user at all (Razorpay
-- webhooks, the razorpay-late-auth reconciliation cron), so an actor FK is wrong
-- by design here. This table deliberately carries NO foreign keys: an audit
-- write must never be rejected because a referenced row is missing.

create table if not exists public.payment_audit_logs (
  id                uuid primary key default gen_random_uuid(),
  event_type        text not null,
  transaction_id    text not null,
  student_id        uuid,
  institution_id    uuid,
  expected_amount   numeric,
  actual_amount     numeric,
  client_status     text,
  server_status     text,
  description       text,
  ip_address        text,
  user_agent        text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on table public.payment_audit_logs is
  'Payment security audit trail (verification, manipulation, replay, webhook, receipt). No FKs by design: an audit write must never fail.';

create index if not exists payment_audit_logs_transaction_id_idx
  on public.payment_audit_logs (transaction_id);
create index if not exists payment_audit_logs_created_at_idx
  on public.payment_audit_logs (created_at desc);
create index if not exists payment_audit_logs_event_type_idx
  on public.payment_audit_logs (event_type, created_at desc);

-- RLS on with no policies: service_role bypasses RLS and is the only writer.
-- Nothing client-side reads this table; the REVOKE is defence in depth so a
-- future accidental policy cannot expose it to anon/authenticated.
alter table public.payment_audit_logs enable row level security;
revoke all on public.payment_audit_logs from anon, authenticated;
