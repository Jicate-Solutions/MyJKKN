# MyJKKN RCLTP — Phase 4 UI Master Plan

**Status:** PLAN (Director-approved direction: build all phases with AI-drafted, human-validated content). 2026-06-15.
**Prereqs LIVE:** Phase A schema, Phase 0 grants, Phase 1 v2 substrate, Phase 2 services+hooks, Phase 3 routes (#1409+#1414) — all merged + deployed. Data layer (6 hooks) ready.

---

## 0. The content-safety contract (applies to EVERY phase — non-negotiable)

This module assesses real children. AI-drafted pedagogy is allowed ONLY under these rules:

1. **Every AI-drafted artifact is born `status='draft'`, `source='ai_generated'`,** with an `ai_meta` provenance stamp: `{ provenance: "AI-drafted — NOT validated; requires educator/MyJKKN review before use with students", model, drafted_at }`.
2. **Nothing student-facing renders unless `status='approved'`** by a human (teacher/admin) via the review gate. The student passage/question feeds already filter `status='approved'` (Phase 3 responses route enforces it).
3. **Provisional numbers** (band cutoffs, NIPUN wpm, score weights) live in the CRUDable `platform_policies` rows, seeded `is_active=false` + labelled "provisional — pending MyJKKN validation". Real published standards (e.g. NIPUN Bharat fluency targets) are used where they exist and **cited**, never silently invented. MyJKKN's validated values overwrite the rows — no rebuild.
4. **Every screen showing AI-drafted or provisional content shows a persistent banner:** "Provisional — AI-drafted, pending MyJKKN validation."
5. **No fabricated score is ever shown.** Where scoring is gated, the UI shows an honest "awaiting scoring" state, never a made-up band/number (rules #21/#25).

---

## 1. Personas × surfaces (from PRD §2, §3, §5 + v2 addendum)

| Persona | MyJKKN role | Phase-4 surfaces | Perm keys |
|---|---|---|---|
| **Student** | `student` | Take-assessment flow (read+record+answer+submit), practice, my-badges/streak, my-report (gated) | `assessment.take`, `report.view_own` |
| **Teacher** | `faculty`/`school_faculty` | Class assessment mgmt, recording-review queue, question-review console, class report (gated) | `assessment.manage`, `review`, `report.view_class` |
| **Principal/Head** | `principal`/`school_principal` | Institution dashboard, rankings (gated), config | `report.view_all`, `config.manage` |
| **Admin** | super/admin | Badge catalog CRUD, content/band config, policies editor (live), content-authoring | all `rcltp.*` |
| **Parent** | `parent_guardian` (NEW) | Child report + progress + voice consent | `report.view_child` — **DEFERRED** (needs `parent_guardian` role + `parent_learner_links` + consent; PRD §11 open) |

---

## 2. Sub-phases (each ships as its OWN PR via the Translator Pattern)

### Phase 4a — Foundation + content unlock  ·  BUILDABLE NOW (zero MyJKKN dependency)
- Role-aware `/rcltp` landing (replaces the redirect-to-policies stub) — routes each persona to their surface.
- Sidebar nav entry for RCLTP (currently missing).
- **Content-authoring console** (`/rcltp/admin/content`): passages CRUD + Part B questions CRUD (uses `useCreateRcltpPassage`/`useCreateRcltpQuestion`). The thing that makes the whole live capture path real.
- **AI-draft + review gate**: "Generate with AI" drafts content (`status='draft'`, stamped) → a teacher/admin reviews + approves (`useReviewRcltpQuestion` / passage status). Approval is the only path to `approved`.
- **Sample content** loaded as a reviewable DRAFT seed (see `myjkkn-rcltp-sample-content-DRAFT.md`).
- **Validation banner** component (reused everywhere provisional/draft content appears).

### Phase 4b — Student take-assessment app  ·  BUILDABLE NOW (needs 4a content)
- The capture flow: open sitting → read passage + **record voice** (signed-upload-URL → upload → `/recording`) → answer Part B (`/responses`, last-wins) → submit (`/submit`). All on the live Phase-3 routes.
- Practice surface (`recordPracticeCompletion`), VBB practice shell (wordlist gated → shows "coming soon").
- "My badges / streak" display (reads `rcltp_learner_badges`/`rcltp_streaks`).
- "My report" → honest **"awaiting scoring"** state (results gated).

### Phase 4c — Teacher console  ·  BUILDABLE NOW (review/manage live; AI-gen + scoring gated)
- Class assessment management (open assessment for class, schedule windows — `assessments`/`schedule` hooks).
- **Recording-review queue** (`reviewRecording`): play recording, manual override fields. (Auto voice-score gated → shows "engine pending"; manual review works now.)
- **Question-review console**: approve/reject AI-draft questions (the gate from 4a, teacher-side). "Generate questions with AI" button → calls gated `/questions/generate` → shows honest "awaiting MyJKKN prompt" until content lands.

### Phase 4d — Admin gamification + config  ·  BUILDABLE NOW
- **Badge catalog CRUD** UI (`createBadge`/`updateBadge`/`deleteBadge`). Badge *criteria* gated → criteria field marked "provisional".
- Content-level + band config surfaces (provisional values from policy rows; the live policies editor already covers nudge/intervention/reward toggles).
- Manual award/streak trigger (admin tool) → calls `/gamification/award` + `/streak` (live).

### Phase 4e — Reports & dashboards FRAMEWORK  ·  PARTLY GATED (build shells)
- Per-persona report **shells** reusing Recharts / score-card / heatmap / leaderboard components (PRD §7 framework).
- The 3 named reports (learner/parent score report, Senior Learner analytics, school-head dashboard) as shells; the **24-report catalog + the score/band data are MyJKKN-gated** → shells show "awaiting MyJKKN scoring + report catalog". No fabricated numbers.

### Deferred (own track later)
- **Parent persona** (consent + `parent_guardian` role + `parent_learner_links` migration).
- **VBB vocabulary screens** content (5,000-word list gated).
- **Real reports** (24-report catalog + validated scoring) — slot into 4e shells when MyJKKN delivers.

---

## 3. Build order & PR plan
4a (foundation+content) → 4b (student app) → 4c (teacher) → 4d (admin gamification) → 4e (report shells). One PR per sub-phase, each: built in a `jicate/main` worktree, frontend-design skill for UI quality, adversarially reviewed, CI-green, browser-verified per role (PRD §12), shipped, Director-merged. No auto-merge.

## 4. Verification (PRD §12 + rules #2/#14/#25)
Every surface browser-tested **as each role** (not "page loads"). Visual artifacts (reports, heatmaps, the student reader) eyeball-verified before phase-complete. The validation banner present on all draft/provisional surfaces. No screen shows a fabricated score/band.
