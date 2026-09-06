-- ============================================================================
-- WHY a leadership post was given, and the condition on which it ends.
--
-- Date: 2026-08-05
-- Status: **FILE ONLY / NOT APPLIED TO PRODUCTION.**
--         Nothing in this file has been run against kvizhngldtiuufknvehv, not
--         even inside a BEGIN..ROLLBACK. Apply is Director-gated. The header and
--         supabase/SQL_FILE_INDEX.md must continue to agree.
--
-- THE DECISION THIS SERVES (Director, 2026-08-05, decision 10)
-- ------------------------------------------------------------
-- Dr. RAJENDIRAN K M (cao@jkkn.ac.in) is Principal of JKKN College of Education
-- **PERSONALLY — explicitly NOT because he is CAO** — and only "till he moves
-- out of JKKN institution". The Director was emphatic that this must NOT follow
-- the CAO post to a successor.
--
-- WHY THE SYSTEM CANNOT SAY THAT TODAY
-- ------------------------------------
-- Verified live 2026-08-05 by catalogue and by PostgREST as the service role:
--
--   * public.institution_leadership is (id, institution_id, position, user_id,
--     assigned_at, assigned_by, is_active, created_at, updated_at). There is no
--     column for a reason, a basis, or an end condition.
--   * He holds THREE user_roles rows — hr_head, cao, and principal
--     (is_primary = true). Nothing distinguishes the principal row from the cao
--     row in kind: both are simply "a role this person has".
--   * His Education principalship is stored EXACTLY as the other eleven
--     principal rows are. There is no field a future admin could read to learn
--     that this one is different.
--
-- So the record is not merely silent about the condition — it is actively
-- misleading, because "Principal of Education" sitting beside "CAO" on the same
-- person reads as one post implying the other. A successor CAO inheriting the
-- principalship is the reasonable inference from what is stored, and it is the
-- exact outcome that was ruled out.
--
-- WHAT THIS FILE DOES
-- -------------------
--   1. A vocabulary of appointment bases, as a TABLE (see §1 for why it is a
--      table and not a CHECK constraint), seeded with the two the decision
--      needs: ex_officio (passes to a successor) and personal (does not).
--   2. Two columns on institution_leadership: which basis, and a free-text note
--      for the reason and the end condition in the Director's own words.
--   3. Both functions taught to persist and return them.
--   4. ONE backfill row: Rajendiran's Education principalship, with the recorded
--      basis. See §6 — this is a narrow, deliberate exception to 20260809102100's
--      standing refusal to backfill, and §6 argues why.
--
-- WHO DECIDED AND WHEN reuses assigned_by / assigned_at, which already exist on
-- the table. No third and fourth column for the same two facts.
--
-- ============================================================================
-- 🛑 THE REGRESSION THAT MUST NOT HAPPEN
-- ============================================================================
-- fn_get_college_leadership resolves a Principal as
--     COALESCE(explicit institution_leadership row, derived from profiles)
-- and the derived arm is load-bearing: measured live 2026-08-05 there are TWELVE
-- `principal` user_roles rows spanning TEN distinct institutions, and exactly ONE
-- explicit institution_leadership row (Dr Dhanasekar Balakrishnan at Allied
-- Health). Eleven colleges therefore answer "who is Principal?" through the
-- derived arm or through that single explicit row. Break either and those
-- colleges go dark.
--
-- Two specific hazards, both guarded below and both proved in
-- __tests__/organizations/leadership-appointment-basis.test.ts:
--
--   (a) The derived arm is REPRODUCED BYTE-IDENTICALLY from 20260809102100 and
--       the new keys are merged onto it with `||` rather than retyped into a
--       longer jsonb_build_object. A retyped WHERE clause is how ten principals
--       disappear; a `||` cannot alter the query it decorates.
--
--   (b) The joins to the basis vocabulary and to the appointer's profile are
--       LEFT joins. An INNER join would drop every explicit row whose basis has
--       not been recorded — which today is the ONLY explicit row there is, so
--       Allied Health would fall through to a derived arm that resolves nobody
--       (Dr Dhanasekar's profile names Dental) and the college would read
--       "Not assigned".
--
-- ORDERING
-- --------
-- Requires 20260809102100_institution_leadership_posts.sql (the table and the
-- two functions this file extends). §0 refuses to apply otherwise rather than
-- leaving an ALTER TABLE pointing at a table that is not there.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Refuse to apply out of order.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.institution_leadership') IS NULL THEN
    RAISE EXCEPTION
      'REFUSING TO APPLY: 20260809102100_institution_leadership_posts.sql must '
      'be applied first — public.institution_leadership does not exist, and '
      'every statement in this file extends it.';
  END IF;

  IF to_regprocedure('public.fn_college_leadership_can_manage(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'REFUSING TO APPLY: 20260809101500_college_leadership.sql must be applied '
      'first — fn_college_leadership_can_manage(uuid) does not exist, and both '
      'functions replaced below call it.';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 1. The vocabulary of appointment bases.
--
-- WHY A TABLE AND NOT `CHECK (basis IN ('ex_officio','personal'))`
-- ----------------------------------------------------------------
-- The column immediately above it, institution_leadership.position, IS a CHECK
-- — and correctly so: that set is CLOSED BY DESIGN. 20260809102100 admits only
-- principal and vice_principal on purpose, because the other three posts already
-- have college-scoped homes and a second place to look for the same fact is how
-- estates drift. Adding a value there would be a design change.
--
-- This set is the opposite: genuinely open. "Acting", "in charge", "honorary",
-- "on deputation" are all bases an institution admin could plausibly need, and
-- none of them is a design change — each is just another reason. A CHECK would
-- make every one of them a migration AND a code deploy, because the picker would
-- have to hardcode the list too.
--
-- But extensibility is the smaller half of the argument. The load-bearing fact
-- about a basis is not its name — it is `passes_to_successor`, and that has to
-- live WITH the value. Put the list in a CHECK and the UI needs a hardcoded map
-- from code to "does this pass on?"; add a row to the CHECK without touching
-- that map and the new basis silently inherits whatever the default branch says.
-- That is precisely "a future admin may reasonably assume the successor
-- inherits it" — the failure this whole file exists to prevent — reintroduced
-- one level up. Carrying the semantic as a column makes the wrong assumption
-- unrepresentable.
--
-- Only the two bases the decision actually names are seeded. A third is one
-- INSERT with no deploy and no code change; inventing options nobody asked for
-- would be putting words in the Director's mouth.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leadership_appointment_basis (
  code                text PRIMARY KEY,
  label               text NOT NULL,
  description         text NOT NULL,
  -- THE column. Everything else here is presentation.
  passes_to_successor boolean NOT NULL,
  sort_order          integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.leadership_appointment_basis
  (code, label, description, passes_to_successor, sort_order)
VALUES
  ('ex_officio',
   'Ex officio — comes with another post',
   'Held because of another post. If that post changes hands, this one goes '
   || 'with it to the successor.',
   true, 10),
  ('personal',
   'Personal — given to this individual',
   'Given to this person, not to a post. It does NOT pass to whoever succeeds '
   || 'them in any other role they happen to hold.',
   false, 20)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.leadership_appointment_basis IS
  'Why a leadership post was given: to a POST (ex officio, passes to a '
  'successor) or to a PERSON (personal, does not). A table rather than a CHECK '
  'constraint because passes_to_successor must travel WITH the value — a '
  'hardcoded code-to-behaviour map in the UI would silently mis-answer any '
  'basis added later, which is the exact misunderstanding this vocabulary '
  'exists to prevent.';

COMMENT ON COLUMN public.leadership_appointment_basis.passes_to_successor IS
  'true = the appointment follows the other post to whoever holds it next. '
  'false = it ends with this person. Read this column; never infer it from the '
  'code.';


-- ----------------------------------------------------------------------------
-- 2. Privileges and RLS on the vocabulary.
--
-- REVOKE FIRST, then grant. Supabase ships
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated — so this table is born with SELECT/INSERT/UPDATE/DELETE granted
-- to the anon key embedded in every page of https://www.jkkn.ai, and a bare
-- GRANT SELECT TO authenticated over an existing ALL is a no-op.
--
-- Read is open to any signed-in user: this is a two-row static vocabulary with
-- no institution, no person and nothing private in it, and the leadership screen
-- needs it to render a label. Write is granted to nobody — adding a basis is a
-- deliberate act, done as a super admin, not something a client can do.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.leadership_appointment_basis FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.leadership_appointment_basis FROM authenticated;
GRANT  SELECT ON TABLE public.leadership_appointment_basis TO authenticated;

ALTER TABLE public.leadership_appointment_basis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leadership_appointment_basis_select ON public.leadership_appointment_basis;
CREATE POLICY leadership_appointment_basis_select
  ON public.leadership_appointment_basis
  FOR SELECT
  USING (true);
-- No INSERT / UPDATE / DELETE policy, deliberately: with no table grant either,
-- the vocabulary is read-only over the API by construction.


-- ----------------------------------------------------------------------------
-- 3. The two new columns.
--
-- basis_code is NULLABLE and has NO DEFAULT, and both of those are decisions.
--
-- A DEFAULT of 'ex_officio' would stamp every existing and future row with a
-- claim nobody made — and for the eleven appointments whose basis has never been
-- discussed, "ex officio" is not a safe guess, it is a fabrication that happens
-- to be the exact thing the Director ruled out for Rajendiran. NULL means "no
-- one has recorded why", the screen says so in those words, and an unrecorded
-- basis is never rendered as ex officio.
--
-- basis_note carries the reason AND the end condition in one field, because the
-- Director's condition — "till he moves out of JKKN institution" — is a
-- CONDITION, not a date. A timestamptz `ends_at` could not hold it, and inventing
-- a date to satisfy the column would be worse than prose: something would
-- eventually act on that date.
-- ----------------------------------------------------------------------------
ALTER TABLE public.institution_leadership
  ADD COLUMN IF NOT EXISTS basis_code text,
  ADD COLUMN IF NOT EXISTS basis_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.institution_leadership'::regclass
       AND conname  = 'institution_leadership_basis_code_fkey'
  ) THEN
    ALTER TABLE public.institution_leadership
      ADD CONSTRAINT institution_leadership_basis_code_fkey
      FOREIGN KEY (basis_code)
      REFERENCES public.leadership_appointment_basis(code)
      -- RESTRICT, not CASCADE or SET NULL: a basis in use must not be deletable
      -- out from under the appointments that cite it. Retiring one is
      -- is_active = false, which leaves every recorded appointment legible.
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON COLUMN public.institution_leadership.basis_code IS
  'Why this post was given — see leadership_appointment_basis. NULL means '
  'nobody has recorded it, which the screen shows as "Basis not recorded". '
  'NULL is never to be read as ex officio.';

COMMENT ON COLUMN public.institution_leadership.basis_note IS
  'The reason and the end condition in the appointer''s own words, e.g. '
  '"personal, till he moves out of JKKN — Director, 2026-08-05". Free text '
  'because an end CONDITION is not a date; a date column here would invite '
  'something to act on a date nobody set.';


-- ----------------------------------------------------------------------------
-- 4. Reading it back.
--
-- Replaces the body from 20260809102100. The ONLY change is the six merged keys
-- on each of the four arms. In particular:
--
--   * Each DERIVED arm is reproduced byte-identically from 20260809102100 and
--     decorated with `|| jsonb_build_object(...nulls...)`. It is not retyped into
--     a longer jsonb_build_object, because a retyped WHERE clause is how ten
--     sitting principals disappear. `NULL || jsonb` is NULL, so a college with no
--     principal still reads back JSON null and still renders "Not assigned".
--
--   * Each EXPLICIT arm gains two LEFT JOINs. LEFT is load-bearing: today the
--     single explicit row (Allied Health) has no basis recorded, so an INNER
--     join to the vocabulary would drop it, fall through to a derived arm that
--     resolves nobody there, and blank the college.
--
-- The committee lookup, the department roster and the authorisation are carried
-- over untouched so a reader can diff the two files and see only what moved.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_college_leadership(
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name        text;
  v_committee   uuid;
  v_result      jsonb;
  -- The six keys a post carries when nobody has recorded why it was given.
  -- Named once so the two derived arms cannot drift apart.
  v_no_basis    jsonb := jsonb_build_object(
                           'basis_code',                NULL,
                           'basis_label',               NULL,
                           'basis_passes_to_successor', NULL,
                           'basis_note',                NULL,
                           'assigned_at',               NULL,
                           'assigned_by_name',          NULL
                         );
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION
      'You do not have access to leadership for this institution. Ask a super '
      'admin to grant you organizations.leadership.manage.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT i.name INTO v_name
    FROM public.institutions i WHERE i.id = p_institution_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No such institution.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT ac.id INTO v_committee
    FROM public.accreditation_committees ac
   WHERE ac.institution_id = p_institution_id
     AND ac.body_code = 'NAAC'
     AND ac.committee_type = 'main'
     AND ac.is_active
   ORDER BY ac.created_at
   LIMIT 1;

  SELECT jsonb_build_object(
    'institution_id',   p_institution_id,
    'institution_name', v_name,
    'committee_id',     v_committee,

    'principal', COALESCE(
      (
        SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
               || jsonb_build_object(
                    'basis_code',                il.basis_code,
                    'basis_label',               b.label,
                    'basis_passes_to_successor', b.passes_to_successor,
                    'basis_note',                il.basis_note,
                    'assigned_at',               il.assigned_at,
                    'assigned_by_name',          ab.full_name
                  )
          FROM public.institution_leadership il
          JOIN public.profiles p ON p.id = il.user_id
          LEFT JOIN public.leadership_appointment_basis b ON b.code = il.basis_code
          LEFT JOIN public.profiles ab ON ab.id = il.assigned_by
         WHERE il.institution_id = p_institution_id
           AND il.position = 'principal'
           AND il.is_active
         ORDER BY il.assigned_at DESC
         LIMIT 1
      ),
      (
        SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
          FROM public.user_roles ur
          JOIN public.custom_roles cr ON cr.id = ur.role_id
          JOIN public.profiles p      ON p.id  = ur.user_id
         WHERE cr.role_key = 'principal' AND p.institution_id = p_institution_id
         ORDER BY ur.assigned_at DESC NULLS LAST
         LIMIT 1
      ) || v_no_basis
    ),
    'vice_principal', COALESCE(
      (
        SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
               || jsonb_build_object(
                    'basis_code',                il.basis_code,
                    'basis_label',               b.label,
                    'basis_passes_to_successor', b.passes_to_successor,
                    'basis_note',                il.basis_note,
                    'assigned_at',               il.assigned_at,
                    'assigned_by_name',          ab.full_name
                  )
          FROM public.institution_leadership il
          JOIN public.profiles p ON p.id = il.user_id
          LEFT JOIN public.leadership_appointment_basis b ON b.code = il.basis_code
          LEFT JOIN public.profiles ab ON ab.id = il.assigned_by
         WHERE il.institution_id = p_institution_id
           AND il.position = 'vice_principal'
           AND il.is_active
         ORDER BY il.assigned_at DESC
         LIMIT 1
      ),
      (
        SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
          FROM public.user_roles ur
          JOIN public.custom_roles cr ON cr.id = ur.role_id
          JOIN public.profiles p      ON p.id  = ur.user_id
         WHERE cr.role_key = 'vice_principal' AND p.institution_id = p_institution_id
         ORDER BY ur.assigned_at DESC NULLS LAST
         LIMIT 1
      ) || v_no_basis
    ),
    'iqac_chair', (
      SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
        FROM public.accreditation_committees ac
        JOIN public.profiles p ON p.id = ac.chair_user_id
       WHERE ac.id = v_committee
    ),
    'iqac_coordinator', (
      SELECT jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
        FROM public.accreditation_committee_members m
        JOIN public.profiles p ON p.id = m.user_id
       WHERE m.committee_id = v_committee
         AND m.role = 'coordinator'
         AND m.is_active
       ORDER BY m.joined_at DESC NULLS LAST
       LIMIT 1
    ),

    'departments', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'department_id',   d.id,
                 'department_name', d.department_name,
                 'department_code', d.department_code,
                 'head_user_id',    d.head_of_department_id,
                 'head_name',       hp.full_name,
                 'head_email',      hp.email
               ) ORDER BY d.department_name
             )
        FROM public.departments d
        LEFT JOIN public.profiles hp ON hp.id = d.head_of_department_id
       WHERE d.institution_id = p_institution_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_college_leadership(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_college_leadership(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_get_college_leadership(uuid) IS
  'Full leadership roster for one college. Principal and Vice Principal now '
  'also carry basis_code / basis_label / basis_passes_to_successor / basis_note '
  'and who recorded it and when, so the screen can say out loud that a post is '
  'personal. Both still read COALESCE(explicit institution_leadership row, the '
  'older derived user_roles x profiles.institution_id query) — the derived arm '
  'is byte-identical to 20260809102100 and merely decorated with null basis '
  'keys, because eleven colleges answer through it or through the single '
  'explicit row. A post whose basis was never recorded reports basis_code NULL, '
  'never ex_officio.';


-- ----------------------------------------------------------------------------
-- 5. The write path.
--
-- Two new trailing parameters. Because that CHANGES THE SIGNATURE, the previous
-- four-argument function must be DROPPED rather than left beside the new one:
-- CREATE OR REPLACE with a different argument list creates an OVERLOAD, and a
-- four-argument call would then resolve to the old body, which knows nothing
-- about a basis. It would save, report success, and record nothing — a silent
-- wrong path. §7 asserts the old signature is gone.
--
-- The four original parameters keep their names, order and types, so the page's
-- existing four-argument named call is unaffected and the code half of this PR
-- is safe to deploy before or after this file is applied.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_set_college_leadership(uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_set_college_leadership(
  p_institution_id uuid,
  p_position       text,
  p_user_id        uuid DEFAULT NULL,
  p_department_id  uuid DEFAULT NULL,
  p_basis_code     text DEFAULT NULL,
  p_basis_note     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_inst_name    text;
  v_role_id      uuid;
  v_role_key     text;
  v_subject_inst uuid;
  v_subject_name text;
  v_has_grant    boolean;
  v_committee    uuid;
  v_dept_inst    uuid;
  v_dept_name    text;
  v_outgoing     uuid[];
  v_holder       uuid;
  v_note         text := NULLIF(btrim(COALESCE(p_basis_note, '')), '');
BEGIN
  -- --- authorise once ------------------------------------------------------
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN
    RAISE EXCEPTION
      'You do not have permission to change leadership for this institution. '
      'Ask a super admin to grant you organizations.leadership.manage.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_position NOT IN ('principal', 'vice_principal', 'iqac_chair',
                        'iqac_coordinator', 'department_head') THEN
    RAISE EXCEPTION 'Unknown leadership position: %', p_position
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- An unknown or retired basis is REFUSED, never quietly dropped. A save that
  -- reports success while storing no reason is how the record ends up looking
  -- exactly like the one this file exists to correct.
  IF p_basis_code IS NOT NULL THEN
    IF p_position NOT IN ('principal', 'vice_principal') THEN
      RAISE EXCEPTION
        'A basis can only be recorded for Principal and Vice Principal. IQAC '
        'office bearers and Heads of Department are stored elsewhere and have '
        'nowhere to keep one.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.leadership_appointment_basis b
       WHERE b.code = p_basis_code AND b.is_active
    ) THEN
      RAISE EXCEPTION 'Unknown or retired appointment basis: %', p_basis_code
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  SELECT i.name INTO v_inst_name
    FROM public.institutions i WHERE i.id = p_institution_id;
  IF v_inst_name IS NULL THEN
    RAISE EXCEPTION 'No such institution.' USING ERRCODE = 'no_data_found';
  END IF;

  -- --- the person must be attached to THIS college -------------------------
  -- Two ways to qualify, because profiles.institution_id is single-valued and
  -- somebody who serves two colleges can only ever name one of them there.
  -- user_institution_access is the platform's existing, auditable record of the
  -- second attachment (granted_by, granted_at, is_active) — this file invents no
  -- new way to say "this person belongs here".
  --
  -- Refused outright, never silently ignored: a no-op here would leave the
  -- screen showing a successful save and the post still empty.
  IF p_user_id IS NOT NULL THEN
    SELECT p.institution_id, COALESCE(p.full_name, p.email, 'that person')
      INTO v_subject_inst, v_subject_name
      FROM public.profiles p WHERE p.id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'That person has no MyJKKN profile.'
        USING ERRCODE = 'no_data_found';
    END IF;

    v_has_grant := EXISTS (
      SELECT 1
        FROM public.user_institution_access uia
       WHERE uia.user_id        = p_user_id
         AND uia.institution_id = p_institution_id
         AND uia.is_active
    );

    IF (v_subject_inst IS NULL OR v_subject_inst <> p_institution_id)
       AND NOT v_has_grant THEN
      RAISE EXCEPTION
        '% is not attached to %. Their profile belongs to another institution '
        'and they hold no active institution-access grant for %. Grant them '
        'access to it, or move their profile there, and try again.',
        v_subject_name, v_inst_name, v_inst_name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ==========================================================================
  -- Principal / Vice Principal -> institution_leadership (+ user_roles)
  -- ==========================================================================
  IF p_position IN ('principal', 'vice_principal') THEN
    v_role_key := p_position;

    SELECT cr.id INTO v_role_id
      FROM public.custom_roles cr
     WHERE cr.role_key = v_role_key AND cr.is_active;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'The % role does not exist or is inactive.', v_role_key
        USING ERRCODE = 'no_data_found';
    END IF;

    -- Who currently holds this post AT THIS COLLEGE, by either route: an
    -- explicit row, or the derived answer that still stands for the principals
    -- who predate this table. Collected first rather than deleted inside a
    -- cursor over the same tables.
    SELECT COALESCE(array_agg(DISTINCT s.holder), '{}')
      INTO v_outgoing
      FROM (
        SELECT il.user_id AS holder
          FROM public.institution_leadership il
         WHERE il.institution_id = p_institution_id
           AND il.position       = v_role_key
           AND il.is_active
        UNION
        SELECT ur.user_id
          FROM public.user_roles ur
          JOIN public.profiles pr ON pr.id = ur.user_id
         WHERE ur.role_id = v_role_id
           AND pr.institution_id = p_institution_id
      ) s
     WHERE (p_user_id IS NULL OR s.holder <> p_user_id);

    -- Vacate the post AT THIS COLLEGE ONLY. Retired, not deleted, so the
    -- history survives; the partial unique index counts only live rows.
    UPDATE public.institution_leadership
       SET is_active  = false,
           updated_at = now()
     WHERE institution_id = p_institution_id
       AND position       = v_role_key
       AND is_active
       AND (p_user_id IS NULL OR user_id <> p_user_id);

    FOREACH v_holder IN ARRAY v_outgoing
    LOOP
      -- user_roles has no institution column, so its row is the person's claim
      -- to the post EVERYWHERE. Deleting it because they were replaced at one
      -- college would strip them at every other. Keep it whenever they still
      -- hold the post elsewhere — by an explicit row at another college, or by
      -- the derived route (their profile names a different college).
      IF EXISTS (
           SELECT 1 FROM public.institution_leadership il
            WHERE il.user_id  = v_holder
              AND il.position = v_role_key
              AND il.is_active
              AND il.institution_id <> p_institution_id
         )
         OR EXISTS (
           SELECT 1 FROM public.profiles pr
            WHERE pr.id = v_holder
              AND pr.institution_id IS NOT NULL
              AND pr.institution_id <> p_institution_id
         )
      THEN
        CONTINUE;
      END IF;

      DELETE FROM public.user_roles
       WHERE user_id = v_holder AND role_id = v_role_id;

      -- Deleting the row does not undo profiles.role, because
      -- sync_primary_role_to_profile only fires on INSERT/UPDATE. Promote a
      -- role the person still holds so the legacy field stops claiming a post
      -- they no longer hold. If they hold nothing else there is nothing to
      -- promote to and profiles.role is left alone rather than guessed at.
      UPDATE public.user_roles ur
         SET is_primary = true
       WHERE ur.id = (
         SELECT ur2.id FROM public.user_roles ur2
          WHERE ur2.user_id = v_holder
          ORDER BY ur2.assigned_at DESC NULLS LAST
          LIMIT 1
       )
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur3
            WHERE ur3.user_id = v_holder AND ur3.is_primary
         );
    END LOOP;

    IF p_user_id IS NOT NULL THEN
      -- The post itself. Step 1 retired every other live holder, so the only row
      -- this can collide with is one naming the same person again — which is a
      -- re-save, and must succeed quietly rather than raise.
      INSERT INTO public.institution_leadership (
        institution_id, position, user_id, assigned_by, is_active,
        basis_code, basis_note
      )
      VALUES (p_institution_id, v_role_key, p_user_id, v_actor, true,
              p_basis_code, v_note)
      ON CONFLICT (institution_id, position) WHERE is_active
      DO UPDATE SET user_id     = EXCLUDED.user_id,
                    assigned_by = EXCLUDED.assigned_by,
                    assigned_at = now(),
                    updated_at  = now(),
                    -- A re-save that supplies no basis must not ERASE one that
                    -- was recorded — the screen changes a person far more often
                    -- than it changes a reason, and silently dropping the
                    -- Director's "personal, till he moves out of JKKN" because
                    -- somebody re-picked the same name is the same information
                    -- loss this file exists to fix.
                    --
                    -- But only while the HOLDER IS UNCHANGED. A reason recorded
                    -- about one person cannot describe another, so a change of
                    -- holder takes exactly what the caller supplied, including
                    -- nothing.
                    basis_code  = CASE
                                    WHEN public.institution_leadership.user_id = EXCLUDED.user_id
                                    THEN COALESCE(EXCLUDED.basis_code, public.institution_leadership.basis_code)
                                    ELSE EXCLUDED.basis_code
                                  END,
                    basis_note  = CASE
                                    WHEN public.institution_leadership.user_id = EXCLUDED.user_id
                                    THEN COALESCE(EXCLUDED.basis_note, public.institution_leadership.basis_note)
                                    ELSE EXCLUDED.basis_note
                                  END;

      -- is_primary differs BY DESIGN between the two posts.
      --
      -- Principal: true. All live principal rows are is_primary=true, and the
      -- sync trigger then writes profiles.role='principal', which legacy
      -- policies such as institutions_select_faculty_hod_principal still read.
      --
      -- Vice Principal: false. The post is new, nothing legacy reads it, and
      -- making it primary would overwrite profiles.role — silently stripping
      -- the person of whatever they were before. Permissions still apply:
      -- multiple roles merge with OR.
      --
      -- Demote the incoming person's existing primary FIRST. user_roles carries
      -- `idx_user_roles_primary_unique` — UNIQUE (user_id) WHERE is_primary —
      -- which is enforced during the INSERT itself, whereas the trigger that
      -- demotes the old primary (sync_primary_role_trigger) is an AFTER trigger
      -- and does not run until the row is already in. Without this line, naming
      -- a Principal who already holds any primary role fails outright with a
      -- duplicate-key error. Caught by the offline behaviour suite, T4.
      IF v_role_key = 'principal' THEN
        UPDATE public.user_roles
           SET is_primary = false
         WHERE user_id = p_user_id AND is_primary = true;
      END IF;

      -- IDEMPOTENT ON PURPOSE. user_roles_unique_assignment is UNIQUE
      -- (user_id, role_id), and a second college for a sitting Principal means
      -- the row is already there — a plain INSERT would raise 23505. DO UPDATE
      -- rather than DO NOTHING because the demotion immediately above has just
      -- cleared this person's primary flag.
      INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_by)
      VALUES (p_user_id, v_role_id, (v_role_key = 'principal'), v_actor)
      ON CONFLICT (user_id, role_id) DO UPDATE
        SET is_primary  = EXCLUDED.is_primary,
            assigned_by = EXCLUDED.assigned_by;
    END IF;

  -- ==========================================================================
  -- IQAC Chairman / Coordinator -> accreditation_committees(+ _members)
  -- ==========================================================================
  ELSIF p_position IN ('iqac_chair', 'iqac_coordinator') THEN
    SELECT ac.id INTO v_committee
      FROM public.accreditation_committees ac
     WHERE ac.institution_id = p_institution_id
       AND ac.body_code = 'NAAC'
       AND ac.committee_type = 'main'
       AND ac.is_active
     ORDER BY ac.created_at
     LIMIT 1;

    -- Twelve of thirteen colleges have no committee row at all, so the row is
    -- created on demand the first time somebody is named to it — and only
    -- then, so clearing an empty post never manufactures an empty committee.
    IF v_committee IS NULL THEN
      IF p_user_id IS NULL THEN
        RETURN jsonb_build_object(
          'ok', true, 'position', p_position, 'user_id', NULL,
          'committee_id', NULL,
          'message', 'Nothing to clear — this college has no IQAC committee yet.'
        );
      END IF;

      INSERT INTO public.accreditation_committees (
        institution_id, body_code, committee_name, committee_type,
        formed_at, is_active
      )
      VALUES (
        p_institution_id, 'NAAC',
        'Internal Quality Assurance Cell (IQAC)', 'main',
        CURRENT_DATE, true
      )
      RETURNING id INTO v_committee;
    END IF;

    IF p_position = 'iqac_chair' THEN
      UPDATE public.accreditation_committees
         SET chair_user_id = p_user_id,
             updated_at    = now()
       WHERE id = v_committee;
    ELSE
      -- Retire whoever currently coordinates before naming the replacement.
      -- There is no unique index on (committee_id, role), so without this a
      -- college would quietly accumulate several live coordinators.
      UPDATE public.accreditation_committee_members
         SET is_active = false
       WHERE committee_id = v_committee
         AND role = 'coordinator'
         AND is_active
         AND (p_user_id IS NULL OR user_id IS DISTINCT FROM p_user_id);

      IF p_user_id IS NOT NULL THEN
        INSERT INTO public.accreditation_committee_members (
          committee_id, user_id, role, joined_at, is_active, is_external
        )
        VALUES (v_committee, p_user_id, 'coordinator', CURRENT_DATE, true, false)
        ON CONFLICT (committee_id, user_id, joined_at) DO UPDATE
          SET role = 'coordinator', is_active = true;
      END IF;
    END IF;

  -- ==========================================================================
  -- Head of Department -> departments.head_of_department_id
  -- ==========================================================================
  ELSE
    IF p_department_id IS NULL THEN
      RAISE EXCEPTION 'Which department? p_department_id is required.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT d.institution_id, d.department_name
      INTO v_dept_inst, v_dept_name
      FROM public.departments d WHERE d.id = p_department_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No such department.' USING ERRCODE = 'no_data_found';
    END IF;

    -- The department must belong to the institution the caller was authorised
    -- for. Without this, anyone cleared for one college could set the Head of
    -- a department in any other by passing its id.
    IF v_dept_inst IS DISTINCT FROM p_institution_id THEN
      RAISE EXCEPTION
        'Department % does not belong to %.', v_dept_name, v_inst_name
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.departments
       SET head_of_department_id = p_user_id,
           updated_at            = now()
     WHERE id = p_department_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'position',      p_position,
    'institution_id', p_institution_id,
    'department_id', p_department_id,
    'user_id',       p_user_id,
    'basis_code',    p_basis_code,
    'committee_id',  v_committee
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text) IS
  'The only write path for the College Leadership screen. Now also records WHY a '
  'Principal / Vice Principal post was given (p_basis_code, checked against '
  'leadership_appointment_basis and REFUSED if unknown or retired) and the '
  'reason / end condition in words (p_basis_note). Who decided and when reuse '
  'the existing assigned_by / assigned_at. A re-save that supplies no basis '
  'PRESERVES the recorded one while the holder is unchanged, and takes exactly '
  'what was supplied when the holder changes — a reason recorded about one '
  'person cannot describe another. The four original parameters keep their '
  'names, order and types, so an existing four-argument call is unaffected.';


