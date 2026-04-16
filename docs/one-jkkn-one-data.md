# Context Library: One JKKN, One Data

**Load this file when working on:** entity masters (Learner/Program/Staff), any module touching admission/academic/billing/hostel/HR, compliance/accreditation (NAAC/NIRF/NBA/QS/DCI/PCI/INC/NCTE/AICTE/UGC), MDM design, evidence mappings, or the `/accreditation/` route tree.

**Purpose:** This is directive context for Claude. It encodes architectural rules, vocabulary, and anti-patterns that govern the most important program MyJKKN is running. Every module decision should pass the tests in this file.

---

## 1. North Star (one sentence)

**Every keystroke entered once. Every compliance format reproducible on click.**

MyJKKN's objective is NOT "being an ERP." It is a unified data substrate where operational modules are data collectors and compliance formats (10 regulatory bodies) are query templates over that substrate.

## 2. Vocabulary (use these terms exactly)

| Term | Meaning | Canonical location |
|---|---|---|
| **Learner Master** | Single source of truth for any student across their full lifecycle (lead → applicant → enrolled → alumni) | `learner_master` table, all FKs |
| **Program Master** | Single source of truth for program/course/semester/year hierarchy | `program_master`, `course_master` |
| **Staff Master** | Single source of truth for faculty/admin/support staff | `staff_master` |
| **MDM Layer** | The thin layer of master tables + views that every module queries through | `lib/mdm/*`, DB views `v_*_master` |
| **Compliance Kernel** | Body-agnostic accreditation engine: formats + mappings + submissions + evidence | `app/(routes)/accreditation/`, `lib/accreditation/*` |
| **Tribal Knowledge** | Rules in people's heads that govern data entry — being captured in 10 interviews | `jkknkb/MyJKKN/Tribal Knowledge/*.md` + `lib/rules/*.json` |
| **Fan-out evidence** | One operational event emits rows to N compliance bodies simultaneously | `quality_evidence_mappings` junction |
| **Critical rebuild paths** | The 4 broken integration points being rewritten | See §5 |

## 3. The 10 Compliance Bodies (not 4, not 1)

JKKN's regulatory surface has **10 bodies** across **8 colleges** (2 autonomous + 4 affiliated + others). All consume OVERLAPPING evidence from the SAME operational data.

| # | Body | Type | Cycle | Scope |
|---|---|---|---|---|
| 1 | NAAC | Accreditation (binary) | 3y | All 8 colleges |
| 2 | NIRF | MoE Ranking | Annual | All 8 + JKKN overall |
| 3 | NBA | Program accreditation | 3y | Engineering programs |
| 4 | QS | World ranking (aspirational) | Annual | All (future) |
| 5 | DCI | Dental Council of India | Annual inspection | Dental only |
| 6 | PCI | Pharmacy Council of India | Annual inspection | Pharmacy only |
| 7 | INC | Indian Nursing Council | Annual inspection | Nursing only |
| 8 | NCTE | Teacher Education | Periodic | Education only |
| 9 | AICTE | Technical Ed approval | Annual EoA | Engg + Pharmacy |
| 10 | UGC | Overall regulator | Continuous | All 8 |

**Principal = IQAC Chair (NAAC) + NIRF Coord + NBA Co-Chair + DCI/PCI/INC Principal + AICTE/UGC Head.** Principal dashboard must aggregate all 5+ hats.

## 4. Architectural Rules (LOCKED 2026-04-16)

### Rule 1 — Substrate naming is body-agnostic

- Use `quality_*`, `accreditation_*`, `compliance_*` prefixes for anything consumed by 2+ bodies
- NEVER use `naac_*` prefixes for structurally multi-body tables (evidence junction, committees, submissions, metrics catalog)
- Exception: `grievance_tickets` + federation is NAAC-specific (Metric 7.7); stays under `/accreditation/naac/grievance`

### Rule 2 — Fan-out evidence at event time

Every operational event must emit `quality_evidence_mappings` rows to EVERY applicable body. Examples:

- A publication row → 4+ evidence rows (NAAC 9.1, NIRF RPC, NBA PO, QS Citations)
- A faculty PhD → NAAC 2.2 + NBA Tier2 + NIRF TLR_QF + DCI/PCI/INC roster (college-dependent)
- A new course → NAAC 1.1 + NBA Tier1 + AICTE EoA + UGC

Never hardcode a single body's metric_code in a trigger/service. Tag against a LIST computed from event category.

### Rule 3 — URL structure

- `/accreditation/<body>` is the pattern — `/accreditation/naac`, `/accreditation/nirf`, `/accreditation/nba`, `/accreditation/dci`, etc.
- `/iqac` is a permanent redirect to `/accreditation/naac` (IQAC is NAAC-specific, not supreme)
- `/accreditation/coverage` is the cross-body dashboard

### Rule 4 — Every new module answers the Evidence Test

