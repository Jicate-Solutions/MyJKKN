-- supabase/migrations/20260818030000_extend_referral_source_audit.sql
-- ===========================================================================
-- The referral audit currently watches ONE door. This adds the second one,
-- and the quota.
--
-- ⚠️ FILE ONLY — NOT APPLIED. Do not apply without Director approval.
--
-- WHAT IS MISSING
-- ---------------------------------------------------------------------------
-- A referral credit can be attached to a learner in two different places:
--
--   1. On the lead        — admission_leads.referral_type / referred_by_id /
--                           referred_by_name. Audited into
--                           admission_lead_source_audit. See the note below on
--                           where that trigger actually lives.
--   2. On the LEARNER     — learners_profiles carries the same three columns
--                           (added 2026-04-18 so conversion stopped dropping
--                           them). Nothing watches these. A credit written or
--                           moved directly on the learner record is invisible
--                           to the existing audit, because that trigger is
--                           bound to a different table and cannot see this one.
--
-- WHERE THE LEAD-SIDE AUDIT ACTUALLY LIVES — READ BEFORE SEARCHING FOR IT
-- ---------------------------------------------------------------------------
-- Do not expect to find admission_lead_source_audit by grepping this repo.
-- `git grep admission_lead_source_audit jicate/main` returns nothing, and that
-- absence is real, not an oversight:
--
--   * The table and its trigger ARE live on production. They were hand-applied
--     through the Supabase Management API on 6 August 2026 and have already
--     captured a real change.
--   * They are NOT yet in the repository. PR #2889 is the pull request that
--     back-fills them into version control.
--
-- So this file's learner-side trail is a SIBLING of a trigger that is running
-- in production but is not yet committed. If the database were rebuilt from
-- this repository alone today, NEITHER trail would exist — the lead-side one
-- because #2889 has not merged, this one because it is FILE ONLY and unapplied.
-- That gap closes when #2889 merges and both files are applied.
--
-- Door 2 is not theoretical. `trg_sync_learner_referral_to_attribution`
-- (migration admission/20260506) exists precisely because attribution gets
-- written from the learner side, and it DELETES the prior attribution row when
-- referred_by_id changes. Today that delete leaves no trace of who the credit
-- used to belong to.
--
-- The Director also asked for the quota to be covered: learners_profiles
-- .quota_id and .counseling_applied together are the Direct-versus-Counselling
-- distinction, which is what decides whether a referral is payable at all.
-- Changing the quota silently changes the money. It must leave a record.
--
-- WHY A SECOND TABLE AND NOT THE EXISTING ONE
-- ---------------------------------------------------------------------------
-- admission_lead_source_audit (live on production, repo back-fill pending in
-- PR #2889) is keyed on a LEAD. This trail is keyed on a
-- LEARNER, and the two are neither one-to-one nor always both present: a
-- learner can exist with no lead at all, and one lead's edit fans out onto the
-- linked learner. Overloading one table would force a nullable subject column
-- plus a discriminator, and every reader would then have to remember which
-- kind of row it is holding. Two narrow tables, each with one subject.
--
-- DORMANT BY DESIGN
-- ---------------------------------------------------------------------------
-- This file creates a table, a trigger function and a trigger. It writes no
-- referral, sets no rate, generates no commission, pays nobody, and backfills
-- nothing. Nothing that already exists is dropped, altered or deleted.
-- The trail starts empty and fills only as people make changes from here on;
-- history before this trigger exists cannot be reconstructed and this file
-- does not pretend otherwise.
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP POLICY / DROP TRIGGER before CREATE.
-- Contains no DELETE, UPDATE, TRUNCATE or DROP TABLE. Re-running is a no-op.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- §0  Refuse to apply against a database that cannot hold this.
--
-- Every one of these is load-bearing. `AFTER UPDATE OF <col>` is validated at
-- CREATE TRIGGER time, so a missing watched column fails the file anyway — but
-- it fails with a bare "column does not exist" partway through, after the table
-- has been created. Naming the reason up front is the difference between a
-- clean refusal and a half-applied migration. The three permission helpers are
-- what the RLS policy below calls; a table whose policy raises instead of
-- scoping is worse than no table.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  c text;
BEGIN
  IF to_regclass('public.learners_profiles') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: public.learners_profiles is absent.';
  END IF;

  FOREACH c IN ARRAY ARRAY['referral_type', 'referred_by_id', 'referred_by_name',
                           'quota_id', 'counseling_applied'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'learners_profiles'
        AND column_name  = c
    ) THEN
      missing := missing || c;
    END IF;
  END LOOP;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: learners_profiles is missing watched column(s): %',
      array_to_string(missing, ', ');
  END IF;

  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: is_super_admin() is absent.';
  END IF;
  -- is_admin is tested through pg_proc rather than to_regprocedure because
  -- to_regprocedure matches an EXACT argument signature and cannot see default
  -- arguments. The live helper is is_admin(user_id uuid DEFAULT auth.uid()), so
  -- to_regprocedure('public.is_admin()') returns NULL even though bare is_admin()
  -- is perfectly callable — and is in fact already called by the RLS policies on
  -- this database. What the policy below actually needs is "a public function
  -- named is_admin that can be invoked with zero arguments", which is what the
  -- pronargs - pronargdefaults = 0 test asks.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_admin'
      AND p.pronargs - p.pronargdefaults = 0
  ) THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: is_admin() is not callable with zero arguments.';
  END IF;
  IF to_regprocedure('public.user_has_permission(text)') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: user_has_permission(text) is absent.';
  END IF;

  -- auth.uid() is checked here for a specific reason. The trigger function
  -- swallows every error so it can never block a learner update — which means
  -- that if auth.uid() did not exist, the call would raise 42883, the handler
  -- would catch it, and NO ROW WOULD EVER BE WRITTEN. The audit would look
  -- perfectly installed and record nothing, forever, with only a WARNING in a
  -- log nobody reads. Refusing here converts that silent no-op into a loud one.
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: auth.uid() is absent — the trail would install cleanly and then silently record nothing.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- §1  The trail.
--
-- One row per FIELD that actually changed, not one row per UPDATE statement.
-- A single edit that moves the credit from one referrer to another and swaps
-- the quota writes three rows, and each can be read on its own — which is what
-- a question like "who last changed this learner's quota" needs.
--
-- NO FOREIGN KEY on learner_profile_id, deliberately. ON DELETE CASCADE would
-- erase the audit trail at exactly the moment it becomes interesting, and
-- ON DELETE RESTRICT would make the trail block a legitimate deletion. An
-- audit row must be able to outlive its subject. The id is still a real
-- learners_profiles.id; it is simply not enforced by the database.
--
-- old_value / new_value are text for every field. uuid and boolean both render
-- to a canonical, lossless text form (lowercase uuid; 'true'/'false'), so
-- comparing the text forms is exactly as faithful as comparing the originals,
-- and one pair of columns beats five typed pairs that are NULL four times out
-- of five. NULL means the field was genuinely empty, not "not applicable".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_attribution_audit (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_profile_id uuid        NOT NULL,
  changed_field      text        NOT NULL,
  old_value          text,
  new_value          text,
  changed_by         uuid,
  changed_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.referral_attribution_audit IS
  'Append-only trail of referral-attribution and quota changes made on the LEARNER record (learners_profiles). Companion to admission_lead_source_audit, which watches the same kind of change on the lead; that table and its trigger are live on production (hand-applied via the Management API on 2026-08-06, and they have already captured a real change) but are NOT yet in the repository — PR #2889 back-fills them, so a database rebuilt from the repo alone would have neither trail until #2889 merges and both files are applied. One row per field that actually changed. Written only by trg_audit_learner_referral_attribution; no client holds INSERT, UPDATE or DELETE. Starts at the moment this trigger is created — it cannot describe anything that happened before.';

COMMENT ON COLUMN public.referral_attribution_audit.learner_profile_id IS
  'learners_profiles.id. Intentionally NOT a foreign key: an audit row must survive the deletion of the row it describes.';

COMMENT ON COLUMN public.referral_attribution_audit.changed_field IS
  'One of referral_type, referred_by_id, referred_by_name, quota_id, counseling_applied — the five columns the trigger watches. Not constrained by a CHECK on purpose: the trigger is the only writer, and because audit failures are deliberately swallowed so they can never block a learner update, a CHECK that fell out of step with the trigger would lose rows silently instead of failing loudly.';

COMMENT ON COLUMN public.referral_attribution_audit.changed_by IS
  'auth.uid() of whoever made the change. NULL is meaningful and expected: it means the write arrived with no signed-in identity — a service-role or cron write, an import, or SQL run directly. It never means "unknown person".';

-- Reads come in three shapes and each gets its own index: one learner's
-- history, the recent-activity feed, and "what has this person been changing".
CREATE INDEX IF NOT EXISTS referral_attribution_audit_learner_idx
  ON public.referral_attribution_audit (learner_profile_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS referral_attribution_audit_changed_at_idx
  ON public.referral_attribution_audit (changed_at DESC);

-- Partial: system writes are NULL by design and are expected to be the bulk of
-- the table, so indexing them would be paying for a value nobody filters on.
CREATE INDEX IF NOT EXISTS referral_attribution_audit_changed_by_idx
  ON public.referral_attribution_audit (changed_by, changed_at DESC)
  WHERE changed_by IS NOT NULL;

-- Supabase default-grants ALL on every new table to anon AND authenticated, so
-- a bare GRANT SELECT is a silent no-op that leaves INSERT/UPDATE/DELETE in
-- place — and the anon key ships in every page of https://www.jkkn.ai. Revoke
-- both first, then grant back only SELECT.
--
-- authenticated gets SELECT and nothing else, on purpose. This is an audit
-- trail: a trail a client can write to, edit or delete is not evidence of
-- anything. The trigger function is SECURITY DEFINER and runs as the table
-- owner, so it needs no grant here to write.
REVOKE ALL ON TABLE public.referral_attribution_audit FROM anon, PUBLIC, authenticated;
GRANT SELECT ON TABLE public.referral_attribution_audit TO authenticated;

ALTER TABLE public.referral_attribution_audit ENABLE ROW LEVEL SECURITY;

-- Read is gated on the same key that opens the leads the trail is about, so
-- nobody gains sight of referral attribution here that they could not already
-- see on the lead itself.
--
-- 🔴 Deliberately NOT institution-scoped, and the readers must not misread the
-- consequence. The table holds no institution_id (its subject is a learner id
-- and nothing else), so this policy is a flat permission test: whoever holds
-- admission.leads.view sees every institution's rows. That matches how the
-- admission desk already works — admission and counselor roles are
-- institution_scope='all' — but it means an own-scoped role granted this key in
-- future would read across colleges. Scoping it later needs a join to
-- learners_profiles.institution_id, which is a change to make deliberately
-- rather than a default to assume.
--
-- There is no INSERT, UPDATE or DELETE policy. That is not an omission: with no
-- grant and no policy, the table is unwritable from any client, in both layers.
DROP POLICY IF EXISTS referral_attribution_audit_select ON public.referral_attribution_audit;
CREATE POLICY referral_attribution_audit_select ON public.referral_attribution_audit
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('admission.leads.view'), false)
  );

