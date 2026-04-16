# One JKKN, One Data — Master Plan

**Status:** Locked after 17-decision interview (2026-04-16)
**Path chosen:** B (full scope, 9 months, extended budget)
**Clock starts:** Monday April 20, 2026
**Clock ends:** Tuesday January 19, 2027
**Sponsor / Arbiter:** Director (Omm)
**Facilitator:** Director + Claude Code (AI-augmented)

---

## 1. North Star

**Every keystroke entered once. Every compliance format reproducible on click.**

JKKN currently loses ~18 weeks of academic-leader time per year to accreditation paperwork across 6 colleges × 8+ formats (NAAC AQAR, NIRF DCF, NBA SAR, AICTE EOA, AISHE, ARIIA, UGC, SDG). The platform is 90% data-capture and 10% compliance-output. This program flips that ratio.

## 2. Success Metric

**Compliance format auto-coverage % across NAAC + NIRF + NBA + AICTE.**

| Format | Baseline (today) | Month-6 target | Month-9 target |
|---|---|---|---|
| NAAC AQAR | ~15% auto-fillable | 60% | 80% |
| NIRF DCF | ~10% | 50% | 75% |
| NBA SAR | ~5% | 40% | 65% |
| AICTE EOA | ~10% | 55% | 75% |
| **Weighted avg** | **~10%** | **~50%** | **~75%** |

Measured by: for each indicator in the official format, can MyJKKN answer it from its tables without manual entry? Numerator = auto-answerable indicators. Denominator = total indicators per format.

Measurement tool built in Sprint 3 (`/accreditation/coverage` dashboard).

## 3. The 17 Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Top outcome 2026 | Unified data foundation (reports integrated into measurement from Sprint 3) |
| 2 | Deadline | Strategic — not tied to a single submission |
| 3 | Unification scope | Everything: MyJKKN + Tally + Google Drive + paper + tribal knowledge |
| 4 | Pilot entity | Learners (forces 10+ modules into alignment) |
| 5 | Rollout approach | Big-bang: 6 colleges × all entities × 9 months (extended from 6 per Path B) |
| 6 | Tribal knowledge methods | ALL 4: structured interviews + screen-record + form tooltips + AI log mining |
| 7 | Architecture | Hybrid: MDM layer above modules + selective rebuild of 4 critical paths |
| 8 | Team | Omm + Claude Code (build) + 2 mid devs (review + migrate) + 6 IQAC coords + Data Owners |
| 9 | First 60-day win | 10 tribal knowledge interviews across all 4 role clusters, codified |
| 10 | Arbiter | Director (Omm) — escalations up |
| 11 | Interview facilitator | Omm + Claude Code (director-led, AI-augmented) |
| 12 | Output artifact | Per interview: policy doc (Obsidian) + rule-engine JSON + form tooltip script |
| 13 | Role clusters in first 10 | All 4: leadership + academic leaders + operations + frontline |
| 14 | Critical rebuild paths | All 4: admission→academic, academic→billing, billing→hostel, HR→academic |
| 15 | Start date | Monday April 20, 2026 |
| 16 | Dev capacity | Omm+Claude primary, 2 mid devs supporting (~₹10–12L total) |
| 17 | Success metric | Compliance auto-coverage % across NAAC + NIRF + NBA + AICTE |

## 4. Team & Governance

**Roles:**

| Role | Person(s) | Responsibility |
|---|---|---|
| Director / Sponsor / Arbiter | Omm | Vision, escalations, leadership interviews, MDM schema sign-off |
| Primary Builder | Omm + Claude Code | MDM layer + rebuild paths + kernel |
| Dev Reviewer A | TBD by Fri Apr 17 | PR review, migration tooling, staging ops |
| Dev Reviewer B | TBD by Fri Apr 17 | PR review, test automation, rollback scripts |
| IQAC Coordinators (6) | 1 per college | Format mappings, tribal interview scheduling per college |
| Data Owners | Registrars, HoDs, Accounts Head, HR Head, Wardens | Authority over entity definitions, dispute inputs |

**Governance cadence:**

- **Daily standup (15 min, 9:00 AM):** Omm + 2 dev reviewers over Telegram/Chat
- **Weekly steering (60 min, Fri 5:00 PM):** Omm + IQAC coords (6) — format mapping progress, dispute surfacing
- **Bi-weekly sprint review (90 min):** All team — demo, metrics, risk review
- **Ad-hoc arbitration:** Omm decides on escalated data definition disputes within 48 hours

