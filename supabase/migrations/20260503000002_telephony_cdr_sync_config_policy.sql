-- ============================================================================
-- Migration: 20260503000002_telephony_cdr_sync_config_policy
-- Phase: Telephony policy-as-config-row fan-out (Agent 3 / 3)
-- ============================================================================
-- Migrates the two hardcoded CDR-sync windowing constants in
--   lib/services/telephony/inbound-call-sync-service.ts
--     - default_lookback_days (was hardcoded 7-day default first-sync window)
--     - chunk_max_days        (was hardcoded 30-day chunk size for Exotel CDR
--                              pages; Exotel max is 31 days)
-- into a single Director-tunable platform_policies row.
--
-- Why a single object row (not two number rows): both values describe the same
-- behavior — how the cron carves time when pulling Exotel CDRs — and they are
-- always read together at sync start. Treating them as one config object keeps
-- the admin UI affordance simple (one card, two numeric fields) and avoids the
-- N+1 RPC reads pattern. Mirrors `telephony.exovoice.config` (Agent 1) shape.
--
-- Policy key: telephony.cdr_sync.config
-- Scope:      global (single row, scope_id NULL)
-- Data type:  object
-- Initial value: {"default_lookback_days": 7, "chunk_max_days": 30}
--
-- Behavior unchanged at deploy: defaults match the prior hardcoded values.
-- Director can tweak either value via the platform_policies admin UI — no deploy.
--
-- IDEMPOTENCY: WHERE NOT EXISTS guard (mirrors the 12+ policies seeded under
--              the substrate convention). Safe to re-apply.
-- REVERSIBILITY: DELETE the row OR set is_active=false; service falls back to
--                hardcoded defaults baked into getPolicy<T>() callers.
-- ============================================================================

INSERT INTO public.platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  is_system,
  is_active
)
SELECT * FROM (VALUES
  (
    'telephony.cdr_sync.config',
    'global',
    NULL::uuid,
    '{"default_lookback_days": 7, "chunk_max_days": 30}'::jsonb,
    'CDR sync windowing for InboundCallSyncService. default_lookback_days = first-sync historical window when no last_synced_call_date cursor exists. chunk_max_days = Exotel CDR page chunk size (Exotel max is 31). Director-tweakable via platform_policies admin UI — no deploy needed.',
    'object',
    true,
    true
  )
) AS r(
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  is_system,
  is_active
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.platform_policies p
  WHERE p.policy_key = r.policy_key
    AND p.scope_type = r.scope_type
    AND COALESCE(p.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(r.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
