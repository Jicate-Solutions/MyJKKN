-- ============================================================================
-- Director's Desk — PR5: the chase engine (decisions 9, 10, 11, 12)
--
-- Date: 2026-08-05
-- Spec: specs/director-desk/SPEC.md (Director interview, 12 locked decisions)
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- It does not build a second accountability engine. This platform already runs
-- the explain-or-meet valve — meeting_trigger_rules / meeting_trigger_events,
-- the 24h explanation window, and bookPendingMeetings() which books the review
-- meeting on the soonest common free slot. That machinery is subject-scoped
-- (subject_type / subject_id) and was written for 'task' and 'project'.
--
-- So this migration teaches it ONE new subject type — 'handover' — and seeds
-- ONE rule. Everything downstream (deadline enforcement, escalation to
-- meeting_pending, the actual calendar booking between the Director and the
-- grantee) is the existing code path, unchanged. A second engine would have
-- meant a second booking race, a second dedupe key, and a second place for the
-- 24h window to drift.
--
-- WHY THE RULE IS SEEDED **ACTIVE** — AND WHY THAT IS UNUSUAL HERE
-- ----------------------------------------------------------------
-- Every other rule in this table was seeded INACTIVE for a human to switch on.
-- Decision 9 is a recorded Director override of exactly that pattern: he was
-- shown the recommendation to run silent for a week, and chose live from night
-- one, on the reasoning that the first run is also the first test.
--
-- The engineering mitigation is NOT a quiet softening back to dark mode — it is
-- the volume fuse in the service layer: before a run sends anything it resolves
-- the whole recipient list, and if that list exceeds HANDOVER_CHASE_MAX_RECIPIENTS
-- (default 50) it sends NOTHING, tells the Director alone, and stops. A correct
-- run over real handovers cannot reach 50 recipients; only a recipient-resolution
-- bug can. That turns the worst case from a mass-mail incident into one alert.
-- Every run — sent or halted — is recorded in director_handover_chase_runs below.
--
-- INDEPENDENCE FROM THE SPINE
-- ---------------------------
-- Deliberately, nothing here references director_handovers or its functions.
-- meeting_trigger_events.subject_id is a bare uuid with no FK, and the run log
-- stands alone. This migration therefore applies cleanly whether or not
-- 20260811100000..100200 (the spine) have landed, which matters because these
-- lanes ship as separate PRs and may be applied out of order.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Teach the breach ledger the 'handover' subject type.
--
--    The CHECK was created inline by ADD COLUMN in 20260720000000, so its name
--    is whatever Postgres generated. Rather than guess it, drop every CHECK on
--    this table whose definition mentions subject_type, then re-add ours by an
--    explicit name so the NEXT migration that widens this has one to target.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class     c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'meeting_trigger_events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%subject_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.meeting_trigger_events DROP CONSTRAINT %I', r.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.meeting_trigger_events
  ADD CONSTRAINT meeting_trigger_events_subject_type_check
  CHECK (subject_type IS NULL OR subject_type IN ('task','project','handover'));

COMMENT ON COLUMN public.meeting_trigger_events.subject_type IS
  'task | project | handover for subject-scoped triggers; NULL for attendance (institution-scoped). handover rows carry subject_id = director_handovers.id and judge_profile_id = the Director who handed it over.';

-- ----------------------------------------------------------------------------
-- 2. The rule.
--
--    observed_value on a handover event is DAYS PAST DUE, so threshold 1 means
--    "the day after the due date has arrived and the item is still open" —
--    which is exactly decision 11's trigger. cooldown_days is 0 because the
--    service opens the valve at most once per handover: it looks for an existing
--    'handover' event on that subject_id before opening another, and relabels
--    the handover to 'expired' only once that window RESOLVES. The relabel is
--    deliberately NOT done up front — fn_director_handover_progress refuses any
--    status outside pending/accepted, so expiring first made the explanation
--    this rule asks for impossible to write and escalated every handover to a
--    meeting no matter how diligently the person answered.
--
--    The partial unique index (rule_id, breach_date, subject_id) is a second
--    guard but NOT a sufficient one on its own: breach_date moves every night,
--    so it does not stop a second window opening on night two for a handover
--    that is still deliberately labelled 'accepted'. The subject lookup does.
--
--    notify_role documents the resolution source, as with the project rules:
--    'grantee' = the person the handover names, resolved per-row rather than by
--    looking up a role.
--
--    Guarded by NOT EXISTS: UNIQUE (metric_key, institution_id) does not fire
--    for NULL institution_id, so ON CONFLICT cannot be used here.
-- ----------------------------------------------------------------------------
INSERT INTO public.meeting_trigger_rules
  (metric_key, institution_id, comparator, threshold, cooldown_days, weekly_cap, notify_role, active, notes)