## 5. 9-Month Sprint Plan (April 20, 2026 → January 19, 2027)

### Phase 1 — Tribal Knowledge Capture (Sprints 1–4, Weeks 1–8, Apr 20 – Jun 14)

**Goal:** Codify the rules in people's heads before encoding them in tables.

| Sprint | Dates | Interviews | Dev Work |
|---|---|---|---|
| S1 | Apr 20 – May 3 | 3 interviews (Director self, COO, Principal-Engg) | Staging DB fork, Fireflies integration, interview protocol doc, rule-engine JSON schema |
| S2 | May 4 – May 17 | 3 interviews (Registrar-Engg, HoD-CSE, Accounts Head) | `/accreditation/coverage` dashboard scaffold, MDM discovery SQL audit (duplicate IDs across modules) |
| S3 | May 18 – May 31 | 3 interviews (HoD-Pharmacy, Hostel Warden, Placement Coord) | Coverage dashboard live (baseline metric published) |
| S4 | Jun 1 – Jun 14 | 1 interview (Principal-Dental), consolidation week | All 10 role outputs codified: 10 policy docs + 10 JSON rule configs + tooltip script drafts |

**Deliverables end-Phase-1:**
- 10 Obsidian notes in `jkknkb/MyJKKN/Tribal Knowledge/` folder
- 10 JSON files in `lib/rules/<role>.json` (machine-readable)
- First tooltip script deployed on 1 critical form (TBD — likely admission lead creation)
- Coverage baseline published (expect ~10%)

### Phase 2 — MDM Layer Build (Sprints 3–8, Weeks 5–16, May 18 – Aug 9)

**Goal:** Canonical masters for Learner / Program / Staff. All modules query through.

| Sprint | Dates | MDM Work |
|---|---|---|
| S3 | May 18 – May 31 | Learner Master schema design + SQL migration draft |
| S4 | Jun 1 – Jun 14 | Learner Master deployed to staging, dedup + match algorithm (fuzzy match across admission/academic/hostel existing learner records) |
| S5 | Jun 15 – Jun 28 | Learner Master production deploy + read-through (modules still write to own tables, but SELECT goes through master view) |
| S6 | Jun 29 – Jul 12 | Program Master schema + deploy (program/course/semester hierarchy canonicalized) |
| S7 | Jul 13 – Jul 26 | Staff Master schema + deploy (HR faculty, academic staff, admin staff unified) |
| S8 | Jul 27 – Aug 9 | Cross-master FK enforcement: make all 4 rebuild-path modules write through masters |

**Safety net:** Read-through first (non-destructive), then write-through (destructive, needs rollback scripts). Sprint 5 adds dual-write mode (old + new) for 2 weeks before cutover.

### Phase 3 — Critical Path Rebuilds (Sprints 6–14, Weeks 11–28, Jun 29 – Oct 25)

**Goal:** Rewrite the 4 broken integration points to use MDM masters.

| Path | Sprints | Rebuild |
|---|---|---|
| A: Admission → Academic | S6–S8 (Jun 29 – Aug 9) | Lead→applicant→learner promotion writes to `learner_master`. Academic enrollment joins from `learner_master_id` not from ad-hoc student_id |
| B: Academic → Billing | S9–S10 (Aug 10 – Sep 6) | Fee invoice generation pulls program+semester+learner from masters. Removes stale copies in billing_* tables |
| C: Billing → Hostel/Mess | S11–S12 (Sep 7 – Oct 4) | Hostel allocation checks payment status via billing→learner_master join. Auto-syncs occupancy with fee status |
| D: HR → Academic | S13–S14 (Oct 5 – Oct 25) | Faculty class assignment pulls from `staff_master`. Publication claims route through staff master for NAAC Criterion 3 aggregation |

### Phase 4 — Compliance Kernel (Sprints 12–18, Weeks 23–36, Sep 7 – Jan 19)

**Goal:** Every required indicator for 4 formats is a templated query over MyJKKN masters + modules.

