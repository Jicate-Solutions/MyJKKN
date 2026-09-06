-- Updated: 2026-08-07 - Learners Council office bearers may notify LEARNERS ONLY
--
-- FILE ONLY / NOT APPLIED. Apply is Director-gated. Nothing in this file has been
-- executed against production; it was validated read-only inside BEGIN .. ROLLBACK.
--
-- Context
-- -------
-- Inserting a row into public.notifications is gated by exactly one policy today:
--   notifications_insert_admins  WITH CHECK (is_super_admin() OR is_admin(auth.uid()))
-- and is_admin() resolves to profiles.is_super_admin OR profiles.role IN
-- ('admin','super_admin','administrator'). Every Learners Council member carries
-- profiles.role = 'student', and none of the 34 holds a broadcast role, so an
-- office bearer physically cannot send a notification: RLS refuses the INSERT and
-- (per the house rule that RLS denial is always silent) the caller sees no error,
-- just nothing happening.
--
-- This migration adds a SECOND, NARROW insert path alongside the admin one. It is
-- DARK on merge: no UI and no API route reaches it yet, and it grants nothing to
-- anyone who is not a sitting office bearer.
--
-- The existing notifications_insert_admins policy is deliberately NOT dropped or
-- modified. Postgres OR-combines permissive policies, so admins keep their path
-- untouched and office bearers gain a strictly narrower one.
--
-- ============================================================================
-- WHY THE TARGETING PREDICATE IS AN ALLOWLIST AND NOT A LIST OF FORBIDDEN KEYS
-- ============================================================================
-- The delivery resolver (app/api/notifications/send/route.ts) turns a targeting
-- payload into a recipient list. Reading it closely, three of its branches WIDEN
-- the audience rather than narrow it, and each is a way for a council message to
-- land on somebody who is not a college learner:
--
--   * audience_ids  — resolved through the resolve_audience RPC and then UNIONED
--     into the recipient list in EVERY branch ("Merge audience user_ids"). The
--     stock 'all_students' audience resolves to 5,690 people and INCLUDES the 778
--     young learners in the two school entities. An audience therefore defeats any
--     institution filter sitting next to it.
--   * an empty payload — "If no specific targeting criteria, send to all users",
--     i.e. every active profile on the platform.
--   * role-only targeting with no institution — the branch filters profiles by
--     role and applies NO institution predicate, so target_roles = ['student']
--     alone reaches every learner in every entity, schools included.
--
-- A blocklist of known-dangerous keys would have to be revised every time the
-- composer learns a new one, and it silently fails open in the gap. institution_ids
-- was added on 2026-08-04 and is exactly the shape of key that would have slipped
-- through. So the predicate below instead states the small set of keys it
-- understands and refuses any payload containing anything else. A key nobody has
-- invented yet defaults to DENY, and the failure is a visible refusal to send
-- rather than an invisible over-delivery.
--
-- EXTENDING THE ALLOWLIST IS A SECURITY DECISION, NOT HOUSEKEEPING. Adding a key
-- here widens who a 20-year-old office bearer can reach. Read the resolver branch
-- that consumes the key first and confirm it narrows rather than widens.
--
-- ============================================================================
-- WHY AN INSTITUTION MUST BE NAMED EXPLICITLY
-- ============================================================================
-- The brief says school learners must NEVER be reachable, and asks this predicate
-- to refuse a payload that names a school. Refusing only NAMED schools is not
-- sufficient on its own: as noted above, naming NO institution at all is the case
-- that reaches every school learner on the platform. Silence is the widest possible
-- request, not the narrowest. The predicate therefore requires at least one
-- institution to be named AND every named institution to be a non-school. The
-- Learners Council is a college body; a council message always has a college.
--
-- School detection uses TWO independent signals, either of which is disqualifying:
--   1. institutions.entity_type = 'school' — the structural marker, added
--      2026-04-24 and pinned by chk_entity_type.
--   2. the name patterns from the brief (school / vidhyalya / cbse / matric).
-- Neither is trusted alone: entity_type could be left at its 'institution'
-- default on a new row, and a school could be renamed out of the patterns. An
-- unknown institution id — one that resolves to no row — is likewise refused,
-- because an id that cannot be checked cannot be cleared.
--
-- ============================================================================
-- RELATIONSHIP TO fn_is_lc_executive()
-- ============================================================================
-- public.fn_is_lc_executive() already exists (20260714160000) and answers the same
-- question for the CURRENT user. fn_is_lc_office_bearer() below is the same
-- predicate with the user as a parameter, which the notification work needs so a
-- seat can be checked for somebody other than the caller. The two MUST be kept in
-- lockstep: if the definition of "office bearer" ever changes (a term-validity
-- test, say), both bodies have to change together or the platform will hold two
-- different opinions about who sits on the council. fn_is_lc_executive() is NOT
-- modified here — four live policies depend on it and this migration is dark.
-- ============================================================================

