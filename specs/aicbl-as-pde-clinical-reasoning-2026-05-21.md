# AICBL as PDE Clinical Reasoning — Integration Spec

**Date:** 2026-05-21 (22 decisions locked via 6-batch Director interview 2026-05-21 / 2026-05-22)
**Author:** Mac Claude session 5de4c918 (continuation from 86bff142)
**Decision owner:** Director (Omm)
**Status:** ✅ LOCKED — build cleared. 5-agent parallel sprint commencing on branch `feat/aicbl-as-pde-clinical-reasoning`.

---

## Decision (3 lines)

1. **AICBL ceases to be a standalone product.** The 3-week-old "JICATE prototype, sell to other dental colleges" decision is reversed.
2. **AICBL becomes a MyJKKN feature.** No new top-level module. No event bridge. No separate auth. No separate Supabase project.
3. **AICBL's surface decomposes across two existing MyJKKN modules**: VAC (case content lives in `vac_lessons.case_scenario`) and PDE (Socratic Q&A, OSCE scoring, capability demonstration, at-risk, policies).

---

## Why this works (existing infrastructure)

| Need | Existing MyJKKN primitive | Status |
|---|---|---|
| Case-content with AI prompts | `vac_lessons.gemini_prompts JSONB` + new `case_scenario JSONB` column | Extend |
| AI Socratic coaching | `pde_coach_conversations` + `PDEService.sendCoachMessage` + `/api/pde/coach` (placeholder body) | Implement body |
| Per-question assessment | `pde_assessments` + `pde_assessment_questions` (with `lesson_id`) | Extend |
| Student submission | `pde_submissions` | Extend |
| OSCE-style capability scoring | `pde_learner_capabilities` (slug=`clinical_reasoning`) | Use as-is |
| Engagement firehose | `pde_engagement_events` | Use as-is |
| At-risk detection | `pde_at_risk_learners` VIEW (auto-derived from `pde_engagement_daily`) | Use as-is, no cron needed |
| Accreditation evidence (DCI 2.3) | `quality_evidence_mappings` | Auto-insert ≥ threshold |
| AI provider routing + cost tracking | `lib/services/platform/ai-providers.ts` + `ai-clients/` + `ai_model_usage` | Use as-is |
| Policy storage | `platform_policies` | Extend with 5 typed-widget metadata columns |
| Auth + learner model | Supabase SSR + `learners_profiles` + institution_id RLS | Use as-is |
| Course + enrollment | `vac_courses` + `vac_enrollments` (auto-enroll trigger) | Extend |

---

## 22 Locked Decisions (6-batch Director interview, 2026-05-21 / 22)

### Batch 1 — Foundation
1. **Route placement:** New PDE sub-route `/pde/learn/cases/[caseSlug]` + faculty mirror `/pde/faculty/cases/`
2. **Capability slug:** Single `clinical_reasoning`; domain breakdown stored in `demonstration_evidence.domain_scores` JSONB
3. **Sakthi WOZ timing:** Wait for MyJKKN port (~2-3 weeks). No standalone URL to Sakthi.
4. **Standalone fate:** Kill `aicbl.vercel.app` + jicate-prototypes Supabase ref entirely after port deploys

### Batch 2 — Build & data
5. **Build cadence:** Single sprint, one branch (`feat/aicbl-as-pde-clinical-reasoning`), single PR to main (~10-15 commits over 2-3 weeks)
6. **Attempt counting:** Best score wins (`pde_learner_capabilities` upsert keeps max); all attempts logged to `pde_submissions`
7. **Case edit rule:** Versioning — `pde_assessments.version` int + `pde_submissions.assessment_version` FK; past attempts tied to version they took
8. **Authoring permission:** Faculty + institution_admin + super_admin in case.institution_id scope

### Batch 3 — Identity & scope
9. **Student identification:** BOTH `learner_id` UUID (canonical) AND `roll_number_snapshot` TEXT (audit/export)
10. **Case scope:** Linked to `vac_courses.id` (FK required for `assessment_type='clinical_case'`)
11. **AI failure UX:** Toast + retry button + answer NOT saved until AI succeeds
12. **Case lifecycle:** Draft → Published → Archived (`pde_assessments.status` ENUM)

