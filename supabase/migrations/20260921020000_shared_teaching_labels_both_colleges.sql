-- ============================================================================
-- 2026-09-21 · Both colleges answer, and the system stamps who said it
--
-- FILE ONLY — NOT APPLIED to any database. Director-gated apply.
--
-- WHAT THIS CHANGES, AND WHY IT IS A SECOND FILE.
-- 20260908010000_shared_teaching_relationship_labels.sql IS APPLIED to
-- production — verified 2026-08-20 by calling the function it creates, which
-- answered with its own 22023 message ('An institution is required to read
-- shared teaching relationships') while a deliberately fake function name on the
-- same endpoint answered PGRST202. That negative control is what makes the
-- reading decisive rather than a guess. An applied migration is never edited in
-- place on this estate: rewriting one is how a DROP+CREATE has previously been
-- rolled back to a stale definition, because the file the next rebuild replays
-- is no longer the file that was applied. So this is an ALTER on top, not a
-- rewrite underneath.
--
-- The same probe read `content-range: */0` — the table holds ZERO rows. That is
-- what makes a NOT NULL column addition safe here and it is asserted again in
-- section 1 below rather than trusted, because the gap between writing this file
-- and applying it is where a first row would appear.
--
-- TWO DIRECTOR DECISIONS (interview of 2026-08-18) CONTRADICT WHAT WAS BUILT.
--
-- DECISION 5 — BOTH colleges label the arrangement, and both answers are shown.
--   Built: `UNIQUE (giver, receiver, academic_year)` — one label per
--   relationship — with INSERT and UPDATE scoped to
--   `role_has_institution_access(receiver_institution_id)`, so only the
--   receiving college could ever answer.
--   Why the first design was wrong, in the Director's terms: the lending college
--   is a party to the arrangement, not a subject of it. "We planned this" and
--   "they could not staff it" are two different sentences about the same 53
--   assignments, and the disagreement between them is information the council
--   would otherwise never see. A single label forces one college's reading to
--   stand in for both and silently deletes the other.
--   Fixed here: a fourth column, `labelled_by_institution_id`, enters the unique
--   key, so the grain becomes one label PER SIDE per relationship per year. Two
--   rows maximum. The write policies scope on that column instead of on the
--   receiver, and a CHECK confines it to the two colleges actually named in the
--   row, so a third college cannot file an opinion about someone else's
--   arrangement.
--
-- DECISION 1 — authorship is stamped by the system; nobody can put another
--   person's name on a label.
--   Built: `set_by` arrived in the request body
--   (hooks/academic/use-shared-teaching-labels.ts sent `set_by: user?.id`) and
--   no policy constrained it. The write goes straight at the table through
--   PostgREST under the `authenticated` role's table-level INSERT/UPDATE grant,
--   so any caller who passes the RLS predicate could put ANY profiles.id in
--   that column — including on an UPDATE of a row somebody else wrote. A label
--   is a claim about a college's staffing; an attributable claim that can be
--   attributed to the wrong person is worse than an anonymous one, because it
--   reads as evidence.
--   Fixed here: a BEFORE INSERT OR UPDATE trigger overwrites `set_by` with the
--   real `auth.uid()`. Client-supplied values are not rejected, they are simply
--   overwritten — rejecting would leak which values are wrong.
--
-- THREE MORE DECISIONS GET THEIR STORAGE HERE.
--
-- DECISION 6 — a label can be corrected, and the system keeps a note that it
--   was. New `edited_at`, NULL until the first correction. NULL and "never
--   edited" are the same fact, so no default and no zero.
--
-- DECISION 8 — a label carries forward MARKED 'from last year', never silently
--   as current. New `carried_forward_from_academic_year_id`. NOTHING WRITES IT
--   YET and this file deliberately ships no carry-forward job: the column exists
--   so that when one is written the marker cannot be forgotten, and until then
--   every row reads as an answer given for its own year, which is true.
--
-- DECISION 12 — anything the platform cannot count reads "nothing records this
--   yet", never a bare 0. Enforced in the read function by returning NULL for a
--   side that has not answered — never an empty object, never a zero — so the
--   screen can tell "they said nothing" from "they said neither".
--
-- ONE MORE FIX, NOT A DECISION — A GUARD THAT DISAGREED WITH ITSELF.
--   All three RLS policies on this table admit `is_super_admin() OR is_admin()`.
--   The read function's guard admits only `is_super_admin()`. So an is_admin()
--   viewer without `academic.shared_teaching.label.view` can SELECT the table
--   directly and is refused 42501 by the function that exists to read it — the
--   screen shows an error while the data sits one query away. `is_admin()` is
--   added to the function guard so the two agree.
--
-- STILL NO SCORE. No ranking, grade, percentage or ordering of colleges is
-- added by this file. Two named states, an absence, and now two independent
-- answers that are allowed to differ.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Precondition — the table must still be empty
--
-- `labelled_by_institution_id` is NOT NULL and has no default, because there is
-- no honest default: guessing 'the receiver' for an existing row would silently
-- attribute one college's sentence to whichever side this migration assumed.
-- With zero rows there is nothing to guess about. If a row has appeared since
-- this file was written, that assumption is void and the migration must stop
-- LOUDLY here rather than fail later with a bare 23502 that says nothing about
-- why.
-- ----------------------------------------------------------------------------

DO $precondition$
DECLARE
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.shared_teaching_labels;

  IF v_rows > 0 THEN
    RAISE EXCEPTION
      'shared teaching labels: expected an empty table, found % row(s). '
      'labelled_by_institution_id cannot be backfilled by assumption — each '
      'existing row must be attributed to the college that actually wrote it '
      'before this migration can run.', v_rows;
  END IF;

  RAISE NOTICE 'shared teaching labels: table empty, safe to add a NOT NULL side';
END;
$precondition$;

-- ----------------------------------------------------------------------------
-- 2 · The side that is speaking
-- ----------------------------------------------------------------------------

ALTER TABLE public.shared_teaching_labels
  ADD COLUMN IF NOT EXISTS labelled_by_institution_id uuid;

ALTER TABLE public.shared_teaching_labels
  ALTER COLUMN labelled_by_institution_id SET NOT NULL;

ALTER TABLE public.shared_teaching_labels
  DROP CONSTRAINT IF EXISTS shared_teaching_labels_labelled_by_fkey,
  ADD  CONSTRAINT shared_teaching_labels_labelled_by_fkey
       FOREIGN KEY (labelled_by_institution_id)
       REFERENCES public.institutions(id) ON DELETE CASCADE;

-- The speaker must be one of the two colleges named in the row. Without this a
-- third college holding the manage key and a wide institution scope could file
-- an opinion on an arrangement it is not part of, and the read function would
-- print it beside the two real answers with nothing marking it as an outsider's.
ALTER TABLE public.shared_teaching_labels
  DROP CONSTRAINT IF EXISTS shared_teaching_labels_labelled_by_is_a_party,
  ADD  CONSTRAINT shared_teaching_labels_labelled_by_is_a_party
       CHECK (labelled_by_institution_id IN (giver_institution_id, receiver_institution_id));

COMMENT ON COLUMN public.shared_teaching_labels.labelled_by_institution_id IS
  'Which of the two colleges in this row is speaking. Part of the unique key, so '
  'each side holds its own answer and the two are allowed to differ — a '
  'disagreement is a finding, not a data error.';

-- ----------------------------------------------------------------------------
-- 3 · One label per SIDE, not one per relationship
--
-- The old name is dropped rather than reused. A constraint whose name says
-- "unique_relationship" while its columns say "unique per side" is a trap for
-- whoever reads the name and trusts it — this estate has already been bitten by
-- a constraint named for a rule it does not enforce (`unique_position` on
-- lc_members carries user_id inside the key, so a different person passes it).
-- Same drop-and-rename idiom as
-- 20260801000800_procurement_number_unique_per_institution.sql.
-- ----------------------------------------------------------------------------

ALTER TABLE public.shared_teaching_labels
    DROP CONSTRAINT IF EXISTS shared_teaching_labels_unique_relationship,
    ADD  CONSTRAINT shared_teaching_labels_unique_side
         UNIQUE (giver_institution_id, receiver_institution_id,
                 academic_year_id, labelled_by_institution_id);

COMMENT ON TABLE public.shared_teaching_labels IS
  'One college''s own reading of one cross-campus teaching relationship for one '
  'academic year: planned_partnership or covering_a_shortage. BOTH the giving '
  'and the receiving college may answer, each in its own row, and the two answers '
  'are shown side by side. No row from a side means that side has not said, which '
  'is a real state and is never rendered as either value.';

-- ----------------------------------------------------------------------------
-- 4 · A correction leaves a mark (decision 6)
--
-- NULL until the first correction. There is no "edited zero times" to store: an
-- answer nobody has revised and an answer revised at an unknown time are
-- different facts, and a 0 or an epoch default would make them look the same.
-- ----------------------------------------------------------------------------

ALTER TABLE public.shared_teaching_labels
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.shared_teaching_labels.edited_at IS
  'When this side last corrected its answer. NULL means never corrected — not '
  'zero, not the creation time. Stamped by the database in '
  'fn_shared_teaching_label_stamp_author, so a correction cannot be made to look '
  'like an original answer.';

-- ----------------------------------------------------------------------------
-- 5 · A carried-forward answer says so (decision 8)
--
-- NOTHING WRITES THIS COLUMN YET, on purpose. The decision is that a label may
-- carry forward but only MARKED, never silently as this year's answer. Adding
-- the marker before adding the carry-forward is the order that makes the marker
-- impossible to skip later; adding the job first would make "unmarked" the
-- shipped default for however long the column took to follow.
--
-- ON DELETE SET NULL, not CASCADE: retiring an old academic year must not delete
-- a college's stated position, only the pointer back to where it came from.
-- ----------------------------------------------------------------------------

ALTER TABLE public.shared_teaching_labels
  ADD COLUMN IF NOT EXISTS carried_forward_from_academic_year_id uuid;

ALTER TABLE public.shared_teaching_labels
  DROP CONSTRAINT IF EXISTS shared_teaching_labels_carried_forward_fkey,
  ADD  CONSTRAINT shared_teaching_labels_carried_forward_fkey
       FOREIGN KEY (carried_forward_from_academic_year_id)
       REFERENCES public.academic_years(id) ON DELETE SET NULL;

-- A label carried forward from the year it already belongs to is not a
-- carry-forward, it is a marker pointing at itself, and it would print
-- "carried forward from 2026-27" on a 2026-27 answer.
ALTER TABLE public.shared_teaching_labels
  DROP CONSTRAINT IF EXISTS shared_teaching_labels_carried_forward_is_another_year,
  ADD  CONSTRAINT shared_teaching_labels_carried_forward_is_another_year
       CHECK (
         carried_forward_from_academic_year_id IS NULL
         OR carried_forward_from_academic_year_id <> academic_year_id
       );

COMMENT ON COLUMN public.shared_teaching_labels.carried_forward_from_academic_year_id IS
  'Set when this answer was brought forward from an earlier year rather than '
  'given fresh for this one. NULL means the answer was given for its own year. '
  'No job writes this yet — the marker exists first so that a carry-forward '
  'cannot ship unmarked.';

-- ----------------------------------------------------------------------------
-- 6 · Anti-spoof authorship stamp (decision 1)
--
-- SECURITY INVOKER so `auth.uid()` is the REAL caller rather than the function
-- owner. A definer trigger here would report the migration owner as the author
-- of every label ever set, which is precisely the failure this exists to
-- prevent.
--
-- Guarded on `auth.uid() IS NOT NULL` so a service-role or migration write is
-- not blanked to NULL. The client's value never survives: it is overwritten, not
-- validated, because a validation error would tell a caller which id was
-- expected.
--
-- `edited_at` and `updated_at` are stamped OUTSIDE that guard. They record that
-- the row changed, which is true regardless of who changed it — a service-role
-- correction is still a correction, and an under-reported edit is the one
-- outcome decision 6 rules out.
--
-- `set_at` is deliberately NOT re-stamped. It is when this side FIRST answered;
-- `edited_at` is when it last changed its mind. Re-stamping set_at would make
-- edited_at redundant and erase the fact that an answer has stood since a
-- particular date.
--
-- Modelled on fn_cohort_proposal_stamp_proposer in
-- 20260731096000_cohort_proposal_sod.sql, including its anon lockdown.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_shared_teaching_label_stamp_author()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.set_by := auth.uid();
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.edited_at  := now();
    NEW.set_at     := OLD.set_at;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_shared_teaching_label_stamp_author() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_shared_teaching_label_stamp_author() IS
  'Stamps set_by from the real auth.uid() on every write and edited_at on every '
  'UPDATE, and pins set_at to its original value. Invoker, so the caller is the '
  'author. Nobody can put another person''s name on a college''s stated position.';

DROP TRIGGER IF EXISTS trg_shared_teaching_labels_stamp_author ON public.shared_teaching_labels;
CREATE TRIGGER trg_shared_teaching_labels_stamp_author
  BEFORE INSERT OR UPDATE ON public.shared_teaching_labels
  FOR EACH ROW EXECUTE FUNCTION public.fn_shared_teaching_label_stamp_author();

-- ----------------------------------------------------------------------------
-- 7 · Write policies follow the speaker, not the receiver (decision 5)
--
-- `role_has_institution_access(labelled_by_institution_id)` is the whole change:
-- a college may write the row that carries its OWN id in that column and no
-- other. Combined with the CHECK in section 2, that means each college can write
-- exactly one row per relationship per year — its own side.
--
-- A role whose institution_scope is 'all' still passes this, as it does
-- everywhere else on this estate. That is not new latitude and it is not
-- silent: the trigger in section 6 stamps the real author onto the row, so a
-- wide-scope write is attributable to the person who made it rather than
-- anonymous.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "shared_teaching_labels_insert" ON public.shared_teaching_labels;
CREATE POLICY "shared_teaching_labels_insert" ON public.shared_teaching_labels
FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (
        public.user_has_permission('academic.shared_teaching.label.manage')
        AND public.role_has_institution_access(labelled_by_institution_id)
    )
);

