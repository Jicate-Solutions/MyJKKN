-- ─── The CAC UGC readiness checklist: create the key AND grant it, atomically ──
-- 2026-08-14 — Part C of the Cluster Academic Council page.
--
-- ⚠ NOT APPLIED TO ANY DATABASE. Director-gated apply, by hand.
--
-- ══ WHAT THIS DOES ═══════════════════════════════════════════════════════════
--
--   accreditation.cac.readiness.view  →  true, on exactly four roles:
--     ceo, managing_director, accreditation_officer, principal
--
-- Nothing else. No other key, no other role, no table, no function, no policy.
--
-- ══ WHY CREATING AND GRANTING ARE THE SAME FILE ══════════════════════════════
--
-- This repo produced FIVE pages in one week that were gated on a key nobody
-- held, because the key was registered in one change and granted in another
-- that never landed. The page then renders its refusal to every single reader,
-- including the person who commissioned it, and looks broken rather than
-- closed. The most recent instance is on record: the Cluster Academic Council
-- was closed to the CEO who authored it.
--
-- So there is no separate "grant" migration to follow this one. The key comes
-- into existence on the four roles that need it, in one statement, or it does
-- not come into existence at all.
--
-- ══ THE `?` OPERATOR IS NOT USED, ANYWHERE IN THIS FILE ══════════════════════
--
--   permissions ? 'some.key'          tests whether the KEY EXISTS
--   (permissions ->> 'some.key')::boolean IS TRUE   tests the VALUE
--
-- user_has_permission() tests the VALUE. A key present and explicitly `false`
-- makes `?` return true on a role that is still locked out, so a `?`-based
-- assertion reports success while nobody can open the page. That exact failure
-- is on record in this repo — an audit read "6,287 learners can approve" from a
-- `?` test when the truth was four roles. Every check below reads `->>`.
--
-- ══ WHY `||` AND NOT `jsonb_set` ═════════════════════════════════════════════
--
-- `||` merges, so every other key on each of the four rows survives untouched,
-- and it behaves identically whether the key is absent (created) or present
-- (overwritten). Both cases occur here: the key is new, so on every row this is
-- a creation — but a re-run finds it present, and `||` handles that without a
-- second code path.
--
-- ══ WHAT THE KEY OPENS ═══════════════════════════════════════════════════════
--
-- One section of one page: the UGC readiness checklist on /accreditation/cac,
-- mounted after the collaboration section. It is READ-ONLY and derives every
-- figure at render time from reads that page already makes
-- (fn_cac_cluster_totals, the cluster-council list). It opens no write surface,
-- no export, and no other page. A reader without the key sees a short message
-- naming this key — never a silent hide and never a redirect.
--
-- The checklist itself carries no score, no grade and no proportion, so the key
-- does not expose a rating of any college to anybody.
--
-- ══ WHY THESE FOUR ROLES ═════════════════════════════════════════════════════
--
-- The checklist is about JKKN's own governance — whether an Academic Council
-- exists, whether it has minuted anything, whether the colleges have anything
-- written between them. Those are decisions for the people who can actually
-- take them. `ceo` and `managing_director` can constitute a council;
-- `accreditation_officer` files the governance record; `principal` is the
-- member college's own seat on it.
--
-- Deliberately NOT granted to `faculty`, `hod` or any learner-facing role. Not
-- because the reading is sensitive — it is a checklist of JKKN's own gaps — but
-- because a reader who cannot act on any line of it is being shown a list of
-- things somebody else has not done.
--
-- The key is registered in lib/constants/permissions.ts in the SAME pull
-- request, under the accreditation category. A key registered nowhere cannot be
-- ticked in Role Management and is therefore ungrantable to anybody outside
-- these four for ever after.
--
-- ══ WHY THE WRITE AND THE GUARD ARE ONE `DO` BLOCK ═══════════════════════════
--
-- Written as a bare UPDATE followed by a separate guard, the guard does NOT
-- guard. Under `psql -f` at default settings (no ON_ERROR_STOP) and the
-- Management API hand-apply path this repo actually uses, a RAISE EXCEPTION in
-- a later statement prints as an error while the UPDATE has already
-- autocommitted. This repo has measured that failure. A DO block is ONE
-- statement to the server, so it is atomic without any BEGIN/COMMIT of ours —
-- which is also why there is none here: a reviewer's `BEGIN … ROLLBACK`
-- rehearsal against production must actually roll back.
--
-- Re-runnable: setting true over true is a no-op that only re-stamps
-- updated_at, and every check is a pure read.

