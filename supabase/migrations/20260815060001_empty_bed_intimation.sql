-- ============================================================================
-- Migration: 20260815060001_empty_bed_intimation
-- Campus Living — tell residents their room has empty beds, and what it costs
-- Director interview 2026-08-09: "some kind of intimation should be made so
-- that they will actively try to fill up the room".
-- ============================================================================
-- FILE ONLY / NOT APPLIED — Director-gated. Nothing here runs until the
-- Director approves it.
--
-- WHAT THIS ADDS
--   1. Three global platform_policies rows under hostel.empty_bed_notice.*,
--      the first of which is the MASTER SWITCH and is seeded FALSE.
--   2. public.hostel_empty_bed_notices — a send ledger, one row per
--      (room, learner, calendar day), so a reminder cannot go out twice in
--      one day even if the cron is fired by hand mid-run.
--
-- SHIPS OFF. hostel.empty_bed_notice.enabled = false means the service refuses
-- entirely — it does not "send a dry run", it returns without composing
-- anything. Arming it is a separate Director decision, taken after the
-- dry-run list has been read. Precedent: soi.inactivity.enabled, seeded false
-- in 20260731180200 for exactly this reason.
--
-- NO SECURITY DEFINER FUNCTION IS ADDED HERE. Everything the notice needs is
-- read by the cron with the service-role client, which is already how
-- occupancy-snapshot works. Adding a SECDEF reader would widen the surface for
-- no gain.
--
-- READS, BUT DOES NOT CREATE, public.hostel_room_settle_windows. That table is
-- the sibling lane's (settle-bill). The service degrades to a logged no-op
-- when it is absent, so the two PRs may merge in either order.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Policy rows (global scope, idempotent on IDENTITY not on value)
-- ---------------------------------------------------------------------------
-- Guarded by ON CONFLICT on the platform_policies unique INDEX shape
-- (policy_key, scope_type, COALESCE(scope_id, '00…0')) — the same guard
-- 20260516131805_seed_premium_platform_policies.sql uses. Re-running never
-- resurrects a value the Director has since changed.
INSERT INTO public.platform_policies (
    policy_key, scope_type, scope_id, value, description, data_type, is_system
) VALUES
    (
        'hostel.empty_bed_notice.enabled',
        'global', NULL,
        'false'::jsonb,
        'MASTER SWITCH for the empty-bed intimation. While false the notice service refuses entirely — no message is composed and nothing is sent, not even a dry run. Turn on only after reading the dry-run list at /api/cron/campus-living/empty-bed-notices.',
        'boolean', true
    ),
    (
        'hostel.empty_bed_notice.reminder_interval_days',
        'global', NULL,
        '2'::jsonb,
        'Minimum whole days between two empty-bed notices to the SAME learner about the SAME room. Default 2. The one-per-day unique key on hostel_empty_bed_notices is a floor under this, not a replacement for it.',
        'number', true
    ),
    (
        'hostel.empty_bed_notice.message_template',
        'global', NULL,
        to_jsonb($tpl$Hello {learner_name}. Your room {room_number} in {block_name} has {empty_beds} of {capacity} beds still empty.

The room charge is shared between the people living in the room, so the fewer of you there are, the bigger each share is. Right now your share of the room charge works out to Rs {current_share} for the year. If all {capacity} beds are taken, your share would be Rs {full_share} — that is Rs {saving} less for you.

You have until {deadline} to bring someone in. You can invite a roommate from the Campus Living section of MyJKKN.

This is about the room charge only. Your mess fee and other fees do not change.$tpl$::text),
        'What the learner reads. Tokens are substituted by the notice service: {learner_name} {room_number} {block_name} {empty_beds} {capacity} {current_share} {full_share} {saving} {deadline}. An unknown token is left in place rather than blanked, so a typo is visible instead of silent. Keep it plain enough for a parent to read.',
        'string', true
    )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Send ledger — one row per (room, learner, calendar day)
