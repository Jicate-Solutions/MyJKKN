-- ============================================================================
-- Premium Stay Phase 1 — platform_policies seed (7 rows)
-- ============================================================================
-- Created: 2026-05-16
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decisions #3, #6b, #7, #8 family)
--
-- 7 policy keys covering the runtime-tweakable knobs for premium SKU:
--   hostel.premium.invite_window_hours         (int, default 48)
--   hostel.premium.invite_max_retries          (int, default 2)
--   hostel.premium.hold_window_minutes         (int, default 15)
--   hostel.premium.payment_mode                (text enum: atomic | hold_24h | pay_at_intake)
--   hostel.premium.eligibility                 (object {require_fees_clear: bool})
--   hostel.premium_plus.late_returns_per_month (int, default 4)
--   hostel.premium.quota_per_block_default_percent (int, default 30)
--
-- Idempotent via ON CONFLICT on the unique-index columns
-- (policy_key, scope_type, COALESCE(scope_id, '00...0000'::uuid)) — that's
-- the platform_policies unique-INDEX shape (NOT a constraint) per
-- CLAUDE.md Rule 1 pitfall 3.
-- ============================================================================

INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, is_system
) VALUES
  (
    'hostel.premium.invite_window_hours',
    'global', NULL,
    '48'::jsonb,
    'Premium Stay Phase 1: hours within which an invited roommate must accept the invite before it expires. Default 48h. Edit via /admin/campus-living/tier-policy or platform-policies admin.',
    'number', true
  ),
  (
    'hostel.premium.invite_max_retries',
    'global', NULL,
    '2'::jsonb,
    'Premium Stay Phase 1: number of times a premium learner can re-invite a roommate after a decline / expiry before admin intervention. Default 2.',
    'number', true
  ),
  (
    'hostel.premium.hold_window_minutes',
    'global', NULL,
    '15'::jsonb,
    'Premium Stay Phase 1: minutes a premium-picked bed is held (advisory-locked) for the picker to complete checkout. After expiry the bed is released. Default 15min.',
    'number', true
  ),
  (
    'hostel.premium.payment_mode',
    'global', NULL,
    '"atomic"'::jsonb,
    'Premium Stay Phase 1: how premium fee + allocation interact. atomic = both succeed or both rollback (recommended). hold_24h = bed held 24h pending payment. pay_at_intake = allocation locked, fee invoiced at admission. Configurable per institution via scope_type=institution row.',
    'string', true
  ),
  (
    'hostel.premium.eligibility',
    'global', NULL,
    '{"require_fees_clear":true}'::jsonb,
    'Premium Stay Phase 1: eligibility gate for opting into premium tier. require_fees_clear = learner must have no pending tuition / hostel dues (existing hostel_allocations.fee_status IN (paid, waived)). Future: add minimum-CGPA / batch / institution-allow-list keys.',
    'object', true
  ),
  (
    'hostel.premium_plus.late_returns_per_month',
    'global', NULL,
    '4'::jsonb,
    'Premium Stay Phase 1: extended-curfew quota for premium_plus tier — number of late-return passes per month the learner can use without warden approval. Default 4. Consumed by gate-pass service (Phase 2).',
    'number', true
  ),
  (
    'hostel.premium.quota_per_block_default_percent',
    'global', NULL,
    '30'::jsonb,
    'Premium Stay Phase 1: suggested default percentage of beds per block to tag premium_only. Director / chief warden may override per block via the rooms admin UI. Pure suggestion — no runtime enforcement.',
    'number', true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- Verification: confirm all 7 keys present
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.platform_policies
   WHERE policy_key LIKE 'hostel.premium%'
     AND scope_type = 'global';

  IF v_count < 7 THEN
    RAISE EXCEPTION 'Premium platform_policies seed failed: expected >= 7 rows, got %', v_count;
  END IF;

  RAISE NOTICE 'platform_policies seeded: % hostel.premium.* rows', v_count;
END $$;
