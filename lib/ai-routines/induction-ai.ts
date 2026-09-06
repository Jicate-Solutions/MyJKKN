import { type AIRoutine } from './types';
// Populated 2026-07-01 from the parallel discovery swarm (deep-read of jicate/main).
export const INDUCTION_AI_ROUTINES: AIRoutine[] = [
  {
    "id": "induction-generate-playbook",
    "maxLane": true,
    "name": "Induction Playbook Generator (annual cohort loop)",
    "category": "induction-ai",
    "type": "cron",
    "schedule": "Mondays 4:23 UTC (weekly)",
    "cronExpr": "23 4 * * 1",
    "triggerPath": "/api/cron/induction-generate-playbook",
    "callsClaude": true,
    "featureKey": "induction.generate_playbook",
    "whatItDoes": "For each fresher-induction cohort that has no playbook yet, it asks Claude for a value-first induction 'playbook' for next year, grounded in the previous cohort's measured referral/value outcome, and records it. Then it runs the verifier that attributes matured cohorts' outcomes so they feed the next cycle.",
    "configKnobs": "MODEL=claude-sonnet-4-6 (config row 'induction.generate_playbook' — /admin/ai-models), BATCH_CAP=25 (max cohorts/run), programs read cap=5000 rows, existing-playbook read cap=5000 rows, AI max_tokens=1024, AI timeout=60000ms, maxDuration=300s",
    "sideEffects": "DB writes only: inserts one playbook row per new cohort into scf_ai_suggestions (domain='induction') via fn_induction_record_loop_suggestion, then runs fn_induction_measure_loop_outcomes which fills in outcome-lift on matured cohorts. No WhatsApp/email/IG/notifications sent.",
    "safeToManualTrigger": true,
    "notes": "Auth required: CRON_SECRET as `Authorization: Bearer <secret>` OR `?secret=<secret>` query param (returns 500 if CRON_SECRET unset, 401 if wrong). Needs CLAUDE_API_KEY or ANTHROPIC_API_KEY to actually generate; with no key, generation is skipped (nothing recorded) but the verifier still runs. Idempotent/regen-guarded: cohorts that already have a playbook are skipped, so re-running is safe and honest-empty when nothing is new. Depends on RPCs fn_induction_prior_loop_suggestion, fn_induction_record_loop_suggestion, fn_induction_measure_loop_outcomes and tables induction_programs, events, scf_ai_suggestions. Sends no messages to humans."
  },
  {
    "id": "induction-session-effectiveness",
    "maxLane": true,
    "name": "Induction Session-Effectiveness Coach (per-session loop)",
    "category": "induction-ai",
    "type": "cron",
    "schedule": "Every 4 hours at :43 UTC (00:43, 04:43, 08:43, ...)",
    "cronExpr": "43 */4 * * *",
    "triggerPath": "/api/cron/induction-session-effectiveness",
    "callsClaude": true,
    "featureKey": "induction.session_effectiveness",
    "whatItDoes": "Finds induction session topics whose first batch run scored weak on the 1-5 'was this valuable' rating, asks Claude for a concrete value-first improvement to try on that topic's next batch run, and records the tip. Then it runs the regression-to-the-mean-corrected verifier so re-run topics get an honest measured effect.",
    "configKnobs": "MODEL=claude-sonnet-4-6 (config row 'induction.session_effectiveness' — /admin/ai-models), THRESHOLD=3.5 (avg below = weak), MIN_RESPONSES=3, EVENT_CAP=50 (events scanned/run), CANDIDATE_CAP=40 (weak topics tipped/run), programs read cap=5000 rows, AI max_tokens=900, AI timeout=60000ms, maxDuration=300s",
    "sideEffects": "DB writes only: records one session-improvement tip per weak topic via fn_induction_record_session_tip, then runs fn_induction_measure_session_effectiveness to attribute matured re-runs. No WhatsApp/email/IG/notifications sent.",
    "safeToManualTrigger": true,
    "notes": "Auth required: CRON_SECRET as `Authorization: Bearer <secret>` OR `?secret=<secret>` (500 if unset, 401 if wrong). Needs CLAUDE_API_KEY or ANTHROPIC_API_KEY to generate tips; absent, generation is skipped but the verifier still runs. Cheap no-op when no induction is active (candidate query returns nothing -> no AI call). Tips are keyed per topic via fn_induction_session_loop_candidates / fn_induction_record_session_tip, so it does not spam duplicate tips. Depends on tables induction_programs plus RPCs fn_induction_session_loop_candidates, fn_induction_record_session_tip, fn_induction_measure_session_effectiveness. Sends no messages to humans."
  },
  {
    "id": "induction-mentorship-rollover",
    "name": "Senior Peer Mentor year-end rollover",
    "category": "induction-ai",
    "type": "cron",
    "schedule": "Daily · 08:45 IST (editable via dispatcher)",
    "cronExpr": "17 3 * * * (retired from vercel.json 2026-08-13)",
    "triggerPath": "/api/cron/induction-mentorship-rollover",
    "callsClaude": false,
    "featureKey": null,
    "featureKeyNote": "Rules-based state hygiene via fn_induction_close_ended_mentorships(); no model involved.",
    "whatItDoes": "Ends mentorships whose freshers' first academic year has passed: flips the volunteer row inactive and releases its freshers, so next year's freshers get fresh mentors. Correctness does not depend on this firing on time — the mentor write RPCs also gate live on the academic year's end_date; this makes the ended state visible for clean reporting.",
    "configKnobs": "None — driven by academic_years.end_date. Day/time editable at /admin/ai-routines.",
    "sideEffects": "DB writes: closes ended mentorships only. Safe to run daily; a given day closes only what has actually ended.",
    "safeToManualTrigger": true,
    "notes": "Auth: Bearer or ?secret=. IST math: 03:17 UTC = 08:47 IST → slot 08:45 (minute_of_day 527)."
  }
];