### Batch 4 — Schema & policy
13. **Scenario home:** Extended via `vac_lessons.case_scenario JSONB`; `pde_assessments.lesson_id` required FK for clinical_case
14. **Enrollment:** Auto-enroll all BDS students in 'BDS Clinical Reasoning' VAC course via DB trigger on `learners_profiles` insert
15. **AI cap:** Strict 5 attempts per student per case (lifetime) — `clinical_reasoning.lifetime_attempts_per_case = 5` in `platform_policies`
16. **Time limit:** Faculty-configurable per case via `pde_assessments.time_limit_minutes INTEGER NULLABLE`

### Batch 5 — Faculty UX
17. **Faculty visibility:** Full transcript drill-down — every Q, student answer, AI feedback, per-domain scores
18. **Domain weights:** Per-case configurable via `pde_assessments.metadata.domain_weights JSONB` (faculty sliders, sum=100%)
19. **Faculty preview:** Dedicated preview mode that runs REAL Gemini calls but doesn't write `pde_submissions` row
20. **Decommission timing:** Immediately after MyJKKN port deploys to prod (no buffer; high-confidence-required deploy)

### Batch 6 — Authoring & quality
21. **Bulk authoring:** Visual form-builder (default) + JSON paste-import tab (power users)
22. **Question types (3):** `free_text_socratic` (AI-graded), `mcq_warmup` (single-correct), `image_tag` (faculty draws regions; AI Gemini-Vision validates student reasoning text per click)
23. **Cap reset:** Faculty action in `/pde/faculty/cases/[slug]/attempts/<student>` — [Grant N more attempts] with mandatory reason, logged to `pde_engagement_events`
24. **Accreditation evidence:** Auto-insert on score ≥ threshold; threshold configurable in `platform_policies` (`clinical_reasoning.evidence_threshold_pct = 60`)

### Batch 7 — Mobile + privacy + substrate scope
25. **MCQ grading:** Single-correct (one option flagged; binary 100% or 0%)
26. **Image-tag scoring:** Faculty draws expected regions; student clicks + types reasoning; AI Gemini-Vision validates region+reasoning match
27. **Mobile scope:** Phone-friendly responsive for all 3 Q types (tested at 360px/768px/1024px+)
28. **PDPB consent:** No explicit modal — governed by general MyJKKN privacy policy (logged as compliance risk if PDPB inquiry occurs)

### Substrate scope
29. **Typed-widget metadata substrate:** AICBL-only — add `ui_widget`/`ui_options`/`ui_consequence`/`ui_cascade`/`ui_category` columns to `platform_policies`; populate ONLY for new `clinical_reasoning.*` rows. Existing 5 PDE policy categories stay hand-coded; retrofit is a future opt-in PR.

---

## Schema changes (LOCKED, ordered by table)

### NEW: typed-widget metadata substrate on `platform_policies`

```sql
ALTER TABLE platform_policies
  ADD COLUMN IF NOT EXISTS ui_widget TEXT,
  ADD COLUMN IF NOT EXISTS ui_options JSONB,
  ADD COLUMN IF NOT EXISTS ui_consequence TEXT,
  ADD COLUMN IF NOT EXISTS ui_cascade JSONB,
  ADD COLUMN IF NOT EXISTS ui_category TEXT;

-- ui_widget: 'number' | 'toggle' | 'dropdown' | 'multi-select' | 'textarea' | 'text' | 'sliders'
-- ui_options: array of {value, label} for dropdown/multi-select widgets
-- ui_consequence: plain-English description of what changes when this is edited
-- ui_cascade: array of {effect: string, severity: 'high'|'medium'|'low'} describing downstream effects
-- ui_category: grouping label for admin UI (e.g., 'AI Provider', 'Caps & Limits')
```

### `vac_lessons` — add case_scenario