-- ----------------------------------------------------------------------------
-- 6. The one appointment the Director actually spoke about.
--
-- 20260809102100 refuses to backfill, and it is right to: inventing a row for a
-- sitting principal would assert an assignment nobody made, with an assigned_by
-- nobody is. This row is the exact case that reasoning EXCLUDES. The Director
-- made this appointment, stated its basis and its end condition on 2026-08-05,
-- and is the assigned_by. There is a decision here to record; for the other
-- eleven there is not, and none is invented.
--
-- Recording it requires an explicit row, because that is where the basis columns
-- live — Rajendiran's Education principalship predates institution_leadership
-- and exists today only as a user_roles row read through the derived arm.
-- Writing the row does NOT change who resolves as Principal of Education: the
-- explicit arm names the same person the derived arm already named. The
-- behaviour suite proves exactly that rather than assuming it.
--
-- Everything is resolved by EMAIL, never by a pasted UUID, so the file is
-- readable, replayable on a fresh database, and cannot silently write against
-- the wrong person if an id was mistyped.
--
-- It refuses to invent anything:
--   * no Rajendiran profile, no Education institution, or he no longer holds the
--     principal role there -> RAISE WARNING and write NOTHING. An appointment
--     that has ended must not be re-asserted by a migration.
--   * a live Education principal row already exists -> leave it entirely alone.
--     Overwriting one would be an unapproved leadership change smuggled into a
--     migration.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_person   uuid;
  v_inst     uuid;
  v_director uuid;
  v_holds    boolean;
  v_existing uuid;
