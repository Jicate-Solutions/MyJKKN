-- =====================================================================
-- Online Meetings — dynamic team meetings with AI Pulse engagement
-- =====================================================================
-- Plan: Online Meetings module (2026-09-09)
--
-- WHY THIS MODULE EXISTS
--   AI Pulse proved a live online session can be measured — who joined on
--   time, who answered the polls, who stayed to the end, who passed the
--   quiz. But that machinery can only describe ONE meeting for ONE
--   audience:
--     * a cycle is a startup_events row with config.kind='ai_pulse',
--       created only by app/api/cron/ai-pulse-tick — nobody can schedule
--       one on demand, and startup_events INSERT is admin-only anyway;
--     * attendance is ai_pulse_live_attendance.profile_id, NOT NULL and
--       FK'd to profiles, with every write policy reading
--       `profile_id = auth.uid()`. Somebody from outside JKKN has no row
--       to be recorded in and no session to be recognised by. They are
--       not merely un-invited — they are UNREPRESENTABLE.
--
--   This module fixes both, without touching AI Pulse. Nothing here reads
--   or writes any ai_pulse_* table or startup_events.
--
-- THE ONE DESIGN DECISION THAT MATTERS
--   Attendance and poll responses are keyed by PARTICIPANT, not by
--   profile. A participant row is either an internal profile OR an
--   external name + email. That is the whole of what admits guests, and
--   it means every downstream report treats both kinds uniformly instead
--   of growing a second code path that drifts.
--
-- GUESTS NEVER TOUCH THIS SCHEMA DIRECTLY
--   An external participant is `anon`, and anon is REVOKED on every table
--   below. Their reads and writes go through service-role route handlers
--   under /api/public/online-meetings/ that validate a join token
--   server-side — the same pattern as /api/public/courses/ and
--   /api/public/moments/. Authorization lives in reviewed TypeScript;
--   RLS here is the backstop, not the policy engine.
--
-- Pattern references:
--   supabase/migrations/20260611_ai_pulse_live_attendance_and_champion.sql
--   supabase/migrations/20260617123300_ai_pulse_polls.sql
-- =====================================================================


--
-- SPLIT: Part 4 of 4 - permission-key grants to roles. Requires nothing but custom_roles.
--   The combined body timed out (57014) as one exec_sql request at 37 KB,
--   so it ships as four sequential migrations. Apply them in filename order.
-- =====================================================================

-- =====================================================================
-- 6. PERMISSION GRANTS
-- =====================================================================
-- Declaring keys in lib/constants/permissions.ts does NOTHING on its own —
-- a key only exists for a role once it is in that role's custom_roles
-- .permissions JSONB. Without this block every screen renders empty and the
-- module looks broken rather than ungranted.
--
-- Additive `||` merge so an existing role keeps everything it already holds.

-- ---------------------------------------------------------------------
-- Broad staff grant: module visibility + the right to schedule a meeting.
-- ---------------------------------------------------------------------
-- Granted to every ACTIVE role except the three non-staff families below.
-- An explicit exclusion list rather than an inclusion list, because the
-- alternative (naming 70 staff roles) silently omits every role added after
-- today and the omission shows up only as somebody's empty screen.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
      'online_meetings.view', true,
      'onlineMeeting:create', true
    ),
    updated_at = now()
WHERE is_active = true
  AND role_key NOT IN (
    -- Vendors and service workers: no MyJKKN meeting to convene.
    'driver', 'transport_boarding', 'housekeeping_staff', 'gate_security',
    'mess_caterer', 'maintenance_vendor', 'builder',
    -- External / partner / time-boxed audit identities.
    'jicate_staff', 'parent', 'client', 'external_auditor_timeboxed',
    'payment_audit_admin',
    -- Learners. They may be INVITED to a meeting (that works through the
    -- participant row, which needs no permission key at all) but they do not
    -- convene one. Note cse_facilitator and its siblings are "Senior Learner"
    -- roles despite the name.
    'student', 'cohort_member', 'production_learner', 'course_participant',
    'cse_resident', 'cse_facilitator',
    'ece_resident', 'ece_facilitator',
    'eee_resident', 'eee_facilitator',
    'it_resident', 'it_facilitator',
    'mech_resident', 'mech_facilitator'
  );

-- ---------------------------------------------------------------------
-- Leadership + administration: see and manage every meeting in scope,
-- author quizzes, keep minutes, read cross-meeting reports.
-- ---------------------------------------------------------------------
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
      'online_meetings.view',        true,
      'onlineMeeting:create',        true,
      'onlineMeeting:manage.all',    true,
      'onlineMeeting:polls.run',     true,
      'onlineMeeting:quiz.author',   true,
      'onlineMeeting:minutes.manage', true,
      'onlineMeeting:report.view',   true
    ),
    updated_at = now()
WHERE is_active = true
  AND role_key IN (
    -- Verified against custom_roles on 2026-09-09. There is no 'admin',
    -- 'director', 'dean' or 'iqac_coordinator' role_key in this database —
    -- naming them would have produced a grant block that matched nothing and
    -- failed silently, which is exactly how a module ships looking broken.
    'super_admin', 'administrator', 'system_admin',
    'managing_director', 'executive_admin_officer',
    'principal', 'vice_principal', 'hod',
    'hr_head', 'coe'
  );

-- ---------------------------------------------------------------------
-- Every host can run polls, author a quiz and keep minutes for their OWN
-- meeting — that is enforced by fn_om_is_host_or_manager in the policies
-- above, not by a key. These keys exist so a co-host or secretary can be
-- granted the same abilities without being made a manager of everything.
-- ---------------------------------------------------------------------
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
      'onlineMeeting:polls.run',      true,
      'onlineMeeting:quiz.author',    true,
      'onlineMeeting:minutes.manage', true
    ),
    updated_at = now()
WHERE is_active = true
  AND role_key IN ('faculty', 'staff', 'ai_pulse_champion');
