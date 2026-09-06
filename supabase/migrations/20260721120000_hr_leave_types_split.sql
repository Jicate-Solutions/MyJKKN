-- HR Leave Types split — dedicated staff catalog.
--
-- WHY: leave_types served two audiences behind a `scope` discriminator, and
-- hr_leave_types was a VIEW over it. HR leave needs fields academic leave
-- never will (carry-forward, encashment, accrual, eligibility), and the
-- shared table made the staff catalog un-manageable from the HR module.
--
-- SAFETY: rows are copied with their EXISTING UUIDs, so every FK value stays
-- byte-identical. Only constraint targets move. No balance data is mutated.
--
-- Two cross-module references block a naive delete and are handled explicitly:
--   institution_leaves    — 20 rows, ON DELETE RESTRICT → would hard-fail
--   leave_approval_chains —  3 rows, ON DELETE CASCADE  → would silently vanish

BEGIN;

-- 1. Drop the view that currently occupies this name.
DROP VIEW IF EXISTS public.hr_leave_types;

-- 2. The real table.
CREATE TABLE public.hr_leave_types (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id        uuid NOT NULL REFERENCES public.hr_organizations(id) ON DELETE CASCADE,
  leave_type_code           varchar NOT NULL,
  leave_type_name           varchar NOT NULL,
  description               text,
  color_code                varchar NOT NULL DEFAULT '#6B7280',
  display_order             integer NOT NULL DEFAULT 0,
  is_active                 boolean NOT NULL DEFAULT true,

  duration_type             varchar NOT NULL DEFAULT 'full'
                              CHECK (duration_type IN ('full','first_half','second_half','hourly')),
  allow_half_day            boolean NOT NULL DEFAULT false,
  allow_hourly              boolean NOT NULL DEFAULT false,

  skip_weekends             boolean NOT NULL DEFAULT true,
  skip_holidays             boolean NOT NULL DEFAULT true,

  requires_approval         boolean NOT NULL DEFAULT true,
  is_paid                   boolean NOT NULL DEFAULT true,
  min_advance_notice_days   integer NOT NULL DEFAULT 0,
  max_continuous_days       integer,
  requires_documents        boolean NOT NULL DEFAULT false,
  document_required_after_days integer,
  default_entitled_days     numeric NOT NULL DEFAULT 0,

  valid_from                timestamptz NOT NULL DEFAULT now(),
  valid_until               timestamptz,
  superseded_by             uuid REFERENCES public.hr_leave_types(id),

  -- HR-specific (design D3)
  allow_carry_forward       boolean NOT NULL DEFAULT false,
  max_carry_forward_days    numeric,
  is_encashable             boolean NOT NULL DEFAULT false,
  max_encashable_days       numeric,
  accrual_type              varchar NOT NULL DEFAULT 'none'
                              CHECK (accrual_type IN ('none','annual','monthly')),
  accrual_rate              numeric NOT NULL DEFAULT 0,
  applicable_gender         varchar NOT NULL DEFAULT 'all'
                              CHECK (applicable_gender IN ('all','male','female')),
  applicable_cadre_ids      uuid[],

  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_leave_types_org_code_unique UNIQUE (hr_organization_id, leave_type_code)
);

CREATE INDEX idx_hlt_org_active ON public.hr_leave_types(hr_organization_id, is_active);

-- 3. Copy the 66 staff rows, PRESERVING ids.
--    Join to hr_organizations verified 1:1 — 66/66 resolve, no institution
--    maps to more than one org, so no row is silently dropped.
INSERT INTO public.hr_leave_types (
  id, hr_organization_id, leave_type_code, leave_type_name, description,
  color_code, display_order, is_active, duration_type, allow_half_day,
  allow_hourly, skip_weekends, skip_holidays, requires_approval, is_paid,
  min_advance_notice_days, max_continuous_days, requires_documents,
  document_required_after_days, default_entitled_days, valid_from, valid_until,
  created_by, updated_by, created_at, updated_at
)
SELECT
  lt.id, o.id, lt.leave_type_code, lt.leave_type_name, lt.description,
  lt.color_code, lt.display_order, lt.is_active, lt.duration_type, lt.allow_half_day,
  lt.allow_hourly, lt.skip_weekends, lt.skip_holidays, lt.requires_approval, lt.is_paid,
  lt.min_advance_notice_days, lt.max_continuous_days, lt.requires_documents,
  lt.document_required_after_days, lt.default_entitled_days, lt.valid_from, lt.valid_until,
  lt.created_by, lt.updated_by, lt.created_at, lt.updated_at
FROM public.leave_types lt
JOIN public.hr_organizations o ON o.institution_id = lt.institution_id
WHERE lt.scope = 'staff';

-- 4. Repoint the five HR foreign keys onto the new table.
ALTER TABLE public.hr_leave_balances
  DROP CONSTRAINT hr_leave_balances_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_balances_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id);

ALTER TABLE public.hr_leave_applications
  DROP CONSTRAINT hr_leave_applications_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_applications_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id);

ALTER TABLE public.hr_leave_type_entitlements
  DROP CONSTRAINT hr_leave_type_entitlements_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_type_entitlements_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id) ON DELETE CASCADE;

