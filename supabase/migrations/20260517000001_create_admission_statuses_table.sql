-- File: supabase/migrations/20260517000001_create_admission_statuses_table.sql
BEGIN;

CREATE TABLE public.admission_statuses (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                       text NOT NULL CHECK (scope IN ('lead','learner')),
  code                        text NOT NULL,
  label                       text NOT NULL,
  description                 text,
  color                       text NOT NULL DEFAULT '#9CA3AF',
  icon                        text,
  sort_order                  int  NOT NULL DEFAULT 0,
  is_active                   boolean NOT NULL DEFAULT true,
  is_terminal                 boolean NOT NULL DEFAULT false,
  is_seat_filled              boolean NOT NULL DEFAULT false,
  fee_paid_threshold_percent  numeric(5,2),
  gates_login                 boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES profiles(id),
  updated_by                  uuid REFERENCES profiles(id),
  CONSTRAINT chk_threshold_range CHECK (
    fee_paid_threshold_percent IS NULL
    OR (fee_paid_threshold_percent >= 0 AND fee_paid_threshold_percent <= 100)
  ),
  CONSTRAINT chk_threshold_only_for_learner CHECK (
    fee_paid_threshold_percent IS NULL OR scope = 'learner'
  ),
  CONSTRAINT chk_gates_login_only_for_learner CHECK (
    gates_login = false OR scope = 'learner'
  )
);

CREATE UNIQUE INDEX uq_admission_statuses_scope_code
  ON public.admission_statuses(scope, code);

CREATE UNIQUE INDEX uq_admission_statuses_one_seat_filled
  ON public.admission_statuses(scope)
  WHERE is_seat_filled = true AND is_active = true;

CREATE INDEX idx_admission_statuses_scope_active_order
  ON public.admission_statuses(scope, is_active, sort_order);

-- Touch trigger (reuse project standard fn)
CREATE TRIGGER trg_admission_statuses_touch_updated_at
  BEFORE UPDATE ON public.admission_statuses
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- RLS
ALTER TABLE public.admission_statuses ENABLE ROW LEVEL SECURITY;

-- Read: anyone with admission.settings.statuses.view OR is_super_admin
CREATE POLICY admission_statuses_select
  ON public.admission_statuses FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.statuses.view')
    OR user_has_permission('admission.settings.statuses.manage')
  );

CREATE POLICY admission_statuses_insert
  ON public.admission_statuses FOR INSERT
  WITH CHECK (
    is_super_admin() OR user_has_permission('admission.settings.statuses.manage')
  );

CREATE POLICY admission_statuses_update
  ON public.admission_statuses FOR UPDATE
  USING (is_super_admin() OR user_has_permission('admission.settings.statuses.manage'))
  WITH CHECK (is_super_admin() OR user_has_permission('admission.settings.statuses.manage'));

CREATE POLICY admission_statuses_delete
  ON public.admission_statuses FOR DELETE
  USING (is_super_admin());  -- hard delete only by super_admin; UI uses archive

COMMIT;
