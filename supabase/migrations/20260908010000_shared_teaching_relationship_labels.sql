-- ============================================================================
-- 2026-09-08 · A college says whether shared teaching is a partnership or a
--              shortage
--
-- FILE ONLY — NOT APPLIED to any database. Director-gated apply.
--
-- WHAT THIS ADDS. One label per teaching RELATIONSHIP — giver college, receiver
-- college, academic year — carrying exactly one of two values:
--
--     'planned_partnership'   we meant to do this
--     'covering_a_shortage'   we could not staff it ourselves
--
-- Absence is a third state and it is NOT stored: a relationship with no row is
-- "not yet labelled". That distinction is the whole point. Defaulting an
-- unlabelled relationship to either value would put words in a college's mouth,
-- and defaulting it to a neutral third stored value would make "we have not
-- decided" indistinguishable from "we decided it is neither".
--
-- WHY IT EXISTS (measured on production 2026-08-14, not inferred). The cluster
-- holds 70 cross-campus teaching assignments across 13 people. Dental → Allied
-- Health is 53 of them, Pharmacy → Allied Health another 12. Allied Health
-- receives about 93% of all cross-campus teaching while holding about 12% of the
-- cluster's active learners.
--
-- Read as volume that is the best collaboration figure in the cluster. Read as
-- staffing it is a dependency on two sibling colleges. Nothing in the data can
-- settle which reading is right, because the two readings are not different
-- numbers — they are the same number with different intent behind it. The only
-- party that knows the intent is the college doing the receiving. This table is
-- where that college says so, once, instead of the council inferring it.
--
-- WHY THE RECEIVING COLLEGE HOLDS THE PEN. "Covering a shortage" is a statement
-- about the receiver's own staffing, and no one else is entitled to make it on
-- their behalf. The write policies below scope INSERT and UPDATE to
-- `role_has_institution_access(receiver_institution_id)`, so a college can label
-- teaching it receives and cannot touch the label on anyone else's. The giver
-- can READ the label on a relationship it is part of — it is being described,
-- and being described silently is worse than being described.
--
-- WHY NOT ON THE COUNCIL PAGE. `/accreditation/cac` stores nothing by explicit
-- design: every figure there is derived at read time and nothing is entered by
-- anyone. A write control there would break that contract. The label is set
-- where a cross-campus teaching assignment is actually managed — Staff Planning,
-- under the academic module — and the council reads it like it reads everything
-- else.
--
-- NO SCORE. There is no ranking, grade, percentage or ordering of colleges
-- anywhere in this file. Two named states and an absence.
--
-- THE GRAIN IS THE RELATIONSHIP, NOT THE ROW. A label per `staff_plan_courses`
-- row would be 70 clicks describing one decision, and the 70 would drift apart
-- within a term. The unique key is (giver, receiver, academic year), which is
-- also the grain `v_cac_exchange_edges` already aggregates to — minus the
-- academic year, which `staff_plans.academic_year_id` carries NOT NULL and which
-- matters here because "we were short last year" is not "we are short now".
--
-- HUB TRAFFIC IS OUT OF SCOPE, DELIBERATELY. Teaching to or from JKKN Main
-- Office is shared central infrastructure, not a college choosing to lean on a
-- sibling. The read function below reports it as a separate count so a college
-- is never shown a shorter list than its real cross-campus load, but there is no
-- label for it, because "partnership or shortage" is not a question you can ask
-- about the central office.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · The table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shared_teaching_labels (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    giver_institution_id   UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    receiver_institution_id UUID       NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    academic_year_id       UUID        NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,

    -- Exactly two values, enforced by the database. A free-text column drifts
    -- within a month: 'shortage', 'Covering shortage', 'covering a shortage  '
    -- all mean the same thing to a person and are three different labels to
    -- every count that reads them afterwards.
    label                  TEXT        NOT NULL,

    -- Who said so and when. A label with no author is an anonymous claim about a
    -- college's staffing, which is the one thing this must never be.
    set_by                 UUID        REFERENCES public.profiles(id),
    set_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT shared_teaching_labels_label_check
        CHECK (label IN ('planned_partnership', 'covering_a_shortage')),

    -- A college cannot lend to itself; such a row would be a data error being
    -- given a meaning.
    CONSTRAINT shared_teaching_labels_distinct_colleges
        CHECK (giver_institution_id <> receiver_institution_id),

    -- One label per relationship per year. This is what makes "change the label"
    -- an UPDATE rather than a second opinion sitting beside the first.
    CONSTRAINT shared_teaching_labels_unique_relationship
        UNIQUE (giver_institution_id, receiver_institution_id, academic_year_id)
);

