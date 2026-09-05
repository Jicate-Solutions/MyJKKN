-- ============================================================================
-- 2026-08-21 · Switching push notifications OFF is remembered for the PERSON,
--              not for the browser endpoint that happened to be switched off.
--
-- ✅ APPLIED TO PRODUCTION 2026-08-21 — ledger row 20260821111941.
--    (This header previously read "FILE ONLY / NOT APPLIED". That was true when
--    the file was written and is no longer true; the PR body does not land in the
--    repo, this header does, so a future session greps THIS.)
--    Applied under an explicit Director gate authorising live application of this
--    wave. Sequence: SQL reviewed → duplicate-prefix check → baseline re-verified
--    immediately before the write → full dry-run in BEGIN … ROLLBACK with
--    EFFECTIVE-privilege probes (has_table_privilege / has_function_privilege, not
--    the ACL string) → rollback confirmed held → committed → ledger row written.
--    Post-apply readings: 118 preference rows, all push_enabled=false, matching the
--    118 distinct users holding an is_active=false subscription EXACTLY; all 109
--    resurrected users covered, 0 unprotected; anon SELECT=false,
--    authenticated SELECT=true, anon EXECUTE on the touch trigger=false;
--    4 RLS policies live.
--    The SCHEMA is live; the CODE in this PR is not. Until it merges and deploys,
--    production still runs the old behaviour — which is safe, because the helper
--    treats a missing table as "feature not live".
--
-- WHAT IS ACTUALLY BROKEN.
--   Read on production 2026-08-21: ~118 people hold at least one
--   `push_subscriptions` row with `is_active = false` — that is, they switched
--   push notifications off. 109 of them are being messaged again anyway.
--
--   The reason is not a missing filter. Every sender already filters
--   `is_active = true`, and every one of those filters is correct. The reason is
--   that the opt-out signal was stored on the very object the opt-out destroys.
--
--   Unsubscribing calls `subscription.unsubscribe()` in the browser, which
--   DESTROYS that push endpoint. On the person's next visit
--   `Notification.permission` is still 'granted' and `getSubscription()` returns
--   null, so the auto-subscribe effect in
--   components/notifications/push-notification-provider.tsx mints a BRAND NEW
--   endpoint and posts it. The new row is a different endpoint, so it is a fresh
--   INSERT (or a forced upsert) carrying `is_active = true`, and it satisfies
--   every sender's filter perfectly. No value of `is_active` on any subscription
--   row can survive this, because the row the flag lived on is gone.
--
--   The fix therefore cannot live on `push_subscriptions` at all. It has to live
--   on the PERSON, which is what this table is.
--
-- WHY A SEPARATE TABLE RATHER THAN A COLUMN ON `profiles`.
--   `email_notification_preferences` is the existing precedent on this estate: a
--   notification preference is its own row keyed by user, not a column bolted to
--   the profile. This table is modelled on it deliberately, so the two read the
--   same way and a future channel (SMS, WhatsApp) has an obvious shape to copy
--   rather than a fourth pattern to invent.
--
-- ONE ROW PER PERSON, EVER — AND THE DATABASE IS WHAT ENFORCES IT.
--   `user_id` carries UNIQUE. That is what makes the API's upsert safe under a
--   double-tap, two tabs, or a retried request: they collide on the constraint
--   instead of producing a second, contradictory preference for the same person.
--
-- SWITCHING IT BACK ON MUST STAY POSSIBLE, AND MUST BE DELIBERATE.
--   `push_enabled` is a plain boolean the person can set back to true, and the
--   own-row UPDATE policy below is what lets them. Nothing in this change
--   auto-resubscribes anybody: the ruling is that a person who asked to be left
--   alone switches it back on themselves, by their own click. The auto-subscribe
--   effect is explicitly NOT allowed to flip this column — see the `deliberate`
--   flag threaded through /api/notifications/subscribe in this same PR.
--
-- `opted_out_at` IS EVIDENCE, NOT DECORATION.
--   It is what lets a later question ("when did this start?", "did the 08-21 fix
--   hold?") be answered from data rather than from memory. It is nullable
--   because a person who has never opted out has no such date, and writing a
--   placeholder there would make "never opted out" indistinguishable from
--   "opted out at the epoch".
--
-- RLS: SUPER-ADMIN DIRECT ACCESS, PLUS THE PERSON'S OWN ROW.
--   This is a personal preference, so the subject of the row can read it and
--   change it — that is the whole point of `user_id = auth.uid()` on SELECT,
--   INSERT and UPDATE. Everything else is admin.
--
--   ⚠️ Stated rather than hidden: there is deliberately NO permission-key-based
--   policy here. A preference about being left alone should not become readable
--   platform-wide because somebody was granted a notifications key. The senders
--   do not need one either — every sender on this estate already reads through a
--   service-role client, which bypasses RLS entirely.
--
--   INSERT is granted to the person, not only UPDATE, because the FIRST opt-out
--   is what creates the row and /api/dashboard/push-subscribe is deliberately a
--   user-scoped route (Dashboard v2 design). An own-row INSERT is no more
--   permissive than the own-row UPDATE already is: either way the person can
--   only ever produce their own preference.
--
--   DELETE is admin-only. Deleting the row does not undo an opt-out, it erases
--   the only record that the person ever asked to be left alone — after which
--   the next auto-subscribe silently resurrects them, which is precisely the bug
--   this file exists to end.
--
-- THE BACKFILL IS THE POINT, NOT AN EXTRA.
--   Creating an empty table fixes nobody. The ~118 people already carrying an
--   `is_active = false` row asked to be left alone under the old mechanism, and
--   their answer has to be carried across or this ships as a fix that helps only
--   people who opt out in future. `ON CONFLICT DO NOTHING` makes it idempotent
--   and, more importantly, makes it incapable of overwriting a live preference
--   if this file is ever re-applied after somebody has switched push back on.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_notification_preferences (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL UNIQUE
                             REFERENCES auth.users(id) ON DELETE CASCADE,
    push_enabled boolean     NOT NULL DEFAULT true,
    opted_out_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.push_notification_preferences IS
  'Whether a PERSON wants web push at all. Deliberately not stored on '
  'push_subscriptions: unsubscribing destroys the browser endpoint, so any flag '
  'living on that row dies with it and the next auto-subscribe mints a fresh '
  'is_active=true row. Every sender consults this table before sending.';

COMMENT ON COLUMN public.push_notification_preferences.push_enabled IS
  'false = the person asked to be left alone. Only a deliberate user action may '
  'set this back to true; the auto-subscribe effect must never flip it.';

COMMENT ON COLUMN public.push_notification_preferences.opted_out_at IS
  'When the person last switched push off. NULL means they never have — not a '
  'placeholder date, so "never opted out" stays distinguishable.';

-- The UNIQUE constraint on user_id already provides the lookup index every
-- sender uses; no second index is created here.

ALTER TABLE public.push_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_notification_preferences_admin_all"  ON public.push_notification_preferences;
DROP POLICY IF EXISTS "push_notification_preferences_own_select" ON public.push_notification_preferences;
DROP POLICY IF EXISTS "push_notification_preferences_own_insert" ON public.push_notification_preferences;
DROP POLICY IF EXISTS "push_notification_preferences_own_update" ON public.push_notification_preferences;

CREATE POLICY "push_notification_preferences_admin_all"
    ON public.push_notification_preferences
    FOR ALL
    USING (public.is_super_admin() OR public.is_admin())
    WITH CHECK (public.is_super_admin() OR public.is_admin());

CREATE POLICY "push_notification_preferences_own_select"
    ON public.push_notification_preferences
    FOR SELECT
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY "push_notification_preferences_own_insert"
    ON public.push_notification_preferences
    FOR INSERT
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "push_notification_preferences_own_update"
    ON public.push_notification_preferences
    FOR UPDATE
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- ── Anon lockdown (CI gate: every new table locks anon explicitly) ───────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon ALL on every new table in
-- schema public, SEPARATELY from PUBLIC, and anon is also a member of PUBLIC —
-- so both have to be named or the revoke leaves the grant standing.
REVOKE ALL ON TABLE public.push_notification_preferences FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.push_notification_preferences TO authenticated;
GRANT ALL ON TABLE public.push_notification_preferences TO service_role;

-- ── updated_at ───────────────────────────────────────────────────────────────
-- The API always writes updated_at explicitly, but a preference that can be
-- changed straight from the browser under the own-row UPDATE policy would
-- otherwise be able to move without its timestamp moving.
CREATE OR REPLACE FUNCTION public.fn_push_notification_preferences_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- SECURITY DEFINER function: anon is a member of PUBLIC, so revoking anon alone
-- would leave PUBLIC granting it straight back. Both are named.
REVOKE EXECUTE ON FUNCTION public.fn_push_notification_preferences_touch() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_push_notification_preferences_touch() TO authenticated;

DROP TRIGGER IF EXISTS trg_push_notification_preferences_touch
  ON public.push_notification_preferences;

CREATE TRIGGER trg_push_notification_preferences_touch
    BEFORE UPDATE ON public.push_notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_push_notification_preferences_touch();

-- ── Backfill: carry the existing opt-outs across ─────────────────────────────
-- Every user who currently holds at least one is_active = false subscription row
-- told the platform to stop under the old mechanism. Read 2026-08-21, that is
-- ~118 people. ON CONFLICT DO NOTHING keeps this idempotent and stops a re-apply
-- from ever overwriting somebody who has since switched push back on.
--
-- ⚠️ THE `EXISTS (auth.users)` GUARD IS NOT DECORATION — it is what stops this
-- file aborting on apply. `push_subscriptions.user_id` is declared plain
-- `UUID NOT NULL` in supabase/setup/01_tables.sql, and the FK that the generated
-- types report (`push_subscriptions_user_id_fkey`) is defined in NO migration in
-- this repo — so its target cannot be read from the codebase, only from the live
-- catalog. If it points at `profiles` rather than `auth.users`, orphans are
-- possible: this estate is known to carry profiles with no `auth.users` row
-- (pre-registered people who have never signed in). A single such user_id in the
-- cohort would violate THIS table's FK and roll the whole migration back. The
-- guard costs one predicate and makes the apply safe either way; a preference row
-- for an account that cannot sign in would mean nothing regardless. The NOTICE
-- prints candidates and inserted separately, so a gap between them is visible
-- rather than silent.
DO $$
DECLARE
  v_candidates int;
  v_inserted   int;
BEGIN
  SELECT count(DISTINCT ps.user_id)
    INTO v_candidates
    FROM public.push_subscriptions ps
   WHERE ps.is_active IS FALSE;

  INSERT INTO public.push_notification_preferences (user_id, push_enabled, opted_out_at)
  SELECT DISTINCT ps.user_id, false, now()
    FROM public.push_subscriptions ps
   WHERE ps.is_active IS FALSE
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ps.user_id)
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RAISE NOTICE
    'push opt-out backfill: % users hold an is_active=false subscription, % preference rows inserted (the rest already had one, or have no auth.users row).',
    v_candidates, v_inserted;
END;
$$;

NOTIFY pgrst, 'reload schema';