```sql
ALTER TABLE vac_lessons ADD COLUMN IF NOT EXISTS case_scenario JSONB;
-- {patient_name, age, gender, occupation?, chief_complaint, hopi, medical_history, habit_history: {type, duration_years, frequency, quantity, current_status}, additional_clinical_details}
```

### `pde_assessments` — extend for clinical_case type

```sql
ALTER TABLE pde_assessments
  ADD COLUMN IF NOT EXISTS assessment_type TEXT DEFAULT 'standard'
    CHECK (assessment_type IN ('standard', 'clinical_case')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES vac_courses(id);
-- lesson_id already exists; for clinical_case rows it becomes REQUIRED (validated by app layer + RLS)
-- metadata.domain_weights JSONB (no schema change — already JSONB)
```

### `pde_assessment_questions` — extend for 3 Q types

```sql
ALTER TABLE pde_assessment_questions
  ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'free_text_socratic'
    CHECK (question_type IN ('free_text_socratic', 'mcq_warmup', 'image_tag')),
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS mcq_options JSONB,       -- [{label, is_correct}]
  ADD COLUMN IF NOT EXISTS expected_regions JSONB;  -- [{label, x, y, w, h, tolerance_px}]
-- metadata.ground_truth + metadata.key_concepts stored in existing metadata JSONB
```

### `pde_submissions` — extend for versioning + audit

```sql
ALTER TABLE pde_submissions
  ADD COLUMN IF NOT EXISTS assessment_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS roll_number_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS attempt_index INTEGER NOT NULL DEFAULT 1;
-- attempt_index = 1..5 (enforced by cap; can exceed if faculty resets)
```

### Seeds

