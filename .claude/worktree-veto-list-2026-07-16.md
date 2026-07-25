# Worktree Veto List — FINAL after 3-pass content sweep (2026-07-16 07:50)

Automation extracted everything provable. 3 proof passes ran: (1) byte-compare vs main, (2) merge-tree 3-way simulation, (3) exact-blob-in-main-history. **58 worktrees + 451 branches deleted today, all content-proven.** What remains below CANNOT be proven landed by git — human judgment required.

## A. UNPROVEN unmerged, >48h — 55 worktrees (the real veto set)
First-failing file shown: if it's SQL_FILE_INDEX.md / permissions.ts / sidebarMenuLink.ts the branch is LIKELY landed (append-race files never match verbatim); if it's a feature page/migration the branch may be superseded or genuinely unshipped.

| Worktree | Branch | First unproven file |
|---|---|---|
| …/agent-a00591cf455101049 | cdc-r4-fix | app/(routes)/cdc/govt-readiness/page.tsx |
| …/agent-a06f61be167d59285 | cdc-govt-readiness-r4 | app/(routes)/cdc/admin/exam-syllabus-topics/page.tsx |
| …/agent-a0a33e9e4bbfe9044 | fix/dept-ig-cadence-round3 | supabase/SQL_FILE_INDEX.md |
| …/agent-a0f5446289fea6663 | cdc-govt-readiness-fixes | app/(routes)/cdc/admin/exam-syllabus-topics/page.tsx |
| …/agent-a11a6d2f238abb1f9 | scf-round2-fixes | app/(routes)/academic/session-feedback/_components/live-pulse-control.tsx |
| …/agent-a219d998a7e2f3d03 | feat/curriculum-phase2 | app/(routes)/academic/curriculum-review/page.tsx |
| …/agent-a23c8df5d80389c42 | feat/referral-pr1-contracts | lib/constants/permissions.ts |
| …/agent-a276a3460c9963d27 | feat/scf-learner-notes-approval | app/(routes)/admin/learner-notes/_components/learner-notes-approval-queue.tsx |
| …/agent-a32c83e3280aaa701 | scf-round3-fixes | app/(routes)/academic/session-feedback/_components/live-pulse-control.tsx |
| …/agent-a3f4c9f09d58bbac7 | feat/live-poll-phase-c-training | supabase/migrations/20260704100000_live_poll_engine_phase_a_rewire.sql |
| …/agent-a532655970c377fc7 | feat/naac-catalog-binary-sync | supabase/SQL_FILE_INDEX.md |
| …/agent-a561ed3b6e489fe39 | cdc-govt-readiness-r3 | app/(routes)/cdc/admin/exam-syllabus-topics/page.tsx |
| …/agent-a568a31ea4c74dfa5 | feat/live-poll-phase-b-ui | app/(routes)/academic/session-feedback/_components/class-poll-dialog.tsx |
| …/agent-a65b2ab1f9aee33f7 | rework/dept-ig-monthly-cadence | app/(routes)/admission/social/loop/_components/cadence-card.tsx |
| …/agent-a65df6345e8edc3f3 | feat/referral-pr1-db-substrate | lib/constants/permissions.ts |
| …/agent-a6b5265f5beedc90e | feat/housekeeping-booking-admin-ui | hooks/campus-living/use-housekeeping-bookings.ts |
| …/agent-a9714c756a1d606cc | feat/housekeeping-booking-db | supabase/migrations/20260610190000_housekeeping_slot_booking.sql |
| …/agent-a97227ef9ebd4fc83 | fix/dept-ig-cadence-review | app/api/cron/social-monthly-cadence/route.ts |
| …/agent-aa684ec7d9b72a99f | feat/housekeeping-booking-svc | hooks/campus-living/use-housekeeping-bookings.ts |
| …/agent-aa92786a0f9b73803 | DETACHED | app/(routes)/academic/session-feedback/faculty/page.tsx |
| …/agent-afd7e4d2aaf8959d4 | feat/housekeeping-booking-resident-ui | hooks/campus-living/use-housekeeping-bookings.ts |
| …/ai-query-max | feat/ai-query-max-inbox | app/api/ai-query/route.ts |
| …/batch-test | DETACHED | app/api/cron/scf-generate-suggestions/route.ts |
| …/coe-ia-build | feat/coe-ia-attendance | app/(routes)/academic/internal-marks/attendance-insight/page.tsx |
| …/fb-capture | feat/fb-capture-combined | lib/constants/permissions.ts |
| …/fold1801b | DETACHED | app/(routes)/learners/class-feedback/page.tsx |
| …/fp-visual | fp-visual | app/(routes)/foundation/_components/student-diagnostic.tsx |
| …/induction-coordinator-panel-filter | induction-coordinator-panel-filter | lib/services/induction/induction-service.ts |
| …/induction-feedback-kiosk-pr1 | induction-feedback-kiosk-pr1 | app/(routes)/events/induction/[id]/_components/feedback-kiosk-dialog.tsx |
| …/induction-feedback-volunteer-pr2 | induction-feedback-volunteer-pr2 | app/(routes)/events/induction/[id]/_components/feedback-volunteers-section.tsx |
| …/live-poll-phase-a | feat/live-poll-engine-phase-a | app/(routes)/learners/class-feedback/page.tsx |
| …/loop-activity | feat/scf-loop-activity | app/api/cron/scf-generate-suggestions/route.ts |
| …/loop-adherence-alerts | feat/loop-adherence-alerts | lib/ai-routines/loop-governance.ts |
| …/loop-registry | feat/loop-registry-tower-wiring | app/(routes)/admin/loops/_components/loop-control-tower.tsx |
| …/loop-runlog-strip | feat/loop-runlog-strip | app/(routes)/admin/loops/page.tsx |
| …/loop-tower-v2 | feat/loop-tower-v2 | app/(routes)/admin/loops/page.tsx |
| …/mission-map | feat/mission-pillar-map-configurable | supabase/migrations/20260713210000_mission_pillar_map_configurable.sql |
| …/persona-design-pr4 | feat/persona-design-pr4-rls-retrofit | supabase/SQL_FILE_INDEX.md |
| …/pillar-strip | DETACHED | supabase/SQL_FILE_INDEX.md |
| …/rcltp-phase4 | ship/rcltp-phase4b | lib/permissions-audit/module-mappings.ts |
| …/run-history | feat/routine-run-7day-history | supabase/migrations/20260714003000_routine_run_log_7day.sql |
| …/scf-activity | feat/scf-activity-lane | app/(routes)/academic/session-feedback/_components/learner-trajectory-card.tsx |
| …/scf-band-facilitator | feat/scf-ui-banding-facilitator | app/(routes)/academic/session-feedback/_components/followup-cell.tsx |
| …/scf-band-leadership | feat/scf-ui-banding-leadership | app/(routes)/academic/attendance/dashboard/_components/feedback-confirmation-tab.tsx |
| …/scf-learner | feat/scf-learner-lane | app/(routes)/learners/class-feedback/_components/loop-closure-card.tsx |
| …/scf-round4 | DETACHED | app/(routes)/academic/session-feedback/_components/live-pulse-control.tsx |
| …/scf-strengths | feat/scf-strengths-lane | supabase/migrations/20260630191000_scf_facilitator_strengths.sql |
| …/ship-att-insight | feat/attendance-vs-marks | lib/sidebarMenuLink.ts |
| …/sn-rescue | feat/sn-rescue | app/(routes)/admission/schools-network/_lib/rescue-api.ts |
| …/sn-scoreboard | feat/sn-scoreboard | app/(routes)/admission/schools-network/_lib/scoreboard-api.ts |
| …/sn-worklist | feat/sn-worklist | app/(routes)/admission/schools-network/_lib/worklist-api.ts |
| …/wf_489d1fca-15c-4 | feat/ai-models-routines-crosslinks | lib/ai-routines/misc-ai.ts |
| …/wf_d14fb062-cd8-2 | feat/admission/schools-network-db-substrate | supabase/SQL_FILE_INDEX.md |
| …/wf_d14fb062-cd8-6 | feat/ig-silence-detect-auto-route | supabase/setup/01_tables.sql |
| …/wf_f4737dde-050-9 | cost-layer/batch-api-pilot | app/api/academic/session-feedback/ai-suggest-improvement/route.ts |

