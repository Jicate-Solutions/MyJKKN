# PDE Roadmap — Tier 1 through Tier 6 (locked 2026-05-19)

**Scope:** What remains to wire after the PDE substrate (33 policy rows + 3 rubric namespaces + `pde_demonstrations` table + `pde-policy-reader` service + 8 admin editors) shipped through PRs #959/#960/#961/#962/#963/#966/#967/#970/#971/#976.

**Reading order:** Tiers are dependency-ordered. Tier 1 depends on substrate (now live). Tier 2 depends on Tier 1. Etc.

**Companion docs:**
- `specs/PDE-PRINCIPAL-DEVELOPMENT-ENGINE-SPEC.md` — original PDE vision & 7-category framework
- `/Users/omm/Vaults/JKKNKB/MyJKKN/PDE-Need-of-the-Hour-Presentation-2026-05-18.html` — strategic case
- `/Users/omm/Vaults/JKKNKB/MyJKKN/PDE-Seven-Category-Framework-Reference-2026-05-18.html` — Fink/OECD/NEP cross-validated framework

---

## Current State (substrate live in prod as of 2026-05-19)

### Policies (20 rows under `platform_policies` with `pde.*` namespace)
| Cluster | Keys (4 each) |
|---|---|
| `pde.scoring.*` | `demonstration_weights`, `peer_bias_detection_enabled`, `validator_audit_threshold`, `ai_deliverable_credit_policy` |
| `pde.visibility.*` | `agency_index_mode`, `cohort_comparison_scope`, `capability_versioning_policy`, `individual_metric_display` |
| `pde.rollout.*` | `pace_cap_coordinators_per_60d`, `per_college_compliance_targets`, `hod_blocking_escalation`, `tier_eligibility` |
| `pde.quests.*` | `compensation_model`, `supply_sources`, `risk_tiers`, `failed_quest_recovery` |
| `pde.governance.*` | `agency_gaming_defense`, `feedback_identity_policy`, `placement_signal_response`, `framework_branding` |

### Rubrics (13 rows under `pde.rubrics.*`)
- `pde.rubrics.embodied.*` — 5 disciplines (medical / pharmacy / nursing / dental / engineering)
- `pde.rubrics.social_leadership.*` — 4 roles (peer_mentor / team_project_lead / committee_role / community_organizer)
- `pde.rubrics.cultural_civic.*` — 4 NEP-aligned (indian_language_proficiency / local_community_project / tradition_attunement / civic_engagement)

### Schema
- `pde_demonstrations` table — empty. Columns: learner_id, institution_id, category_key (enum 7 values), rubric_policy_key, skill_name, evidence (jsonb), evidence_type, status (draft|submitted|under_review|validated|scored|rejected|withdrawn), submitted_at, validator_ids (jsonb), validator_notes (jsonb), raw_score, weighted_score, passed, scored_at, created_by, created_at, updated_at. RLS: learner-own + faculty-same-inst + super_admin-all.

### Service layer
- `lib/services/pde-policy-reader.ts` — 20 typed accessors over `fn_get_policy_json`. Exports: `PDE_POLICY_KEYS`, `getDemonstrationWeights()`, `getPeerBiasDetectionEnabled()`, `getValidatorAuditThreshold()`, `getAiDeliverableCreditPolicy()`, `getAgencyIndexMode()`, `getCohortComparisonScope()`, `getCapabilityVersioningPolicy()`, `getIndividualMetricDisplay()`, `getPaceCapCoordinatorsPer60d()`, `getPerCollegeComplianceTargets()`, `getHodBlockingEscalation()`, `getTierEligibility()`, `getQuestsRiskTiers()`, `getQuestsSupplySources()`, `getQuestsCompensationModel()`, `getFailedQuestRecovery()`, `getAgencyGamingDefense()`, `getFeedbackIdentityPolicy()`, `getPlacementSignalResponse()`, `getFrameworkBranding()`. Each accepts optional `institutionId` for per-institution overrides.