```sql
-- 1. pde_capabilities row for clinical_reasoning
INSERT INTO pde_capabilities (slug, name, category, description) VALUES
  ('clinical_reasoning', 'Clinical Reasoning', 'cognitive',
   'Ability to reason through patient cases — data gathering, hypothesis generation, management planning, communication, professionalism.');

-- 2. vac_courses row for BDS Clinical Reasoning (free, BDS-scoped)
INSERT INTO vac_courses (code, name, fee, track, faculty_eligible, course_category, institution_id) VALUES
  ('BDS-CR-101', 'BDS Clinical Reasoning', 0, 'general', false, 'value_add', <jkkn_dental_uuid>);

-- 3. Auto-enroll trigger
CREATE OR REPLACE FUNCTION fn_auto_enroll_bds_clinical_reasoning() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.program = 'BDS' AND NEW.institution_id = <jkkn_dental_uuid> THEN
    INSERT INTO vac_enrollments (user_id, course_id, status)
    VALUES (NEW.user_id, (SELECT id FROM vac_courses WHERE code='BDS-CR-101'), 'active')
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_enroll_bds_clinical_reasoning
  AFTER INSERT ON learners_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_auto_enroll_bds_clinical_reasoning();

-- One-time backfill for existing BDS learners (same logic, run as DO block)

-- 4. clinical_reasoning policies in platform_policies (8 rows with typed-widget metadata)
-- Examples:
INSERT INTO platform_policies (policy_key, scope_type, value, data_type, description,
                                ui_widget, ui_consequence, ui_cascade, ui_category, is_system) VALUES
  ('clinical_reasoning.lifetime_attempts_per_case', 'global', '5'::jsonb, 'number',
   'Lifetime cap on case attempts per student',
   'number',
   'Students get N attempts per case. After that, they must request faculty reset.',
   '[{"effect": "Higher cap = more learning iterations but higher AI cost", "severity": "medium"}]'::jsonb,
   'Caps & Limits', true),

  ('clinical_reasoning.evidence_threshold_pct', 'global', '60'::jsonb, 'number',
   'Minimum score to auto-create DCI 2.3 accreditation evidence',
   'number',
   'Attempts scoring ≥ N% auto-generate DCI Criterion 2.3 evidence rows.',
   '[{"effect": "Lower = more evidence rows, possibly lower quality", "severity": "high"}, {"effect": "Higher = fewer rows, stronger signal", "severity": "medium"}]'::jsonb,
   'Accreditation', true),

  ('clinical_reasoning.ai.provider', 'global', '"google"'::jsonb, 'enum',
   'AI provider for Socratic feedback',
   'dropdown',
   'All AI Socratic feedback routes through this provider.',
   '[{"effect": "Provider change affects latency, cost, and tone", "severity": "high"}]'::jsonb,
   'AI Provider', true),

  -- ui_options for the enum widget (mirrors AI_PROVIDER_REGISTRY)
  -- ('clinical_reasoning.ai.provider', ..., ui_options = '[{"value":"openai","label":"OpenAI"},{"value":"anthropic","label":"Anthropic"},{"value":"google","label":"Google Gemini"}]')

  ('clinical_reasoning.ai.model', 'global', '"gemini-2.5-pro"'::jsonb, 'enum',
   'AI model for Socratic feedback', 'dropdown',
   'Determines latency, cost, and quality of AI tutor responses.',
   '[{"effect": "Higher-tier models cost more but reason better", "severity": "medium"}]'::jsonb,
   'AI Provider', true),

  ('clinical_reasoning.ai.max_response_sentences', 'global', '4'::jsonb, 'number',
   'Maximum sentences in AI Socratic response', 'number',
   'AI feedback capped at N sentences to keep responses focused.',
   '[{"effect": "Too short = unhelpful; too long = student tunes out", "severity": "low"}]'::jsonb,
   'AI Behavior', true),

  ('clinical_reasoning.ai.system_prompt_template', 'global',
   '"<TEMPLATE>"'::jsonb, 'string',
   'Socratic feedback prompt template (uses {case_context}, {q_number}, {question}, {ground_truth}, {key_concepts}, {student_answer}, {max_sentences})',
   'textarea',
   'Determines voice + pedagogy of the AI tutor.',
   '[{"effect": "Template change affects feel-of-tutor across ALL cases", "severity": "high"}]'::jsonb,
   'AI Behavior', true),

  ('clinical_reasoning.scoring.passing_threshold_pct', 'global', '60'::jsonb, 'number',
   'Score to mark capability demonstrated', 'number',
   'Attempts ≥ N% mark pde_learner_capabilities.status=demonstrated.',
   '[{"effect": "Lower = more learners pass, less rigor", "severity": "high"}]'::jsonb,
   'Scoring', true),

  ('clinical_reasoning.faculty.cap_reset_default_count', 'global', '3'::jsonb, 'number',
   'Default additional attempts when faculty resets a student cap', 'number',
   'Faculty cap-reset button grants N more attempts by default (editable per reset).',
   '[]'::jsonb,
   'Faculty Workflow', true);

-- 5. Leukoplakia case seed (ported from AICBL standalone)
-- See agents/A/leukoplakia-seed.sql for full content (patient scenario + 4 questions)
```

### `fn_get_policy_clinical_reasoning` RPC

