-- ─── Two governance keys held by too few people to do the job ────────────────
-- 2026-08-21 — CAC governance grants. Lane C.
--
-- ⚠ NOT APPLIED TO ANY DATABASE. Director-gated apply, by hand.
--
-- ══ WHAT THIS DOES ═══════════════════════════════════════════════════════════
--
--   solutions.first_use.view    →  true  ┐  on exactly four roles:
--   solutions.first_use.record  →  true  ┘  hod, principal, vice_principal,
--                                           school_principal
--
--   accreditation.naac.committees.meetings.manage  →  true  on: registrar
--
-- Nothing else. No table, no function, no policy, no revoke. This file changes
-- `custom_roles.permissions` and nothing else in the database.
--
-- PURELY ADDITIVE. `ceo`, `managing_director` and `cbo` (who hold the first-use
-- keys today) and `accreditation_officer` (who holds the meetings key today)
-- are not named in any UPDATE below and keep everything they have. This file
-- cannot remove a permission from anybody — there is no jsonb `-` operator and
-- no `false` written anywhere in it.
--
-- ══ WHY #1 — THE DEPARTMENT THAT PRODUCES THE RECORD CANNOT WRITE IT ═════════
--
-- Director decision #5 is stated in this codebase, in
-- hooks/solutions/use-solution-first-use.ts: "The producing department records,
-- at one checkpoint, the first time somebody outside the team used the thing
-- they built."
--
-- Measured on production 2026-08-21 against 91 active roles, the roles holding
-- `solutions.first_use.record` are `ceo`, `managing_director` and `cbo` — three
-- roles, four people, none of whom is the producing department. The department
-- that watched the first real use has to relay it to an executive to get it
-- written down, which is how a one-date checkpoint stops being recorded at all.
--
-- HOW IT GOT THAT WAY, because it is the whole reason this file exists.
-- Migration 20260907120000 granted the two keys with the predicate
--
--     WHERE (permissions->>'solutions.dashboard.view')::boolean IS TRUE
--
-- and its own header states the intent: "Every role that already holds
-- solutions.dashboard.view as TRUE. That is the producing department's existing
-- way into the hub." On this estate that donor key resolves to the three
-- executives, so the predicate delivered the exact opposite of its stated
-- intent — silently, and with every assertion in that file passing, because a
-- donor-key predicate is self-consistent by construction: it can only be
-- "wrong" relative to an intent the SQL never states.
--
-- That is why every role below is named as a literal. A predicate of the shape
-- "every role that already holds X" appears nowhere in this file. It is not a
-- style preference — it is the correction of this specific measured failure.
--
-- ══ WHY #2 — ONE ACCOUNT CAN FILE A COUNCIL RESOLUTION ═══════════════════════
--
-- `accreditation.naac.committees.meetings.manage` is held by
-- `accreditation_officer` and by nobody else: ONE account in the platform. Not
-- the CEO, not the Registrar, not any Principal.
--
-- What that key gates (RLS from migration 20260710060000, per the service
-- header in lib/services/accreditation/committee-meeting-service.ts): ALL
-- writes to `accreditation_committee_meetings` and
-- `accreditation_committee_resolutions` — plus institution access, plus the
-- super-admin/admin bypass. In the UI it is `canManageMeetings` on
-- /accreditation/naac/committees/[id], the surface that records a meeting and
-- its resolutions.
--
-- Those minutes are the Council's only durable output — the same service header
-- records the loop the Director set on 2026-07-10, in which "minutes become the
-- Action-Taken Report". Gating that on a single account means one person on
-- leave, one handover, or one deactivated login stops the Council being able to
-- minute anything, and an unminuted resolution is indistinguishable from a
-- meeting that never happened.
--
-- `registrar` is the officer who files the institution's governance record, so
-- it is the second holder that costs nothing to justify. This is a SECOND pair
-- of hands, not a replacement: `accreditation_officer` is untouched.
--
-- ══ ROLES HERE ARE CLUSTER-WIDE — THIS DOES NOT LEAK ACROSS COLLEGES ═════════
--
-- `custom_roles.role_key` is UNIQUE platform-wide. There is no row-per-college:
-- there is ONE `hod` role, not one per institution, so a grant on `hod` is
-- necessarily a grant to every HOD in the cluster and there is no narrower
-- write available in this table.
--
-- Per-college confinement is not the grant's job and never was — it lives in
-- the RLS policies, which pair the permission test with an institution test:
--
--   sh_solution_first_use_insert (migration 20260907120000):
--     user_has_permission('solutions.first_use.record')
--     AND EXISTS (SELECT 1 FROM sh_solutions s
--                  WHERE s.id = solution_id
--                    AND role_has_institution_access(s.institution_id))
--
-- So a Nattraja HOD gaining `solutions.first_use.record` gains it for Nattraja's
-- solutions, because `role_has_institution_access()` still has to pass on the
-- row. A reviewer reading only the role list below would reasonably fear this
-- opens every college to every HOD; it does not, and the sentence above is here
-- so that fear is answered without having to go and read the policies.
--
-- The one documented exception is not introduced here and is not new: that
-- policy's own header records that `sh_solutions.institution_id` is NULLABLE
-- and that `role_has_institution_access(NULL)` returns TRUE by design
-- ("system-wide record"), so on a solution with no institution the permission
-- key alone decides. That is the platform's existing meaning for a NULL
-- institution, unchanged by this file.
--
-- ══ THE `?` OPERATOR IS NOT USED, ANYWHERE IN THIS FILE ══════════════════════
--
--   permissions ? 'some.key'                        tests the KEY EXISTS
--   (permissions ->> 'some.key')::boolean IS TRUE   tests the VALUE
--
-- user_has_permission() tests the VALUE. A key present and explicitly `false`
-- makes `?` return true on a role that is still locked out, so a `?`-based
-- assertion reports success while nobody gained anything. Both halves of that
-- are measured on this estate: an audit read "6,287 learners can approve" from
-- a `?` test when the truth was four roles, and separately `hod` carries a key
-- set explicitly to false which a `?` test counted as held, producing 107
-- recipients where 5 were intended. `hod` is one of the roles below, so this is
-- not a hypothetical here. Every check in this file reads `->>`.
--
-- ══ WHY `||` AND NOT `jsonb_set` ═════════════════════════════════════════════
--
-- `||` merges, so every other key on each of the five rows survives untouched,
-- and it behaves identically whether the key is absent (created) or already
-- present (overwritten) — including the `false` case above, which is overwritten
-- to true rather than skipped. `jsonb_set` with create_missing would need a
-- second code path for the absent case and silently does nothing on a NULL
-- `permissions`. A NULL `permissions` here is not silently repaired either: it
-- would make `permissions || …` evaluate to NULL, which the by-value post-check
-- in step 2 catches and raises on, rolling the whole thing back. Failing loudly
-- on an anomalous row is the intended behaviour, not an oversight.
--
-- ══ WIDENING WHO MAY RECORD CANNOT PRODUCE COMPETING RECORDS ════════════════
--
-- `sh_solution_first_use.solution_id` is UNIQUE, so "one entry per solution,
-- ever" is a database guarantee and not a UI convention. Four more roles able
-- to record therefore cannot produce four first-use rows for one solution; the
-- second writer gets a 23505. Correction of a mistaken entry goes through that
-- table's UPDATE policy, which this file does not alter.
--
-- Note for whoever applies this: 20260907120000 (the table, its policies and the
-- executives' grant) is still listed as FILE ONLY in supabase/SQL_FILE_INDEX.md,
-- while the keys it grants were read as live on production on 2026-08-21. That
-- discrepancy is worth resolving, but it does not change what this file does —
-- this file touches only `custom_roles.permissions` and is correct whether or
-- not `sh_solution_first_use` exists yet. If the table is not live, the grant
-- simply becomes operative when it lands.
--
-- ══ NOTHING TO REGISTER — ALL THREE KEYS ALREADY EXIST IN THE UI ═════════════
--
-- All three keys are already in lib/constants/permissions.ts
-- (accreditation.naac.committees.meetings.manage at line 1680;
-- solutions.first_use.view / .record at lines 1892-1893), so they are already
-- tickable in Role Management and this change needs no accompanying code edit.
-- That file is deliberately NOT touched by this PR. This is a DB grant only.
--
-- ══ WHY THE WRITES AND THE GUARDS ARE ONE `DO` BLOCK ═════════════════════════
--
-- Written as bare UPDATEs followed by a separate guard, the guard does NOT
-- guard. Under `psql -f` at default settings (no ON_ERROR_STOP) and the
-- Management API hand-apply path this repo actually uses, a RAISE EXCEPTION in
-- a later statement prints as an error while the UPDATE has already
-- autocommitted. This repo has measured that failure. A DO block is ONE
-- statement to the server, so it is atomic without any BEGIN/COMMIT of ours —
-- which is also why there is none here: a reviewer's `BEGIN … ROLLBACK`
-- rehearsal against production must actually roll back. Both grants share the
-- one block deliberately: they are one Director decision, and a half-applied
-- pair is a worse state than neither.
--
-- Re-runnable: setting true over true is a no-op that only re-stamps
-- updated_at, and every check is a pure read.

DO $$
DECLARE
  c_key_view    constant text   := 'solutions.first_use.view';
  c_key_record  constant text   := 'solutions.first_use.record';
  c_key_minutes constant text   := 'accreditation.naac.committees.meetings.manage';

  -- The departments and colleges that witness a first real use.
  c_producers   constant text[] := ARRAY['hod', 'principal',
                                         'vice_principal', 'school_principal'];
  -- The second pair of hands on Council minutes.
  c_minuters    constant text[] := ARRAY['registrar'];

  c_all_roles   constant text[] := c_producers || c_minuters;

  v_role        text;
  v_is_active   boolean;
  v_before      text;
  v_before2     text;
  v_after       text;
  v_granted     int := 0;
  v_key         text;
  v_other       text;
BEGIN
  -- ══ 0. PRECONDITIONS — fail, never skip ════════════════════════════════════
  --
  -- A missing role_key is a FAILURE, not a no-op. If one of these five were ever
  -- renamed, the UPDATE would match fewer rows and a post-check would read NULL
  -- — which looks exactly like a clean apply that granted nobody anything.

  FOREACH v_role IN ARRAY c_all_roles LOOP
    SELECT is_active INTO v_is_active
      FROM public.custom_roles
     WHERE role_key = v_role;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'CAC governance grants FAILED — no row in public.custom_roles with role_key = %. Nothing was changed.',
        v_role;
    END IF;

    -- Refuse on a deactivated role. NOTE the reason: user_has_permission() does
    -- NOT filter on custom_roles.is_active in either its user_roles path or its
    -- legacy profiles.role path, so a grant on an inactive role would still
    -- reach people — worse than harmless, not better. Refusing is deliberate:
    -- an inactive role means somebody deactivated it, and silently widening a
    -- role in that state is not this file's decision to make.
    IF v_is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        'CAC governance grants FAILED — role_key = % exists but is_active = %. Refusing to widen a deactivated role. Nothing was changed.',
        v_role, COALESCE(v_is_active::text, 'NULL');
    END IF;
  END LOOP;

  -- Recorded for the apply log, by VALUE. 'ABSENT' means the key is not on the
  -- row at all; 'false' means it is present and switched off — the case a `?`
  -- test would have miscounted as held. Both become true below, and both are
  -- fine; neither may fail.

  FOREACH v_role IN ARRAY c_producers LOOP
    SELECT permissions ->> c_key_view, permissions ->> c_key_record
      INTO v_before, v_before2
      FROM public.custom_roles
     WHERE role_key = v_role;

    RAISE NOTICE 'BEFORE: role_key=% % = % / % = %',
      v_role,
      c_key_view,   COALESCE(v_before,  'ABSENT'),
      c_key_record, COALESCE(v_before2, 'ABSENT');
  END LOOP;

  FOREACH v_role IN ARRAY c_minuters LOOP
    SELECT permissions ->> c_key_minutes INTO v_before
      FROM public.custom_roles
     WHERE role_key = v_role;

    RAISE NOTICE 'BEFORE: role_key=% % = %',
      v_role, c_key_minutes, COALESCE(v_before, 'ABSENT');
  END LOOP;

  -- ══ 1a. THE FIRST-USE GRANT — two keys, four roles, one statement ══════════
  --
  -- Scoped by an explicit `role_key = ANY(c_producers)`. Both keys move together
  -- because `.record` without `.view` is a role that can write the checkpoint
  -- and cannot read back what it wrote.

  UPDATE public.custom_roles
     SET permissions = permissions || jsonb_build_object(c_key_view,   true,
                                                         c_key_record, true),
         updated_at  = now()
   WHERE role_key = ANY(c_producers);

  GET DIAGNOSTICS v_granted = ROW_COUNT;

  IF v_granted <> array_length(c_producers, 1) THEN
    RAISE EXCEPTION
      'first-use grant FAILED — updated % rows, expected %. The grant has been rolled back.',
      v_granted, array_length(c_producers, 1);
  END IF;

  -- ══ 1b. THE MINUTES GRANT — one key, one role ══════════════════════════════

  UPDATE public.custom_roles
     SET permissions = permissions || jsonb_build_object(c_key_minutes, true),
         updated_at  = now()
   WHERE role_key = ANY(c_minuters);

  GET DIAGNOSTICS v_granted = ROW_COUNT;

  IF v_granted <> array_length(c_minuters, 1) THEN
    RAISE EXCEPTION
      'minutes grant FAILED — updated % rows, expected %. Both grants have been rolled back.',
      v_granted, array_length(c_minuters, 1);
  END IF;

  -- ══ 2. ASSERT THE END STATE BY VALUE — never the `?` operator ══════════════
  --
  -- RAISE EXCEPTION, never RAISE NOTICE: a NOTICE-only guard reads as a clean
  -- apply and Studio hides NOTICE output entirely. Because this is the same DO
  -- block as both UPDATEs, raising here rolls both grants back.

  FOREACH v_role IN ARRAY c_producers LOOP
    FOREACH v_key IN ARRAY ARRAY[c_key_view, c_key_record] LOOP
      SELECT permissions ->> v_key INTO v_after
        FROM public.custom_roles
       WHERE role_key = v_role;

      IF NOT ((v_after)::boolean IS TRUE) THEN
        RAISE EXCEPTION
          'first-use grant FAILED — after the UPDATE role_key=% reads % = % by value, not true. Both grants have been rolled back.',
          v_role, v_key, COALESCE(v_after, 'ABSENT');
      END IF;
    END LOOP;
  END LOOP;

  FOREACH v_role IN ARRAY c_minuters LOOP
    SELECT permissions ->> c_key_minutes INTO v_after
      FROM public.custom_roles
     WHERE role_key = v_role;

    IF NOT ((v_after)::boolean IS TRUE) THEN
      RAISE EXCEPTION
        'minutes grant FAILED — after the UPDATE role_key=% reads % = % by value, not true. Both grants have been rolled back.',
        v_role, c_key_minutes, COALESCE(v_after, 'ABSENT');
    END IF;
  END LOOP;

  -- ══ 3. REPORTED, NOT ENFORCED ══════════════════════════════════════════════
  --
  -- Nothing below can fail the migration. It exists so the apply log shows what
  -- the estate looks like afterwards rather than leaving it to be inferred.
  --
  -- The expected reading: the first-use keys on the four roles above PLUS ceo,
  -- managing_director and cbo, who keep theirs; the meetings key on registrar
  -- PLUS accreditation_officer, who keeps theirs. Any OTHER role appearing here
  -- is a signal, not an error — it means somebody granted that key by another
  -- route, and the reviewer should know before deciding whether that was
  -- intended.

  FOREACH v_key IN ARRAY ARRAY[c_key_view, c_key_record, c_key_minutes] LOOP
    FOR v_other IN
      SELECT role_key FROM public.custom_roles
       WHERE (permissions ->> v_key)::boolean IS TRUE
       ORDER BY role_key
    LOOP
      RAISE NOTICE '% is TRUE on role_key=%', v_key, v_other;
    END LOOP;
  END LOOP;

  RAISE NOTICE
    'CAC governance grants applied — first-use view/record on % roles (%), committee minutes on % role (%). Verified true by value on every one. Nothing was revoked from anybody.',
    array_length(c_producers, 1), array_to_string(c_producers, ', '),
    array_length(c_minuters, 1),  array_to_string(c_minuters, ', ');
END $$;
