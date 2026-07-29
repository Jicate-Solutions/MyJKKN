import { type AIRoutine } from './types';
// Curriculum-aware class poll — Phase 2 (2026-07-06): the AI lesson-spine BULK
// MINT cron. See app/api/cron/curriculum-lesson-spine-generate/route.ts for the
// full submit/collect design. The per-course "regenerate" click is a SEPARATE
// feature (lib/ai-tasks/registry.ts, feature_key 'curriculum.lesson_spine_regen',
// second entry below since 2026-07-12) — it flows through the generic ai_task_queue
// → ai-tasks-sweep lane, not this cron.
export const CURRICULUM_AI_ROUTINES: AIRoutine[] = [
  {
    id: 'curriculum-lesson-spine-generate',
    maxLane: true,
    name: 'Curriculum Lesson-Spine Generator (bulk mint)',
    category: 'curriculum-ai',
    type: 'cron',
    // Night-chain reality since 2026-07-08 (Director "no limits"): the Mac Max-lane
    // runner (~/jkkn-max-lane/lesson-spine.mjs, launchd 22:50 IST, 7h window) is
    // PRIMARY and mints ~300 drafts/night at zero API cost until the ~860-course
    // backlog clears; this paid-API cron is the FALLBACK, parked on Sundays via the
    // dispatcher. The ⚡ Run-on-Max button relays to the same Mac runner.
    schedule: 'Nightly 22:50 IST · Mac Max lane (launchd, 7h window) · paid-API fallback Sun via dispatcher',
    triggerPath: '/api/cron/curriculum-lesson-spine-generate',
    callsClaude: true,
    featureKey: 'curriculum.lesson_spine_generate',
    capPolicyKey: 'curriculum_ai.batch_cap',
    whatItDoes:
      "For each course whose Board-of-Studies (BoS) syllabus is on file but has no lesson spine yet, it asks Claude for an ordered set of teachable lessons (grounded in the syllabus's units + Course Learning Outcomes, tagged with Fink dimension + Bloom level K1-K6 + the CLO each maps to), plus — when the syllabus's assessment structure has capstone/Concept-Application data — a short in-class Concept-Application brief per unit and one team-capstone brief for the course. Everything is recorded as an UNPUBLISHED DRAFT; nothing reaches students until a faculty member reviews and approves it at /academic/curriculum-review.",
    configKnobs:
      "MODEL=claude-sonnet-4-6 (config row 'curriculum.lesson_spine_generate' — /admin/ai-models), curriculum_ai.batch_cap=10000 (max courses/run, platform_policies, editable — raised 25→10000 on 2026-07-08, Director 'no limits' initial mint), curriculum_ai.emit_assessment_briefs=false (default off until the brief lane is hardened; platform_policies, editable), courses read cap=5000, bos_course_syllabi read cap=5000, AI max_tokens=8192, AI timeout via batch lane, maxDuration=300s",
    sideEffects:
      "DB writes only: inserts DRAFT (status='draft', never 'published') rows into curriculum_lesson via fn_curriculum_lesson_ai_draft_upsert — one per generated lesson, plus optional concept_brief/capstone_brief rows. No WhatsApp/email/IG/notifications sent. Faculty approval (a separate authenticated action) is required before anything is visible to students or counts toward the class-poll seam.",
    safeToManualTrigger: true,
    notes:
      "Auth required: CRON_SECRET as `Authorization: Bearer <secret>` OR `?secret=<secret>` query param. Needs CLAUDE_API_KEY or ANTHROPIC_API_KEY to generate; with no key, submission is skipped (collect still drains any already-outstanding batch). Idempotent per (course, artifact_kind, slot) via uq_curriculum_lesson_ai_draft_slot — a re-gen replaces the prior UNAPPROVED draft in that slot, never a faculty-approved (published) lesson, and never duplicates. Only the ~13-23% of courses with a BoS syllabus on file are touched; the remaining no-syllabus courses are skipped entirely and stay faculty-typed (Phase 1). Async Message-Batches lane (ai-clients/batch.ts, 50% rate): SUBMIT is weekly via the ai-routine-dispatcher (ai_routine_schedules), COLLECT is a */30 vercel.json cron hitting ?mode=collect. Uses its OWN feature_key ('curriculum.lesson_spine_generate') distinct from the per-course 'regenerate' click's feature_key ('curriculum.lesson_spine_regen') so the two independent collectors never drain each other's jobs.",
  },
  {
    id: 'curriculum-lesson-spine-regen',
    maxLane: true,
    name: 'Curriculum Lesson-Spine Regeneration (per-course click)',
    category: 'curriculum-ai',
    type: 'interactive',
    schedule: 'On demand (per-course button) · queue drained by the */15 ai-tasks-sweep',
    triggerPath: '/api/ai-tasks/enqueue',
    callsClaude: true,
    featureKey: 'curriculum.lesson_spine_regen',
    whatItDoes:
      "A faculty member or reviewer clicks 'Regenerate spine' on /academic/curriculum-review for one course: the click enqueues an ai_task_queue row, the */15 ai-tasks-sweep asks Claude for a fresh lesson spine from the course's BoS syllabus (same prompt as the bulk mint), and the new drafts replace the course's UNAPPROVED drafts slot-by-slot — approved (published) lessons are never touched, and nothing reaches students until the faculty approves each draft.",
    configKnobs:
      "MODEL=claude-sonnet-4-6 (config row 'curriculum.lesson_spine_regen' — /admin/ai-models), AI max_tokens=8192, curriculum_ai.emit_assessment_briefs policy (shared with the bulk cron), no-syllabus courses skip the LLM entirely, in-flight dedupe = one outstanding task per course.",
    sideEffects:
      "DB writes only: inserts/updates DRAFT (status='draft', never 'published') rows in curriculum_lesson via fn_curriculum_lesson_ai_draft_upsert, plus the requester's own ai_task_queue row and a 'result ready' bell notification to the requester. No WhatsApp/email/IG sent.",
    safeToManualTrigger: true,
    notes:
      "⚡ Run-on-Max semantics (on-demand): process the PENDING 'curriculum.lesson_spine_regen' rows in ai_task_queue on the seat (₹0 API) — the per-course button on /academic/curriculum-review is what enqueues them; with no pending rows a Max run is honest-empty. The Mac runner brain for this key lands separately (no .mjs yet); until then the cloud path is the ONLY executor: /api/ai-tasks/enqueue (session-gated, JSON body {taskType:'curriculum.lesson_spine_regen', entityId:'<course uuid>'}) → ai-tasks-sweep (*/15, Anthropic Message Batches at the 50% rate). Enqueue authz reuses the review page's gate (fn_curriculum_lesson_drafts_for_course: super-admin OR institution-scoped teaching-staff/HOD/admin). The trigger path is a POST needing an authenticated USER SESSION, not CRON_SECRET — an operator 'Run now' without a session/body is a harmless 4xx.",
  },
];