| Sprint | Dates | Kernel Work |
|---|---|---|
| S12 | Sep 7 – Sep 20 | `/accreditation` module scaffolding (routes + DB tables for formats/mappings/submissions) |
| S13 | Sep 21 – Oct 4 | NAAC AQAR 2024-25 format schema + 50% of indicators mapped |
| S14 | Oct 5 – Oct 18 | NAAC AQAR 80% mapped; preview renderer |
| S15 | Oct 19 – Nov 1 | NAAC AQAR PDF export in submission-ready layout |
| S16 | Nov 2 – Nov 15 | NIRF DCF 2026 format schema + 75% of indicators mapped |
| S17 | Nov 16 – Dec 13 | NBA SAR + AICTE EOA format schemas + 65% indicators mapped (2 sprints) |
| S18 | Dec 14 – Jan 19 | Hardening, safety net drills, success metric validation, pilot submission generation for 1 college on 1 format |

## 6. Critical Rebuild Paths — Detail

### Path A: Admission → Academic Handoff

**Current pain:** Lead becomes applicant in `admission_applications`. Applicant becomes learner in `learners`. Learner enrolls in `semester_enrollments`. Same person re-keyed 2–3 times with drift (DOB format, name case, category codes).

**Rebuild:** `learner_master` (UUID PK) + `learner_identity_events` (append-only log: lead_created → applicant_confirmed → learner_enrolled). Every module FK to master. Admission module promotes applicant → learner by inserting identity event, not re-keying.

### Path B: Academic → Billing

**Current pain:** Fee structure maintained in `billing_fee_structures` keyed to program+semester+year. Academic maintains program+semester+year separately. When academic updates a program, billing doesn't know.

**Rebuild:** `program_master` is canonical. Billing reads fee structure JOIN program_master (no program duplication). Fee generation is a scheduled job against active enrollments, not a manual invoice creation flow.

### Path C: Billing → Hostel/Mess

**Current pain:** Hostel allocation happens in residential office, often before first fee payment. Non-payers occupy rooms. Payers show up on reporting day with no room assigned.

**Rebuild:** `hostel_allocations` has a `payment_gate` BOOL column + view `v_learner_hostel_eligible` that joins billing payment status. Allocation UI blocks allocation when gate fails; allows override with reason (logged for audit).

### Path D: HR → Academic

**Current pain:** Faculty in HR module. Class assignment in academic module uses a separate `staff_allocation` table with its own faculty list. Publications claimed in personal profile, not aggregated to institution for NAAC Criterion 3.

**Rebuild:** `staff_master` single source. Class assignment and publications both FK. NAAC Criterion 3 aggregation becomes a query, not a spreadsheet.

## 7. First 10 Interview Roster

| # | Role | Person | Target Sprint |
|---|---|---|---|
| 1 | Director | Omm (self-interview, sets template) | S1 Week 1 |
| 2 | COO | TBD | S1 Week 1 |
| 3 | Principal — Engineering College | TBD | S1 Week 2 |
| 4 | Registrar — Engineering | TBD | S2 Week 1 |
| 5 | HoD — Computer Science (high-volume dept) | TBD | S2 Week 1 |
| 6 | Accounts Head (JKKN central) | TBD | S2 Week 2 |
| 7 | HoD — Pharmacy (regulatory-heavy, PCI) | TBD | S3 Week 1 |
| 8 | Hostel Warden (residential ops depth) | TBD | S3 Week 1 |
| 9 | Placement Coordinator (alumni→outcome link) | TBD | S3 Week 2 |
| 10 | Principal — Dental (regulatory-heavy, DCI) | TBD | S4 Week 1 |

**Interview format (30-min):**
- 5 min: Rapport + consent to record
- 15 min: Domain deep — "walk me through the last 5 decisions you made that required judgment"
- 10 min: Codify — "if I were new to your chair, what 5 rules would you tell me that aren't written anywhere?"

**Post-interview (AI-automated by Claude):**
- Fireflies transcript → Claude extraction → 3 outputs (policy doc + JSON rules + tooltip lines)
- Omm reviews + edits within 48 hours
- Commits to `jkknkb/MyJKKN/Tribal Knowledge/<role>.md`

## 8. Week 1 Kickoff Checklist

### Friday April 17, 2026

- [ ] Omm: identify 2 mid dev reviewers (external vendor or internal team)
- [ ] Omm: brief reviewers on scope, access, daily standup cadence
- [ ] Omm: confirm Fireflies + Google Calendar integrations for auto-transcription
- [ ] Omm: create `specs/one-jkkn-one-data/interview-protocol.md` (template doc)
- [ ] Omm: send calendar invites for 3 Week-1 interviews

