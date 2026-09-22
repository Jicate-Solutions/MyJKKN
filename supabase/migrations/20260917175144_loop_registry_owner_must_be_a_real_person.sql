-- =============================================================================
-- LOOP OWNERSHIP — an owner_email must resolve to a real, active person
-- =============================================================================
-- FILE ONLY / NOT APPLIED — the operator applies it at merge. No data changes.
--
-- THE HOLE. 20260726012000 (the Article 2 birth-gate) made owner_email NOT NULL
-- and added `loop_registry_owner_nonempty CHECK (btrim(owner_email) <> '')`.
-- The intent was that every loop names a human. The constraint only tests that
-- the string is not empty, so a non-empty address belonging to NOBODY passes.
--
-- Verified on production 2026-09-17 (read-only):
--   • 'aieee@jkkn.ac.in' has ZERO rows in profiles — it is not a person and
--     never has been. It owns 25 of the registry's 43 loops, including
--     'director', 'scf', 'iqac-meeting', 'mess', 'bug-triage', 'metaloop',
--     'carre-audit' and the 'ai-pulse' parent row. All 25 are is_active.
--   • The other 18 loops (director@, krishnaveni_a@, dhuraimurugan.g@) each
--     resolve to exactly one active, non-pre-registered profile.
--   • That same address was written INTO those rows by the birth-gate migration
--     itself (`SET owner_email = 'aieee@jkkn.ac.in' WHERE owner_email IS NULL`),
--     so the gate that was meant to require an owner is what installed the
--     placeholder. 20260821111719 later corrected the 13 ai-pulse-% rows to
--     krishnaveni_a@jkkn.ac.in — the precedent for a targeted, by-hand fix.
--
-- THIS MIGRATION DOES NOT REASSIGN ANY LOOP. Who owns 'director' or 'scf' is
-- the Director's decision and those loops sit in other people's areas. Not one
-- owner_email value changes here; the 25 are listed in the PR body instead, so
-- they can be assigned in one pass on /admin/loops (Owners & verdicts).
--
-- ── WHY A TRIGGER AND NOT A CONSTRAINT ──────────────────────────────────────
-- 25 existing rows violate the rule being added, so the shape of the guard is
-- the whole decision. Rehearsed on a local Postgres before choosing:
--
--   (a) Plain `ADD CONSTRAINT ... CHECK (EXISTS (SELECT ... FROM profiles))`
--       is not merely blocked by the 25 rows — PostgreSQL rejects it outright:
--       "cannot use subquery in check constraint". Not an option at all.
--
--   (b) A CHECK over a lookup FUNCTION, added NOT VALID, DOES apply over the
--       25 — and that is exactly why it is wrong. A NOT VALID constraint is
--       re-checked on every UPDATE of the row, not only when the guarded
--       column changes. Rehearsed: with such a constraint in place,
--         UPDATE loop_registry SET is_active = false WHERE loop_key='director'
--       FAILS on one of the 25, although owner_email was never touched. Worse,
--       fn_loop_set_owner (the Owners & verdicts panel's RPC) always writes
--       owner_email in its SET list even when a super admin edited only the
--       verdict owner — so under (b) the panel could no longer record a verdict
--       owner on any of the 25. The guard would break the one surface that
--       exists to fix them. It also carries a dump/restore hazard: a restore
--       re-checks every row against a profiles table that may not be populated
--       yet.
--
--   (c) A FOREIGN KEY to profiles(email) is technically possible — profiles
--       DOES carry `profiles_email_unique UNIQUE (email)`, so the reference is
--       legal — but it is wrong here, for three reasons found by looking:
--         · it is case-SENSITIVE (a plain btree on the raw column), and two
--           addresses already exist in two case variants, so 'Director@...'
--           would be refused although the person plainly exists;
--         · a FK cannot express "active" or "not a pre-registered shadow row",
--           which is what "a real person" means everywhere else in this estate;
--         · it couples a person's lifecycle to the registry — deleting or
--           re-addressing a profile would either block that edit or cascade
--           into loops nobody meant to touch.
--
--   (d) A TRIGGER on INSERT and on UPDATE OF owner_email — chosen. It fires
--       only when an owner is actually being SET, leaves the 25 alone at rest,
--       and can express the estate's real definition of a person.
--
-- WHAT HAPPENS TO THE 25 ON THE DAY SOMEONE EDITS ONE. Nothing. Editing any
-- other column (is_active, name, a charter leg, verdict_owner) does not fire
-- the trigger. Re-saving the SAME owner_email — which fn_loop_set_owner does on
-- every verdict-owner edit — passes the `IS NOT DISTINCT FROM OLD` guard and is
-- allowed. The row is only judged when someone gives it a genuinely NEW owner,
-- and then the new owner must be real. Assigning one of the 25 to an actual
-- person therefore works; replacing the placeholder with another placeholder
-- does not. The 25 stay editable and stay honest.
--
-- WHAT COUNTS AS A PERSON. The same rule the notification route already applies
-- (classifyLoopOwnerProfiles in lib/services/loops/loop-owner-fallback.ts, and
-- app/api/cron/learner-risk-notifications/route.ts): EXACTLY ONE profile, matched
-- case-insensitively, that is is_active and is not a pre-registered shadow row.
-- Zero matches and two-or-more matches are both refusals there ('owner_no_profile'
-- / 'owner_ambiguous' — in both cases an alert reaches nobody), so they are both
-- refusals here. One definition of "a real owner" in this estate, not two.
--
-- The existing loop_registry_owner_nonempty CHECK is deliberately LEFT IN PLACE:
-- it is cheap, already validated, and still holds if this trigger is ever
-- disabled.
--
-- To re-list the orphans at any time:
--   SELECT loop_key, name, owner_email FROM loop_registry
--    WHERE (SELECT count(*) FROM profiles p
--            WHERE lower(p.email) = lower(btrim(loop_registry.owner_email))
--              AND p.is_active AND p.is_pre_registered IS NOT TRUE) <> 1
--    ORDER BY stack_tier, loop_key;
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loop_registry_require_real_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Mirror of fn_loop_set_owner's NULLIF(btrim(...)) normalization, so the
  -- value judged here is the value that would be stored.
  v_email   text := btrim(coalesce(NEW.owner_email, ''));
  v_matches integer;
BEGIN
  -- Only judge an owner that is actually being SET to something new. The
  -- trigger is already narrowed to `UPDATE OF owner_email`, but that fires
  -- whenever the column appears in the SET list even if the value is
  -- unchanged — which fn_loop_set_owner does on every save. Without this the
  -- 25 legacy rows would become uneditable.
  IF TG_OP = 'UPDATE' AND NEW.owner_email IS NOT DISTINCT FROM OLD.owner_email THEN
    RETURN NEW;
  END IF;

  IF v_email = '' THEN
    RAISE EXCEPTION
      'A loop must name an owner: owner_email was left blank'
      USING ERRCODE = '23514',
            HINT    = 'Enter the JKKN address of the person who owns this loop.';
  END IF;

  -- Case-insensitive equality (not a LIKE pattern — no wildcard hazard),
  -- active, and not a pre-registered shadow row. IS NOT TRUE, not = false, so
  -- a NULL is treated as "not pre-registered", exactly as the notification
  -- route's .not('is_pre_registered','is',true) does.
  SELECT count(*) INTO v_matches
    FROM public.profiles p
   WHERE lower(p.email) = lower(v_email)
     AND p.is_active
     AND p.is_pre_registered IS NOT TRUE;

  IF v_matches = 0 THEN
    RAISE EXCEPTION
      'Loop owner "%" is not a person: no active account carries that address', v_email
      USING ERRCODE = '23514',
            HINT    = 'A loop must be owned by someone who can actually receive its alerts. Use the address of an active MyJKKN account; if the owner has not joined yet, create their account first.';
  ELSIF v_matches > 1 THEN
    RAISE EXCEPTION
      'Loop owner "%" is ambiguous: more than one active account carries that address', v_email
      USING ERRCODE = '23514',
            HINT    = 'Alerts are not sent to an ambiguous address. Resolve the duplicate accounts, or name a different owner.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_loop_registry_require_real_owner() IS
  'Article 2 birth-gate, second half (2026-09-17): loop_registry.owner_email must resolve to EXACTLY ONE active, non-pre-registered profile (case-insensitive) — the same rule classifyLoopOwnerProfiles applies before sending a loop''s alerts. Fires on INSERT and only when owner_email actually CHANGES, so the 25 rows that predate the rule stay editable and are never silently reassigned.';

-- A trigger function cannot be invoked directly — PostgreSQL refuses with
-- "trigger functions can only be called as triggers" — and the repo's own
-- secdef-anon-revoke gate exempts RETURNS trigger for that reason. The lock is
-- kept anyway, naming anon AND PUBLIC (anon is a member of PUBLIC, so revoking
-- anon alone leaves PUBLIC granting it straight back).
REVOKE EXECUTE ON FUNCTION public.fn_loop_registry_require_real_owner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loop_registry_require_real_owner() TO authenticated;

DROP TRIGGER IF EXISTS trg_loop_registry_require_real_owner ON public.loop_registry;
CREATE TRIGGER trg_loop_registry_require_real_owner
  BEFORE INSERT OR UPDATE OF owner_email ON public.loop_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_loop_registry_require_real_owner();

NOTIFY pgrst, 'reload schema';
