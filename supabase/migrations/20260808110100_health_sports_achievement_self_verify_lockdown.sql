-- ============================================================================
-- Migration: 20260808110100_health_sports_achievement_self_verify_lockdown.sql
-- Date:      2026-07-31
-- Module:    health / sports achievements  (Director decision D4)
--
-- ⚠️ NOT APPLIED TO ANY DATABASE — Director-gated apply.
--    Merging and deploying this repo does NOT run migrations. Nothing here has
--    touched production; it was proven inside BEGIN..ROLLBACK only, and the
--    residue re-read in a SEPARATE call.
--
-- ============================================================================
-- WHAT WAS WRONG — measured on production 2026-07-31, not inferred
-- ============================================================================
-- D4 says ONLY the accreditation / IQAC side may tick `verified`. The point of
-- that tick is to make the record trustworthy to an EXTERNAL accreditation
-- reviewer. Evidence its own subject can tick is worth nothing to that reviewer.
--
-- Production enforced D4 nowhere below the button:
--
--   * information_schema.table_privileges — UPDATE on
--     public.health_sports_achievements granted to anon, authenticated,
--     postgres, service_role.
--   * information_schema.column_privileges — UPDATE on the `verified` and
--     `verified_by` COLUMNS granted to the same four roles.
--   * pg_policies — health_sports_achievements_self was cmd = ALL over the
--     learner's own rows.
--
-- PostgreSQL RLS is ROW-scoped, never COLUMN-scoped. "You may edit your own
-- row" therefore silently reads "you may verify your own row". Proven live as
-- the OWNING learner, DB role `authenticated`, request.jwt.claims.sub set to
-- their profile id — the exact execution shape PostgREST uses:
--
--   BEFORE  UPDATE … SET verified = true WHERE id = <own row>   -> 1 row
--           read back                                           -> verified = true
--   BEFORE  UPDATE … SET certificate_url = '…/FORGED/x.pdf'     -> 1 row
--
-- Hiding the tick in the UI does not achieve D4. The API is the boundary, and
-- the public anon key that ships in every Next.js bundle is enough to reach it.
--
-- ============================================================================
-- WHY A COLUMN GRANT, AND WHY THE ORDER MATTERS
-- ============================================================================
-- RLS cannot express "you may update this row but not this column": a policy
-- predicate cannot see OLD, so no USING/WITH CHECK can say "verified did not
-- change". The privilege system CAN say it — column-level UPDATE is exactly
-- this shape — so that is what carries the rule.
--
-- The ordering below is not stylistic. A TABLE-level UPDATE grant covers every
-- column, and a later column-level GRANT does NOT carve anything back out of
-- it: adding column grants on top of a table grant restricts nothing at all.
-- `authenticated` already holds a table-level UPDATE from Supabase's default
-- privileges (read on prod 2026-07-31, quoted above), so the table grant MUST
-- be revoked FIRST or this whole migration is a no-op that reads as a fix.
-- That trap was found the hard way on the sibling PR #2651 and is repeated here
-- deliberately rather than rediscovered.
--
-- CONSEQUENCE, STATED PLAINLY: column privileges attach to a DB ROLE, and every
-- signed-in person on this platform is the same role — `authenticated`. There
-- is no column grant that admits the IQAC officer and refuses the learner. So
-- after this migration NO user session may write `verified` at all; the only
-- writer left is `service_role`, which is reachable only through the gated
-- server action _actions/verify-achievement.ts (permission
-- accreditation.certificates.manage, plus its own refusal to let anyone verify
-- their own row). That is a NARROWING for the IQAC officer's raw PostgREST
-- session and a strengthening of D4: one auditable code path, no second door.
-- Nothing in the app writes `verified` through a user session — verified on the
-- whole repo before choosing this shape.
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--   DROP TRIGGER  trg_hsa_unverify_on_certificate_change ON public.health_sports_achievements;
--   DROP FUNCTION public.fn_hsa_unverify_on_certificate_change();
--   DROP POLICY   health_sports_achievements_self_select ON public.health_sports_achievements;
--   DROP POLICY   health_sports_achievements_self_insert ON public.health_sports_achievements;
--   DROP POLICY   health_sports_achievements_self_update ON public.health_sports_achievements;
--   DROP POLICY   health_sports_achievements_self_delete ON public.health_sports_achievements;
--   GRANT ALL ON TABLE public.health_sports_achievements TO anon, authenticated;
--   CREATE POLICY health_sports_achievements_self
--     ON public.health_sports_achievements FOR ALL TO authenticated
--     USING (learner_id IN ( SELECT lp.id
--        FROM (learners_profiles lp
--          JOIN profiles p ON (((lp.id = p.id) OR (p.id = auth.uid()))))
--       WHERE (p.id = auth.uid())));
-- ============================================================================


