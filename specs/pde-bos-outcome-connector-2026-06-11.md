# PDE ↔ BoS Outcome Connector — Spec (locked 2026-06-11)

**One sentence:** Link every PDE demonstration to the curriculum outcome it evidences — BoS-approved CLOs for autonomous colleges, VAC course outcomes for everyone — and compute CLO/PO attainment from validated evidence instead of marks.

**Companion docs:**
- `specs/pde-roadmap-tier-1-6-2026-05-19.md` — PDE tier roadmap (Tiers 0-4 shipped; this connector is the first post-roadmap feature)
- `specs/PDE-PRINCIPAL-DEVELOPMENT-ENGINE-SPEC.md` — original vision (Agency Index F3.2, capability tracks)
- `docs/features/value-added-courses/` — VAC handoff package (Step 6 seed export never ran; content on staging)

---

## 1. Why (Director intent, 2026-06-11 session)

1. **Close the OBE loop.** BoS approves curriculum with CLOs + PO mappings (421 syllabi live). PDE captures validated demonstrations. Nothing links a demonstration to the outcome it evidences — so attainment is still spreadsheet arithmetic over marks, not evidence. Accreditors (NAAC Criterion 1/2) get a defensible evidence chain when every attainment % drills to a named-validator artifact.
2. **CARE hardening** (Director's 4-axis framework: Clarity, Appreciation, Recognition, Empowerment). Verified gap: learner demonstrations page has **0 references to `validator_notes`** — appreciation is written but never received. Clarity gap: rubric criteria not shown inline at submission time.
3. **Multi-college equity.** BoS is the autonomy privilege (all 413 latest syllabi = Arts & Science Self 282 + Aided 131). Dental/Pharmacy/Nursing/AHS must not be locked out → dual-lane picker (see §3).

## 2. Verified findings (probed live 2026-06-11, prod ref kvizhngldtiuufknvehv)

| Finding | Value | Consequence |
|---|---|---|
| `bos_course_syllabi` latest rows | 413 (all Arts & Science) | BoS lane is A&S-only today; Engineering when autonomy lands |
| CLO shape | `course_learning_outcomes.clos[] = {clo_number, description, k_values[]}` | Parser targets this shape (sample: 24UTFCP07, 5 CLOs) |
| PO map shape | `po_mappings.mappings[] = {co_id, pos{PO1..:H/M}, psos{PSO1..:H/M}}` | H/M(/L) grades drive weighted roll-up |
| Course-code join viability | **1 of 413** syllabi match `courses.course_code` (1,003 rows) | ❌ Code-namespace mismatch → **direct `bos_syllabus_id` FK**, NOT code reconciliation |
| `bos_course_syllabi` has no `course_id` / no approval-status column | versioning = `version_number` + `is_latest` + `is_archived` | "Approved" := `is_latest AND NOT is_archived` |
| Existing OBE services | `lib/services/obe/{obe-co-po-mapping,obe-outcomes,obe-regulation-config}-service.ts` | Build Step 0 MUST sample-read; reuse CO/PO vocabulary; extend if attainment math already exists there |
| VAC content | prod: 1 course/1 lesson; **staging (hhprjbgknupaplivtoib): 93 courses / 2,746 lessons / 6 CASE tracks** | VAC lane lights up via staging migration (separate effort) |
| `pde_demonstrations` rows | 0 | All attainment surfaces need graceful empty states |
| AI Pulse → PDE bridge | `lib/services/ai-pulse/ai-pulse-pde-bridge-service.ts` (4 signals → demonstrations) | First evidence generator; cycle-linked not course-linked (future: cycle→course tag) |
| Validator notes on learner page | 0 refs | CARE-A fix is real |

## 3. The three-lane curriculum model (Director-locked)

| Lane | Who | Outcome container | Status |
|---|---|---|---|
| **BoS** | Autonomous (A&S now, Engineering next) | `bos_course_syllabi` CLOs + PO maps | This PR |
| **VAC** | All 8 colleges (no university approval needed) | `vac_courses`/`vac_lessons` (FK exists from T4.2) | This PR (picker) + staging content migration (separate) |
| **Council** | Dental (DCI), Pharmacy (PCI), Nursing (INC), AHS | Mandated competency frameworks | Future: competency-framework registry. Interim: per-discipline embodied rubrics already serve as competency evidence |

Affiliated colleges MAY transcribe university-prescribed syllabi into `bos_course_syllabi` (table doesn't require a meeting; `composition_id` nullable) — ops decision, zero engineering.

## 4. Locked decisions (assumption-thrash output + Director interview 2026-06-11 22:25)

1. **Join strategy:** direct `bos_syllabus_id uuid` FK on `pde_demonstrations` (data-forced; see §2 row 4). `lesson_id` (T4.2) is the VAC-lane reference.
2. **Attainment denominator:** learners with ≥1 demonstration against that syllabus ("of participating learners" — labeled in UI). Programme-enrollment denominators deferred until enrollment linkage exists.
3. **CLO attained:** ≥1 **passed** demonstration with that CLO **validator-confirmed**.
4. **PO weights:** H=1.0, M=0.5, L=0.25 via `platform_policies` row `pde.obe.po_weight_map` (config-row rule; zero-deploy tunable).
5. **Version pinning:** demonstration pins the `bos_syllabus_id` of the version current at submission. BoS revisions do NOT re-link old evidence (grandfather analog of T2.5). Attainment page sections by version when >1 version has evidence.
6. **BoS strictly read-only** — zero writes to `bos_*` tables (T4.3 discipline).
7. **Agency level labels** rendered as operating mode, not identity (Dweck/CARE-R copy fix).

**Director-interview decisions (AskUserQuestion, verbatim choices):**

8. **CLO tag control = "Learner tags, validator confirms":** learner proposes at submission (`clo_refs`); validation form pre-checks proposals, validator can uncheck/add; confirmed set stored in `clo_refs_confirmed`. **Attainment reads `clo_refs_confirmed` only** (accreditor-defensible).
9. **Scope guard = "Own institution only":** picker shows only the learner's institution's syllabi/VAC courses. Transfers keep old links; picker follows current institution.
10. **Tag cap = 2** via policy row `pde.obe.clo_tag_cap` (zero-deploy raise).
11. **Sequencing = "Both in one session":** connector PR 1 + VAC staging FK-mapping **audit** (read-only) run in parallel; VAC migration executes only after Director reviews the audit.

**Edge dispositions:** rejected/withdrawn demos drop from attainment automatically (passed-only). VAC lane = course-level link only (vac_courses has no CLO structure — verified). Tagging optional; untagged demos still count in 7 categories + Agency Index. Blanket-tag gaming guarded by cap + validator confirmation + T3.4 nightly sample.

## 5. Schema (additive only; apply-and-probe via Management API)

```sql
ALTER TABLE pde_demonstrations
  ADD COLUMN IF NOT EXISTS bos_syllabus_id uuid REFERENCES bos_course_syllabi(id) ON DELETE SET NULL;
ALTER TABLE pde_demonstrations
  ADD COLUMN IF NOT EXISTS clo_refs jsonb;            -- learner-PROPOSED, e.g. [1,3] (cap via pde.obe.clo_tag_cap)
ALTER TABLE pde_demonstrations
  ADD COLUMN IF NOT EXISTS clo_refs_confirmed jsonb;  -- validator-CONFIRMED subset; attainment reads THIS only
CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_bos_syllabus
  ON pde_demonstrations(bos_syllabus_id) WHERE bos_syllabus_id IS NOT NULL;
```

Policy seeds (`platform_policies`, defensive NOT-EXISTS inserts):
- `pde.obe.po_weight_map` = `{"H":1.0,"M":0.5,"L":0.25}` (PR 1)
- `pde.obe.clo_tag_cap` = `2` (PR 1 — Director-locked cap, zero-deploy raise)
- `pde.scoring.validation_sla_days` = `7` (PR 2)

## 6. Service design (pattern sources named per find-the-pattern rule)

| File | Functions | Pattern source |
|---|---|---|
| `lib/services/pde-curriculum-service.ts` (NEW — unless Step-0 read of `obe-outcomes-service` shows existing attainment math → extend there; verdict in PR body) | `listApprovedSyllabi(institutionId)` · `listVacCourses(institutionId)` · `getSyllabusCLOs(syllabusId)` · `computeCLOAttainment(syllabusId)` · `computePOAttainment(institutionId?)` | `pde-cohort-service.ts` (aggregator shape) + `obe/*` vocabulary |
| Demonstration form changes | dual-lane picker (BoS syllabus OR VAC course) → CLO checklist → inline rubric criteria | existing form in `app/(routes)/pde/learn/demonstrations/new/` |
| Learner demo page | render `validator_notes` (CARE-A) | transcript page note rendering |
| Validation form | process-praise placeholder in notes field (CARE-A) | — (one-string change) |
| Accreditation-evidence | "CLO/PO attainment from PDE evidence" section + links to `/academic/obe/*` | `pde-accreditation-evidence-service.ts` (T4.5 aggregator) |
| T4.3 tighten | bos-evidence join via new FK | `pde-bos-evidence-service.ts` |

## 7. Attainment math

```
CLO_attainment(syllabus, clo_n) = distinct learners with ≥1 passed demo
                                  WHERE bos_syllabus_id = syllabus AND clo_refs @> [clo_n]
                                  ÷ distinct learners with ≥1 demo against syllabus
PO_attainment(PO_k) = Σ over CLOs mapped to PO_k ( CLO_attainment × weight(H/M/L) )
                      ÷ Σ weights      -- weights from pde.obe.po_weight_map
```
Empty states: 0 participants → "no evidence yet", never divide-by-zero (KPI-service test pattern).

## 8. CARE mapping (Director's 4-axis audit, locked)

| Axis | This build | Where |
|---|---|---|
| **C**larity | CLO checklist + inline rubric criteria at submission | form |
| **A**ppreciation | validator_notes visible to learner + process-praise placeholder | learner page + validation form |
| **R**ecognition | attainment section on accreditation evidence; level-label copy → operating mode | evidence page + agency card |
| **E**mpowerment | (already native — no change) | — |
| Speed (Gen Z caveat) | PR 2: SLA policy + aging badge + median-latency KPI tile | validator inbox + KPI dashboard |

## 9. PR decomposition

- **PR 1 — `feat(pde): BoS/VAC curriculum connector — CLO/PO attainment from demonstrations`** (~10 files): migration + policy row + service + form (dual-lane + inline rubric) + learner-page notes + validation placeholder + evidence section + T4.3 tighten + tests + spec file (this doc rides along).
- **PR 2 — `feat(pde): validation SLA + latency visibility`** (~3 files): policy row + inbox aging badge + KPI latency tile.
- **Separate efforts (not these PRs):** VAC staging content migration (93 courses / 2,746 lessons; FK-mapping audit first) · competency-framework registry (council lane) · per-course Agency Index segmentation (dormant `pde_agency_index.course_id`) · AI Pulse cycle→course tag.

## 10. Gates & verification

- Classification: **UI change + migration** → `npm run build` + Step 2.5 issues-delta + Step 2.7 bespoke gates + real screenshot (CLO selector) via connected Chrome.
- Step 0: `.env.local` → prod; dev verification is read-only navigation; no form submits without explicit Director ack.
- Discovery test: curriculum service returns 24UTFCP07's 5 CLOs from live data; form renders 5-CLO checklist; delta table in PR body.
- Q1: no new value lists (weights/SLA = policy rows). Q2: no settings-CRUD components. persona-design: no new personas (existing PDE gating).

## 11. Out of scope (explicit)

- Any write to `bos_*` or `vac_*` tables
- Programme-enrollment denominators
- Competency-framework registry (council lane)
- VAC staging content migration
- Cohort/marks integration — attainment here is evidence-based only, complementary to exam-based OBE in `/academic/obe/*`