-- ---------------------------------------------------------------------------
-- §2  The trigger function.
--
-- SECURITY DEFINER for two reasons. The people who edit a learner's referral
-- do not hold INSERT on the audit table — nobody does — and an audit row must
-- not be subject to the writer's own RLS. Running as the owner is what makes
-- the trail both unforgeable and unavoidable.
--
-- 🔴 IT MUST NEVER BLOCK A LEGITIMATE UPDATE. An audit that can fail a learner
-- edit is a liability, not a control. So the write is wrapped: any error at all
-- is downgraded to a WARNING and the update proceeds. The trade is explicit —
-- a lost audit row is recoverable by asking; a blocked admission is not.
--
-- The cheap distinctness test runs FIRST, outside the exception block. A
-- plpgsql EXCEPTION block establishes a subtransaction on every entry, and
-- bulk learner edits touch these columns thousands of rows at a time while
-- changing almost none of them. Returning early on a no-op keeps that cost off
-- the common path.
--
-- 🔴 AFTER, and purely additive. learners_profiles already carries
-- trg_sync_learner_referral_to_attribution, which DELETES the prior
-- consultant_lead_attributions row when referred_by_id changes. This function
-- touches nothing but its own table, returns NEW unmodified, and cannot alter
-- the row or the outcome — so it cannot interfere with that trigger whichever
-- order the two fire in. (They fire alphabetically: trg_audit_… first.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_learner_referral_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor uuid;
BEGIN
  -- Nothing actually moved: leave without opening a subtransaction. `UPDATE OF`
  -- fires whenever a watched column is MENTIONED, not only when it changes, so
  -- this is the common case on every bulk write.
  IF NOT (
       OLD.referral_type      IS DISTINCT FROM NEW.referral_type
    OR OLD.referred_by_id     IS DISTINCT FROM NEW.referred_by_id
    OR OLD.referred_by_name   IS DISTINCT FROM NEW.referred_by_name
    OR OLD.quota_id           IS DISTINCT FROM NEW.quota_id
    OR OLD.counseling_applied IS DISTINCT FROM NEW.counseling_applied
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Inside the guard as well: on a write with no JWT this is simply NULL,
    -- but a malformed claim would raise, and losing the row is the correct
    -- outcome there — never failing the learner's update.
    v_actor := auth.uid();

    INSERT INTO public.referral_attribution_audit
      (learner_profile_id, changed_field, old_value, new_value, changed_by)
    SELECT NEW.id, f.field, f.old_value, f.new_value, v_actor
    -- Every value is cast to text EXPLICITLY, including the two columns that
    -- are already text. A VALUES list resolves one common type per column, so
    -- leaving the text ones bare would make that resolution depend on their
    -- declared type staying text — and the day referral_type became an enum,
    -- the column would fail to resolve and the handler would swallow it into
    -- an audit that silently records nothing. The redundant casts cost nothing
    -- and remove the dependency.
    FROM (
      VALUES
        ('referral_type',      OLD.referral_type::text,      NEW.referral_type::text),
        ('referred_by_id',     OLD.referred_by_id::text,     NEW.referred_by_id::text),
        ('referred_by_name',   OLD.referred_by_name::text,   NEW.referred_by_name::text),
        ('quota_id',           OLD.quota_id::text,           NEW.quota_id::text),
        ('counseling_applied', OLD.counseling_applied::text, NEW.counseling_applied::text)
    ) AS f(field, old_value, new_value)
    WHERE f.old_value IS DISTINCT FROM f.new_value;

  EXCEPTION WHEN OTHERS THEN
    -- Visible in the Postgres log, invisible to the person saving the form.
    RAISE WARNING 'fn_audit_learner_referral_attribution: audit write skipped for learner_profile_id=% (%: %)',
      NEW.id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_audit_learner_referral_attribution() IS
  'Writes one referral_attribution_audit row per watched field that actually changed on a learners_profiles UPDATE. Deliberately swallows every error into a WARNING: an audit trail must never be able to block a legitimate learner update. Purely additive — reads and writes nothing but its own table, and returns NEW unmodified.';

-- Supabase default privileges hand EXECUTE on every new function to anon, which
-- is a separate grant from PUBLIC and survives a REVOKE FROM PUBLIC alone.
-- A trigger function is not callable usefully by hand, but the rule is
-- unconditional and the cost of keeping it so is one line.
REVOKE EXECUTE ON FUNCTION public.fn_audit_learner_referral_attribution() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_audit_learner_referral_attribution() TO authenticated;

-- ---------------------------------------------------------------------------
-- §3  The trigger.
--
-- AFTER, so the row is already final and no failure here can undo it.
-- UPDATE OF the five watched columns, so an unrelated edit — a phone number, a
-- photo — never enters the function at all.
--
-- INSERT is deliberately not watched. A learner created with a referrer already
-- attached has changed nothing; the creation itself is the record, and auditing
-- it here would file every conversion as an attribution edit and bury the real
-- ones. DELETE is not watched either: there is no learner to attribute to
-- afterwards, and the row this trigger would write could not be read back
-- against anything.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_learner_referral_attribution ON public.learners_profiles;
CREATE TRIGGER trg_audit_learner_referral_attribution
AFTER UPDATE OF referral_type, referred_by_id, referred_by_name, quota_id, counseling_applied
ON public.learners_profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_learner_referral_attribution();

-- ===========================================================================
-- NOT DONE HERE, ON PURPOSE
--
-- * NO BACKFILL. Every learner already carrying a referrer or a quota got it
--   before this trigger existed, and there is no record of who set it or when.
--   Writing a row that says "changed_at = the day the migration ran" would be
--   manufacturing evidence, not recovering it.
--
-- * NO UI. Nothing reads this table yet. It is a trail that starts filling now
--   so that a screen built later has something true to show; a screen built
--   today would show an empty table and teach people it is empty.
--
-- * admission_lead_source_audit is not touched, renamed or merged into. The two
--   trails stay separate and independently readable.
--
-- * The audit is NOT institution-scoped — see the note on the SELECT policy in
--   §1. Adding the scope means joining learners_profiles.institution_id, which
--   is a deliberate decision and not a detail to slip in under a trail.
-- ===========================================================================
