-- ============================================================================
-- Teaching-Enterprise Spine · Phase 1a · Cohort config substrate
-- Created: 2026-07-26
-- Hardened: 2026-07-26 (blast-radius floor + role-key uniqueness; see § HARDENING)
-- Spec: specs/teaching-enterprise-spine-generalization-2026-07-26.md (§4.1, §4.2, §9)
--
-- DORMANT migration. Ships as a FILE only; the Director applies it AFTER merge
-- (a MyJKKN deploy ships CODE, not DB migrations). Fully idempotent — safe to
-- re-run. Zero residue on prod from the PR itself.
--
-- WHAT THIS IS: a PURE REFACTOR. It removes the last hardcoded cohort predicate
-- from the teaching-enterprise participant layer while it is still cheap (one
-- cohort, not four). After it is applied, MBA membership must be IDENTICAL:
-- 44 mba_associate holders, 6 mba_faculty holders, 26 active postings, and
-- fn_teaching_cohort_sync('mba_associate') must report role_added=0 /
-- role_removed=0. Any drift means the predicate translation is wrong.
--
-- THE COUPLING IT REMOVES — fn_mba_associate_sync() hardcoded three literals:
--     lp.program_id      = '43eed6cf-fa51-4e6b-ba93-1b27c4c16df4'
--     s.semester_order  IN (3, 4)
--     (plus fn_mba_faculty_sync's staff.department_id = MBA dept)
-- Those become COLUMNS on a config row, per the standing rule
-- "every policy decision = a config row" (docs/architecture/config-table-pattern.md).
--
-- (a) teaching_enterprise_cohorts — the config table (+ RLS, anon lock, trigger)
-- (a2) role-key uniqueness indexes — see § HARDENING / DEFECT 2
-- (b) seed the MBA row with the EXACT values the old literals carried
-- (c) fn_teaching_cohort_sync(p_cohort_key) — the generic participant sweep
-- (d) fn_mba_associate_sync() / fn_mba_faculty_sync() → thin wrappers (kept, NOT
--     dropped, for rollback safety; their existing crons keep working unchanged)
--
-- OUT OF SCOPE (later phases, do NOT add here): widening
-- fn_mba_analyst_views' role literal, the CSE roles/config row, the cohort admin
-- UI, contribution_mode='build' PR tracking, and any mba_rotation_* change.
--
-- Verified prod ground truth (kvizhngldtiuufknvehv, 2026-07-26):
--   MBA program_id     43eed6cf-fa51-4e6b-ba93-1b27c4c16df4
--   MBA department_id  e73d1763-7479-4771-9c9e-cdea547d0205
--   mba_associate      44 holders   (enrolment rule matches 44 distinct profiles)
--   mba_faculty         6 holders   (6 distinct active profile_ids in the dept)
--   cohorts kind='mba_associate' → 1 row, 44 learner memberships
--
-- ============================================================================
-- § HARDENING (2026-07-26) — two HIGH defects found by review, both PROVEN on
-- prod in a rolled-back transaction before this file was corrected. The file had
-- been merged but NEVER applied, so both are fixed IN PLACE (no down-migration).
--
-- DEFECT 1 — silent mass privilege revocation via a config TYPO.
--   Turning the enrolment predicate into editable data means a VALID-BUT-WRONG
--   value (e.g. semester_orders='{99}', or a program_id that exists but has no
--   active learners) passes every NOT NULL / cardinality check, matches NOBODY,
--   and then the role delete — scoped only by role_id — strips EVERY holder
--   while the function RETURNS SUCCESS and the cron logs ok:true.
--   PROVEN: UPDATE ... SET semester_orders='{99}' → role_removed=44,
--   role_total=0, no exception raised.
--   FIX: a BLAST-RADIUS FLOOR before BOTH role deletes (learner + faculty):
--     (a) ZERO-MATCH GUARD      — matched 0 but holders > 0        → RAISE
--     (b) MASS-REVOCATION GUARD — delete > half of holders, >= 4   → RAISE
--   Neither guard can fire on a correct config row (0 planned deletions).
--   The only intentional way past (b) is the explicit, per-transaction
--   `teaching_enterprise.allow_mass_revocation` escape hatch documented on the
--   guard itself — a deliberate act by an operator, not a typo's side effect.
--   AGGRAVATOR (also proven): with an empty match set the derived institution
--   was NULL, so the `cohorts` decoration block was SILENTLY SKIPPED — leaving
--   0 role holders but 44 cohort_memberships still 'active'. The institution is
--   now derived through a fallback chain and a non-derivable institution on a
--   non-empty match set RAISES instead of no-opping.
--
-- DEFECT 2 — no uniqueness on the role keys → one INSERT revokes 44 people.
--   cohort_key is UNIQUE but learner_role_key / faculty_role_key were not. The
--   no-argument sweep loops EVERY active row in ONE transaction with a delete
--   scoped only by role_id, ORDER BY cohort_key — so two active rows sharing a
--   learner_role_key make the LATER row strip every member the EARLIER row just
--   added. Reachable by nothing more than a natural second config row (e.g. an
--   "MBA sem 5,6 second intake" reusing learner_role_key='mba_associate').
--   FIX: partial unique indexes (a2) make that state UNREPRESENTABLE.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (a) The config table.
--
--     One row per teaching-enterprise cohort. The row IS the enrolment rule:
--     WHO qualifies (program_id + semester_orders), WHAT access they get
--     (learner_role_key / faculty_role_key) and WHAT they do (contribution_mode).
--
--     institution_id is reserved for future explicit scoping — Phase 1a derives
--     the institution from the matched learner rows exactly as today, so the MBA
--     seed row leaves it NULL.
--
--     NOTE ON COLUMN NAMES: `faculty_role_key` / `faculty_source` are CODE
--     identifiers (they name the role granted to a department's Senior Learners
--     and mirror the existing `mba_faculty` role_key). All user-facing copy comes
--     from `display_name`.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teaching_enterprise_cohorts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key        text NOT NULL UNIQUE,          -- 'mba_associate', 'cse_resident'
  display_name      text NOT NULL,                 -- drives ALL user-facing copy
  -- WHO qualifies (the ex-hardcoded predicate, now data):
  program_id        uuid REFERENCES public.programs(id),
  department_id     uuid REFERENCES public.departments(id),
  semester_orders   int[] NOT NULL DEFAULT '{}',   -- '{3,4}' for MBA
  -- WHAT access they get:
  learner_role_key  text NOT NULL,                 -- role granted to the learners
  faculty_role_key  text,                          -- role granted to the dept's Senior Learners
  faculty_source    text NOT NULL DEFAULT 'department_membership'
                      CHECK (faculty_source IN ('department_membership', 'none')),
  -- WHAT they do (drives which output the participant produces):
  contribution_mode text NOT NULL DEFAULT 'analyse'
                      CHECK (contribution_mode IN ('analyse', 'build')),
  institution_id    uuid REFERENCES public.institutions(id),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.teaching_enterprise_cohorts IS
  'Config rows defining each teaching-enterprise cohort (who qualifies, what access they get, what they produce). Read by fn_teaching_cohort_sync(). Replaces the hardcoded MBA predicate.';

-- updated_at trigger — REUSES the module's existing touch function
-- (public.improvement_touch_updated_at, created by 20260723090000, one line:
-- `NEW.updated_at = now()`), rather than adding a fourth identical copy.
DROP TRIGGER IF EXISTS trg_teaching_enterprise_cohorts_touch ON public.teaching_enterprise_cohorts;
CREATE TRIGGER trg_teaching_enterprise_cohorts_touch
  BEFORE UPDATE ON public.teaching_enterprise_cohorts
  FOR EACH ROW EXECUTE FUNCTION public.improvement_touch_updated_at();

-- RLS + grants.
-- MANDATORY: Supabase's ALTER DEFAULT PRIVILEGES grants anon ~7 privileges on
-- every NEW table, separately from PUBLIC — an explicit REVOKE is required.
-- `authenticated` receives the same default ALL grant, and TRUNCATE is NOT an
-- RLS-checked command — so the write privileges are revoked and only SELECT is
-- granted back (measured on prod before this line existed:
-- authenticated held DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE).
ALTER TABLE public.teaching_enterprise_cohorts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teaching_enterprise_cohorts FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.teaching_enterprise_cohorts TO authenticated;

-- Read-only for humans: config rows are changed by migration (service_role /
-- owner), never from the browser. No INSERT/UPDATE/DELETE grant is issued to
-- `authenticated`, and there is deliberately NO `FOR ALL` policy here — so an
-- RLS sweep across all commands finds exactly one SELECT path.
DROP POLICY IF EXISTS teaching_enterprise_cohorts_select ON public.teaching_enterprise_cohorts;
CREATE POLICY teaching_enterprise_cohorts_select ON public.teaching_enterprise_cohorts
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('improvement.board.manage')
);