### Saturday April 18, 2026

- [ ] Omm: create staging DB fork (via `sync-staging-from-prod` skill)
- [ ] Omm: create Obsidian folder `jkknkb/MyJKKN/Tribal Knowledge/`
- [ ] Omm: draft `lib/rules/` directory with JSON rule-engine schema
- [ ] Omm: run coverage baseline audit SQL (count duplicate IDs across modules)

### Sunday April 19, 2026

- [ ] Omm: finalize first interview protocol
- [ ] Omm: create first format schema draft: `lib/accreditation/formats/naac-aqar-2024.json` (structure only, empty indicators)
- [ ] Omm: publish this master plan to Obsidian + share with IQAC coords

### Monday April 20, 2026 — Day 1

- [ ] 9:00 AM: first daily standup with dev reviewers
- [ ] 10:00 AM: Omm runs self-interview as Director (captures vision + institutional priorities, sets the template)
- [ ] 2:00 PM: COO interview (if scheduled)
- [ ] End of day: first tribal knowledge note committed to vault

## 9. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Omm bottleneck (100%+ capacity load) | High | Catastrophic | Hire 2nd dev reviewer by S3 if velocity <70% of plan |
| R2 | Dev reviewers can't keep up with PR volume | Medium | High | Claude-generated PRs tagged with self-review checklist; reviewers only block on security + migration correctness |
| R3 | Tribal knowledge interviews get cancelled/rescheduled | High | Medium | Double-book backup slots; allow async video response for busy principals |
| R4 | MDM dedup algorithm produces wrong merges | Medium | Catastrophic | Dry-run on staging for 2 weeks before production; dual-write period of 2 weeks for rollback safety |
| R5 | Data Owner disputes escalate faster than Omm can arbitrate | Medium | High | Delegate category-level disputes to Data Owners; escalate only cross-category to Director within 48h |
| R6 | Hostel/mess payment-gate blocks real emergencies | Medium | High | "Override with reason" escape hatch in UI, logged and reviewed weekly |
| R7 | NAAC format schema changes mid-build (2025-26 cycle update) | Low | High | Lock to 2024-25 format first; build schema-versioning into kernel from Sprint 12 |
| R8 | Budget overrun beyond ₹12L | Medium | Medium | Monthly cash-out review; drop Path D (HR→Academic) if needed |

## 10. Measurement Infrastructure

**Coverage metric (Sprint 3 deliverable):**

`app/(routes)/accreditation/coverage` dashboard shows:
- Per format: % indicators auto-fillable / manual / gap
- Per institution × format matrix
- Trend line (weekly snapshot)
- Drill-down: which specific indicators are blocking higher coverage

**Implementation:** Each mapping row (`accreditation_mapping` table) has `auto_fillable BOOLEAN` + `query_definition TEXT` + `gap_reason TEXT`. Coverage = count(auto_fillable=true) / count(*).

**Weekly report:** Auto-generated snapshot committed to `jkknkb/MyJKKN/Weekly Reports/YYYY-WW.md` for trend analysis.

## 11. Open Items (resolve before Sprint 1 end)

1. Identify + contract 2 mid dev reviewers (by Fri Apr 17)
2. Confirm IQAC coord names per college (6 people, by Mon Apr 20)
3. Confirm Data Owner authority list (registrars × 6, accounts head, HR head, wardens × 3, by Fri Apr 24)
4. Decide: which single form gets the first "tooltip deployment" for live tribal-knowledge-in-UI proof (by S1 end)
5. Decide: which canary college for production cutover in S5 (Engg recommended given volume + autonomy)

## 12. What This Spec Is NOT

- Not a replacement for the Workshop Transformation v0.4 master plan — this program integrates with it, not replaces it
- Not a Solutions Hub extension — Solutions Hub is JICATE's client business; this is JKKN's internal unification
- Not a greenfield rebuild — MyJKKN keeps running; this is surgical MDM + 4 rebuilds + kernel on top
- Not a SaaS product (yet) — the architecture stays institution-parameterized so it CAN become SaaS in Phase 2 (post-Jan 2027), but that's not this 9-month scope

---

**Last updated:** 2026-04-16 23:35 IST
**Next update:** End of Sprint 1 (May 3, 2026)
**Owner:** Director (Omm)
