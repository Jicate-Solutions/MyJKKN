-- ============================================================================
-- COHORT CORE — SF100 backfill into the shared spine (Phase 2)
-- Created: 2026-07-05  (plan: docs/cohort-core/PLAN.md, PHASE 2.2 · decision D3)
-- ============================================================================
-- WHAT: Register the 1 live SF100 program + its 18 team enrollments into the
--       shared cohort spine — sf100_programs → public.cohorts (kind='sf100'),
--       sf100_enrollments → public.cohort_memberships (member_type='team').
--
-- TIER: TIER-1 (data-touching, ADDITIVE, IDEMPOTENT).
--
-- COPY-ONLY · NON-DESTRUCTIVE · NO CUTOVER (D3 = COPY-OVER + KEEP OLD AS BACKUP):
--   • The SELECT side only READS sf100_programs / sf100_enrollments. This file
--     runs NO UPDATE and NO DELETE against any sf100_* table.
--   • sf100_* tables REMAIN THE LIVE SOURCE OF TRUTH after this migration. SF100
--     services/hooks are NOT repointed in Phase 2 — that is Phase 2.3. Until a
--     human signs off, the migrated cohorts/memberships are a parallel COPY.
--
-- IDEMPOTENT (safe to re-apply):
--   • cohorts has NO natural unique key (only the surrogate PK), so a plain
--     INSERT…SELECT would create a DUPLICATE cohort on re-run. Guard: a
--     `WHERE NOT EXISTS … config->>'sf100_program_id' = p.id` anti-join keyed on
--     the source program id we stash in config.
--   • cohort_memberships has UNIQUE (cohort_id, member_type, member_ref); with
--     member_ref = the enrollment's own id this is naturally unique, so
--     `ON CONFLICT (cohort_id, member_type, member_ref) DO NOTHING` fully
--     prevents duplicate memberships on re-run.
--
-- REVERSIBILITY: delete ONLY the inserted target rows — the source is untouched:
--     DELETE FROM public.cohort_memberships
--       WHERE member_type='team' AND config ? 'sf100_enrollment_id';
--     DELETE FROM public.cohorts
--       WHERE kind='sf100' AND config ? 'sf100_program_id';
--
-- RLS: this migration runs as the migration role (owner/superuser), which
--   BYPASSES RLS, so the inserts succeed regardless of the cohort.* policies.
--   (Phase 2.3 must ensure the SF100 role(s) hold cohort.view or the migrated
--   rows appear to "vanish" in any new cohort-core UI — gotcha #9.)
-- ============================================================================

-- ── STEP 1: sf100_programs → public.cohorts (kind='sf100') ────────────────────
-- Status REMAP (sf100 5-value CHECK → cohorts 5-value CHECK):
--   draft→draft · enrollment_open→ENROLLING · active→active · completed→completed
--   · archived→archived   (enrollment_open is NOT a valid cohort status — a plain
--   copy would fail the CHECK; it must be remapped explicitly.)
-- DATE→timestamptz: DATE columns cast at IST boundaries (NOT server TZ) —
--   opens_at = START-of-day IST; closes_at / hard_deadline = END-of-day IST so
--   the deadline day stays inclusive.
INSERT INTO public.cohorts (
  kind,
  name,
  institution_id,
  owner_id,
  academic_year,
  opens_at,
  closes_at,
  hard_deadline,
  status,
  config,
  archived_at,
  archived_by,
  created_by,
  created_at,
  updated_at
)
SELECT
  'sf100'                                                     AS kind,
  p.name                                                     AS name,
  p.institution_id                                           AS institution_id,
  p.created_by                                               AS owner_id,      -- best-effort: no owner col on source
  NULL::text                                                 AS academic_year, -- no source column; do not fabricate
  -- opens_at: enrollment_start at START-of-day IST
  (p.enrollment_start::timestamp AT TIME ZONE 'Asia/Kolkata') AS opens_at,
  -- closes_at: enrollment_deadline at END-of-day IST (deadline inclusive)
  (((p.enrollment_deadline + 1)::timestamp - interval '1 second')
     AT TIME ZONE 'Asia/Kolkata')                            AS closes_at,
  -- hard_deadline: END-of-day IST (NOT NULL on source)
  (((p.hard_deadline + 1)::timestamp - interval '1 second')
     AT TIME ZONE 'Asia/Kolkata')                            AS hard_deadline,
  CASE p.status
    WHEN 'draft'           THEN 'draft'
    WHEN 'enrollment_open' THEN 'enrolling'
    WHEN 'active'          THEN 'active'
    WHEN 'completed'       THEN 'completed'
    WHEN 'archived'        THEN 'archived'
  END                                                        AS status,
  jsonb_build_object(
    -- idempotency guard + backlink to the source program
    'sf100_program_id',        p.id::text,
    -- SF100-only program fields with no first-class cohort column
    'description',             p.description,
    'source_event_id',         p.source_event_id,
    'paid_user_target',        p.paid_user_target,
    'min_transaction_amount',  p.min_transaction_amount,
    'max_internal_user_pct',   p.max_internal_user_pct,
    'stall_warning_days',      p.stall_warning_days,
    'stall_probation_days',    p.stall_probation_days,
    'stall_removal_days',      p.stall_removal_days,
    'started_at',              p.started_at,
    'completed_at',            p.completed_at,
    -- D2 rule-config: SF100 runs the FULL shared lifecycle at locked thresholds
    -- (mirrors defaultRuleConfigForKind('sf100') in lifecycle.ts)
    'rules', jsonb_build_object(
      'inactivity', jsonb_build_object('enabled', true, 'nudgeAfterDays', 7, 'pauseAfterDays', 14),
      'escalation', jsonb_build_object('enabled', true, 'businessDays', 3),
      'grace',      jsonb_build_object('enabled', true, 'graceDays', 30)
    )
  )                                                          AS config,
  CASE WHEN p.status = 'archived' THEN p.completed_at ELSE NULL END AS archived_at,
  NULL::uuid                                                 AS archived_by,
  p.created_by                                               AS created_by,
  p.created_at                                               AS created_at,    -- keep true history (don't default now())
  p.updated_at                                               AS updated_at
FROM public.sf100_programs p
WHERE p.institution_id IS NOT NULL                           -- NOT NULL tenant guard (cohorts.institution_id)
  AND NOT EXISTS (                                           -- idempotency: skip already-migrated programs
    SELECT 1 FROM public.cohorts c
    WHERE c.kind = 'sf100'
      AND c.config->>'sf100_program_id' = p.id::text
  );

-- ── STEP 2: sf100_enrollments → public.cohort_memberships (member_type='team') ─
-- Status REMAP (sf100 6-value ENUM → membership 6-value CHECK, folding):
--   active→active · warning→ACTIVE · probation→ACTIVE (stall sub-states, not
--   lifecycle states) · removed→removed · graduated→graduated · withdrawn→REMOVED.
--   The ORIGINAL sf100 status is preserved in config.sf100_status so the folded
--   stall-state and the withdrawn-vs-removed distinction are not lost (gotcha #3).
-- member_ref = the enrollment's own id (keeps SF100 extension tables that FK
--   enrollment_id joinable while sf100_* stays intact); registration_id (the
--   team entity) is preserved in config (gotcha #6).
INSERT INTO public.cohort_memberships (
  cohort_id,
  member_type,
  member_ref,
  status,
  role,
  joined_at,
  joined_by,
  config,
  created_at,
  updated_at
)
SELECT
  c.id                                                       AS cohort_id,
  'team'                                                     AS member_type,
  e.id                                                       AS member_ref,     -- enrollment id (unique → free idempotency)
  CASE e.status
    WHEN 'active'    THEN 'active'
    WHEN 'warning'   THEN 'active'
    WHEN 'probation' THEN 'active'
    WHEN 'removed'   THEN 'removed'
    WHEN 'graduated' THEN 'graduated'
    WHEN 'withdrawn' THEN 'removed'
  END                                                        AS status,
  'team'                                                     AS role,
  e.enrolled_at                                              AS joined_at,
  e.enrolled_by                                              AS joined_by,
  jsonb_build_object(
    'sf100_enrollment_id',   e.id::text,                     -- idempotency backlink
    'registration_id',       e.registration_id,             -- the team entity (member_ref points at the enrollment)
    'current_phase',         e.current_phase::text,         -- context enum, NOT a lifecycle status
    'phase_entered_at',      e.phase_entered_at,
    'sf100_status',          e.status::text,                -- ORIGINAL status preserved (fold-loss guard)
    'status_reason',         e.status_reason,
    'status_changed_at',     e.status_changed_at,
    'cumulative_paid_users', e.cumulative_paid_users,
    'active_paid_users',     e.active_paid_users,
    'internal_paid_users',   e.internal_paid_users,
    'total_revenue',         e.total_revenue,
    'problem_domain',        e.problem_domain,
    'target_segment',        e.target_segment,
    'pricing_model',         e.pricing_model,
    'last_check_in_at',      e.last_check_in_at,
    'warning_sent_at',       e.warning_sent_at,
    'probation_sent_at',     e.probation_sent_at,
    'seed_paying_users',     e.seed_paying_users,
    'seed_mrr',              e.seed_mrr,
    'seed_active_users',     e.seed_active_users,
    'removed_at',            e.removed_at,
    'removed_by',            e.removed_by,
    'graduated_at',          e.graduated_at
  )                                                          AS config,
  e.created_at                                               AS created_at,     -- keep true history
  e.updated_at                                               AS updated_at
FROM public.sf100_enrollments e
JOIN public.cohorts c
  ON c.kind = 'sf100'
  AND c.config->>'sf100_program_id' = e.program_id::text     -- link enrollment → mapped cohort
ON CONFLICT (cohort_id, member_type, member_ref) DO NOTHING; -- idempotent on re-run

-- ── STEP 3: self-check — abort if the copy did not fully close the gap ─────────
DO $$
DECLARE
  v_programs_skipped    integer;
  v_programs_unmapped   integer;
  v_enrollments_unmapped integer;
BEGIN
  -- Programs intentionally skipped (NULL institution_id) — reported, not fatal.
  SELECT COUNT(*) INTO v_programs_skipped
  FROM public.sf100_programs p
  WHERE p.institution_id IS NULL;

  -- Every non-null-institution program must now have a mapped cohort.
  SELECT COUNT(*) INTO v_programs_unmapped
  FROM public.sf100_programs p
  WHERE p.institution_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.cohorts c
      WHERE c.kind = 'sf100'
        AND c.config->>'sf100_program_id' = p.id::text
    );
  IF v_programs_unmapped > 0 THEN
    RAISE EXCEPTION 'Cohort backfill incomplete: % sf100_programs still unmapped to cohorts', v_programs_unmapped;
  END IF;

  -- Every enrollment whose program mapped must now have a membership (gotcha #10:
  -- no orphan enrollment left without a cohort_id).
  SELECT COUNT(*) INTO v_enrollments_unmapped
  FROM public.sf100_enrollments e
  JOIN public.cohorts c
    ON c.kind = 'sf100'
    AND c.config->>'sf100_program_id' = e.program_id::text
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cohort_memberships m
    WHERE m.cohort_id = c.id
      AND m.member_type = 'team'
      AND m.member_ref = e.id
  );
  IF v_enrollments_unmapped > 0 THEN
    RAISE EXCEPTION 'Cohort backfill incomplete: % sf100_enrollments still unmapped to memberships', v_enrollments_unmapped;
  END IF;

  RAISE NOTICE 'Cohort backfill OK: all in-tenant sf100_programs mapped to cohorts, all their enrollments mapped to team memberships (% program(s) skipped for NULL institution_id).', v_programs_skipped;
END $$;

-- Reload PostgREST schema cache (deliverable requirement; harmless for data-only).
NOTIFY pgrst, 'reload schema';