ALTER TABLE public.hr_leave_encashments
  DROP CONSTRAINT hr_leave_encashments_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_encashments_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id);

ALTER TABLE public.hr_leave_policies
  DROP CONSTRAINT hr_leave_policies_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_policies_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id) ON DELETE CASCADE;

-- 5a. leave_types.scope is CHECK-constrained to ('learner','staff','both').
--     The holiday labels below are a third audience — neither learner nor
--     staff. 'both' would be actively wrong: it means "learners AND staff",
--     so any query filtering scope IN ('learner','both') for the Academic
--     page AND any filtering scope IN ('staff','both') would both pick these
--     up, reintroducing the cross-audience contamination this split removes.
--     'both' currently has 0 rows, so widening the constraint is safe.
ALTER TABLE public.leave_types DROP CONSTRAINT leave_types_scope_check;
ALTER TABLE public.leave_types ADD  CONSTRAINT leave_types_scope_check
  CHECK (scope::text = ANY (ARRAY['learner','staff','both','institution']::text[]));

-- 5. institution_leaves (20 rows, RESTRICT). These are institution HOLIDAY
--    periods that borrowed a staff leave type purely as a LABEL.
--    hr_calc_leave_days reads institution_leaves by DATE RANGE only and never
--    reads leave_type_id, so relabelling does not change day-count behaviour.
--    Create one scope='institution' label per (institution, code) still in use,
--    then repoint.
INSERT INTO public.leave_types (
  institution_id, leave_type_code, leave_type_name, description, scope,
  color_code, is_active, duration_type
)
SELECT DISTINCT
  il.institution_id,
  lt.leave_type_code,
  lt.leave_type_name,
  'Institution holiday label (migrated from staff leave type)',
  'institution',
  lt.color_code,
  true,
  'full'
FROM public.institution_leaves il
JOIN public.leave_types lt ON lt.id = il.leave_type_id
WHERE lt.scope = 'staff'
ON CONFLICT DO NOTHING;

UPDATE public.institution_leaves il
SET leave_type_id = newlt.id
FROM public.leave_types oldlt, public.leave_types newlt
WHERE il.leave_type_id = oldlt.id
  AND oldlt.scope = 'staff'
  AND newlt.scope = 'institution'
  AND newlt.institution_id  = il.institution_id
  AND newlt.leave_type_code = oldlt.leave_type_code;

-- 6. leave_approval_chains (3 rows, CASCADE). Staff leave routes through
--    hr_approval_flows (flow_for='leave_approval'), so chain rows pointing at
--    staff types are orphaned config. Delete EXPLICITLY and loudly rather than
--    letting the cascade do it invisibly.
DO $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.leave_approval_chains c
  USING public.leave_types lt
  WHERE lt.id = c.leave_type_id AND lt.scope = 'staff';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned leave_approval_chains rows referencing staff types', v_deleted;
END $$;

-- 7. Remove the staff rows from the shared catalog.
DELETE FROM public.leave_types WHERE scope = 'staff';

-- 8. Post-conditions — abort the transaction on any mismatch.
DO $$
DECLARE
  v_new    integer;
  v_stale  integer;
  v_orphan integer;
  v_holi   integer;
BEGIN
  SELECT count(*) INTO v_new    FROM public.hr_leave_types;
  SELECT count(*) INTO v_stale  FROM public.leave_types WHERE scope = 'staff';
  SELECT count(*) INTO v_orphan FROM public.hr_leave_balances b
    WHERE NOT EXISTS (SELECT 1 FROM public.hr_leave_types t WHERE t.id = b.leave_type_id);
  SELECT count(*) INTO v_holi   FROM public.institution_leaves il
    WHERE NOT EXISTS (SELECT 1 FROM public.leave_types t WHERE t.id = il.leave_type_id);

  IF v_new <> 66 THEN RAISE EXCEPTION 'Expected 66 hr_leave_types, got %', v_new; END IF;
  IF v_stale <> 0  THEN RAISE EXCEPTION 'Stale staff rows remain in leave_types: %', v_stale; END IF;
  IF v_orphan <> 0 THEN RAISE EXCEPTION 'Orphaned hr_leave_balances rows: %', v_orphan; END IF;
  IF v_holi <> 0   THEN RAISE EXCEPTION 'Orphaned institution_leaves rows: %', v_holi; END IF;
END $$;

-- 9. RLS. Mirrors 20260721065226_hr_leave_rls_permission_retrofit: gate reads
--    on org membership, writes on an explicit permission key.
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY hlt_select ON public.hr_leave_types
  FOR SELECT TO authenticated
  USING (
    hr_organization_id IN (
      SELECT o.id FROM public.hr_organizations o
      JOIN public.staff s ON s.institution_id = o.institution_id
      WHERE s.profile_id = auth.uid()
    )
    OR public.user_has_permission('hr.leave.types.manage')
  );

CREATE POLICY hlt_write ON public.hr_leave_types
  FOR ALL TO authenticated
  USING      (public.user_has_permission('hr.leave.types.manage'))
  WITH CHECK (public.user_has_permission('hr.leave.types.manage'));

COMMIT;
