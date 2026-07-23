-- ============================================================================
-- Migration: Auto-accountability-meeting engine — PR1a (trigger spine + attendance)
-- Date: 2026-06-22
-- Spec: specs/meeting-auto-trigger-engine-2026-06-22.md (§8 decisions, §9 flow)
--
-- Builds the NON-DORMANT spine of the auto-meeting engine:
--   1. meeting_trigger_rules  — per-college threshold config (Director sets all)
--   2. meeting_trigger_events — breach-event ledger (idempotency + cooldown/cap
--                               state; PR1b adds explanation, PR1c adds booking)
--   3. fn_college_day_attendance_rate(institution, date) — the validated
--      per-college-per-day attendance metric (mark-level present%, NULL on no
--      data). Deliberately NOT calc_attendance_rate (both overloads are stale
--      against the real student_attendance JSONB shape: {<session>:{students:
--      [{status:'Present',student_id}]}} — session-keyed, capitalized status).
--
-- Seeds the 7 currently-reporting colleges as INACTIVE rules with a suggested
-- starting threshold (~30-day avg − 10). NOTHING fires until the Director
-- reviews each line and flips a rule active (decision #2: Director sets all).
--
-- Security: new RPC is anon-REVOKEd (Supabase default-grants anon EXECUTE).
-- RLS: admin/super-admin only (Director-managed config, decision #2).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CONFIG TABLE — one rule per (metric, college)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_trigger_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key      text NOT NULL,                       -- 'attendance_rate_daily' (PR1a)
  institution_id  uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  comparator      text NOT NULL DEFAULT 'lt'
                    CHECK (comparator IN ('lt','lte','gt','gte','eq','ne')),
  threshold       numeric NOT NULL CHECK (threshold >= 0),
  cooldown_days   integer NOT NULL DEFAULT 7  CHECK (cooldown_days >= 0),     -- 7d cooldown/owner
  weekly_cap      integer NOT NULL DEFAULT 1  CHECK (weekly_cap   >= 1),      -- decision #5: ≤1/person/week
  quiet_windows   jsonb   NOT NULL DEFAULT '[]'::jsonb,                       -- [{start:date,end:date}] to skip (exams/holidays)
  notify_role     text    NOT NULL DEFAULT 'principal',                       -- who gets the breach notice (decision §9 step 2)
  active          boolean NOT NULL DEFAULT false,                            -- seeded INACTIVE; Director activates
  notes           text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_key, institution_id)
);

COMMENT ON TABLE public.meeting_trigger_rules IS
  'Auto-meeting engine config: per-college metric thresholds. Director-managed (super_admin). A nightly cron evaluates active rules and, on breach, notifies the notify_role. Seeded INACTIVE.';

CREATE INDEX IF NOT EXISTS idx_meeting_trigger_rules_active
  ON public.meeting_trigger_rules (metric_key, active) WHERE active = true;

-- ----------------------------------------------------------------------------
-- 2. EVENT LEDGER — one breach event per (rule, day); idempotency + cooldown/cap
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_trigger_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id               uuid NOT NULL REFERENCES public.meeting_trigger_rules(id) ON DELETE CASCADE,
  institution_id        uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  metric_key            text NOT NULL,
  observed_value        numeric,                                  -- computed rate at fire time
  threshold             numeric NOT NULL,                         -- snapshot of the line
  breach_date           date NOT NULL,                            -- day evaluated
  status                text NOT NULL DEFAULT 'notified'
                          CHECK (status IN ('notified','explained','dismissed','meeting_pending','booked','expired')),
  notified_profile_ids  uuid[],                                   -- recipients of the breach notice
  notification_id       uuid,                                     -- the bell notification created
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, breach_date)                                   -- idempotent per rule per day
);

COMMENT ON TABLE public.meeting_trigger_events IS
  'Auto-meeting engine state ledger: one row per breach (rule x day). PR1a writes status=notified. PR1b adds explanation/dismissal; PR1c adds the booked meeting. Cooldown + weekly-cap are computed from this table.';