-- ── 1. Split the one FOR ALL door into four ─────────────────────────────────
--
-- Replaced, verbatim as it stands on prod 2026-07-31:
--
--   CREATE POLICY health_sports_achievements_self
--     ON public.health_sports_achievements FOR ALL TO authenticated
--     USING ((learner_id IN ( SELECT lp.id
--        FROM (learners_profiles lp
--          JOIN profiles p ON (((lp.id = p.id) OR (p.id = auth.uid()))))
--       WHERE (p.id = auth.uid()))));
--
-- The row predicate is carried over BYTE-FOR-BYTE into all four replacements.
-- It has a known oddity — the `OR (p.id = auth.uid())` makes the join condition
-- true for every learners_profiles row, so the subquery is bounded only by that
-- table's own RLS, and the `lp.id = p.id` half matches nothing because a profile
-- id is not a learner id. Straightening it is a separate change with its own
-- blast radius and is deliberately NOT folded in here: this migration must be
-- readable as "the FOR ALL was split", nothing else. It is filed as a follow-up
-- on the PR. Measured today the oddity is not exploitable — see the probe note
-- in the PR body — but "not exploitable today" is a reason to file it, not to
-- fix it silently inside a security migration.
--
-- The only behavioural deltas in this section are:
--   * UPDATE is now its own policy (the column grants in section 3 decide WHAT
--     it may write), and
--   * INSERT now pins a row to being BORN UNVERIFIED.
-- SELECT and DELETE keep exactly the reach they have today.

DROP POLICY IF EXISTS health_sports_achievements_self ON public.health_sports_achievements;

-- ---- read own rows (unchanged reach) ---------------------------------------
CREATE POLICY health_sports_achievements_self_select
  ON public.health_sports_achievements
  FOR SELECT
  TO authenticated
  USING (
    learner_id IN ( SELECT lp.id
       FROM (learners_profiles lp
         JOIN profiles p ON (((lp.id = p.id) OR (p.id = auth.uid()))))
      WHERE (p.id = auth.uid()))
  );

-- ---- file own rows, always unverified --------------------------------------
-- The FOR ALL policy carried no WITH CHECK, so Postgres reused its USING clause
-- for INSERT — which constrained the learner and NOTHING about the verification
-- state. A row could therefore be born already ticked. It cannot be now.
--
-- This is where "born unverified" is enforced rather than in a column grant:
-- INSERT column privileges would have to enumerate every insertable column, and
-- missing one silently breaks the entry form, while WITH CHECK sees the
-- resulting row and is complete by construction. COALESCE because `verified` is
-- nullable with DEFAULT false — an explicit NULL must not slip past a bare
-- `verified = false`.
CREATE POLICY health_sports_achievements_self_insert
  ON public.health_sports_achievements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    learner_id IN ( SELECT lp.id
       FROM (learners_profiles lp
         JOIN profiles p ON (((lp.id = p.id) OR (p.id = auth.uid()))))
      WHERE (p.id = auth.uid()))
    AND COALESCE(verified, false) = false
    AND verified_by IS NULL
  );

-- ---- edit own rows; WHAT may be edited is decided by section 3 --------------
-- WITH CHECK repeats the predicate so a row cannot be re-pointed at another
-- learner on the way out. That is belt-and-braces here — `learner_id` is not in
-- the column grant either — but a future re-grant of the column should not
-- silently re-open row donation.
CREATE POLICY health_sports_achievements_self_update
  ON public.health_sports_achievements
  FOR UPDATE
  TO authenticated
  USING (
    learner_id IN ( SELECT lp.id
       FROM (learners_profiles lp
         JOIN profiles p ON (((lp.id = p.id) OR (p.id = auth.uid()))))
      WHERE (p.id = auth.uid()))
  )
  WITH CHECK (
    learner_id IN ( SELECT lp.id
       FROM (learners_profiles lp
         JOIN profiles p ON (((lp.id = p.id) OR (p.id = auth.uid()))))
      WHERE (p.id = auth.uid()))
  );

-- ---- delete own rows (unchanged reach) -------------------------------------
-- Deliberately PRESERVED, not tightened. The FOR ALL policy allowed it,
-- HealthSportsService.deleteAchievement exists against the browser client, and
-- trg_hsa_evidence_cleanup is built to fire on DELETE and withdraw the evidence
-- mapping. Removing the capability would be a behaviour change this PR was not
-- asked to make, and delete is not a route to a false tick: a re-filed row is
-- born unverified by the policy above.
CREATE POLICY health_sports_achievements_self_delete
  ON public.health_sports_achievements
  FOR DELETE
  TO authenticated
  USING (
    learner_id IN ( SELECT lp.id
       FROM (learners_profiles lp
         JOIN profiles p ON (((lp.id = p.id) OR (p.id = auth.uid()))))
      WHERE (p.id = auth.uid()))
  );


-- ── 2. anon holds nothing on this relation ──────────────────────────────────
-- Supabase ships ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, so
-- anon arrived holding SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
-- on this table without any migration asking for it — confirmed on prod today.
--
-- HONEST ACCOUNT OF WHAT THIS BUYS: measured live, an anon UPDATE already
-- affects 0 rows, because no policy on this table names anon or PUBLIC, so RLS
-- returns nothing. anon is stopped by RLS TODAY — not by privileges. That is
-- precisely the accident the platform's own table-anon-revoke guard exists to
-- remove: the day someone writes a policy `TO public` (as cdc_docs_read already
-- is, one table over) the standing grant turns into live anon write access with
-- no migration touching this table. This revoke is the defence that does not
-- depend on that accident holding.
REVOKE ALL ON TABLE public.health_sports_achievements FROM anon, PUBLIC;


