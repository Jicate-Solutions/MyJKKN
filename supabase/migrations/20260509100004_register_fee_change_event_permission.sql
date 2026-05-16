-- ============================================================================
-- 20260509100004 — Register admission_fees.approve_change_event
-- ============================================================================
-- Approving / rejecting fee_change_events is a high-trust operation: it
-- supersedes paid bills and reallocates payments. Only super_admin and
-- administrator (finance/admission heads).
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.approve_change_event": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE(permissions->>'admission_fees.approve_change_event','false') <> 'true';