-- ----------------------------------------------------------------------------
-- (a2) ROLE-KEY UNIQUENESS — the structural fix for DEFECT 2.
--
--      WHY (cross-cohort revocation): fn_teaching_cohort_sync reconciles a role
--      by DELETEing every holder outside the row's own match set, scoped ONLY by
--      role_id. The no-argument sweep walks every active row inside ONE
--      transaction in cohort_key order. So if two ACTIVE rows name the same
--      learner_role_key (or the same faculty_role_key), the row processed second
--      revokes everyone the first row just granted — silently, with both rows
--      reporting success. That is a config-authoring mistake nobody would expect
--      to be destructive (e.g. adding an "MBA sem 5,6 second intake" row that
--      reuses learner_role_key='mba_associate').
--
--      These partial indexes make that state UNREPRESENTABLE rather than merely
--      discouraged: one role key may back at most ONE active cohort. Deactivated
--      rows (is_active=false) are exempt, so a cohort can be retired and a
--      replacement row can take over the same role key.
--
--      Consequence for the guards below: with these indexes in place, the role
--      delete's "everyone outside my match set" scope can only ever be about
--      THIS cohort's own membership — the guards in (c) are then a sufficient
--      runtime backstop and no cross-row union-scoping is required (it would be
--      unreachable code).
--
--      Partial/expression unique indexes are also why every seed in this file
--      uses INSERT ... SELECT ... WHERE NOT EXISTS instead of ON CONFLICT
--      (ON CONFLICT cannot infer a partial index and fails 42P10).
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS teaching_enterprise_cohorts_learner_role_active_uidx
  ON public.teaching_enterprise_cohorts (learner_role_key)
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS teaching_enterprise_cohorts_faculty_role_active_uidx
  ON public.teaching_enterprise_cohorts (faculty_role_key)
  WHERE is_active AND faculty_role_key IS NOT NULL;