SELECT 'handover_overdue', NULL, 'gte', 1, 0, 7, 'grantee', true,
       'Director''s Desk decision 11: a handover whose due date has passed while '
       || 'still open. The grantee has 24h to post an explanation '
       || '(fn_director_handover_progress); if they do it is routed to the Director '
       || 'and escalation stops, if they do not the existing booking pass puts a '
       || 'short meeting between the Director and the grantee on the soonest common '
       || 'free slot. Seeded ACTIVE — Director decision 9, a recorded override of '
       || 'the seed-inactive pattern. The volume fuse '
       || '(HANDOVER_CHASE_MAX_RECIPIENTS, default 50) is what bounds the blast '
       || 'radius instead. NOTE ON THRESHOLD: 1 is the only value that does '
       || 'anything. Raising it does NOT add a grace period, it switches the '
       || 'valve off — access ends at the due date (decision 4), so a handover is '
       || 'already labelled expired by day 2 and never comes back round for a '
       || 'day-3 pass. To stop the chasing, switch `active` off; do not raise '
       || 'this number. THRESHOLD > 1 also skips the explanation window '
       || 'entirely, so the handover is relabelled expired immediately rather '
       || 'than after a window that will never open.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.meeting_trigger_rules
  WHERE metric_key = 'handover_overdue' AND institution_id IS NULL
);

-- ----------------------------------------------------------------------------
-- 3. The run log.
--
--    The fuse has to be auditable in both directions: a run that sent is as
--    interesting as a run that refused to. Notifications record what went out;
--    nothing would record a night the engine looked at 60 recipients and
--    stopped, which is precisely the night someone will need to reconstruct.
--
--    No institution_id: one run sweeps every college's handovers at once, the
--    same shape as the AI-lane tables. Scoping it per-institution would be a
--    lie about what the row describes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.director_handover_chase_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date            date        NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,

  -- What the run looked at.
  live_handovers      integer     NOT NULL DEFAULT 0,
  recipients_resolved integer     NOT NULL DEFAULT 0,

  -- The fuse decision, both ways.
  fuse_limit          integer     NOT NULL,
  fuse_blown          boolean     NOT NULL DEFAULT false,
  outcome             text        NOT NULL DEFAULT 'sent'
                        CHECK (outcome IN ('sent','halted_volume_fuse','failed')),

  -- What actually happened when the fuse held.
  nudged              integer     NOT NULL DEFAULT 0,
  expired             integer     NOT NULL DEFAULT 0,
  orphaned            integer     NOT NULL DEFAULT 0,
  overdue_opened      integer     NOT NULL DEFAULT 0,
  explained           integer     NOT NULL DEFAULT 0,
  escalated           integer     NOT NULL DEFAULT 0,

  -- On a blown fuse this carries the computed recipient list, so the Director's
  -- alert and the forensic record say the same thing.
  detail              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  errors              text[]      NOT NULL DEFAULT '{}',

  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.director_handover_chase_runs IS
  'One row per nightly chase run. Records the volume-fuse decision whether or not it fired — a refused run is the one nobody can otherwise reconstruct.';
COMMENT ON COLUMN public.director_handover_chase_runs.fuse_limit IS
  'HANDOVER_CHASE_MAX_RECIPIENTS as it was read at run time, so a later env change does not rewrite history.';

CREATE INDEX IF NOT EXISTS idx_dhcr_run_date
  ON public.director_handover_chase_runs (run_date DESC, started_at DESC);

-- Supabase's ALTER DEFAULT PRIVILEGES grants anon on every new relation, so the
-- revoke is explicit (CLAUDE.md "Every new table needs explicit REVOKE ALL").
ALTER TABLE public.director_handover_chase_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.director_handover_chase_runs FROM anon, PUBLIC;
GRANT  SELECT ON public.director_handover_chase_runs TO authenticated;
GRANT  ALL    ON public.director_handover_chase_runs TO service_role;

-- Read-only for admins. Writes come from the cron on the service-role key only,
-- so there is deliberately no INSERT/UPDATE/DELETE policy for anyone — RLS
-- default-denies what it does not name, which makes this append-only from every
-- signed-in session without needing a trigger.
--
-- The policy does NOT call fn_can_hand_over(): that function lives in the spine
-- migration, and depending on it here would make this file fail to apply on a
-- database where the spine has not landed yet. The Director learns about a blown
-- fuse from the notification, not from this table.
DROP POLICY IF EXISTS dhcr_select ON public.director_handover_chase_runs;
CREATE POLICY dhcr_select ON public.director_handover_chase_runs FOR SELECT
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
  );

NOTIFY pgrst, 'reload schema';