```sql
CREATE OR REPLACE FUNCTION fn_get_policy_clinical_reasoning(p_key TEXT, p_default JSONB DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT value INTO v_value
  FROM platform_policies
  WHERE policy_key = 'clinical_reasoning.' || p_key
    AND scope_type = 'global'
    AND is_active = true;
  RETURN COALESCE(v_value, p_default);
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## What gets retired

### From AICBL standalone repo (`/Users/omm/PROJECTS/aicbl/`)
- ✂️ `lib/events/*` (no bridge needed in-process)
- ✂️ `lib/policies/*` (replaced by MyJKKN's policy infra)
- ✂️ `lib/tenants/*` (replaced by institution_id model)
- ✂️ `lib/auth/*` (replaced by MyJKKN SSR auth)
- ✂️ `lib/ai/{gemini,anthropic,provider,types}.ts` (replaced by MyJKKN `ai-providers.ts`)
- ✂️ `app/api/feedback`, `app/api/score`, `app/api/events`, `app/api/cron/at-risk`
- ✂️ `app/admin/tenants` (JICATE substrate, irrelevant in MyJKKN)
- ✂️ Tables: `aicbl_users`, `aicbl_event_outbox`, `aicbl_at_risk_log`
- ✂️ The entire `https://aicbl.vercel.app` Vercel deployment (after JKKN Dental migrates)
- ✂️ The `jicate-prototypes` Supabase ref `ileccfzrcrkoglssvxgm`
- ✂️ PR #727 (PDE event bridge receiver) — closed without merging

### From MyJKKN repo (during PR 7 / Agent E decommission)
- ✂️ `lib/pde/external-providers/aicbl/handler.ts` (after its logic is in-lined)
- ✂️ `lib/services/pde-bridge-service.ts` (if exclusively for AICBL — verify)
- ✂️ `/pde/admin/bridge` route (if exclusively for AICBL — verify)

### What survives (the IP being preserved)
- ✅ Socratic prompt template (`DEFAULT_TEMPLATE` in AICBL's `get-feedback.ts`)
- ✅ Case scenario JSON shape (patient_name, hopi, habit_history, etc.)
- ✅ OSCE rubric structure (5 domains: data_gathering, hypothesis_generation, management_planning, patient_communication, professionalism)
- ✅ Question structure (ground_truth + key_concepts + q_number)
- ✅ Leukoplakia case content (the actual clinical case Sakthi designed)
- ✅ The pedagogical decision tree (when to affirm, when to surface contradiction, never reveal answer directly)

---

## Build plan — 5-agent sprint on `feat/aicbl-as-pde-clinical-reasoning`

**Sequence:** Agent A FIRST (substrate must land before others build on it). Once A commits clean, Agents B/C/D/E spawn in parallel.

| Agent | Branch seam | Scope |
|---|---|---|
| **A — Substrate + schema + seeds** | `supabase/migrations/`, `lib/services/pde-policy-clinical-reasoning.ts` | (1) Typed-widget columns on `platform_policies` (2) All schema additions to `pde_assessments`, `pde_assessment_questions`, `pde_submissions`, `vac_lessons` (3) `pde_capabilities` clinical_reasoning seed (4) `vac_courses` BDS Clinical Reasoning seed + auto-enroll trigger + BDS backfill (5) 8 clinical_reasoning policy rows with typed-widget metadata (6) `fn_get_policy_clinical_reasoning` RPC (7) Leukoplakia case seed (1 lesson + 1 assessment + 4 questions) (8) Apply migrations via Supabase Management API + verify each landed |
| **B — Coach service** | `lib/services/pde-coach-clinical-reasoning.ts`, `lib/services/pde-service.ts`, `app/api/pde/coach/route.ts` | (1) Port AICBL's `get-feedback.ts` Socratic logic to MyJKKN (2) Replace placeholder body in `PDEService.sendCoachMessage` for `context_type='clinical_case'` (3) Route through `lib/services/platform/ai-providers.ts` + `ai-clients/` (4) Read 4 policies via `fn_get_policy_clinical_reasoning` (provider, model, max_sentences, prompt_template) (5) Implement attempt-cap check (5 lifetime) (6) Cost tracking via `ai_model_usage` insert (7) Handle AI failure UX: throw appropriate FeedbackError; route returns 4xx so client shows toast+retry |
| **C — Student UI** | `app/(routes)/pde/learn/cases/**`, `hooks/pde/use-clinical-reasoning.ts`, types | (1) `/pde/learn/cases/[caseSlug]/page.tsx` — case attempt page with phone-responsive design at 360px/768px/1024px+ (2) Q renderers: `<FreeTextSocraticQuestion>`, `<MCQWarmupQuestion>`, `<ImageTagQuestion>` (canvas + click capture) (3) Attempt counter (X of 5) + cap-reached state (4) AI feedback panel with retry-on-failure (5) `/pde/learn/cases/[caseSlug]/summary/[attemptId]/page.tsx` post-case review (6) `useLogEngagement` integration to write `pde_engagement_events` (event_type='clinical_case_completed') (7) Multi-device manual test before commit |
| **D — Faculty CRUD + authoring** | `app/(routes)/pde/faculty/cases/**`, faculty-side hooks + components | (1) `/pde/faculty/cases/page.tsx` list with status filters + per-cohort views (2) `/pde/faculty/cases/new/page.tsx` visual form-builder (patient details + Q editor + ground_truth + key_concepts + domain weight sliders summing to 100%) + JSON paste-import tab (3) `/pde/faculty/cases/[id]/edit` (draft/publish/archive transitions, versioning on edit) (4) `/pde/faculty/cases/[slug]/attempts/page.tsx` cohort-level analytics + per-student drill (5) `/pde/faculty/cases/[slug]/attempts/[studentId]/page.tsx` full transcript view + [Grant N more attempts] cap-reset action with reason capture (6) Preview-as-student mode (real Gemini, no save) (7) Image-tag region authoring (canvas + bounding-box drawing) |
| **E — Admin policies + OSCE scoring + decommission** | `app/(routes)/pde/admin/policies/clinical-reasoning/**`, `lib/services/pde-osce-scoring.ts`, `app/api/pde/clinical-reasoning/score/route.ts`, decommission steps | (1) `/pde/admin/policies/clinical-reasoning/page.tsx` mirroring `<ScoringPolicyEditor>` pattern — but as `<TypedWidgetPolicyEditor>` that reads ui_widget/ui_options/ui_consequence/ui_cascade from platform_policies and renders the appropriate widget (number input / dropdown / textarea / etc.) (2) Port AICBL's `lib/osce/rubric.ts` (107 LOC) + `extractor.ts` (135 LOC) to `lib/services/pde-osce-scoring.ts` (3) `/api/pde/clinical-reasoning/score/route.ts` — server endpoint called after final Q of an attempt (4) Accreditation evidence auto-insert into `quality_evidence_mappings` when score ≥ threshold (reads threshold from `platform_policies`) (5) Update `pde_learner_capabilities` (upsert, keep max score) (6) Write `pde_engagement_events` row for case completion (7) PR #727 closure note + `aicbl.vercel.app` decommission checklist (action only after MyJKKN port verified live) |

### Dependencies / sequencing
- A → must finish before B/C/D/E can compile-check against new schema
- B → blocks C (student UI calls coach service)
- E → can run parallel with B and C; D can also be parallel
- Final integration: A commits, then parallel B/C/D/E, then bundle commit for cross-agent fixes (visual proof, type-check, e2e smoke), then Ready PR

### Agent prompt defenses (per memory `feedback_agent_spawn_defensive_prompt_template` + `feedback_agent_pr_terminal_step_protocol_skipping` + `feedback_module_overlap_audit_before_spawn` + `feedback_agent_migration_must_apply_before_ready` + `feedback_agent_must_override_spec_when_reality_differs`)
Every agent spawn prompt MUST include:
- Read this spec FIRST
- Chunked reads ≤50 lines per file
- Max 3 Edits per file before commit
- Commit-and-push per logical step (not a single bulk commit)
- Spec-vs-reality clause: if spec contradicts what's in the codebase, OVERRIDE spec and report
- Apply-and-probe for migrations (curl Management API + verify via information_schema)
- Module-overlap audit before adding new tables/columns (grep for synonyms)
- Hard negative permissions for read-only operations
- NO `gh pr create` mid-sprint (single PR at end, opened by orchestrator)
- Verify roll_number column exists in learners_profiles before using it
- Verify capability slug 'clinical_reasoning' exists before referencing

---

## Quality bar for "done"

### Spec phase (this document)
✅ Done — 22 decisions locked, build plan defined, branch identified.

### Sprint phase (the 5-agent build)
"Done" when ALL of:
1. Branch `feat/aicbl-as-pde-clinical-reasoning` exists, ahead of jicate/main with all 5 agents' commits + bundle commit
2. `npm run typecheck` passes locally
3. `npm run build` passes locally (Turbopack)
4. `npm run lint` passes locally
5. All migrations applied to prod Supabase via Management API and verified via `information_schema.columns` probes
6. Visual proof bookend: pre-merge localhost screenshots of `/pde/learn/cases/leukoplakia`, `/pde/faculty/cases`, `/pde/admin/policies/clinical-reasoning`
7. Single PR opened to jicate/main, Ready (not DRAFT), with verbatim body referencing this spec
8. Per `feedback_session_prs_must_be_one_click_mergeable`: NO Director-side fix-after-handoff allowed

### Integration "done" (post-merge)
A real dental BDS student logs into MyJKKN, opens `/pde/learn/cases/leukoplakia`, completes all 4 Socratic questions with AI feedback, sees their OSCE score, and the Director can verify all three of:
1. `SELECT count(*) FROM pde_engagement_events WHERE event_type='clinical_case_completed' AND learner_id=<bds-student-uuid>` ≥ 1
2. `SELECT demonstration_score FROM pde_learner_capabilities WHERE learner_id=<bds-student-uuid> AND capability_id=(SELECT id FROM pde_capabilities WHERE slug='clinical_reasoning')` returns the OSCE percentage
3. `https://aicbl.vercel.app` returns 404 (standalone decommissioned)

---

## Risks + non-obvious gotchas

- **Coach placeholder caller analysis:** When porting `get-feedback.ts` into `PDEService.sendCoachMessage`, the existing placeholder may have callers expecting placeholder behavior. Agent B must `grep -r 'sendCoachMessage'` before changing the return shape; if other callers exist, branch by `context_type`.
- **VAC has TWO meanings of "case"** (`vac_lessons.gemini_prompts` AI content vs `/vac/admin/case/` Graduation Tracker). Use `clinical_case` everywhere in new code to disambiguate.
- **PR #727 receiver code exists in MyJKKN already** at `lib/pde/external-providers/aicbl/handler.ts` — Agent A and E both reference this for the mapping logic; do not edit it during the sprint (Agent E deletes it during decommission step).
- **Phantom-lesson coupling:** Every clinical case requires a vac_lessons row (for `case_scenario`) even though the lesson has no traditional lesson content. Faculty UI must hide this — faculty sees "create case", backend creates both lesson + assessment.
- **Strict 5-attempt cap conflicts with "best score wins":** Student who fails 4 times only gets 1 shot at recovery. Faculty cap-reset is the escape valve. UI should surface "Attempt N of 5" prominently to prevent surprise.
- **Image-tag Vision API cost:** Each image-tag click = 1 Gemini Vision call. A 4-tag image question = 4 calls. Budget accordingly when setting `clinical_reasoning.lifetime_attempts_per_case`.
- **Auto-enroll trigger must handle BDS backfill:** Migration must run a one-time backfill DO block to enroll existing BDS learners; otherwise only new BDS signups get enrolled.
- **roll_number_snapshot is YAGNI per Mac Claude but locked by Director:** Capture it on every pde_submissions row. Director's reasoning: roll numbers may mutate (transfer, repeat year). Future-proof.
- **PDPB compliance risk logged:** No explicit consent modal per Director decision. If PDPB inquiry occurs, defense is "covered by general MyJKKN privacy policy." Recommend a follow-up sprint adds explicit consent if compliance review pushes back.
- **Single-branch / single-PR cadence:** Director chose this over incremental. Branch will be 35+ commits behind jicate/main when sprint starts; periodic rebase against jicate/main mandatory to avoid drift. Pre-pr-ready hook will warn at PR creation time.

---

## Out of scope for this spec

- Other JICATE prototypes (admission CRM, etc.) — unchanged.
- Multi-language AI feedback (Tamil/Hindi) — English-only Phase 1.
- Mobile native app — responsive web is sufficient.
- Faculty collaboration / multi-author case editing — single-author Phase 1.
- Student-to-student peer review of cases — out of scope.
- Existing 5 PDE policy categories retrofit to typed-widget — opt-in future PR per substrate scope decision 29.
- Image-tag scoring beyond Gemini Vision validation (e.g., per-pixel accuracy) — out of scope.