Before merging any new feature/module, answer: **"which of the 10 bodies consume evidence from this module, and at which metric codes?"** If the answer is empty, reconsider the feature.

### Rule 5 — Entity Master First

Before creating a new entity table (students, faculty, courses, etc.), check if it belongs in an existing master. Never create parallel entity tables. Use FK to master + role/context table for extensions.

## 5. The 4 Critical Rebuild Paths

These are the integration points being rewritten on top of the MDM layer. Any PR touching these areas must follow the new pattern.

| Path | What breaks today | What the rebuild does |
|---|---|---|
| **A. Admission → Academic** | Student re-keyed 2–3 times from lead → applicant → learner | `learner_identity_events` append-only log. Promotion = new event, not re-key |
| **B. Academic → Billing** | Fee structure in billing duplicates program+semester+year from academic | Billing JOINs `program_master` — no duplication |
| **C. Billing → Hostel/Mess** | Non-payers occupy rooms; payers unallotted | `v_learner_hostel_eligible` view + `payment_gate` column + audit-logged override |
| **D. HR → Academic** | Faculty master in HR, class allocation uses separate `staff_allocation`, publications scattered | `staff_master` canonical; class + publication FK through it |

## 6. The 14 Locked Decisions (compact reference)

| Dimension | Choice |
|---|---|
| Scope | Everything: MyJKKN + Tally + Drive + paper + tribal knowledge |
| Pilot entity | Learners (highest leverage) |
| Rollout | Big-bang 9-month (Apr 20, 2026 → Jan 19, 2027) |
| Architecture | Hybrid MDM + selective rebuild of 4 paths |
| Tribal methods | Interviews + screen-record + tooltips + AI log mining |
| Team | Omm+Claude primary, 2 mid dev reviewers, 6 IQAC coords, Data Owners |
| First 60-day win | 10 tribal knowledge interviews × 3 outputs each |
| Arbiter | Director (Omm) — escalations up |
| Facilitator | Director + Claude Code (AI-augmented) |
| Output per interview | Policy doc + JSON rules + form tooltips |
| Role clusters | Leadership + Academic leaders + Operations + Frontline |
| Rebuild paths | All 4 (admission→academic, academic→billing, billing→hostel, HR→academic) |
| Start | Monday April 20, 2026 |
| Dev budget | ~₹10–12L (2 mid reviewers + Omm via Claude) |
| Success metric | Compliance coverage % across NAAC+NIRF+NBA+AICTE (Month-9 target: 75%) |

## 7. Anti-Patterns (reject these in code review)

- `naac_evidence`, `naac_committees`, `naac_submissions` — use `accreditation_*` or `quality_*` instead
- New `students` / `student_*` tables — use `learner_master` + context tables
- New `employees` / `faculty_list` — use `staff_master`
- Hardcoded body in triggers: `INSERT INTO naac_evidence` — use fan-out to `quality_evidence_mappings`
- Parallel fee structure tables: `academic_fees` vs `billing_fees` — single source, `program_master`-keyed
- Hostel allocation without payment gate check — breaks Rule 4
- Publications tracked in faculty profile only (not aggregated) — must emit evidence rows

## 8. Success Measurement

**Metric:** `(auto_fillable_indicators / total_indicators)` per format per institution, weekly snapshot.

**Dashboard:** `app/(routes)/accreditation/coverage/page.tsx`

**Targets:**

| Phase | Weighted coverage (across NAAC+NIRF+NBA+AICTE) |
|---|---|
| Baseline (Apr 2026) | ~10% |
| Month-6 (Oct 2026) | 50% |
| Month-9 (Jan 2027) | 75% |

**Weekly snapshot:** Auto-committed to `jkknkb/MyJKKN/Weekly Reports/YYYY-WW.md`.

## 9. Related Files

| File | Purpose |
|---|---|
| `specs/one-jkkn-one-data/MASTER-PLAN.md` | Full 9-month plan, sprint-by-sprint, risk register |
| `jkknkb/MyJKKN/Tribal Knowledge/*.md` | Output of 10+ role interviews — policy docs |
| `lib/rules/<role>.json` | Machine-readable rule configs from interviews |
| `lib/accreditation/formats/<body>-<cycle>.json` | Format schemas (e.g., `naac-aqar-2024.json`) |
| `lib/accreditation/mappings/<body>/*.sql` | Body-specific mapping queries |
| `~/.claude/projects/.../memory/project_one_jkkn_one_data.md` | Memory note — 14 decisions |
| `~/.claude/projects/.../memory/project_jkkn_accreditation_surface.md` | Memory note — 10-body surface |

## 10. When in Doubt

If a design decision isn't covered here, ask: **"does this reduce duplicate entry or enable one-click compliance output?"** If neither, it's low priority. If both, prioritize.

---

**Maintained by:** Director (Omm)
**Last updated:** 2026-04-16
**Supersedes:** Nothing — this is additive to existing CLAUDE.md project rules
