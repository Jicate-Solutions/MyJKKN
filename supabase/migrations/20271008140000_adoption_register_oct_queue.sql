-- Adoption loop — register the features shipped since late September, so the loop can see them.
--
-- Why these rows have to exist:
--   fn_feature_used writes nothing, and reports no error, when no feature_registry row
--   matches the key. Until a feature is registered, wiring a recording call to it looks
--   finished and still measures nothing. These are 20 rows: 19 features that shipped
--   between 29 Sep and 7 Oct 2026, plus the Improvement Board, which shipped in July and
--   was never registered, so the Adoption desk can wire them one at a time later.
--
-- NOT registered here (no screen a person can use yet, or no shipping PR):
--   meetings.ai_summary_review (#4053)  the AI draft job is switched off live and no screen
--                                       shows meeting_notes.ai_draft, so there is nothing to review.
--   learners.leave_apply                the screen dates from the initial import; no shipping PR.
--   session_feedback.confirm_attendance #3882 fixes the confirmation-status readers; no separate
--                                       "confirm attendance" screen exists to measure.
--
-- MESSAGES NOBODY. Every row is usage_wired = false and leaves usage_event_module NULL:
--   * the daily run never asks "why not?" about, and never reminds anyone of, a row that
--     is not wired (fn_adoption_ask_why_core and fn_adoption_remind_core both return early
--     on NOT usage_wired, and the daily tick selects only wired rows; checked live 8 Oct);
--   * fn_adoption_sync_usage_events_core flips usage_wired to true only for rows with a
--     usage_event_module, so leaving it NULL keeps these rows unwired until the desk
--     sets it on purpose.
--   This migration is measurement scaffolding only.
--
-- shipped_at is the source pull request's merge time (GitHub mergedAt, UTC). Several
-- source PRs are fixes to a feature that already existed (#4131, #4134, #4135, #4098,
-- #4209), so for those the feature is older than its shipped_at. Accepted: the rows are
-- unwired, so age changes no rule today; the desk re-dates a row if it wires it.
--
-- intended_roles are real role keys (custom_roles.role_key), read from the code that
-- gates each action and from live configuration on 8 Oct 2026 — not from role names.
-- Where that differs from the desk's first guess:
--   hr.salary_revision_request    askers hold hr.payroll.salary_revision.ask: hod, principal, hr_head.
--   hr.raise_approve              the final yes is is_super_admin() only (the approve key is held by
--                                 no role), so super_admin.
--   admission.consultant_commission_approve
--                                 the live flow "Payment Initiation" assigns its approval stage to
--                                 managing_director; admission only starts and pays out.
--   hr.pay_band_check             hr.payroll.salary.view is held by hr_head only.
--   hr.payroll_lop_preview        the API requires hr.payroll.view, which NO role holds today, so only
--                                 super admins can use it; hr_head is listed as the intended user.
--   events.cancel_with_reason     #4128: only the event's in-charges and admins (is_admin()).
--   procurement.purchase_request_raise
--                                 Director's ruling 8 Oct: store keepers / office staff, HoDs and
--                                 principals, and the central purchase office. Today only
--                                 procurement_officer, procurement_manager and store_admin hold
--                                 procurement.request_create; hod, principal and office_assistant do not.
--   improvement.idea_raise        Director's ruling 8 Oct: learners only ('student'). Today the
--                                 'student' role holds neither improvement.ideas.view nor
--                                 improvement.ideas.create, so the measured share will read zero
--                                 until that is granted.
--   meetings.*                    access is per meeting (the host, or the follow-up's owner), not
--                                 per role; the roles listed are the staff who can reach /meetings.
--   hr_head has no person whose primary role is hr_head (one holds it as a second role); the share
--   is computed on profiles.role, so its rows will show no audience until that changes.
--
-- Written as a plain INSERT rather than through fn_adoption_register: that function opens
-- with a super-admin check, and a migration runs as the owner with no auth.uid(), so the
-- RPC would raise. created_by stays NULL, the honest record for a row a migration made.
--
-- Idempotent: re-running changes nothing, and it never overwrites a row created by hand
-- through fn_adoption_register in the meantime.

INSERT INTO public.feature_registry (
  feature_key,
  title,
  module,
  intended_roles,
  core_action,
  shipped_at,
  source_pr,
  usage_wired,
  status,
  cadence,
  href
)
VALUES
  ('hr.salary_revision_request',
   'Ask for a salary revision',
   'hr',
   ARRAY['hod', 'principal', 'hr_head']::text[],
   'ask for a salary revision for a staff member, with a written reason',
   '2026-09-30T05:23:59Z'::timestamptz, 4120, false, 'live', 'event',
   '/hr/salary-revisions/ask'),

  ('hr.raise_approve',
   'Give the final yes to a raise',
   'hr',
   ARRAY['super_admin']::text[],
   'give the final yes to a salary raise: 5% from the next month, the rest held until targets are met',
   '2026-10-07T13:16:01Z'::timestamptz, 4252, false, 'live', 'event',
   '/hr/salary-revisions/approve'),

  ('admission.consultant_commission_approve',
   'Approve a consultant commission payment',
   'admission',
   ARRAY['managing_director']::text[],
   'approve a consultant commission payment request at its approval stage',
   '2026-09-30T04:58:12Z'::timestamptz, 4118, false, 'live', 'event',
   '/admission/consultants/commission-payments'),

  ('hr.pay_band_check',
   'Check pay against the pay band',
   'hr',
   ARRAY['hr_head']::text[],
   'check whether a staff member''s pay sits inside their pay band',
   '2026-09-30T09:09:01Z'::timestamptz, 4103, false, 'live', 'event',
   '/hr/payroll/pay-band-check'),

  ('meetings.my_followups_close',
   'Close your meeting follow-ups',
   'meetings',
   ARRAY['faculty', 'staff', 'hod', 'principal', 'office_assistant', 'admission_counselor', 'super_admin']::text[],
   'close a follow-up from a recorded meeting on My Follow-ups',
   '2026-10-02T08:54:24Z'::timestamptz, 4050, false, 'live', 'weekly',
   '/meetings/action-items'),

  ('meetings.record_pdf_download',
   'Download a meeting record (PDF)',
   'meetings',
   ARRAY['faculty', 'staff', 'hod', 'principal', 'office_assistant', 'admission_counselor', 'super_admin']::text[],
   'download the finished record of a past meeting as a PDF',
   '2026-10-02T14:58:14Z'::timestamptz, 4048, false, 'live', 'event',
   NULL),

  ('hr.appraisal_write',
   'Write an appraisal in words',
   'hr',
   ARRAY['hod', 'principal', 'hr_head']::text[],
   'write a staff appraisal in words across the four areas',
   '2026-10-02T15:05:32Z'::timestamptz, 4081, false, 'live', 'term',
   '/hr/performance-reviews/team'),

  ('hr.payroll_lop_preview',
   'Preview loss-of-pay days for a pay month',
   'hr',
   ARRAY['hr_head', 'super_admin']::text[],
   'preview the loss-of-pay days a pay month will deduct before payslips are made',
   '2026-10-02T14:58:46Z'::timestamptz, 4102, false, 'live', 'event',
   NULL),

  ('admission.certificate_checklist',
   'Tick the Certificate Submitted checklist',
   'admission',
   ARRAY['admission', 'admission_staff']::text[],
   'tick a certificate as submitted on a newly admitted learner''s checklist',
   '2026-10-02T15:02:32Z'::timestamptz, 4126, false, 'live', 'event',
   '/learners/enquiries'),

  ('events.tournament_create',
   'Create a sports tournament',
   'events',
   ARRAY['faculty', 'sports_coordinator', 'event_coordinator', 'principal']::text[],
   'create a sports tournament (the creator becomes its in-charge)',
   '2026-10-02T15:03:04Z'::timestamptz, 4127, false, 'live', 'event',
   '/events/tournament'),

  ('events.tournament_result_record',
   'Enter a tournament match result',
   'events',
   ARRAY['faculty', 'sports_coordinator', 'event_coordinator', 'coo']::text[],
   'enter the result of a tournament match',
   '2026-10-05T16:22:06Z'::timestamptz, 4209, false, 'live', 'event',
   NULL),

  ('events.tournament_record_winners',
   'Record a division''s winners',
   'events',
   ARRAY['faculty', 'sports_coordinator', 'event_coordinator', 'coo']::text[],
   'record the winner, runner-up and third place of a tournament division',
   '2026-10-07T01:58:06Z'::timestamptz, 4222, false, 'live', 'event',
   NULL),

  ('pde.clinical_case_answer',
   'Answer a clinical reasoning case',
   'pde',
   ARRAY['student', 'faculty']::text[],
   'answer a clinical reasoning case to the end and have it scored',
   '2026-10-02T15:06:27Z'::timestamptz, 4131, false, 'live', 'weekly',
   '/pde/learn/cases'),

  ('hr.compoff_decide',
   'Decide a comp-off claim',
   'hr',
   ARRAY['hr_head', 'managing_director', 'principal', 'hod', 'cao']::text[],
   'approve or reject a compensatory-off claim, with the reason recorded',
   '2026-10-02T15:06:56Z'::timestamptz, 4135, false, 'live', 'event',
   '/hr/leave/compensatory-off'),

  ('events.cancel_with_reason',
   'Cancel an event with a reason',
   'events',
   ARRAY['faculty', 'hod', 'super_admin', 'administrator']::text[],
   'cancel an event you are in-charge of, giving a reason',
   '2026-10-02T15:57:10Z'::timestamptz, 4098, false, 'live', 'event',
   NULL),

  ('bug_reports.answer_still_open',
   'Say whether your reported bug still happens',
   'bug_reports',
   ARRAY['all']::text[],
   'answer whether a bug you reported is still happening',
   '2026-10-02T14:57:46Z'::timestamptz, 4134, false, 'live', 'event',
   NULL),

  ('admission.pg_previous_degree',
   'Fill a PG applicant''s previous degree',
   'admission',
   ARRAY['admission', 'admission_staff', 'staff_counselor']::text[],
   'fill in a postgraduate applicant''s previous degree and upload the mark sheet',
   '2026-10-02T16:54:53Z'::timestamptz, 4138, false, 'live', 'event',
   '/learners/enquiries'),

  ('auth.sign_out_all_devices',
   'Sign out of all devices',
   'auth',
   ARRAY['all']::text[],
   'sign out of every device at once',
   '2026-10-02T17:35:19Z'::timestamptz, 4169, false, 'live', 'event',
   '/profile'),

  ('procurement.purchase_request_raise',
   'Raise a purchase request',
   'procurement',
   ARRAY['store_admin', 'office_assistant', 'hod', 'principal', 'procurement_officer', 'procurement_manager']::text[],
   'raise a purchase request',
   '2026-09-29T05:06:35Z'::timestamptz, 4108, false, 'live', 'event',
   '/procurement/requests/new'),

  ('improvement.idea_raise',
   'Raise an improvement idea',
   'improvement',
   ARRAY['student']::text[],
   'raise an improvement idea on the Improvement Board',
   '2026-07-23T03:40:12Z'::timestamptz, 2300, false, 'live', 'weekly',
   '/improvement-board')
ON CONFLICT (feature_key) DO NOTHING;
