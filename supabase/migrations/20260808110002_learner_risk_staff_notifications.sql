-- ============================================================================
-- Learner risk → staff notifications: dedupe ledger + policy knobs + schedule
-- Created: 2026-07-30
-- NOT APPLIED TO ANY DATABASE — Director-gated apply.
--
-- WHY THIS EXISTS
-- The risk engine (compute_learner_risk_assessment, substrate migration
-- 20260525200000) succeeded for the first time on 2026-07-30, writing 4,342
-- rows for that date — 59 'critical' and 403 'high'. It only WRITES rows; it
-- notifies nobody. Director approved notifying staff on 2026-07-30, having
-- been shown the caveat that this sends messages naming real learners from an
-- engine whose first successful run was that same day.
--
-- WHAT THIS FILE ADDS — three things, no RPC:
--   1. learner_risk_notification_log — the dedupe ledger (see below).
--   2. platform_policies rows — the runtime knobs (mode, expiry, thresholds).
--   3. an ai_routine_schedules row so the existing 15-minute dispatcher fires
--      the notifier. Deliberately NOT a vercel.json cron: `crons` is already at
--      100 entries, which is the plan cap — a 101st would fail the BUILD and
--      block every deploy, not just this feature.
--
-- No SECURITY DEFINER function is created here, so there is no new EXECUTE
-- surface to lock. All selection, scoping and fan-out run in the cron route
-- under the service-role client (app/api/cron/learner-risk-notifications).
-- The two tables this migration touches still get explicit anon revokes below,
-- because Supabase's `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon`
-- would otherwise hand `anon` a direct grant on the new table independently of
-- PUBLIC (the 2026-06-06 standing rule in CLAUDE.md, and the reason the
-- _bak_/_rollback_ tables leaked).
--
-- ── WHY A LEDGER AND NOT previous_risk_score ────────────────────────────────
-- The spec's natural dedupe signal is learner_risk_assessments.previous_risk_score
-- / trend_direction. Measured on prod 2026-07-30: BOTH ARE NULL ON ALL 4,342
-- ROWS, because only one day of assessments exists (the table's total row count
-- equals that date's count exactly). A dedupe that trusted those columns would
-- therefore classify every learner as "no trend information" on the first run
-- and — worse — would keep doing so on every subsequent daily run, because the
-- engine recomputes the same standing each day and nothing in the assessment
-- row records that a human was already told. That is precisely the bell-flood
-- failure mode (no duplicate folding, broadcasts that never expire).
--
-- So notification state is tracked HERE, in its own ledger, keyed by
-- (learner_id, notified_on). The route compares today's tier/score against the
-- learner's most recent ledger row and notifies only on CHANGE:
--   * no prior ledger row                       → 'new'        (first entry into high/critical)
--   * prior tier 'high'  → today 'critical'     → 'escalated'
--   * same tier, score up by >= min_score_delta → 'worsening'
--   * anything else                             → SKIPPED ('unchanged')
-- previous_risk_score / trend_direction are still read and still shown as
-- evidence in the message, and a trend_direction of 'worsening' with a risen
-- score is honoured as a worsening trigger — they are simply not the sole
-- source of truth, because today they carry none.
--
-- An improving learner is deliberately NOT notified: a message saying "this
-- learner got better" competes for the same bell as one saying "act now", and
-- the standing is still visible on the risk board either way.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) learner_risk_notification_log — one row per learner per day we notified.
--    UNIQUE(learner_id, notified_on) makes a same-day re-run of the cron a
--    no-op instead of a second message, so the route is safe to fire manually
--    or to retry after a partial failure.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_risk_notification_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id           uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id       uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  department_id        uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  notified_on          date NOT NULL DEFAULT CURRENT_DATE,
  risk_tier            text NOT NULL CHECK (risk_tier IN ('critical','high')),
  composite_risk_score smallint NOT NULL CHECK (composite_risk_score BETWEEN 0 AND 100),
  -- Why this learner crossed the notify threshold today. Mirrors the decision
  -- function's return value so a "why did my bell light up" question is
  -- answerable from the ledger alone.
  reason               text NOT NULL CHECK (reason IN ('new','escalated','worsening')),
  -- The notifications row this learner was announced in. Nullable because a
  -- digest announces many learners in ONE notification, and because the ledger
  -- write must still succeed if the id is unavailable.
  notification_id      uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  recipient_count      integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT learner_risk_notification_log_once_per_day UNIQUE (learner_id, notified_on)
);

-- Last-standing lookup: "most recent ledger row for these learners".
CREATE INDEX IF NOT EXISTS idx_lrnl_learner_notified
  ON public.learner_risk_notification_log(learner_id, notified_on DESC);

-- Per-institution reporting ("how many did we announce today").
CREATE INDEX IF NOT EXISTS idx_lrnl_institution_notified
  ON public.learner_risk_notification_log(institution_id, notified_on DESC);

ALTER TABLE public.learner_risk_notification_log ENABLE ROW LEVEL SECURITY;

-- The writer is the cron route's service-role client.
CREATE POLICY "Service role manages learner_risk_notification_log"
  ON public.learner_risk_notification_log FOR ALL
  USING (auth.role() = 'service_role');

