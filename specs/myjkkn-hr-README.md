# MyJKKN HR Module — Spec Index

**Last updated:** 2026-04-24 (spec-recovery PR)

This is the entry point for anyone exploring MyJKKN's HR module specs. Start with the authoritative parent (v4) and then drill into the sprint you care about.

---

## Sprint status

| Sprint | Title | Status | PR | Spec |
|--------|-------|--------|----|------|
| **1** | Employee Master | Shipped | #163, #165 | [`myjkkn-hr-sprint-01-plan.md`](./myjkkn-hr-sprint-01-plan.md) |
| **2** | Policy Management (Policy-as-Data) | Shipped | #167 | [`myjkkn-hr-sprint-02-plan.md`](./myjkkn-hr-sprint-02-plan.md) *(retrospective — captured post-ship)* |
| **3** | Staff Leave Workflow | Shipped | #168 | [`myjkkn-hr-sprint-03-plan.md`](./myjkkn-hr-sprint-03-plan.md) |
| 4 | eSSL Biometric | **Deferred** (per user decision 2026-04-15) | — | — |
| 5 | Attendance | **Deferred** (per user decision 2026-04-15) | — | — |
| **6** | HR Command Center Dashboard | Shipped | (post-rebuild) | [`myjkkn-hr-sprint-06-plan.md`](./myjkkn-hr-sprint-06-plan.md) |
| **R** | Recruitment | Shipped | (no spec committed) | — |

**Sprint 4 + 5 deferral**: per user decision on 2026-04-15, the team skipped eSSL biometric integration and attendance so that Sprint 6 (the HR Command Center Dashboard) could ship first with Sprint 1–3 data. See `myjkkn-hr-sprint-06-plan.md` header: *"Skips: Sprint 4 (eSSL biometric) + Sprint 5 (Attendance) — deferred to end per user decision."*

---

## Specs in this folder

### Module-level parent specs (iteration trail)

| File | Purpose |
|------|---------|
| [`myjkkn-hr-module-spec.md`](./myjkkn-hr-module-spec.md) | v1 — original technical spec (463 lines) |
| [`myjkkn-hr-module-spec-v2-deep.md`](./myjkkn-hr-module-spec-v2-deep.md) | v2 — deep-dive iteration (501 lines) |
| [`myjkkn-hr-module-spec-v3-final.md`](./myjkkn-hr-module-spec-v3-final.md) | v3 — consolidated final pre-evidence (182 lines) |
| [`myjkkn-hr-module-spec-v4-evidence.md`](./myjkkn-hr-module-spec-v4-evidence.md) | **v4 — AUTHORITATIVE parent spec**. Every sprint plan references this. Links design decisions back to customer evidence. (263 lines) |

### Sprint plans

| File | Sprint | Lines |
|------|--------|-------|
| [`myjkkn-hr-sprint-01-plan.md`](./myjkkn-hr-sprint-01-plan.md) | 1 (Employee Master) | 143 |
| [`myjkkn-hr-sprint-02-plan.md`](./myjkkn-hr-sprint-02-plan.md) | 2 (Policies) — retrospective | 214 |
| [`myjkkn-hr-sprint-03-plan.md`](./myjkkn-hr-sprint-03-plan.md) | 3 (Leave Workflow) | 334 |
| [`myjkkn-hr-sprint-06-plan.md`](./myjkkn-hr-sprint-06-plan.md) | 6 (Command Center Dashboard) | 250 |

### Customer evidence & competitive analysis

| File | Purpose |
|------|---------|
| [`hrapp-issues-capture.md`](./hrapp-issues-capture.md) | **Crown jewel.** 1,678 customer messages from hrapp.co (the current HR vendor being replaced). Empirical basis for every HR design decision. 569KB, 3,371 lines. |
| [`hrapp-features-benchmark.md`](./hrapp-features-benchmark.md) | Feature-by-feature mapping of hrapp.co → MyJKKN v4 coverage. Drives buy-vs-build decisions. 213 lines. |

---

## Production state snapshot (2026-04-24)

| Metric | Value |
|--------|-------|
| Total `hr_*` tables on prod | **35** |
| — Policy tables (Sprint 2) | 19 |
| — Leave workflow tables (Sprint 3, `hr_leave_*`) | 8 |
| — Recruitment tables (`hr_recruitment_*`) | 2 |
| — Employee master + dashboard + orgs + other | 6 |
| Staff rows (`staff` table) | 444 |
| Production DB | `kvizhngldtiuufknvehv.supabase.co` |

---

## How to use this index

1. **New to HR?** Read v4 parent spec first, then Sprint 1 → Sprint 2 → Sprint 3 → Sprint 6 in order.
2. **Investigating a customer complaint?** `hrapp-issues-capture.md` is grep-friendly; every quoted decision in v4/sprint specs can be traced back to it.
3. **Designing a new HR sprint?** Mirror the structure of `myjkkn-hr-sprint-03-plan.md` (the only pre-implementation spec that shipped with the PR). Sprint 6 is also a strong template for dashboard-style sprints.
4. **Considering Sprint 4 or 5 revival?** The deferral rationale is captured in the Sprint 6 spec header. Open a fresh interview before reviving.