COMMENT ON INDEX public.teaching_enterprise_cohorts_learner_role_active_uidx IS
  'At most ONE active cohort per learner_role_key. Two active rows sharing a role key would make the second row revoke every member the first row granted (the role delete in fn_teaching_cohort_sync is scoped by role_id only, and the no-arg sweep runs all rows in one transaction).';
COMMENT ON INDEX public.teaching_enterprise_cohorts_faculty_role_active_uidx IS
  'At most ONE active cohort per faculty_role_key. Same cross-cohort revocation hazard as the learner_role_key index.';


-- ----------------------------------------------------------------------------
-- (b) Seed the MBA row — byte-identical to today's behaviour (the no-op proof).
--     WHERE NOT EXISTS, never ON CONFLICT (ON CONFLICT fails 42P10 against
--     expression unique indexes).
-- ----------------------------------------------------------------------------
INSERT INTO public.teaching_enterprise_cohorts
  (cohort_key, display_name, program_id, department_id, semester_orders,
   learner_role_key, faculty_role_key, faculty_source, contribution_mode,
   institution_id, is_active)
SELECT 'mba_associate',
       'MBA Associate',
       '43eed6cf-fa51-4e6b-ba93-1b27c4c16df4'::uuid,   -- ex-literal #1
       'e73d1763-7479-4771-9c9e-cdea547d0205'::uuid,   -- ex-literal (dept side)
       '{3,4}'::int[],                                 -- ex-literal #2
       'mba_associate',
       'mba_faculty',
       'department_membership',
       'analyse',
       NULL,                                           -- derived from matched rows
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.teaching_enterprise_cohorts t WHERE t.cohort_key = 'mba_associate'
);


