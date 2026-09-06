-- File: supabase/migrations/20260517000005_create_learners_profile_status_history.sql
BEGIN;

CREATE TABLE public.learners_profile_status_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  from_status   lifecycle_status,
  to_status     lifecycle_status NOT NULL,
  reason_code   text,                  -- 'auto_threshold','manual','revert','admin_override'
  paid_pct_at_change numeric(5,2),     -- snapshot for forensics
  threshold_at_change numeric(5,2),    -- snapshot of the rule applied
  changed_by    uuid REFERENCES public.profiles(id),  -- NULL for trigger-driven
  changed_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_lpsh_learner_changed_at
  ON public.learners_profile_status_history(learner_id, changed_at DESC);

ALTER TABLE public.learners_profile_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY lpsh_select ON public.learners_profile_status_history FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('learners.profiles.view')
    OR user_has_permission('admission.settings.statuses.manage')
  );

-- Inserts only by SECURITY DEFINER RPC. No INSERT policy.
COMMIT;