-- ============================================================================
-- 1. WHO IS AN OFFICE BEARER
-- ============================================================================

-- President / Vice President / Secretary / Treasurer are the executive seats.
-- category is compared case-insensitively via ::text so the test survives the
-- column being a varchar today or an enum later.
CREATE OR REPLACE FUNCTION public.fn_is_lc_office_bearer(p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn_bearer$
  SELECT EXISTS (
    SELECT 1
    FROM lc_members m
    JOIN lc_positions p ON p.id = m.position_id
    WHERE m.user_id = p_user
      AND p_user IS NOT NULL
      AND m.status = 'active'
      AND lower(p.category::text) = 'executive'
  );
$fn_bearer$;

COMMENT ON FUNCTION public.fn_is_lc_office_bearer(uuid) IS
  'TRUE when p_user holds an ACTIVE Learners Council executive seat (President / Vice President / Secretary / Treasurer). Parameterised sibling of fn_is_lc_executive(); keep both definitions in lockstep.';

-- Re-asserted on every CREATE OR REPLACE: Supabase's default privileges hand anon
-- a direct EXECUTE grant on each new function, separate from PUBLIC.
REVOKE EXECUTE ON FUNCTION public.fn_is_lc_office_bearer(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_lc_office_bearer(uuid) TO authenticated;

-- ============================================================================
-- 2. CAN THIS TARGETING PAYLOAD REACH ANYONE BUT A COLLEGE LEARNER?
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_notification_targets_learners_only(p_targeting jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn_learners_only$
DECLARE
  v_elements  jsonb;
  v_element   jsonb;
  v_id_text   text;
  v_inst_ids  uuid[];
  v_cleared   integer;
BEGIN
  -- (i) An absent payload is the WIDEST request the resolver accepts, not the
  -- narrowest. Deny it.
  IF p_targeting IS NULL OR jsonb_typeof(p_targeting) = 'null' THEN
    RETURN FALSE;
  END IF;

  -- (iv) Both shapes are stored in this column. Normalise to a list of payload
  -- objects so one loop below judges either shape identically; a scalar is
  -- neither and is denied.
  IF jsonb_typeof(p_targeting) = 'array' THEN
    v_elements := p_targeting;
  ELSIF jsonb_typeof(p_targeting) = 'object' THEN
    v_elements := jsonb_build_array(p_targeting);
  ELSE
    RETURN FALSE;
  END IF;

  -- An empty array requests nothing explicitly and everything by omission.
  IF jsonb_array_length(v_elements) = 0 THEN
    RETURN FALSE;
  END IF;

  FOR v_element IN SELECT value FROM jsonb_array_elements(v_elements) LOOP
    -- Every element of the array shape must independently clear. One bad
    -- element condemns the payload.
    IF jsonb_typeof(v_element) <> 'object' THEN
      RETURN FALSE;
    END IF;

    IF v_element = '{}'::jsonb THEN
      RETURN FALSE;
    END IF;

    -- Allowlist. See the header for why this is not a blocklist. Any key not
    -- named here — audience_ids, broadcast, user_ids, or something invented
    -- next month — denies the payload.
    IF EXISTS (
      SELECT 1
      FROM jsonb_object_keys(v_element) AS k(key)
      WHERE k.key NOT IN (
        'type',
        'target_roles',
        'institution_id',
        'institution_ids',
        'department_id',
        'program_id',
        'semester_id',
        'section_id'
      )
    ) THEN
      RETURN FALSE;
    END IF;

    -- (ii) Roles must be present, non-empty, and unanimously the learner role.
    -- Absent or empty fails CLOSED: the resolver reads a missing target_roles as
    -- "no role filter", which is every role, not none.
    -- 'student' is the literal role key stored in profiles.role for learners; it
    -- is a DB value, not prose.
    IF jsonb_typeof(v_element -> 'target_roles') <> 'array'
       OR jsonb_array_length(v_element -> 'target_roles') = 0 THEN
      RETURN FALSE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_element -> 'target_roles') AS r(value)
      WHERE jsonb_typeof(r.value) <> 'string'
         OR (r.value #>> '{}') <> 'student'
    ) THEN
      RETURN FALSE;
    END IF;

    -- (iii) Collect every institution the payload names, across both the legacy
    -- singular key and the multi-select list added 2026-08-04.
    v_inst_ids := ARRAY[]::uuid[];

    IF jsonb_typeof(v_element -> 'institution_id') = 'string' THEN
      v_id_text := v_element ->> 'institution_id';
      -- Shape-check before casting so a malformed id is a denial, not a 22P02.
      IF v_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN FALSE;
      END IF;
      v_inst_ids := v_inst_ids || v_id_text::uuid;
    ELSIF jsonb_exists(v_element, 'institution_id')
          AND jsonb_typeof(v_element -> 'institution_id') <> 'null' THEN
      RETURN FALSE;
    END IF;

    IF jsonb_typeof(v_element -> 'institution_ids') = 'array' THEN
      FOR v_id_text IN
        SELECT CASE WHEN jsonb_typeof(e.value) = 'string'
                    THEN e.value #>> '{}'
                    ELSE NULL
               END
        FROM jsonb_array_elements(v_element -> 'institution_ids') AS e(value)
      LOOP
        IF v_id_text IS NULL
           OR v_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RETURN FALSE;
        END IF;
        v_inst_ids := v_inst_ids || v_id_text::uuid;
      END LOOP;
    ELSIF jsonb_exists(v_element, 'institution_ids')
          AND jsonb_typeof(v_element -> 'institution_ids') <> 'null' THEN
      RETURN FALSE;
    END IF;

    -- Naming no institution reaches every entity, schools included.
    SELECT array_agg(DISTINCT x) INTO v_inst_ids FROM unnest(v_inst_ids) AS x;

    IF v_inst_ids IS NULL OR cardinality(v_inst_ids) = 0 THEN
      RETURN FALSE;
    END IF;

    -- Every named institution must resolve to a real row that is not a school by
    -- EITHER signal. An id that matches no row clears nothing and is refused.
    SELECT count(*) INTO v_cleared
    FROM institutions i
    WHERE i.id = ANY (v_inst_ids)
      AND COALESCE(i.entity_type, '') <> 'school'
      AND i.name NOT ILIKE '%school%'
      AND i.name NOT ILIKE '%vidhyalya%'
      AND i.name NOT ILIKE '%cbse%'
      AND i.name NOT ILIKE '%matric%';

    IF v_cleared <> cardinality(v_inst_ids) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$fn_learners_only$;

COMMENT ON FUNCTION public.fn_notification_targets_learners_only(jsonb) IS
  'TRUE only when a notifications.targeting payload can reach nothing but college learners: allowlisted keys, target_roles unanimously the learner role key, and at least one named institution with every named institution a non-school. Fails CLOSED on absent, empty, scalar or unrecognised payloads. Accepts both the object and array storage shapes.';

REVOKE EXECUTE ON FUNCTION public.fn_notification_targets_learners_only(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_notification_targets_learners_only(jsonb) TO authenticated;

-- ============================================================================
-- 3. THE NARROW INSERT PATH
-- ============================================================================

-- Added ALONGSIDE notifications_insert_admins, which is untouched. Restricted TO
-- authenticated so the policy is never even evaluated for an anonymous caller.
DROP POLICY IF EXISTS notifications_insert_lc_office_bearer ON public.notifications;
CREATE POLICY notifications_insert_lc_office_bearer ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  public.fn_is_lc_office_bearer()
  AND public.fn_notification_targets_learners_only(targeting)
);

COMMENT ON POLICY notifications_insert_lc_office_bearer ON public.notifications IS
  'Lets a sitting Learners Council office bearer send to college learners only. Both conjuncts are required: the seat, and a targeting payload that provably reaches nobody else.';