BEGIN
  SELECT p.id INTO v_person
    FROM public.profiles p WHERE lower(p.email) = 'cao@jkkn.ac.in';

  SELECT i.id INTO v_inst
    FROM public.institutions i WHERE i.name = 'JKKN College of Education';

  SELECT p.id INTO v_director
    FROM public.profiles p WHERE lower(p.email) = 'director@jkkn.ac.in';

  IF v_person IS NULL OR v_inst IS NULL THEN
    RAISE WARNING
      'Leadership basis backfill SKIPPED: profile cao@jkkn.ac.in (%) or '
      'institution "JKKN College of Education" (%) not found. Nothing written.',
      v_person, v_inst;
    RETURN;
  END IF;

  -- The appointment must still be true. A migration may record why a live post
  -- was given; it may not resurrect one that has since ended.
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
     WHERE ur.user_id = v_person AND cr.role_key = 'principal'
  ) INTO v_holds;

  IF NOT v_holds THEN
    RAISE WARNING
      'Leadership basis backfill SKIPPED: cao@jkkn.ac.in no longer holds the '
      'principal role. Nothing written.';
    RETURN;
  END IF;

  SELECT il.user_id INTO v_existing
    FROM public.institution_leadership il
   WHERE il.institution_id = v_inst
     AND il.position = 'principal'
     AND il.is_active
   LIMIT 1;

  IF v_existing IS NOT NULL AND v_existing <> v_person THEN
    RAISE WARNING
      'Leadership basis backfill SKIPPED: JKKN College of Education already has '
      'a different live Principal row (%). A migration must not overwrite a '
      'leadership assignment. Record the basis from the screen instead.',
      v_existing;
    RETURN;
  END IF;

  IF v_director IS NULL THEN
    RAISE WARNING
      'No profile for director@jkkn.ac.in — the row is written with '
      'assigned_by NULL and the attribution left in the note.';
  END IF;

  INSERT INTO public.institution_leadership (
    institution_id, position, user_id, assigned_by, is_active,
    basis_code, basis_note
  )
  VALUES (
    v_inst, 'principal', v_person, v_director, true,
    'personal',
    'Personal to Dr. RAJENDIRAN K M — NOT held by virtue of being CAO. '
    || 'Ends when he moves out of JKKN institution. It does not pass to '
    || 'whoever succeeds him as CAO. Director''s decision, 2026-08-05.'
  )
  ON CONFLICT (institution_id, position) WHERE is_active
  DO UPDATE SET basis_code = 'personal',
                basis_note = EXCLUDED.basis_note,
                assigned_by = COALESCE(public.institution_leadership.assigned_by,
                                       EXCLUDED.assigned_by),
                updated_at = now()
  -- Only ever touches HIS row. The guard above already refused a row naming
  -- somebody else; this repeats it at the statement level so the two can never
  -- disagree.
  WHERE public.institution_leadership.user_id = v_person;

  RAISE NOTICE
    'Leadership basis recorded: JKKN College of Education Principal = % '
    '(personal, ends when he leaves JKKN), decided by %.', v_person, v_director;