CREATE INDEX IF NOT EXISTS idx_meeting_trigger_events_rule_date
  ON public.meeting_trigger_events (rule_id, breach_date DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_trigger_events_inst_date
  ON public.meeting_trigger_events (institution_id, breach_date DESC);

-- updated_at maintenance (reuse the repo-standard trigger fn)
DROP TRIGGER IF EXISTS set_timestamp_meeting_trigger_rules  ON public.meeting_trigger_rules;
CREATE TRIGGER set_timestamp_meeting_trigger_rules
  BEFORE UPDATE ON public.meeting_trigger_rules
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_meeting_trigger_events ON public.meeting_trigger_events;
CREATE TRIGGER set_timestamp_meeting_trigger_events
  BEFORE UPDATE ON public.meeting_trigger_events
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- ----------------------------------------------------------------------------
-- 3. RLS — admin/super-admin only (Director-managed config; cron uses service role)
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_trigger_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_trigger_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_trigger_rules_admin_all  ON public.meeting_trigger_rules;
CREATE POLICY meeting_trigger_rules_admin_all ON public.meeting_trigger_rules
  FOR ALL USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS meeting_trigger_events_admin_all ON public.meeting_trigger_events;
CREATE POLICY meeting_trigger_events_admin_all ON public.meeting_trigger_events
  FOR ALL USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 4. METRIC RPC — per-college-per-day attendance rate (mark-level present %)
--    Robust to session-key variation (FN/AN vs period-UUID vs <id>_group_N):
--    the second-level `students` array is the structural invariant. Guards
--    against any non-array `students` value. Returns NULL when no marks exist
--    (so "no attendance entered" is a gap for PR3, never a false 0% breach).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_college_day_attendance_rate(
  p_institution_id uuid,
  p_date date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(
           100.0 * count(*) FILTER (WHERE lower(elem->>'status') = 'present')
           / NULLIF(count(*), 0),
           2
         )
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS sess(key, value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(sess.value->'students') = 'array'
         THEN sess.value->'students'
         ELSE '[]'::jsonb END
  ) AS elem
  WHERE sa.institution_id = p_institution_id
    AND sa.attendance_date = p_date;
$$;

COMMENT ON FUNCTION public.fn_college_day_attendance_rate(uuid, date) IS
  'College-day attendance rate = present marks / total marks * 100 across all sections/periods/sessions for an institution on a date. NULL when no attendance recorded. Validated 2026-06-22 against 751,435 prod marks.';

REVOKE EXECUTE ON FUNCTION public.fn_college_day_attendance_rate(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_college_day_attendance_rate(uuid, date) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. SEED — 7 currently-reporting colleges, INACTIVE, suggested line (~avg − 10).
--    Director reviews each threshold and flips active (decision #2). Idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.meeting_trigger_rules
  (metric_key, institution_id, comparator, threshold, active, notes)
VALUES
  ('attendance_rate_daily', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'lt', 50, false, 'Allied Health Sciences — 30d avg ~54%. Suggested start; Director to confirm + activate.'),
  ('attendance_rate_daily', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'lt', 54, false, 'Arts & Science (Self) — 30d avg ~64%. Suggested start; Director to confirm + activate.'),
  ('attendance_rate_daily', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 'lt', 71, false, 'Pharmacy — 30d avg ~81%. Suggested start; Director to confirm + activate.'),
  ('attendance_rate_daily', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'lt', 72, false, 'Dental College — 30d avg ~82%. Suggested start; Director to confirm + activate.'),
  ('attendance_rate_daily', '70e54e51-9b98-4e07-9534-a85310609bfd', 'lt', 76, false, 'Nursing & Research — 30d avg ~86%. Suggested start; Director to confirm + activate.'),
  ('attendance_rate_daily', '29c221d1-b918-4c46-9d67-857273b0b553', 'lt', 82, false, 'Nattraja Vidhyalya CBSE — 30d avg ~92%. Suggested start; Director to confirm + activate.'),
  ('attendance_rate_daily', 'e04b8a7f-1445-4ef1-92e9-bde3d32b1f44', 'lt', 84, false, 'Matric Higher Secondary — 30d avg ~94%. Suggested start; Director to confirm + activate.')
ON CONFLICT (metric_key, institution_id) DO NOTHING;