## B. Landed but real uncommitted changes in worktree — decide if dirt matters
- …/cdc-trainer-semester (feat/cdc-training-data-driven-pickers): supabase/migrations/20260629154402_cdc_rls_multirole_institution_scope.sql 
- …/verify-2 (rebase-phase-b7-quiz-authoring): .next 
- …/agent-a1a9e307372217b43 (feat/lesson-spine-regen-task): analyze-voice-memos cron route modified [from Phase 2]
- …/cdc-admin-fix (fix/cdc-admin-config-key-gate): 9 STAGED cdc-admin source files never committed [from Phase 2]
- …/agent-ad003dfa1ae06eac4 (feat/referral-pr1-services): untracked referral services/hooks/types [from Phase 2]

## C. Open PR — untouchable
- …/network-sso-foundation (feat/network-sso-foundation, PR #792)

## D. Under 48h (sibling session's work) — auto-clears via re-run after 2026-07-18
- 29 merged (will pass Phase 1/2 once aged)
- 23 unmerged (will get the same 3-pass proof once aged)

## Recommended next actions
1. After 07-18: re-run Phase 1 + 3-pass sweep → expect ~30-40 more auto-removals.
2. Section A candidates for bulk approval: rows whose first-fail is an append-race file only.
3. Section B: eyeball cdc-admin-fix's 9 staged files — possibly an unshipped fix worth rescuing.