COMMENT ON TABLE public.shared_teaching_labels IS
  'The receiving college''s own reading of one cross-campus teaching '
  'relationship for one academic year: planned_partnership or '
  'covering_a_shortage. No row means not yet labelled, which is a real state '
  'and is never rendered as either value.';

COMMENT ON COLUMN public.shared_teaching_labels.giver_institution_id IS
  'The college whose team member teaches away from home (profiles.institution_id '
  'of the person behind staff_plan_courses.staff_id).';

COMMENT ON COLUMN public.shared_teaching_labels.receiver_institution_id IS
  'The college hosting the plan (staff_plans.institution_id). This college owns '
  'the label.';

CREATE INDEX IF NOT EXISTS idx_shared_teaching_labels_receiver
    ON public.shared_teaching_labels(receiver_institution_id, academic_year_id);

CREATE INDEX IF NOT EXISTS idx_shared_teaching_labels_giver
    ON public.shared_teaching_labels(giver_institution_id, academic_year_id);

-- ----------------------------------------------------------------------------
-- 2 · Anon lockdown
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
-- TO anon, authenticated, service_role`, so this table is created with the full
-- anon grant unless it is taken away here. The anon key is embedded in every
-- page bundle of https://www.jkkn.ai.
-- ----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.shared_teaching_labels FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.shared_teaching_labels TO authenticated;
GRANT ALL ON TABLE public.shared_teaching_labels TO service_role;

-- ----------------------------------------------------------------------------
-- 3 · Row level security
--
-- No DELETE policy, on purpose. A label is changed, not withdrawn — and with no
-- DELETE policy the only route back to "not yet labelled" is a deliberate
-- service-role action, which is the correct amount of friction for erasing a
-- college's stated position.
-- ----------------------------------------------------------------------------

ALTER TABLE public.shared_teaching_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_teaching_labels_select" ON public.shared_teaching_labels;
DROP POLICY IF EXISTS "shared_teaching_labels_insert" ON public.shared_teaching_labels;
DROP POLICY IF EXISTS "shared_teaching_labels_update" ON public.shared_teaching_labels;

-- Both ends of the relationship may read it. The giver is named in the row.
CREATE POLICY "shared_teaching_labels_select" ON public.shared_teaching_labels
FOR SELECT USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
        public.user_has_permission('academic.shared_teaching.label.view')
        AND (
            public.role_has_institution_access(receiver_institution_id)
            OR public.role_has_institution_access(giver_institution_id)
        )
    )
);

-- Only the receiving college writes. `role_has_institution_access` is the
-- repo's standard scope test: it is true for a viewer's own institution, for a
-- role whose institution_scope is 'all', and for an explicit grant in
-- user_institution_access — and false for a sibling college, which is the whole
-- requirement here.
CREATE POLICY "shared_teaching_labels_insert" ON public.shared_teaching_labels
FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (
        public.user_has_permission('academic.shared_teaching.label.manage')
        AND public.role_has_institution_access(receiver_institution_id)
    )
);

CREATE POLICY "shared_teaching_labels_update" ON public.shared_teaching_labels
FOR UPDATE USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
        public.user_has_permission('academic.shared_teaching.label.manage')
        AND public.role_has_institution_access(receiver_institution_id)
    )
)
WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (
        public.user_has_permission('academic.shared_teaching.label.manage')
        AND public.role_has_institution_access(receiver_institution_id)
    )
);

-- ----------------------------------------------------------------------------
-- 4 · Reading the relationships
--
-- WHY A DEFINER FUNCTION. The giver of a cross-campus assignment is
-- `profiles.institution_id` of the person behind `staff_plan_courses.staff_id`.
-- Reached from the browser under the caller's own RLS, that join returns the
-- caller's slice of `profiles`, so a college would be shown a shorter list than
-- its real one and could not tell a hidden row from an absent one. That exact
-- failure was diagnosed on this estate on 2026-08-01 for the council's own
-- collaboration panel. The list a college labels must be complete or the label
-- describes something other than what the council counts.
--
-- The guard is the caller's, not the definer's: the function refuses anyone
-- without the view key or without access to the institution asked about, and
-- refuses LOUDLY (42501) rather than returning an empty array, because an empty
-- array is indistinguishable from a college with no shared teaching.
--
-- COALESCE on BOTH predicates is load-bearing, not padding. A guard helper
-- returning NULL makes the condition NULL, `NOT NULL` is NULL, the IF never
-- fires, and the function hands the data to an unauthorised caller.
-- ----------------------------------------------------------------------------

-- ONE PARAMETER, DELIBERATELY. An academic-year filter looks obviously useful
-- and would be wrong here: `academic_years` is per-institution, so the year id a
-- caller holds belongs to its OWN college, and filtering outgoing rows on it
-- would silently drop every relationship where the plan lives at the sibling.
-- Each row carries its own academic year name instead, and the caller groups.
CREATE OR REPLACE FUNCTION public.fn_shared_teaching_relationships(
    p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_relationships jsonb;
  v_hub_assignments integer;
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'An institution is required to read shared teaching relationships'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR (
      COALESCE(public.user_has_permission('academic.shared_teaching.label.view'), false)
      AND COALESCE(public.role_has_institution_access(p_institution_id), false)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to read shared teaching relationships for this institution'
      USING ERRCODE = '42501';
  END IF;

  WITH hub AS (
    SELECT id FROM public.institutions
     WHERE lower(btrim(name)) = 'jkkn main office'
  ),
  edges AS (
    SELECT
      p.institution_id  AS giver_institution_id,
      sp.institution_id AS receiver_institution_id,
      sp.academic_year_id,
      st.id             AS person_id,
      spc.id            AS unit_id
    FROM public.staff_plan_courses spc
    JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
    JOIN public.staff st       ON st.id = spc.staff_id
    JOIN public.profiles p     ON p.id  = st.profile_id
    WHERE p.institution_id IS DISTINCT FROM sp.institution_id
      AND p.institution_id  IS NOT NULL
      AND sp.institution_id IS NOT NULL
      AND (p.institution_id = p_institution_id OR sp.institution_id = p_institution_id)
  ),
  peer AS (
    SELECT * FROM edges
     WHERE giver_institution_id    NOT IN (SELECT id FROM hub)
       AND receiver_institution_id NOT IN (SELECT id FROM hub)
  ),
  grouped AS (
    SELECT
      e.giver_institution_id,
      e.receiver_institution_id,
      e.academic_year_id,
      count(DISTINCT e.unit_id)   AS assignments,
      count(DISTINCT e.person_id) AS people
    FROM peer e
    GROUP BY 1, 2, 3
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'giver_institution_id',    g.giver_institution_id,
        'giver_name',              gi.name,
        'receiver_institution_id', g.receiver_institution_id,
        'receiver_name',           ri.name,
        'academic_year_id',        g.academic_year_id,
        'academic_year_name',      ay.academic_year_name,
        'assignments',             g.assignments,
        'people',                  g.people,
        -- 'incoming' is the direction this institution may label.
        'direction',               CASE
                                     WHEN g.receiver_institution_id = p_institution_id
                                       THEN 'incoming'
                                     ELSE 'outgoing'
                                   END,
        -- NULL, never a substitute value. The caller renders this as
        -- "not yet labelled".
        'label',                   stl.label,
        'label_set_at',            stl.set_at,
        'label_set_by_name',       sb.full_name
      )
      ORDER BY g.assignments DESC, gi.name, ri.name
    ),
    '[]'::jsonb
  ) INTO v_relationships
  FROM grouped g
  LEFT JOIN public.institutions   gi ON gi.id = g.giver_institution_id
  LEFT JOIN public.institutions   ri ON ri.id = g.receiver_institution_id
  LEFT JOIN public.academic_years ay ON ay.id = g.academic_year_id
  LEFT JOIN public.shared_teaching_labels stl
         ON stl.giver_institution_id    = g.giver_institution_id
        AND stl.receiver_institution_id = g.receiver_institution_id
        AND stl.academic_year_id        = g.academic_year_id
  LEFT JOIN public.profiles sb ON sb.id = stl.set_by;

  -- Reported, not hidden: teaching to or from the central office is real load
  -- that carries no label. A college that sees only its peer list must still be
  -- told the rest of its cross-campus teaching exists.
  WITH hub AS (
    SELECT id FROM public.institutions
     WHERE lower(btrim(name)) = 'jkkn main office'
  )
  SELECT count(*)::integer INTO v_hub_assignments
  FROM public.staff_plan_courses spc
  JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
  JOIN public.staff st       ON st.id = spc.staff_id
  JOIN public.profiles p     ON p.id  = st.profile_id
  WHERE p.institution_id IS DISTINCT FROM sp.institution_id
    AND p.institution_id  IS NOT NULL
    AND sp.institution_id IS NOT NULL
    AND (p.institution_id = p_institution_id OR sp.institution_id = p_institution_id)
    AND (
      p.institution_id  IN (SELECT id FROM hub)
      OR sp.institution_id IN (SELECT id FROM hub)
    );

  RETURN jsonb_build_object(
    'relationships',   v_relationships,
    'hub_assignments', coalesce(v_hub_assignments, 0)
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_shared_teaching_relationships(uuid) IS
  'Cross-campus teaching relationships one institution is part of, each with its '
  'label or NULL for not yet labelled, plus a separate count of central-office '
  'traffic which carries no label. Definer, so the list is complete rather than '
  'the caller''s slice; refuses with 42501 rather than returning an empty array.';

-- Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE on every new
-- function to `anon` directly, separately from PUBLIC. Revoking PUBLIC alone
-- leaves it callable by any unauthenticated client holding the anon key.
REVOKE EXECUTE ON FUNCTION public.fn_shared_teaching_relationships(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_shared_teaching_relationships(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5 · Grant the two keys in the same file that demands them
--
-- A key created and granted to nobody is a feature that ships, looks built, and
-- is unreachable for every real operator — an RLS denial returns zero rows with
-- error: null, so nothing logs and nothing fails. That has shipped repeatedly on
-- this estate. Both keys are also registered in lib/constants/permissions.ts in
-- the same pull request, which is what makes them appear as toggles in Role
-- Management afterwards.
--
-- Membership is tested with `->> ... ::boolean IS TRUE`. `permissions ? 'key'`
-- tests KEY EXISTENCE, so a key present and explicitly false reports as held.
-- ----------------------------------------------------------------------------

DO $grant$
DECLARE
  -- The college leadership who can answer "did we plan this or are we short".
  c_manage_roles CONSTANT text[] := ARRAY['principal', 'vice_principal', 'hod'];
  v_role   text;
  v_found  integer := 0;
  v_manage integer := 0;
BEGIN
  FOREACH v_role IN ARRAY c_manage_roles LOOP
    IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = v_role) THEN
      RAISE NOTICE 'shared teaching label: role % not present, skipped', v_role;
      CONTINUE;
    END IF;

    v_found := v_found + 1;

    UPDATE public.custom_roles
       SET permissions = coalesce(permissions, '{}'::jsonb)
                         || jsonb_build_object(
                              'academic.shared_teaching.label.view',   true,
                              'academic.shared_teaching.label.manage', true
                            ),
           updated_at  = now()
     WHERE role_key = v_role;
  END LOOP;

  IF v_found = 0 THEN
    RAISE EXCEPTION
      'shared teaching label: none of the intended roles (%) exist — the label '
      'would be super-admin-only', array_to_string(c_manage_roles, ', ');
  END IF;

  SELECT count(*) INTO v_manage
    FROM public.custom_roles
   WHERE role_key = ANY (c_manage_roles)
     AND (permissions ->> 'academic.shared_teaching.label.manage')::boolean IS TRUE
     AND (permissions ->> 'academic.shared_teaching.label.view')::boolean IS TRUE;

  IF v_manage <> v_found THEN
    RAISE EXCEPTION
      'shared teaching label: expected % roles holding both keys, found %',
      v_found, v_manage;
  END IF;

  RAISE NOTICE 'shared teaching label: % role(s) can now label their own '
               'incoming cross-campus teaching', v_manage;
END;
$grant$;