-- ----------------------------------------------------------------------------
-- (c) fn_teaching_cohort_sync(p_cohort_key) — the generic participant sweep.
--
--     Replaces fn_mba_associate_sync + fn_mba_faculty_sync with ONE function
--     driven by config rows. Per active row it reproduces exactly the old logic
--     with every literal swapped for a column.
--
--     Called with no argument → every active cohort. Called with a cohort_key →
--     just that one (this is what the two MBA wrappers do).
--
--     IMPLEMENTATION NOTE — no temp tables. The old functions used
--     `CREATE TEMP TABLE ... ON COMMIT DROP`, which cannot be created twice in
--     one call (this function loops) and can trip plpgsql's cached-plan-by-OID
--     behaviour across calls in one session. The match set is therefore held in
--     uuid[] locals. Set semantics are unchanged:
--       • adds       — DISTINCT ids, ON CONFLICT DO NOTHING (same net count)
--       • removals   — `NOT (id = ANY(ids))` on a COALESCEd '{}' array behaves
--                      exactly like the old `NOT EXISTS` against an empty set.
--
--     BLAST-RADIUS FLOOR (DEFECT 1). Every role delete here is scoped only by
--     role_id, so a config row that matches nobody would revoke everybody. Two
--     guards run before EACH delete (learner and faculty) and RAISE rather than
--     delete. Both are computed with cheap COUNTs and neither can fire on a
--     correct row (0 planned deletions):
--       (a) ZERO-MATCH — the rule matched 0 people but the role has holders.
--           There is no legitimate reading of "delete all holders because the
--           predicate returned nothing"; the operator's intent is one of three
--           explicit acts, named in the exception message.
--       (b) MASS-REVOCATION — the delete would remove MORE THAN HALF of the
--           current holders, and there are at least 4 holders (so a 1-of-2
--           cohort is not blocked by rounding).
--           Escape hatch, for the ONE legitimate mass revocation — a semester
--           rollover that turns the whole cohort over. It is per-transaction and
--           explicit, so it cannot be reached by a typo:
--             BEGIN;
--               SELECT set_config('teaching_enterprise.allow_mass_revocation','on',true);
--               SELECT * FROM public.fn_teaching_cohort_sync('mba_associate');
--             COMMIT;
--           The bypass is recorded as a NOTICE with the exact counts. It does
--           NOT weaken guard (a): a rule matching nobody always raises.
--
--     Signature note: the returned table is a SUPERSET of the spec's column
--     list — cohort_added / cohort_removed / faculty_total are also returned so
--     the two MBA wrappers below can keep their EXISTING return signatures and
--     their crons keep logging the same real numbers. The signature is unchanged
--     by this hardening pass — (text) only, no new parameter — because adding an
--     overload would make the wrappers' 1-argument calls ambiguous.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_sync(p_cohort_key text DEFAULT NULL)
RETURNS TABLE(
  cohort_key      text,
  role_added      integer,
  role_removed    integer,
  role_total      integer,
  cohort_added    integer,
  cohort_removed  integer,
  faculty_added   integer,
  faculty_removed integer,
  faculty_total   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg            record;
  v_matched      integer := 0;
  v_learner_role uuid;
  v_faculty_role uuid;
  v_user_ids     uuid[];
  v_learner_ids  uuid[];
  v_fac_ids      uuid[];
  v_inst         uuid;
  v_cohort       uuid;
  v_role_add     integer;
  v_role_del     integer;
  v_role_tot     integer;
  v_coh_add      integer;
  v_coh_del      integer;
  v_fac_add      integer;
  v_fac_del      integer;
  v_fac_tot      integer;
  -- blast-radius floor (DEFECT 1)
  v_hold_now     integer;   -- holders of the role right now
  v_del_plan     integer;   -- rows the pending DELETE would remove
  v_allow_mass   boolean;   -- explicit per-transaction override for guard (b)
BEGIN
  -- Read the escape hatch ONCE. current_setting(..., true) returns NULL when the
  -- GUC was never set, so an unset override is simply false.
  v_allow_mass := COALESCE(
                    lower(COALESCE(current_setting('teaching_enterprise.allow_mass_revocation', true), ''))
                      IN ('on', 'true', 't', '1', 'yes'),
                    false);

  FOR cfg IN
    SELECT tec.*
    FROM public.teaching_enterprise_cohorts tec
    WHERE tec.is_active
      AND (p_cohort_key IS NULL OR tec.cohort_key = p_cohort_key)
    ORDER BY tec.cohort_key
  LOOP
    v_matched      := v_matched + 1;
    v_role_add     := 0; v_role_del := 0; v_role_tot := 0;
    v_coh_add      := 0; v_coh_del  := 0;
    v_fac_add      := 0; v_fac_del  := 0; v_fac_tot  := 0;
    v_cohort       := NULL;
    v_inst         := NULL;
    v_faculty_role := NULL;

    -- Config sanity. An empty predicate would match nobody and then REMOVE the
    -- role from every current holder — fail loudly instead. NOTE: these checks
    -- only catch a MISSING rule. A rule that is present but matches nobody
    -- (semester_orders='{99}') is caught by the ZERO-MATCH guard further down.
    SELECT cr.id INTO v_learner_role
    FROM public.custom_roles cr WHERE cr.role_key = cfg.learner_role_key;
    IF v_learner_role IS NULL THEN
      RAISE EXCEPTION 'teaching cohort %: learner_role_key % is missing from custom_roles; apply the access-wiring migration first',
        cfg.cohort_key, cfg.learner_role_key;
    END IF;
    IF cfg.program_id IS NULL OR cardinality(cfg.semester_orders) = 0 THEN
      RAISE EXCEPTION 'teaching cohort %: incomplete enrolment rule (program_id and semester_orders are both required)',
        cfg.cohort_key;
    END IF;

    -- Current matching set: carry both the learner id (for the cohort) and the
    -- profile id (for the role) so both stay aligned to one derivation.
    SELECT COALESCE(array_agg(DISTINCT m.user_id),    '{}'::uuid[]),
           COALESCE(array_agg(DISTINCT m.learner_id), '{}'::uuid[]),
           -- one institution off the matched set, exactly like the old
           -- `SELECT DISTINCT institution_id ... LIMIT 1` (DISTINCT sorts, so
           -- element 1 is the first non-null; NULL when nothing matched).
           (array_agg(DISTINCT m.institution_id))[1]
      INTO v_user_ids, v_learner_ids, v_inst
    FROM (
      SELECT DISTINCT lp.id AS learner_id, p.id AS user_id, lp.institution_id
      FROM public.learners_profiles lp
      JOIN public.semesters      s  ON s.id  = lp.semester_id
      JOIN public.academic_years ay ON ay.id = lp.academic_year_id
      JOIN public.profiles       p  ON p.learner_id = lp.id
      WHERE lp.program_id = cfg.program_id
        AND s.semester_order = ANY (cfg.semester_orders)
        AND ay.is_active
        AND lp.lifecycle_status = 'active'
    ) m;

    -- ======================= GUARD (a) · ZERO-MATCH =========================
    -- The rule is well-formed but matched NOBODY. Deleting here would revoke
    -- the role from every holder and still report success (the DEFECT 1 path).
    SELECT count(*) INTO v_hold_now
    FROM public.user_roles ur WHERE ur.role_id = v_learner_role;

    IF cardinality(v_user_ids) = 0 AND v_hold_now > 0 THEN
      RAISE EXCEPTION
        'teaching cohort %: enrolment rule matched 0 learners but % user(s) currently hold role % — refusing to revoke all of them. Rule that matched nobody: program_id=%, semester_orders=%, plus (academic_years.is_active AND learners_profiles.lifecycle_status=''active''). Fix the rule (most often semester_orders or program_id is wrong, or no academic year is active), or if this cohort is genuinely over do it explicitly: UPDATE public.teaching_enterprise_cohorts SET is_active=false WHERE cohort_key=''%'' (leaves existing role holders untouched), or DELETE that config row. No roles were changed.',
        cfg.cohort_key, v_hold_now, cfg.learner_role_key,
        cfg.program_id, cfg.semester_orders, cfg.cohort_key;
    END IF;

    -- ROLE (the access gate) — ADD new matches
    WITH ins AS (
      INSERT INTO public.user_roles (user_id, role_id, is_primary)
      SELECT u, v_learner_role, false FROM unnest(v_user_ids) AS u
      ON CONFLICT (user_id, role_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_role_add FROM ins;

    -- =================== GUARD (b) · MASS REVOCATION ========================
    -- Counted against holders AS OF NOW (i.e. after the adds above), which is
    -- exactly the population the DELETE below is about to act on.
    SELECT count(*) INTO v_hold_now
    FROM public.user_roles ur WHERE ur.role_id = v_learner_role;

    SELECT count(*) INTO v_del_plan
    FROM public.user_roles ur
    WHERE ur.role_id = v_learner_role
      AND NOT (ur.user_id = ANY (v_user_ids));

    IF v_del_plan > 0 AND v_hold_now >= 4 AND (v_del_plan * 2) > v_hold_now THEN
      IF v_allow_mass THEN
        RAISE NOTICE 'teaching cohort %: mass-revocation guard BYPASSED by teaching_enterprise.allow_mass_revocation — removing % of % holders of role %',
          cfg.cohort_key, v_del_plan, v_hold_now, cfg.learner_role_key;
      ELSE
        RAISE EXCEPTION
          'teaching cohort %: this sync would remove role % from % of % current holders (more than half) — refusing. Matched learners: %. Verify the enrolment rule first (program_id=%, semester_orders=%). If this really is a whole-cohort turnover, re-run it deliberately in one transaction: SELECT set_config(''teaching_enterprise.allow_mass_revocation'',''on'',true); SELECT * FROM public.fn_teaching_cohort_sync(''%''); No roles were removed.',
          cfg.cohort_key, cfg.learner_role_key, v_del_plan, v_hold_now,
          cardinality(v_user_ids), cfg.program_id, cfg.semester_orders, cfg.cohort_key;
      END IF;
    END IF;

    -- ROLE — REMOVE leavers (held the role, no longer match)
    WITH del AS (
      DELETE FROM public.user_roles ur
      WHERE ur.role_id = v_learner_role
        AND NOT (ur.user_id = ANY (v_user_ids))
      RETURNING 1
    )
    SELECT count(*) INTO v_role_del FROM del;

    SELECT count(*) INTO v_role_tot
    FROM public.user_roles ur WHERE ur.role_id = v_learner_role;

    -- COHORT (analytics decoration) — keep aligned to the same set, best-effort.
    -- A cohort membership grants ZERO permissions in MyJKKN; the ROLE above is
    -- the access gate. Wrapped so a decoration failure (e.g. cohorts_kind_check
    -- has no entry yet for a newer cohort_key) can never block the role sweep.
    --
    -- INSTITUTION DERIVATION (the DEFECT 1 aggravator). Previously the whole
    -- block was `IF v_inst IS NOT NULL`, so a NULL institution silently skipped
    -- the decoration and left roles and memberships diverged. The match set is
    -- still the primary source; the config row and then the programme are
    -- fallbacks; and a non-empty match set with no derivable institution now
    -- RAISES (outside the EXCEPTION block below, so it cannot be swallowed)
    -- instead of no-opping. Guard (a) already guarantees a non-empty set here.
    v_inst := COALESCE(v_inst, cfg.institution_id);
    IF v_inst IS NULL THEN
      SELECT pr.institution_id INTO v_inst
      FROM public.programs pr WHERE pr.id = cfg.program_id;
    END IF;
    IF v_inst IS NULL THEN
      RAISE EXCEPTION
        'teaching cohort %: % learner(s) matched but no institution could be derived (learners_profiles.institution_id is NULL for all of them, the config row''s institution_id is NULL, and programs.institution_id is NULL for program %) — refusing to skip the analytics cohort silently, which would leave role holders and cohort_memberships diverged. Set teaching_enterprise_cohorts.institution_id for cohort_key=''%'', or fix the learner/programme institution data.',
        cfg.cohort_key, cardinality(v_learner_ids), cfg.program_id, cfg.cohort_key;
    END IF;

    BEGIN
      SELECT c.id INTO v_cohort FROM public.cohorts c
       WHERE c.kind = cfg.cohort_key AND c.institution_id = v_inst LIMIT 1;
      IF v_cohort IS NULL THEN
        INSERT INTO public.cohorts (kind, name, institution_id, status, config)
        VALUES (cfg.cohort_key, cfg.display_name, v_inst, 'active',
                jsonb_build_object(
                  'purpose', 'analytics_only',
                  'note', 'access gate is the ' || cfg.learner_role_key || ' role, NOT this cohort'))
        RETURNING id INTO v_cohort;
      END IF;

      WITH cins AS (
        INSERT INTO public.cohort_memberships (cohort_id, member_type, member_ref, status)
        SELECT v_cohort, 'learner', l, 'active' FROM unnest(v_learner_ids) AS l
        ON CONFLICT (cohort_id, member_type, member_ref) DO NOTHING
        RETURNING 1
      )
      SELECT count(*) INTO v_coh_add FROM cins;

      WITH cdel AS (
        DELETE FROM public.cohort_memberships cm
        WHERE cm.cohort_id = v_cohort
          AND cm.member_type = 'learner'
          AND NOT (cm.member_ref = ANY (v_learner_ids))
        RETURNING 1
      )
      SELECT count(*) INTO v_coh_del FROM cdel;
    EXCEPTION WHEN OTHERS THEN
      v_coh_add := 0;
      v_coh_del := 0;
      RAISE NOTICE 'teaching cohort %: analytics cohort decoration skipped (%)',
        cfg.cohort_key, SQLERRM;
    END;

    -- DEPARTMENT-SIDE ROLE (the Senior Learners who manage the board for this
    -- cohort). Same reconcile shape, keyed on department membership — and the
    -- same blast-radius floor, because this delete is scoped only by role_id too.
    IF cfg.faculty_source = 'department_membership' AND cfg.faculty_role_key IS NOT NULL THEN
      SELECT cr.id INTO v_faculty_role
      FROM public.custom_roles cr WHERE cr.role_key = cfg.faculty_role_key;
      IF v_faculty_role IS NULL THEN
        RAISE EXCEPTION 'teaching cohort %: faculty_role_key % is missing from custom_roles; apply the role migration first',
          cfg.cohort_key, cfg.faculty_role_key;
      END IF;
      IF cfg.department_id IS NULL THEN
        RAISE EXCEPTION 'teaching cohort %: faculty_source=department_membership requires department_id',
          cfg.cohort_key;
      END IF;

      SELECT COALESCE(array_agg(DISTINCT st.profile_id), '{}'::uuid[])
        INTO v_fac_ids
      FROM public.staff st
      WHERE st.department_id = cfg.department_id
        AND st.is_active
        AND st.profile_id IS NOT NULL;

      -- ===================== GUARD (a) · ZERO-MATCH ========================
      SELECT count(*) INTO v_hold_now
      FROM public.user_roles ur WHERE ur.role_id = v_faculty_role;

      IF cardinality(v_fac_ids) = 0 AND v_hold_now > 0 THEN
        RAISE EXCEPTION
          'teaching cohort %: department rule matched 0 staff but % user(s) currently hold role % — refusing to revoke all of them. Rule that matched nobody: staff.department_id=% AND staff.is_active AND staff.profile_id IS NOT NULL. Fix department_id (or the staff records'' is_active / profile_id), or if this cohort is genuinely over do it explicitly: UPDATE public.teaching_enterprise_cohorts SET is_active=false WHERE cohort_key=''%'', or set faculty_source=''none'' to stop managing this role. No roles were changed.',
          cfg.cohort_key, v_hold_now, cfg.faculty_role_key,
          cfg.department_id, cfg.cohort_key;
      END IF;

      WITH fins AS (
        INSERT INTO public.user_roles (user_id, role_id, is_primary)
        SELECT f, v_faculty_role, false FROM unnest(v_fac_ids) AS f
        ON CONFLICT (user_id, role_id) DO NOTHING
        RETURNING 1
      )
      SELECT count(*) INTO v_fac_add FROM fins;

      -- ================== GUARD (b) · MASS REVOCATION ======================
      SELECT count(*) INTO v_hold_now
      FROM public.user_roles ur WHERE ur.role_id = v_faculty_role;

      SELECT count(*) INTO v_del_plan
      FROM public.user_roles ur
      WHERE ur.role_id = v_faculty_role
        AND NOT (ur.user_id = ANY (v_fac_ids));

      IF v_del_plan > 0 AND v_hold_now >= 4 AND (v_del_plan * 2) > v_hold_now THEN
        IF v_allow_mass THEN
          RAISE NOTICE 'teaching cohort %: mass-revocation guard BYPASSED by teaching_enterprise.allow_mass_revocation — removing % of % holders of role %',
            cfg.cohort_key, v_del_plan, v_hold_now, cfg.faculty_role_key;
        ELSE
          RAISE EXCEPTION
            'teaching cohort %: this sync would remove role % from % of % current holders (more than half) — refusing. Matched staff: %. Verify department_id=% and the staff records'' is_active / profile_id first. If this really is a whole-department turnover, re-run it deliberately in one transaction: SELECT set_config(''teaching_enterprise.allow_mass_revocation'',''on'',true); SELECT * FROM public.fn_teaching_cohort_sync(''%''); No roles were removed.',
            cfg.cohort_key, cfg.faculty_role_key, v_del_plan, v_hold_now,
            cardinality(v_fac_ids), cfg.department_id, cfg.cohort_key;
        END IF;
      END IF;

      WITH fdel AS (
        DELETE FROM public.user_roles ur
        WHERE ur.role_id = v_faculty_role
          AND NOT (ur.user_id = ANY (v_fac_ids))
        RETURNING 1
      )
      SELECT count(*) INTO v_fac_del FROM fdel;

      SELECT count(*) INTO v_fac_tot
      FROM public.user_roles ur WHERE ur.role_id = v_faculty_role;
    END IF;

    RETURN QUERY SELECT cfg.cohort_key, v_role_add, v_role_del, v_role_tot,
                        v_coh_add, v_coh_del, v_fac_add, v_fac_del, v_fac_tot;
  END LOOP;

  IF p_cohort_key IS NOT NULL AND v_matched = 0 THEN
    RAISE EXCEPTION 'teaching cohort %: no ACTIVE row in teaching_enterprise_cohorts',
      p_cohort_key;
  END IF;
END $$;

-- Cron/system-only: never callable by a browser session.
REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_sync(text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_sync(text) TO service_role;


-- ----------------------------------------------------------------------------
-- (d) The two MBA functions become THIN WRAPPERS.
--
--     Deprecation, not deletion — rollback safety. Their EXISTING return
--     signatures are preserved exactly, so app/api/cron/mba-associate-sync and
--     app/api/cron/mba-faculty-sync keep working with no code change and keep
--     logging the same real numbers.
--
--     Both now delegate to the same single sweep, so each one reconciles BOTH
--     sides of the MBA cohort and each returns only its own half. The end state
--     is identical and every step is idempotent; the two crons simply converge
--     on the same result twice a day. (They are retired in a later PR once the
--     generic cron has run green.)
--
--     These are CREATE OR REPLACE of existing SECURITY DEFINER functions — the
--     secdef-anon-revoke gate treats that as NEW, so the REVOKE lines are
--     RE-ASSERTED below even though the originals already had them.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mba_associate_sync()
RETURNS TABLE(role_added integer, role_removed integer, role_total integer,
              cohort_added integer, cohort_removed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.role_added, t.role_removed, t.role_total, t.cohort_added, t.cohort_removed
  FROM public.fn_teaching_cohort_sync('mba_associate') t;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_associate_sync() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_mba_associate_sync() TO service_role;

CREATE OR REPLACE FUNCTION public.fn_mba_faculty_sync()
RETURNS TABLE(role_added integer, role_removed integer, role_total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.faculty_added, t.faculty_removed, t.faculty_total
  FROM public.fn_teaching_cohort_sync('mba_associate') t;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_faculty_sync() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_mba_faculty_sync() TO service_role;

-- ============================================================================
-- End Phase 1a migration.
--
-- ACCEPTANCE (run by the Director after applying, or in a rolled-back txn):
--   SELECT * FROM public.fn_teaching_cohort_sync('mba_associate');
--   → role_added=0, role_removed=0, role_total=44,
--     cohort_added=0, cohort_removed=0,
--     faculty_added=0, faculty_removed=0, faculty_total=6
--   Any drift = the predicate translation is wrong. Stop and investigate.
--
-- HARDENING ACCEPTANCE (both proved in a rolled-back txn on prod, 2026-07-26):
--   1. UPDATE public.teaching_enterprise_cohorts SET semester_orders='{99}'
--        WHERE cohort_key='mba_associate';
--      SELECT * FROM public.fn_teaching_cohort_sync('mba_associate');
--      → RAISES (was: role_removed=44, role_total=0, ok:true)
--   2. INSERT a second ACTIVE row reusing learner_role_key='mba_associate'
--      → rejected 23505 by teaching_enterprise_cohorts_learner_role_active_uidx
--        (was: accepted, and the later row then revoked all 44)
-- ============================================================================