DROP POLICY IF EXISTS "shared_teaching_labels_update" ON public.shared_teaching_labels;
CREATE POLICY "shared_teaching_labels_update" ON public.shared_teaching_labels
FOR UPDATE USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
        public.user_has_permission('academic.shared_teaching.label.manage')
        AND public.role_has_institution_access(labelled_by_institution_id)
    )
)
WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (
        public.user_has_permission('academic.shared_teaching.label.manage')
        AND public.role_has_institution_access(labelled_by_institution_id)
    )
);

-- The SELECT policy is unchanged and is re-stated here only as a reader's note:
-- both ends already read both rows, which is what makes "shown side by side"
-- possible without widening anything.

-- ----------------------------------------------------------------------------
-- 8 · Reading BOTH answers
--
-- The relationship is still the grain of the LIST — one line per giver x
-- receiver x year — but each line now carries two independent answers instead of
-- one shared answer. `shared_teaching_labels` is joined twice, each join pinned
-- to one side of the relationship. The unique key added in section 3 is what
-- guarantees each join matches at most one row, so no line can fan out.
--
-- A side that has not answered comes back as JSON null for the WHOLE object, not
-- as an object full of nulls and not as a zero (decision 12). The caller can
-- then tell "they have not said" from "they said neither", which is the
-- distinction this whole feature exists to preserve.
--
-- `is_admin()` joins the guard here — see the header. COALESCE on every
-- predicate is load-bearing and not padding: a helper returning NULL makes the
-- condition NULL, `NOT NULL` is NULL, the IF never fires, and the function hands
-- the data to an unauthorised caller.
-- ----------------------------------------------------------------------------

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
    OR COALESCE(public.is_admin(), false)
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
        -- Which side the ASKING institution is on. It decides which of the two
        -- answers below belongs to the viewer, not whether they may answer at
        -- all — both sides may, since decision 5.
        'direction',               CASE
                                     WHEN g.receiver_institution_id = p_institution_id
                                       THEN 'incoming'
                                     ELSE 'outgoing'
                                   END,

        -- NULL for the whole object when that college has not answered. Never an
        -- object of nulls, never a zero.
        'giver_label',    CASE WHEN gl.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
                            'label',                                   gl.label,
                            'set_at',                                  gl.set_at,
                            'set_by_name',                             gsb.full_name,
                            'edited_at',                               gl.edited_at,
                            'carried_forward_from_academic_year_id',   gl.carried_forward_from_academic_year_id,
                            'carried_forward_from_academic_year_name', gcf.academic_year_name
                          ) END,

        'receiver_label', CASE WHEN rl.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
                            'label',                                   rl.label,
                            'set_at',                                  rl.set_at,
                            'set_by_name',                             rsb.full_name,
                            'edited_at',                               rl.edited_at,
                            'carried_forward_from_academic_year_id',   rl.carried_forward_from_academic_year_id,
                            'carried_forward_from_academic_year_name', rcf.academic_year_name
                          ) END
      )
      ORDER BY g.assignments DESC, gi.name, ri.name
    ),
    '[]'::jsonb
  ) INTO v_relationships
  FROM grouped g
  LEFT JOIN public.institutions   gi ON gi.id = g.giver_institution_id
  LEFT JOIN public.institutions   ri ON ri.id = g.receiver_institution_id
  LEFT JOIN public.academic_years ay ON ay.id = g.academic_year_id

  -- The giving college's own answer.
  LEFT JOIN public.shared_teaching_labels gl
         ON gl.giver_institution_id       = g.giver_institution_id
        AND gl.receiver_institution_id    = g.receiver_institution_id
        AND gl.academic_year_id           = g.academic_year_id
        AND gl.labelled_by_institution_id = g.giver_institution_id
  LEFT JOIN public.profiles       gsb ON gsb.id = gl.set_by
  LEFT JOIN public.academic_years gcf ON gcf.id = gl.carried_forward_from_academic_year_id

  -- The receiving college's own answer.
  LEFT JOIN public.shared_teaching_labels rl
         ON rl.giver_institution_id       = g.giver_institution_id
        AND rl.receiver_institution_id    = g.receiver_institution_id
        AND rl.academic_year_id           = g.academic_year_id
        AND rl.labelled_by_institution_id = g.receiver_institution_id
  LEFT JOIN public.profiles       rsb ON rsb.id = rl.set_by
  LEFT JOIN public.academic_years rcf ON rcf.id = rl.carried_forward_from_academic_year_id;

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
  'Cross-campus teaching relationships one institution is part of, each carrying '
  'the giving college''s answer and the receiving college''s answer as two '
  'independent objects — either of which is NULL when that side has not said — '
  'plus a separate count of central-office traffic which carries no label. '
  'Definer, so the list is complete rather than the caller''s slice; refuses with '
  '42501 rather than returning an empty array.';