-- ---------------------------------------------------------------------------
-- WHY sent_on IS A COLUMN AND NOT sent_at::date
--   A UNIQUE *constraint* cannot be written over an expression, and only a
--   constraint (not a bare unique index) is usable as an ON CONFLICT target
--   from PostgREST. sent_on materialises the same value.
--
-- WHY 'Asia/Kolkata' AND NOT plain ::date
--   sent_at is timestamptz, so ::date resolves in the session timezone. A cron
--   running as UTC between 00:00 and 05:30 IST would bank the notice on
--   yesterday's date and allow a second one the same Indian morning. The
--   default pins the calendar day the learner actually lives in.
CREATE TABLE IF NOT EXISTS public.hostel_empty_bed_notices (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id           UUID        NOT NULL REFERENCES public.hostel_rooms(id) ON DELETE CASCADE,
    learner_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_on           DATE        NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
    occupants_at_send INTEGER     NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT hostel_empty_bed_notices_one_per_day
        UNIQUE (room_id, learner_id, sent_on)
);

COMMENT ON TABLE public.hostel_empty_bed_notices IS
    'Send ledger for the empty-bed intimation (2026-08-09). One row per room per learner per IST calendar day. Written ONLY by the service-role cron; the unique key is the race guard, the reminder_interval_days policy is the pacing rule.';
COMMENT ON COLUMN public.hostel_empty_bed_notices.occupants_at_send IS
    'Active residents in the room when the notice went out — active means hostel_allocations.check_out_date IS NULL, matching v_hostel_room_occupancy. Kept so a later reading can tell a stale nudge from a fresh one.';
COMMENT ON COLUMN public.hostel_empty_bed_notices.sent_on IS
    'IST calendar day of sent_at. Materialised because a UNIQUE constraint cannot span an expression and ON CONFLICT needs a constraint.';

-- Interval lookup: "when did this learner last hear about this room?"
CREATE INDEX IF NOT EXISTS hostel_empty_bed_notices_recent
    ON public.hostel_empty_bed_notices (learner_id, room_id, sent_at DESC);

-- Anon lock FIRST, then the narrow re-grant. Supabase's
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES already handed anon,
-- authenticated and service_role everything the moment the table existed, so a
-- bare GRANT SELECT would be a no-op over an existing GRANT ALL.
ALTER TABLE public.hostel_empty_bed_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hostel_empty_bed_notices FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_empty_bed_notices FROM authenticated;
GRANT SELECT ON TABLE public.hostel_empty_bed_notices TO authenticated;

-- Read policies only. There is deliberately NO insert/update/delete policy:
-- the ledger is written exclusively by the service-role cron, which bypasses
-- RLS. A row nobody can forge is the point of the one-per-day guard.
DROP POLICY IF EXISTS hostel_empty_bed_notices_select_admin ON public.hostel_empty_bed_notices;
CREATE POLICY hostel_empty_bed_notices_select_admin ON public.hostel_empty_bed_notices
    FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('campus_living.allocations.view')
    );

-- The learner may read her own notices. profiles.id = auth.users.id, and
-- hostel_allocations.learner_id is a profiles.id, so learner_id = auth.uid()
-- is the self test used across campus living.
DROP POLICY IF EXISTS hostel_empty_bed_notices_select_own ON public.hostel_empty_bed_notices;
CREATE POLICY hostel_empty_bed_notices_select_own ON public.hostel_empty_bed_notices
    FOR SELECT USING (learner_id = auth.uid());


-- ============================================================================
-- ROLLBACK (down migration)
--   DROP TABLE IF EXISTS public.hostel_empty_bed_notices;
--   DELETE FROM public.platform_policies
--    WHERE scope_type = 'global'
--      AND scope_id IS NULL
--      AND policy_key LIKE 'hostel.empty_bed_notice.%';
-- ============================================================================