END $$;


-- ----------------------------------------------------------------------------
-- 7. Assert what this file changed, in this transaction.
--
-- Every check below is scoped to an object THIS file owns. None asks a question
-- about the wider estate that some unrelated change could make permanently
-- unanswerable.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_priv text;
  v_n    integer;
BEGIN
  -- (a) The columns exist and basis_code is NULLABLE. A NOT NULL here would
  --     force every future row to claim a basis somebody may not know.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'institution_leadership'
       AND column_name = 'basis_code' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'institution_leadership.basis_code is missing or NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'institution_leadership'
       AND column_name = 'basis_note'
  ) THEN
    RAISE EXCEPTION 'institution_leadership.basis_note is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.institution_leadership'::regclass
       AND conname  = 'institution_leadership_basis_code_fkey'
  ) THEN
    RAISE EXCEPTION 'the basis_code foreign key did not take';
  END IF;

  -- (b) The vocabulary carries the semantic, and carries it the right way round.
  SELECT count(*) INTO v_n FROM public.leadership_appointment_basis WHERE is_active;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'expected at least the 2 seeded bases, found %', v_n;
  END IF;
  IF (SELECT passes_to_successor FROM public.leadership_appointment_basis WHERE code = 'personal')
     IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'basis "personal" must NOT pass to a successor';
  END IF;
  IF (SELECT passes_to_successor FROM public.leadership_appointment_basis WHERE code = 'ex_officio')
     IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'basis "ex_officio" must pass to a successor';
  END IF;

  -- (c) The old four-argument write path is GONE, so a four-argument call
  --     cannot resolve to a body that silently discards the basis.
  IF to_regprocedure('public.fn_set_college_leadership(uuid, text, uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION
      'the previous 4-argument fn_set_college_leadership still exists — a '
      '4-argument call would resolve to it and record no basis';
  END IF;
  IF to_regprocedure('public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'the 6-argument fn_set_college_leadership was not created';
  END IF;

  -- (d) anon is locked out of both functions and of the new table; authenticated
  --     may read the vocabulary and nothing more.
  IF has_function_privilege('anon', 'public.fn_get_college_leadership(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_get_college_leadership';
  END IF;
  IF has_function_privilege('anon', 'public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_set_college_leadership';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_get_college_leadership(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_get_college_leadership, which the page calls';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_set_college_leadership(uuid, text, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_set_college_leadership, which the page calls';
  END IF;

  FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('anon', 'public.leadership_appointment_basis', v_priv) THEN
      RAISE EXCEPTION 'anon holds % on leadership_appointment_basis', v_priv;
    END IF;
  END LOOP;

  FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('authenticated', 'public.leadership_appointment_basis', v_priv) THEN
      RAISE EXCEPTION
        'authenticated holds % on leadership_appointment_basis — the vocabulary '
        'is read-only over the API', v_priv;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('authenticated', 'public.leadership_appointment_basis', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot read leadership_appointment_basis, which the picker needs';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.leadership_appointment_basis'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on leadership_appointment_basis';
  END IF;

  -- (e) The backfill wrote at most ONE live Education principal row, and if it
  --     wrote one it names Rajendiran and says "personal". Scoped to that single
  --     college so no unrelated estate change can make this unanswerable.
  SELECT count(*) INTO v_n
    FROM public.institution_leadership il
    JOIN public.institutions i ON i.id = il.institution_id
   WHERE i.name = 'JKKN College of Education'
     AND il.position = 'principal'
     AND il.is_active;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'JKKN College of Education has % live principal rows, expected at most 1', v_n;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.institution_leadership il
      JOIN public.institutions i ON i.id = il.institution_id
      JOIN public.profiles p     ON p.id = il.user_id
     WHERE i.name = 'JKKN College of Education'
       AND il.position = 'principal'
       AND il.is_active
       AND lower(p.email) = 'cao@jkkn.ac.in'
       AND il.basis_code IS DISTINCT FROM 'personal'
  ) THEN
    RAISE EXCEPTION
      'the Education principal row exists but is not recorded as personal — the '
      'whole point of this file';
  END IF;
END $$;