### Admin editors (live, SuperAdminOnly-gated)
- `/pde/admin/policies/scoring` (#959)
- `/pde/admin/policies/visibility` (#963)
- `/pde/admin/policies/rollout` (#962)
- `/pde/admin/policies/quests` (#961)
- `/pde/admin/policies/governance` (#960)
- `/pde/admin/rubrics/embodied` (#976)
- `/pde/admin/rubrics/social-leadership` (#970)
- `/pde/admin/rubrics/cultural-civic` (#967)

### Existing PDE module (pre-substrate, parallel mental model — see Tier 4)
- Tables: `pde_assessments`, `pde_assessment_questions`, `pde_submissions`, `pde_certificates`, `pde_quests`, `pde_quest_enrollments`, `pde_quest_submissions`, `pde_capabilities`, `pde_learner_capabilities`, `pde_engagement_events`, `pde_engagement_daily`, `pde_agency_index`, `pde_build_sessions`, `pde_channels`, `pde_messages`, `pde_reputation`, `pde_badges`, `pde_learner_badges`, `pde_coach_conversations`.
- Routes: `/learn/quests`, `/learn/capabilities`, `/learn/build`, `/learn/assess`, `/learn/leaderboard`, `/learn/profile`, `/learn/channels`, `/learn/certificate/[id]`, `/pde/admin/assessments`, `/pde/admin/capabilities`, `/pde/admin/quests`, `/pde/admin/engagement`, `/pde/admin/at-risk`, `/pde/admin/lti`.
- Service: `lib/services/pde-service.ts` (1370 lines, `PDEService` class).

---

## Tier 1 — Consumer Layer (immediate next, spawning 2026-05-19)

**Goal:** wire the substrate so a learner can submit a demonstration, a faculty validator can review it, the scoring engine computes a weighted score, and cohort comparison surfaces relative performance.

**Risk surface:** new student-facing UI; first prod write to `pde_demonstrations`. RLS already enforced.

### T1.1 — Learner-side demonstration UI (Agent K)
- `/app/(routes)/pde/learn/demonstrations/page.tsx` — list "my demonstrations"
- `/app/(routes)/pde/learn/demonstrations/new/page.tsx` — submission form
- `/app/(routes)/pde/learn/demonstrations/new/_components/DemonstrationForm.tsx`
- `/app/(routes)/pde/learn/demonstrations/_components/DemonstrationList.tsx`
- `/app/api/pde/demonstrations/route.ts` — GET own + POST new
- `/lib/services/pde-demonstration-service.ts` — CRUD + rubric resolver
- Reads: `pde.rubrics.*` (for rubric selector via `pde-policy-reader`)
- Writes: `pde_demonstrations` INSERT (status `draft` → `submitted`)

### T1.2 — Validator + Scoring (Agent L)
- `/app/(routes)/pde/admin/demonstrations/page.tsx` — inbox of pending validations
- `/app/(routes)/pde/admin/demonstrations/[id]/page.tsx` — detail + validate form
- `/app/(routes)/pde/admin/demonstrations/_components/ValidationForm.tsx`
- `/app/api/pde/demonstrations/[id]/validate/route.ts` — POST validation
- `/app/api/pde/demonstrations/[id]/score/route.ts` — POST scoring (consumes `pde.scoring.demonstration_weights`)
- `/lib/services/pde-validator-service.ts`
- `/lib/services/pde-scoring-service.ts` — consumes `pde.scoring.*` via `pde-policy-reader`
- `/__tests__/lib/services/pde-scoring-service.test.ts`
- Reads: `pde_demonstrations` where status='submitted', `pde.rubrics.*` (criteria), `pde.scoring.*` (weights)
- Writes: `pde_demonstrations.validator_ids/notes/raw_score/weighted_score/passed/scored_at`, status `submitted` → `validated` → `scored`

### T1.3 — Cohort comparison dashboard (Agent N)
- `/app/(routes)/pde/admin/cohort/page.tsx` — admin overview by category × cohort
- `/app/(routes)/pde/learn/cohort/page.tsx` — learner-facing peer-relative view
- `/app/(routes)/pde/admin/cohort/_components/CohortHeatmap.tsx`
- `/app/(routes)/pde/learn/cohort/_components/PeerRelativeCard.tsx`
- `/lib/services/pde-cohort-service.ts` — consumes `pde.visibility.*` via `pde-policy-reader`
- Reads: `pde_demonstrations` (aggregated), `pde.visibility.cohort_comparison_scope`
- Writes: nothing

---

## Tier 2 — Policy enforcement (immediate post-Tier 1)

Most policy rows are still inert after Tier 1. Tier 2 wires them to actual behavior.

- **Pace-cap enforcement** for coordinator onboarding (consumes `pde.rollout.pace_cap_coordinators_per_60d`). New service `lib/services/pde-pace-cap-service.ts`. Possibly new table `pde_coordinator_onboarding_log` OR reuse `audit_logs`.
- **HOD-escalation hook** when HOD blocks a learner (consumes `pde.rollout.hod_blocking_escalation`). Hooks into existing HOD workflows.
- **Course-tier eligibility checker** (consumes `pde.rollout.tier_eligibility`). Service that gates which courses can wrap PDE.
- **Per-college compliance dashboard** (consumes `pde.rollout.per_college_compliance_targets` — 8 colleges × 7 categories). `/pde/admin/compliance/per-college/page.tsx`.
- **Capability versioning logic** (consumes `pde.visibility.capability_versioning_policy` — grandfather-with-upgrade). Modifies existing `pde_capabilities` consumer.
- **AI deliverable detection** (consumes `pde.scoring.ai_deliverable_credit_policy`). Service `lib/services/pde-ai-detection-service.ts` — heuristic + optional LLM classification.
- **Peer-bias detection** (consumes `pde.scoring.peer_bias_detection_enabled`). Plugs into peer-validator path of T1.2.
- **Agency-Index live recomputation** (consumes `pde.visibility.agency_index_mode = 'live'`). Modifies existing `pde_agency_index` consumer.

---

## Tier 3 — Quest & Defense pipelines (post-pilot)

- **Quest supply pipeline** — submission portal for industry / alumni / student-proposed (consumes `pde.quests.supply_sources`).
- **Quest risk-tier promotion** (consumes `pde.quests.risk_tiers` — experimental → production after 2 passes).
- **Reciprocal credit accounting** (consumes `pde.quests.compensation_model`). New table `pde_reciprocal_credits` likely.
- **Gaming-defense audit job** — nightly 10% judgment-of-judgment sample (consumes `pde.governance.agency_gaming_defense`). Cron-triggered.
- **Feedback moderation queue** (consumes `pde.governance.feedback_identity_policy`).
- **Active employer briefing flow** (consumes `pde.governance.placement_signal_response`). Outbound email + dashboard for placement team.

---

## Tier 4 — Integration with existing academic system

- **Bridge old PDE → new PDE** — decide fate of `pde_assessments` / `pde_certificates` / `pde_capabilities` / `pde_quests` tables. Old mental model: auto-graded assessments + badges. New: demonstrations + 7-category rubrics + validator attestation. Options: (a) parallel-run both, (b) deprecate old, (c) bridge old artifacts to new categories.
- **Course linkage** — demonstrations tied to academic courses + lessons via new FK or junction table.
- **BoS (Board of Studies) integration** — surface demonstrations as part of curriculum approval flows.
- **Per-learner PDE transcript** — downloadable, NAAC/NBA-ready PDF. Service + route + email delivery.
- **Accreditation evidence wiring** — existing `/pde/admin/accreditation-evidence/[body]` route needs feeding from new demonstrations.

---

## Tier 5 — Mobile + hardware (post-web-validation)

- QR-based validation (faculty scans student work; new short URL endpoint).
- Mobile-first demonstration capture (photo/video evidence upload + processing).
- Sensor/simulator data ingestion (clinical OSCE scores, lab equipment APIs, etc.).

---

## Tier 6 — Operational launch (non-engineering)

- Faculty training materials + onboarding playbook.
- Pilot cohort selection (which 30 coordinators get white-glove first — pace-cap is 30/60d per `pde.rollout.pace_cap_coordinators_per_60d`).
- Communication kit (faculty/learner-facing explainers).
- KPI dashboard tying back to Director's "60% active-use ratio by 90 days" lock from `project_hr_strategic_lock_2026_05_11`.

---

## Standalone / unrelated

- `__tests__/` regex gap in `.github/workflows/visual-proof-gate.yml` (placeholder workaround used in #971). One-line fix: append `__tests__/|` to NON_UI_REGEX.
- NAAC scanner workstream — locked separate per `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_wave4c_naac_separate_workstream.md`. Has its own `/assumption-thrash` interview.

---

## Sizing

| Tier | PRs | Sessions |
|------|-----|----------|
| 1 | 3 | 1 |
| 2 | 6-8 | 2-3 |
| 3 | 5-6 | 2 |
| 4 | 4-5 | 3-4 |
| 5 | 4-6 | 2-3 |
| 6 | 0 engineering | n/a |
| **Total** | **22-28** | **10-13** |

"Minimum viable engine" = Tier 1 + Tier 2 = ~10 PRs, 3-4 sessions.
