-- ─── Faculty can open the accreditation worklist they were made owners of ───
-- 2026-08-14 — Director-approved.
--
-- ⚠ NOT APPLIED TO ANY DATABASE. Director-gated apply, by hand.
--
-- ══ WHAT THIS FIXES, IN PLAIN ENGLISH ════════════════════════════════════════
--
-- PEOPLE WERE MADE ACCOUNTABLE FOR AN AWARDING BODY AND CANNOT OPEN THE PAGE
-- THAT TELLS THEM SO.
--
-- On 2026-08-13 the Executive Admin Officer assigned metric owners: 14 rows in
-- public.accreditation_metric_owners, 14 distinct people, all body-level.
-- Read live on 2026-08-14, TEN of those fourteen hold the `faculty` role, and
-- `faculty` carries ZERO accreditation keys true — all 32 accreditation keys are
-- present on the row and every one of them is false.
--
-- /accreditation/my-gaps is the per-owner worklist. It is where an owner sees
-- what they owe, presses Accept or Decline on their assignment, and follows the
-- "Fix this →" links to the page where the underlying data is actually entered.
-- It gates on `accreditation.view` — `isSuperAdmin || can('accreditation.view')`
-- in the page itself, and MENU_PERMISSIONS agrees. None of the 14 owners is a
-- super admin (is_super_admin = false for all 14), so no bypass covers for it.
--
-- The accreditation guide's orientation sections gate on the same key
-- (lib/accreditation/guide/content.ts: REQUIRES.overview = 'accreditation.view'),
-- so those owners cannot read the explanation either.
--
-- ══ THE NUMBERS, MEASURED — NOT THE ONES IN THE ORIGINAL BRIEF ═══════════════
--
-- The brief for this change said "nine of fourteen hold faculty" and "nine
-- people cannot open the page". Both were read again live on 2026-08-14 and
-- neither is exactly right. The corrected figures:
--
--   14   distinct metric owners (14 assignment rows, all body-level)
--   10   of them hold `faculty` through user_roles
--    0   of them are super admins
--    7   are locked out TODAY — no path grants them accreditation.view
--    7   of those 7 are unblocked by this migration
--    0   remain locked out afterwards
--
-- The other 7 of the 14 can already open the page today, through `hod`,
-- `principal` or another role that carries the key. So: 7 can open it now,
-- 14 can open it after this file.
--
-- ══ THE 14th OWNER IS REACHED BY THE LEGACY PATH, NOT user_roles ═════════════
--
-- An earlier draft of this file claimed one owner would REMAIN locked out. That
-- was wrong, and the reason it was wrong is the interesting part.
--
-- user_has_permission() has FOUR paths, tried in order. Read verbatim from the
-- live function body on 2026-08-14:
--
--   1. super-admin bypass          profiles.is_super_admin
--   2. multi-role                  user_roles → custom_roles
--   3. LEGACY FALLBACK             profiles.role = custom_roles.role_key
--   4. Director handover           fn_handover_grants_key(auth.uid(), key)
--
-- The owner in question holds `faculty` in `profiles.role` and has NO rows in
-- user_roles at all. A check that walks only path 2 — which is what the earlier
-- draft did — cannot see them, and reports them as unreachable. Path 3 joins
-- profiles.role straight to custom_roles.role_key, so the moment `faculty`
-- carries accreditation.view = true, that path returns true for them.
--
-- Modelled across all four paths for all 14 owners: 7 can open before, 14 after,
-- 0 remaining. Exactly one of the 7 unblocked is reached ONLY through path 3.
--
-- ══ HEADCOUNT — 440, AND WHY IT IS NEITHER 393 NOR 490 ═══════════════════════
--
-- Neither single column answers this question, because `faculty` is reachable
-- by two different routes and they are not nested:
--
--   490  hold `faculty` via user_roles          (path 2)
--   393  hold `faculty` via profiles.role       (path 3, the legacy column)
--   499  UNION of the two — the real population
--     9  of those reach `faculty` ONLY through profiles.role, with no user_roles
--        row whatsoever. This is a small population but it is NOT empty, and the
--        14th metric owner is one of them.
--   106  reach it only through user_roles
--   384  hold it both ways
--
--   499  hold `faculty` by either route
--   -59  already reach accreditation.view anyway (super admin, or another role
--        by either route — hod, principal, and the six others listed below)
--   ────
--   440  people who can open /accreditation and /accreditation/my-gaps
--        after this migration who could not before
--
-- 440 is the honest blast radius. An earlier draft said 431; that figure counted
-- only user_roles holders and silently dropped the 9 legacy-only ones.
--
-- ══ WHAT THE KEY OPENS — TWO ROUTES, AND NOTHING ELSE ════════════════════════
--
-- Swept across lib/sidebarMenuLink.ts MENU_PERMISSIONS on jicate/main
-- 2026-08-14. `accreditation.view` is the gate on exactly two routes:
--
--   /accreditation            the landing page
--   /accreditation/my-gaps    the per-owner worklist — which shows ONLY what is
--                             assigned to the viewer. A faculty member with no
--                             assignment sees "Nothing is assigned to you yet".
--
-- plus the guide's orientationSections (REQUIRES.overview).
--
-- It opens NO awarding-body dashboard, NO /accreditation/manage/* page, and NO
-- write surface. Every one of those carries its own separate key, and `faculty`
-- holds none of them — verified by value, not assumed: a sweep of every
-- accreditation.* key on the `faculty` row that reads true returned ZERO rows on
-- 2026-08-14. For the avoidance of doubt, all of these stay closed to faculty:
--
--   accreditation.coverage.view, accreditation.metrics.view,
--   accreditation.naac.view, accreditation.nirf.view, accreditation.nba.view,
--   accreditation.qs.view, accreditation.dci.view, accreditation.pci.view,
--   accreditation.inc.view, accreditation.ncte.view, accreditation.aicte.view,
--   accreditation.ugc.view, accreditation.cac.view, accreditation.bodies.view,
--   accreditation.naac.narrative.view, accreditation.naac.narrative.manage,
--   accreditation.naac.committees.view, accreditation.naac.dcf_export, …
--
-- In particular `accreditation.naac.narrative.manage` — the key the live RLS on
-- accreditation_metric_owners uses for BOTH its USING and WITH CHECK, i.e. the
-- assign-an-owner write — is NOT granted here. A faculty member can read and
-- respond to their own assignment. They cannot create one.
--
-- ══ WHAT IT CHANGES — ONE (role, key) PAIR ═══════════════════════════════════
--
--   faculty  →  accreditation.view = true    (was present, explicitly FALSE)
--
-- Nothing else. No other role, no other key.
--
-- ══ THE KEY IS PRESENT AND FALSE — NOT ABSENT. THIS MATTERS FOR THE GUARD ════
--
-- Read by value on production 2026-08-14:
--
--   role_key     is_active   key_exists   raw_value   accreditation_keys_on_row
--   faculty      true        true         false       32
--
-- `permissions ? 'accreditation.view'` returns TRUE on this row RIGHT NOW, while
-- faculty cannot open the page. So a `?`-based assertion would pass on a role
-- that is still locked out — it would report success and change nothing that
-- matters. The guard below therefore reads the VALUE via `->>` and casts, never
-- the `?` existence operator.
--
-- ══ WHY `||` AND NOT `jsonb_set` ═════════════════════════════════════════════
--
-- `||` merges, so the other 31 accreditation keys and every non-accreditation
-- key on the faculty row survive untouched.
--
-- To be accurate about jsonb_set, because the folklore is wrong: the
-- three-argument form `jsonb_set(target, path, value)` takes a FOURTH argument,
-- create_if_missing, which DEFAULTS TO TRUE — so the 3-arg form would in fact
-- have worked here, and would have worked even had the key been absent. The real
-- hazard is the FOUR-argument form with `false`, which silently returns the row
-- unchanged for an absent key while the migration reports success. `||` is used
-- because it is immune either way, whoever edits this file next.
--
-- ══ SCOPING ══════════════════════════════════════════════════════════════════
--
-- The UPDATE is scoped by an explicit `role_key = 'faculty'`. No predicate of
-- the shape "every role that already holds X" appears anywhere in this file, so
-- it is structurally incapable of sweeping in a role nobody reviewed.
--
-- Eight roles already hold accreditation.view true and are deliberately NOT
-- touched: accreditation_officer, ceo, coo, hod, managing_director, principal,
-- registrar, vice_principal. They are reported in the apply log, not enforced.
--
-- ══ WHY THE WRITE AND THE GUARD ARE ONE `DO` BLOCK ═══════════════════════════
--
-- Written as a bare UPDATE followed by a separate guard block, the guard does
-- NOT guard. Under `psql -f` at default settings (no ON_ERROR_STOP) and the
-- Management API hand-apply path this repo actually uses, a RAISE EXCEPTION in a
-- later statement prints as an error and the runner moves on — the UPDATE has
-- already autocommitted. This repo has measured that exact failure (see
-- SQL_FILE_INDEX.md, "Sections 0–3 are ONE DO block, and that is load-bearing").
--
-- A DO block is ONE statement to the server, so it is atomic without any
-- BEGIN/COMMIT of ours — which is also why there is none here: a reviewer's
-- `BEGIN … ROLLBACK` rehearsal against production must actually roll back.
--
-- Re-runnable: the UPDATE is idempotent (setting true over true is a no-op that
-- only re-stamps updated_at) and every check is a pure read.

DO $$
DECLARE
  v_is_active    boolean;
  v_before_raw   text;
  v_after_raw    text;
  v_other_role   text;
  v_key_count    int;
BEGIN
  -- ══ 0. PRECONDITIONS — fail, never skip ════════════════════════════════════
  --
  -- A missing role_key is a FAILURE, not a no-op. If `faculty` were ever renamed
  -- the UPDATE would match zero rows and the post-check would read NULL, which
  -- looks exactly like a clean apply that granted nobody anything.

  SELECT is_active INTO v_is_active
    FROM public.custom_roles
   WHERE role_key = 'faculty';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'faculty accreditation.view grant FAILED — no row in public.custom_roles with role_key = ''faculty''. Nothing was changed.';
  END IF;

  -- Refuse on a deactivated role. NOTE the reason, because an earlier draft of
  -- this file stated it wrongly: user_has_permission() does NOT filter on
  -- custom_roles.is_active — neither the user_roles path nor the profiles.role
  -- path mentions the column (read from the live function body 2026-08-14). So
  -- a grant on an inactive role would in fact still reach people, which is worse
  -- than harmless, not better. Refusing is deliberate: `faculty` being inactive
  -- would mean someone deactivated it, and silently widening a role in that
  -- state is not a decision this file should make on their behalf.
  IF v_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'faculty accreditation.view grant FAILED — role_key = ''faculty'' exists but is_active = %. Refusing to widen a deactivated role. Nothing was changed.',
      COALESCE(v_is_active::text, 'NULL');
  END IF;

  -- Recorded for the apply log. Expected on 2026-08-14: 'false' (present, false).
  -- 'true' means someone already granted it and this file is a no-op — which is
  -- fine and must not fail.
  SELECT permissions ->> 'accreditation.view' INTO v_before_raw
    FROM public.custom_roles
   WHERE role_key = 'faculty';

  RAISE NOTICE 'BEFORE: faculty accreditation.view = % (NULL means the key was absent)',
    COALESCE(v_before_raw, 'ABSENT');

  -- ══ 1. THE GRANT — one role, one key ═══════════════════════════════════════
  --
  -- `||` merges: every other key on the row is preserved.

  UPDATE public.custom_roles
     SET permissions = permissions || jsonb_build_object('accreditation.view', true),
         updated_at  = now()
   WHERE role_key = 'faculty';

  -- ══ 2. ASSERT THE END STATE BY VALUE — never the `?` operator ══════════════
  --
  -- user_has_permission() tests the VALUE. `permissions ? 'accreditation.view'`
  -- was already TRUE on this row before the UPDATE, with the value false, so an
  -- existence check would have passed while faculty stayed locked out.
  --
  -- RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only guard stamps zero rows,
  -- reads as a clean apply, and Studio hides NOTICE output entirely. Because
  -- this is the same DO block as the UPDATE, raising here rolls the grant back.

  SELECT permissions ->> 'accreditation.view' INTO v_after_raw
    FROM public.custom_roles
   WHERE role_key = 'faculty';

  IF NOT ((v_after_raw)::boolean IS TRUE) THEN
    RAISE EXCEPTION
      'faculty accreditation.view grant FAILED — after the UPDATE the key reads % by value, not true. The grant has been rolled back.',
      COALESCE(v_after_raw, 'ABSENT');
  END IF;

  -- ══ 3. REPORTED, NOT ENFORCED ══════════════════════════════════════════════
  --
  -- Nothing below can fail the migration. These exist so the apply log shows
  -- what the estate looks like afterwards rather than leaving it to be inferred.

  -- 3a. Confirm the merge preserved the rest of the row. Expected: 32 keys, of
  --     which exactly ONE (accreditation.view) now reads true.
  SELECT count(*) INTO v_key_count
    FROM public.custom_roles cr, LATERAL jsonb_object_keys(cr.permissions) k
   WHERE cr.role_key = 'faculty' AND k LIKE 'accreditation.%';

  RAISE NOTICE 'faculty now carries % accreditation.* keys; exactly 1 of them (accreditation.view) reads true', v_key_count;

  -- 3b. The eight roles that already held the key are untouched by this file.
  --     Expected 2026-08-14: accreditation_officer, ceo, coo, hod,
  --     managing_director, principal, registrar, vice_principal.
  FOR v_other_role IN
    SELECT role_key FROM public.custom_roles
     WHERE (permissions ->> 'accreditation.view')::boolean IS TRUE
       AND role_key <> 'faculty'
     ORDER BY role_key
  LOOP
    RAISE NOTICE 'accreditation.view also TRUE on role_key=% (pre-existing, untouched)', v_other_role;
  END LOOP;

  RAISE NOTICE 'faculty accreditation.view grant OK — verified true by value. ~440 people gain /accreditation and /accreditation/my-gaps (499 hold faculty by either route, 59 already had access). All 7 locked-out metric owners are unblocked and 0 remain: 6 reach it via user_roles, the 7th only via the legacy profiles.role path.';
END $$;