-- Readers mirror the SELECT scope that already governs the underlying
-- assessments (substrate migration 20260525200000): institution admins across
-- their institution, and department staff for their own department. Mirroring
-- rather than inventing means the ledger can never reveal the existence of a
-- learner-risk row the reader could not already open.
CREATE POLICY "Institution admins can view learner risk notification log"
  ON public.learner_risk_notification_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.institution_id = learner_risk_notification_log.institution_id
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.role IN ('principal', 'admin')
          OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = p.id
              AND cr.role_key IN ('principal', 'cao', 'administrator')
          )
        )
    )
  );

CREATE POLICY "Department staff can view learner risk notification log"
  ON public.learner_risk_notification_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.institution_id = learner_risk_notification_log.institution_id
        AND p.department_id IS NOT NULL
        AND p.department_id = learner_risk_notification_log.department_id
        AND (
          p.role IN ('hod', 'faculty')
          OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = p.id
              AND cr.role_key IN ('hod', 'faculty', 'staff')
          )
        )
    )
  );

-- Standing anon lock (CLAUDE.md 2026-06-06). Revoking only `anon` is a silent
-- no-op where the grant is inherited from PUBLIC, so both are revoked.
REVOKE ALL ON TABLE public.learner_risk_notification_log FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.learner_risk_notification_log TO authenticated;

COMMENT ON TABLE public.learner_risk_notification_log IS
  'Dedupe ledger for learner-risk staff notifications. One row per learner per '
  'day we actually announced them. The route notifies only when today''s tier/'
  'score differs from this ledger''s latest row (new / escalated / worsening); '
  'an unchanged standing is never re-announced.';

-- ---------------------------------------------------------------------------
-- 2) Runtime knobs. platform_policies columns verified against prod on
--    2026-07-30 — the live table uses `value`, `scope_type`, `data_type`,
--    `publication_state`; it does NOT have the `policy_value`/`module` columns
--    the 20260525200000 substrate file declares (that file's shape never
--    reached this database). Seeds below use the LIVE shape.
--    ON CONFLICT DO NOTHING so re-running never clobbers a Director's edit.
--    The unique index is uq_platform_policies_key_scope, an EXPRESSION index
--    over (policy_key, scope_type, COALESCE(scope_id, <zero uuid>)) — so
--    ON CONFLICT must repeat that expression verbatim. `ON CONFLICT (policy_key)`
--    alone raises 42P10 (no matching unique constraint) and fails the migration.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, enum_options,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
VALUES
  ('learner_risk.notifications.enabled', 'global', NULL, 'true'::jsonb,
   'Master switch for learner-risk staff notifications. Off = the daily routine reads and reports but sends nothing.',
   'boolean', NULL, false, true, 'major', 'published', 'toggle', 'learner_risk'),

  ('learner_risk.notifications.mode', 'global', NULL, '"digest"'::jsonb,
   'digest = ONE grouped message per department head listing their at-risk learners (default). individual = one message per learner, which on a 462-learner day is the bell-flood scenario.',
   'enum', '["digest","individual"]'::jsonb, false, true, 'major', 'published', 'dropdown', 'learner_risk'),

  ('learner_risk.notifications.include_department_staff', 'global', NULL, 'false'::jsonb,
   'Also notify non-lead department staff, not just the department head. Measured 2026-07-30: adds 203 recipients across the 17 affected departments, so it is off by default.',
   'boolean', NULL, false, true, 'major', 'published', 'toggle', 'learner_risk'),

  ('learner_risk.notifications.expiry_hours', 'global', NULL, '72'::jsonb,
   'Every notification row this routine creates gets expires_at = now() + this. The bell read path honours expires_at, so a missed day cannot leave a stale item pinned forever.',
   'number', NULL, false, true, 'operational', 'published', 'number', 'learner_risk'),

  ('learner_risk.notifications.min_score_delta', 'global', NULL, '5'::jsonb,
   'Within the same tier, how much the composite risk score must rise before the learner is announced again. Below this the standing counts as unchanged and is not re-sent.',
   'number', NULL, false, true, 'operational', 'published', 'number', 'learner_risk'),

  ('learner_risk.notifications.max_learners_per_message', 'global', NULL, '25'::jsonb,
   'Cap on how many learners are itemised in one digest body; the remainder are summarised as a count with a link to the full board.',
   'number', NULL, false, true, 'operational', 'published', 'number', 'learner_risk')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Dispatcher slot. 17:20 IST = minute_of_day 1040 — the engine's only
--    observed run on 2026-07-30 completed at 10:57Z (16:27 IST) in a single
--    batch, so this reads a finished day. Editable in /admin/ai-routines
--    without a redeploy. managed=true so the 15-minute dispatcher owns it.
--    Off-the-hour minute chosen deliberately (dispatcher slot contention).
--    days_of_week is smallint[] — the ARRAY literal is cast explicitly rather
--    than left as integer[], which would not match the column type.
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed, max_only)
VALUES
  ('learner-risk-staff-notifications', true, ARRAY[0,1,2,3,4,5,6]::smallint[], 1040, true, false)
ON CONFLICT (routine_id) DO NOTHING;