-- Re-asserted on this CREATE OR REPLACE, not assumed to survive it. Supabase's
-- default ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to
-- `anon` directly, separately from PUBLIC — and `anon` is itself a member of
-- PUBLIC, so revoking one and leaving the other still leaves the function
-- callable by any unauthenticated client holding the anon key that ships in
-- every page bundle of https://www.jkkn.ai. Both are named.
REVOKE EXECUTE ON FUNCTION public.fn_shared_teaching_relationships(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_shared_teaching_relationships(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9 · Assert the shape this file claims to have produced
--
-- A migration that runs without error has proved it PARSED, never that it did
-- what its comments say. Each check below names one promise made above.
-- ----------------------------------------------------------------------------

DO $verify$
DECLARE
  v_side_cols     integer;
  v_unique_side   integer;
  v_old_unique    integer;
  v_trigger       integer;
  v_anon_can_exec boolean;
BEGIN
  SELECT count(*) INTO v_side_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'shared_teaching_labels'
     AND column_name  IN ('labelled_by_institution_id', 'edited_at',
                          'carried_forward_from_academic_year_id');

  IF v_side_cols <> 3 THEN
    RAISE EXCEPTION 'shared teaching labels: expected 3 new columns, found %', v_side_cols;
  END IF;

  SELECT count(*) INTO v_unique_side
    FROM pg_constraint
   WHERE conrelid = 'public.shared_teaching_labels'::regclass
     AND conname  = 'shared_teaching_labels_unique_side';

  SELECT count(*) INTO v_old_unique
    FROM pg_constraint
   WHERE conrelid = 'public.shared_teaching_labels'::regclass
     AND conname  = 'shared_teaching_labels_unique_relationship';

  IF v_unique_side <> 1 OR v_old_unique <> 0 THEN
    RAISE EXCEPTION
      'shared teaching labels: the per-side unique key did not replace the '
      'per-relationship one (per-side %, per-relationship %)',
      v_unique_side, v_old_unique;
  END IF;

  SELECT count(*) INTO v_trigger
    FROM pg_trigger
   WHERE tgrelid = 'public.shared_teaching_labels'::regclass
     AND tgname  = 'trg_shared_teaching_labels_stamp_author'
     AND NOT tgisinternal;

  IF v_trigger <> 1 THEN
    RAISE EXCEPTION
      'shared teaching labels: the authorship stamp is not attached — set_by '
      'would stay client-supplied';
  END IF;

  -- The EFFECTIVE privilege, not the ACL text. An ACL naming both anon and
  -- PUBLIC still grants anon after anon alone is revoked, because anon is a
  -- member of PUBLIC — reading the ACL string reports that as fixed when it is
  -- not.
  SELECT has_function_privilege(
           'anon',
           'public.fn_shared_teaching_relationships(uuid)',
           'EXECUTE'
         ) INTO v_anon_can_exec;

  IF v_anon_can_exec THEN
    RAISE EXCEPTION
      'shared teaching labels: anon can still execute '
      'fn_shared_teaching_relationships — the read is public';
  END IF;

  RAISE NOTICE
    'shared teaching labels: both colleges may now answer, each in its own row, '
    'and the database stamps who said it';
END;
$verify$;