-- ── 3. The lock: column-level UPDATE for authenticated ──────────────────────
-- REVOKE FIRST (see the header — a column grant on top of a table grant
-- restricts nothing), then grant back exactly the descriptive columns a learner
-- legitimately owns.
--
-- TRUNCATE is revoked in the same breath. It is not decorative: TRUNCATE
-- BYPASSES RLS entirely, so the standing default grant let any signed-in caller
-- erase every achievement on the platform in one statement — strictly worse
-- than the tampering this migration was opened to stop, on the same table, and
-- a one-line fix with no behavioural cost (nothing in the repo truncates it).
-- Called out here and in the PR body rather than folded in quietly.
REVOKE UPDATE, TRUNCATE ON TABLE public.health_sports_achievements FROM authenticated;

-- NOT granted, each for a stated reason:
--   verified, verified_by  — D4. Only service_role, i.e. only the gated server
--                            action, may write the accreditation decision.
--   certificate_url        — written by _actions/upload-certificate.ts with the
--                            service-role client after it authorizes the caller
--                            against the row. A learner pastes a link at INSERT
--                            time (INSERT grants are untouched); they may not
--                            re-point the evidence afterwards.
--   learner_id             — a filed achievement cannot be donated to another
--                            learner.
--   id, created_at         — identity and provenance.
GRANT UPDATE (
  achievement_date,
  sport,
  event_name,
  event_level,
  achievement_type,
  description,
  category
) ON TABLE public.health_sports_achievements TO authenticated;


-- ── 4. A verified row is TAMPER-EVIDENT ─────────────────────────────────────
-- Section 3 stops a learner SESSION re-pointing certificate_url. It does not
-- stop the service-role path, and that path is exactly where the remaining hole
-- was: _actions/upload-certificate.ts ran its authorization gate and then
-- unconditionally wrote certificate_url, with no `verified` check anywhere — so
-- a learner could attach a second file to a row IQAC had ALREADY ticked and the
-- tick would stand over a document no reviewer ever saw.
--
-- The app-side half of the fix refuses that outright for a non-IQAC caller
-- (see the action). This trigger is the half that cannot be bypassed, and it is
-- deliberately UNCONDITIONAL: whoever the caller is, whichever client they hold,
-- if the certificate on a verified row changes then the verification is
-- withdrawn and must be re-made against the new document.
--
-- WHY UNVERIFY RATHER THAN REFUSE, HERE:
--   A refusal in the database would make an IQAC officer's own legitimate
--   correction impossible without a hand-written un-tick first, and it would
--   have to distinguish callers — which, per the header, the privilege system
--   at this level cannot do. Unverifying needs no caller test at all: it states
--   the invariant directly. A tick means "a reviewer looked at THIS document",
--   so the tick simply cannot outlive the document. The learner-facing REFUSAL
--   lives in the action, where the caller IS known and a plain-English message
--   is possible. Two halves, two different jobs, neither standing in for the
--   other.
--
-- The existing AFTER trigger trg_hsa_evidence_fanout then does the right thing
-- unprompted: BEFORE runs first, so the fan-out sees verified = false and
-- withdraws the NAAC 8.3 mapping. The swapped file cannot keep the evidence
-- claim alive either.
--
-- Not SECURITY DEFINER, on purpose: it reads nothing and needs no privilege
-- beyond writing NEW, so elevating it would add attack surface for no reason.
-- EXECUTE is revoked from anon and PUBLIC anyway — PostgreSQL checks EXECUTE on
-- a trigger function when the TRIGGER is created, never when it fires, so the
-- revoke costs nothing and keeps it off the RPC surface. Proven by the probe:
-- the trigger fires for `authenticated` after the revoke.

CREATE OR REPLACE FUNCTION public.fn_hsa_unverify_on_certificate_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(OLD.verified, false)
     AND NEW.certificate_url IS DISTINCT FROM OLD.certificate_url THEN
    NEW.verified    := false;
    NEW.verified_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_hsa_unverify_on_certificate_change() IS
  'D4 (2026-07-31): an IQAC tick means a reviewer looked at THIS document, so it cannot outlive the document. Any change of certificate_url on an already-verified achievement withdraws the verification. Unconditional by design — it does not test the caller, because the invariant does not depend on who made the swap.';

REVOKE EXECUTE ON FUNCTION public.fn_hsa_unverify_on_certificate_change() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_hsa_unverify_on_certificate_change
  ON public.health_sports_achievements;

-- UPDATE OF certificate_url: fires only when that column is named in the SET
-- list, which is the only way its value can change. The IS DISTINCT FROM guard
-- inside means naming it with an unchanged value is still a no-op.
CREATE TRIGGER trg_hsa_unverify_on_certificate_change
  BEFORE UPDATE OF certificate_url ON public.health_sports_achievements
  FOR EACH ROW EXECUTE FUNCTION public.fn_hsa_unverify_on_certificate_change();