DO $$
DECLARE
  c_key        constant text   := 'accreditation.cac.readiness.view';
  c_roles      constant text[] := ARRAY['ceo', 'managing_director',
                                        'accreditation_officer', 'principal'];
  v_role       text;
  v_is_active  boolean;
  v_before     text;
  v_after      text;
  v_granted    int := 0;
  v_other      text;
BEGIN
  -- ══ 0. PRECONDITIONS — fail, never skip ════════════════════════════════════
  --
  -- A missing role_key is a FAILURE, not a no-op. If one of these four were
  -- ever renamed, the UPDATE would match zero rows and a post-check would read
  -- NULL — which looks exactly like a clean apply that granted nobody anything.

  FOREACH v_role IN ARRAY c_roles LOOP
    SELECT is_active INTO v_is_active
      FROM public.custom_roles
     WHERE role_key = v_role;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        '% grant FAILED — no row in public.custom_roles with role_key = %. Nothing was changed.',
        c_key, v_role;
    END IF;

    -- Refuse on a deactivated role. NOTE the reason: user_has_permission()
    -- does NOT filter on custom_roles.is_active in either its user_roles path
    -- or its legacy profiles.role path, so a grant on an inactive role would
    -- still reach people — worse than harmless, not better. Refusing is
    -- deliberate: an inactive role means somebody deactivated it, and silently
    -- widening a role in that state is not this file's decision to make.
    IF v_is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        '% grant FAILED — role_key = % exists but is_active = %. Refusing to widen a deactivated role. Nothing was changed.',
        c_key, v_role, COALESCE(v_is_active::text, 'NULL');
    END IF;

    -- Recorded for the apply log. Expected on every row: ABSENT — this key is
    -- new. 'true' means somebody already granted it and this file is a no-op,
    -- which is fine and must not fail.
    SELECT permissions ->> c_key INTO v_before
      FROM public.custom_roles
     WHERE role_key = v_role;

    RAISE NOTICE 'BEFORE: role_key=% % = % (ABSENT means the key did not exist)',
      v_role, c_key, COALESCE(v_before, 'ABSENT');
  END LOOP;

  -- ══ 1. THE GRANT — one key, four roles, one statement ══════════════════════
  --
  -- Scoped by an explicit `role_key = ANY(c_roles)`. No predicate of the shape
  -- "every role that already holds X" appears anywhere in this file, so it is
  -- structurally incapable of sweeping in a role nobody reviewed.

  UPDATE public.custom_roles
     SET permissions = permissions || jsonb_build_object(c_key, true),
         updated_at  = now()
   WHERE role_key = ANY(c_roles);

  GET DIAGNOSTICS v_granted = ROW_COUNT;

  IF v_granted <> array_length(c_roles, 1) THEN
    RAISE EXCEPTION
      '% grant FAILED — updated % rows, expected %. The grant has been rolled back.',
      c_key, v_granted, array_length(c_roles, 1);
  END IF;

  -- ══ 2. ASSERT THE END STATE BY VALUE — never the `?` operator ══════════════
  --
  -- RAISE EXCEPTION, never RAISE NOTICE: a NOTICE-only guard reads as a clean
  -- apply and Studio hides NOTICE output entirely. Because this is the same DO
  -- block as the UPDATE, raising here rolls the grant back.

  FOREACH v_role IN ARRAY c_roles LOOP
    SELECT permissions ->> c_key INTO v_after
      FROM public.custom_roles
     WHERE role_key = v_role;

    IF NOT ((v_after)::boolean IS TRUE) THEN
      RAISE EXCEPTION
        '% grant FAILED — after the UPDATE role_key=% reads % by value, not true. The grant has been rolled back.',
        c_key, v_role, COALESCE(v_after, 'ABSENT');
    END IF;
  END LOOP;

  -- ══ 3. REPORTED, NOT ENFORCED ══════════════════════════════════════════════
  --
  -- Nothing below can fail the migration. It exists so the apply log shows what
  -- the estate looks like afterwards rather than leaving it to be inferred.
  --
  -- Any role listed here that is NOT one of the four is a signal, not an error:
  -- it means somebody granted this key by another route, and the reviewer
  -- should know before deciding whether that was intended.

  FOR v_other IN
    SELECT role_key FROM public.custom_roles
     WHERE (permissions ->> c_key)::boolean IS TRUE
     ORDER BY role_key
  LOOP
    RAISE NOTICE '% is TRUE on role_key=%', c_key, v_other;
  END LOOP;

  RAISE NOTICE
    '% created and granted on % roles — verified true by value on every one. Opens one read-only section of /accreditation/cac and nothing else.',
    c_key, v_granted;
END $$;
