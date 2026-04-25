# MyJKKN HR Module — Spec v4 (Evidence-Driven Final)

**Created:** 2026-04-14 (night)
**Supersedes:** v3 (which superseded v1 + v2)
**Source:** All previous interview rounds + hrapp.co customer-evidence capture (`specs/hrapp-issues-capture.md`, 1,678 messages, 281 users, 22 months)
**Status:** READY for final human gate

---

## What v4 Adds Over v3

v3 was decision-locked. v4 adds **failure-mode-driven engineering standards** derived from analyzing 1,678 hrapp.co complaint messages.

| Area | v3 Position | v4 Position | Source |
|------|-------------|-------------|--------|
| Reliability target | Implicit | **99.9% application uptime, <0.1% data loss; edge/device best-effort** | Round 8 Q1 |
| Attendance failures | Generic "must be accurate" | **Defense-in-depth against ALL 4 patterns: false LOP, missing punch, day calc, sync delay** | Round 6 Q1 + 55% complaint share |
| Stuck submissions | Not addressed | **All forms: idempotent APIs + visible queue/status + auto-retry** | Round 6 Q2 |
| Approval failures | Configurable chain | **+ Auto-nudge at 24h, escalate at 48h, chain validation, per-approver dashboards** | Round 6 Q3 + 20% complaint share |
| Auto-approve policy | Not in spec | **CL + Permission + OD allowed at 72h; Vacation/Sabbatical NEVER** | Round 7 Q2 + Round 8 Q2 |
| Self-healing missing punch | Not addressed | **3-step: class-proxy → WhatsApp confirm → shift-end default → HR notify** | Round 8 Q3 |
| Migration trust | Standard parallel | **Users welcoming; reduce parallel to 2 weeks (was 2-4)** | Round 6 Q4 |
| Champion strategy | UAT + champion AO | **Skip champion; Central HR officer sole UAT; all-at-once rollout** | Round 8 Q4 |
| Total v1 timeline | 24-26 weeks | **28-30 weeks** (added reliability + self-healing) | Aggregate of new scope |

---

## 1. Customer-Evidence Foundation

`specs/hrapp-issues-capture.md` is now the source of truth for "what NOT to repeat":

| Evidence Stat | Implication for HR-App |
|---------------|------------------------|
| 1,678 complaint messages from 281 unique users | Real validated user pain — not hypothetical |
| 920 (55%) about attendance | Attendance engine is the project's defining make-or-break |
| 380 (23%) about app bugs (stuck submissions dominant) | Engineering reliability discipline is non-optional |
| 331 (20%) about approval workflow | Approval engine must auto-escalate + show bottlenecks |
| Santhiya ↔ Sri@hrapp.co email pattern | Vendor dependency creates 30+ min delays per issue; HR-App removes this |
| 22-month complaint history | Patterns are systemic, not incidental |

---

## 2. Engineering Standards (Banking-Grade)

### 2.1 Reliability Tiers

| Layer | Target | Strategy |
|-------|--------|----------|
| HR-App application (Vercel + Supabase) | **99.9% uptime** | Vercel SLA + Supabase HA + monitoring |
| Edge agent (Raspberry Pi at sites) | Best-effort, target 99.5% | Local SQLite buffer + push retry + daily health report |
| eSSL biometric devices | Best-effort | Out of our control; reconciliation tools to detect gaps |
| Data integrity (no lost transactions) | **<0.1% loss** | Idempotent APIs + queue-based ingestion + daily reconciliation jobs |

### 2.2 Form Submission Standard (All HR-App Forms)

Every API route that mutates data MUST:
1. Accept idempotency key from client (UUID)
2. Return 200 + idempotency-key on duplicate (don't re-process)
3. Show client-visible status: `queued | processing | sent | failed | retry_pending`
4. Auto-retry with exponential backoff on network failure
5. Surface queue depth on dashboard for HR officer monitoring

### 2.3 Failure-Mode-Driven Test Suite (for Sprint 4-5 Attendance)

From hrapp.co complaint patterns, mandatory test cases:

| Test ID | Scenario | Expected |
|---------|----------|----------|
| ATT-T1 | Employee has approved leave but punch missing | LOP NOT applied (cross-reference `institution_leaves`) |
| ATT-T2 | Employee has approved permission but punch outside grace | NOT marked late |
| ATT-T3 | Employee clocks in at 9:03, no clock-out | Self-heal: WhatsApp at 6 PM, default to shift end if no reply |
| ATT-T4 | Employee marked half-day leave on Date X | NOT calculated as full LOP |
| ATT-T5 | eSSL device offline 2 hours | Edge agent buffers; reconciles when online; no data lost |
| ATT-T6 | Faculty marked Period 5 student attendance | Counts as present-via-class-proxy if biometric missing |
| ATT-T7 | Two punches within 5 min for same employee | Dedup, count as one |
| ATT-T8 | Daylight saving boundary | Times calculated correctly (no shifted minutes) |

### 2.4 Self-Healing Flow (Missing Punch Recovery)

```
Detected: Employee punch-in but no punch-out by 6 PM

Step 1 (immediate): Cross-check MyJKKN academic data
  IF faculty marked any class attendance after punch-in time:
    → Mark present, proof_type='class_proxy', no further action

Step 2 (at 6 PM): WhatsApp employee
  Template: "Hi {name}, no punch-out detected today. Did you work till {shift_end}?
             Reply YES to confirm, NO to dispute (HR will be notified)."
  
  IF YES received within 24h: Mark present, proof_type='employee_confirmed'
  IF NO received: Flag for HR officer review

Step 3 (next day 9 AM): Default + flag
  IF no employee reply by 9 AM next day:
    → Default to shift-end time, mark with proof_type='auto_default'
    → Notify HR officer in daily review queue
```

### 2.5 Approval Auto-Escalation

```
Leave request submitted → assign first approver

T+0:    Notify approver (in-app + WhatsApp)
T+24h:  IF no action → nudge approver again (in-app + WhatsApp)
T+48h:  IF no action → escalate to next-in-chain (or HR officer if no next)

T+72h:  IF leave_type IN [CL, Permission, OD]:
          → AUTO-APPROVE with note "Auto-approved per policy (no rejection within 72h)"
        ELSE:
          → Continue escalation; never auto-approve

Vacation, Sabbatical, Sick (>2 days), Half-Pay Leave: NEVER auto-approve
```

---

## 3. Updated Sprint Plan — v4

| Sprint | Weeks | Focus | New v4 Additions |
|--------|-------|-------|-------------------|
| S1 | 1-2 | Shadow tenant + Employee master | (Unchanged) |
| S2 | 3-4 | Policy Management UI + Policy Engine | + Auto-approve config per leave_type |
| S3 | 5-6 | Leave workflow + Approval engine | + Auto-escalation + per-approver dashboard (was 1 wk; now 2) |
| S4 | 7-9 | eSSL edge agent + reliability infra | + Idempotency + reconciliation jobs (was 3 wks; now 3) |
| S5 | 10-11 | Attendance dashboard + Self-healing | + 3-step self-heal flow + WhatsApp template + employee confirm webhook |
| S6 | 12-13 | Central HR Command Center | (Unchanged) |
| S7 | 14-15 | Payroll engine | (Unchanged) |
| S8 | 16-18 | PF + ECR | (Unchanged) |
| S9 | 19-20 | TDS New Regime + Form 16 | (Unchanged) |
| S10 | 21 | Payslip PDF | (Unchanged) |
| S11 | 22-23 | Onboarding workflow | (Unchanged) |
| S12 | 24 | Grievance + Termination | (Unchanged) |
| S13 | 25-26 | Reports + CSV migration + Self-service | (Unchanged) |
| S14 | 27 | Failure-mode test suite execution + reliability hardening | **NEW** |
| Gate | 28 | UAT with Central HR officer + 2-week parallel | (Reduced from 4 weeks per Round 6 trust answer) |
| Cutover | 29-30 | Big-bang switch + 30-day hrapp.co backup | (Unchanged) |

**Total v1: 28-30 weeks. v3 was 24-26. Net +4-5 weeks for the reliability + self-healing scope.**

---

## 4. Sprint 1 — UNCHANGED

Sprint 1 plan in `specs/myjkkn-hr-sprint-01-plan.md` is **not affected by v4 additions**. The reliability + self-healing work kicks in at Sprint 3-5. Sprint 1 (foundation + employee CRUD) ships as planned.

**Proceed with Sprint 1 immediately upon approval.**

---

## 5. Final Open Questions (None Block Sprint 1)

| Q | Resolution |
|---|------------|
| eSSL device models (per campus) | Field audit — blocks S4, not S1 |
| hrapp.co CSV sample fields | Ask JKKN IT — blocks S13, not S1 |
| Class-proxy SLA confirm with HR officer | Pre-S5 interview — not blocking S1 |
| Champion AO identification | DEFERRED — Central HR officer is sole UAT (per Round 8 Q4) |

---

## 6. Final Recommendation

**Stop interviewing. Start building.**

8 rounds done. We have:
- Full PRD analysis (v1)
- First-principles depth (v2)
- Cross-module reuse (v2)
- Customer-evidence corpus (1,678 messages)
- Engineering standards (v4)

Marginal value of further interviews now < marginal cost of delay. Sprint 1 is unchanged across all four spec versions because foundation work doesn't depend on the upper-layer decisions. Ship Sprint 1, gather real data, return to interview as needed.

---

## 7. Files Final State

| File | Purpose |
|------|---------|
| `specs/myjkkn-hr-module-spec.md` | v1 foundational |
| `specs/myjkkn-hr-module-spec-v2-deep.md` | v2 first-principles + cross-module reuse |
| `specs/myjkkn-hr-module-spec-v3-final.md` | v3 consolidated decisions |
| `specs/myjkkn-hr-module-spec-v4-evidence.md` | **v4 — evidence-driven engineering standards (BUILD FROM THIS)** |
| `specs/hrapp-issues-capture.md` | Customer-evidence corpus (556KB, 3,371 lines) |
| `specs/myjkkn-hr-sprint-01-plan.md` | Sprint 1 task breakdown (unchanged) |

---

## 8. Final Human Gate

**One last time:**

| Reply | Meaning |
|-------|---------|
| **"Approved, start Sprint 1"** | I begin executing Phase A of Sprint 1 immediately |
| **"More interview on [topic]"** | I do another round on that specific topic |
| **"Change [X]"** | I revise + re-present |
| **"Hold"** | Pause until you're ready |

My strong recommendation: **start Sprint 1 now.** Foundation work is unaffected by every decision we've made; the value-add of more interviews from this point is low.

---

---

## 9. Round 9 Additions (Post-Benchmark Gap Round)

After firecrawl-ing hrapp.in feature list, 4 gaps surfaced. Decisions:

| Gap | v4 Decision |
|-----|-------------|
| **Retain pillar (performance appraisal, awards)** | **DELEGATED to SAMS module** — not in HR-App scope. SAMS is a sibling MyJKKN module, already fully specced at `specs/SAMS-STAFF-APPRAISAL-SPEC.md` (649 lines, 16 metrics, 50 decisions ratified, 23 tables, 12/16 metrics auto-measured from existing MyJKKN data). HR-App integrates via `staff_id` FK; SAMS handles appraisal entirely. Zero overlap. |
| **ESIC + Gratuity + PT statutory** | **DEFERRED to post-v1** — stays TDS + PF only for v1 (matches v3). User explicitly answered "Other later" = add later, not in v1 cutover. hrapp.co archive retains these for legacy continuity. |
| **Mobile experience** | **PWA only** — installable 'add to home screen', no native Android app in v1. Matches v4 §3 sprint plan. |
| **Leave encashment + bonus** | **IN v1** (+1 week). Annual encashment (year-end per HR manual §15.4 carry-forward) + bonus disbursement (festival/Diwali per §12.2). Rate configurable via Policy-as-Data (`hr_allowances` extended with `type='encashment'|'bonus'|'allowance'`). |

### Revised v4 Sprint Plan Impact

| Change | Delta |
|--------|-------|
| SAMS not in HR-App scope | 0 weeks (sibling module, separate project) |
| Statutory stays TDS + PF only | 0 weeks (no change from v4 plan) |
| PWA only (no native) | 0 weeks (no change) |
| Encashment + bonus added | **+1 week** |
| **Net v4 final timeline** | **29-31 weeks** (was 28-30) |

### SAMS Integration Contract

HR-App ↔ SAMS integration (minimal seam):

```
hr_employees.staff_id ──FK──> staff.id
                                 │
                                 └─FK──> sams_appraisal_cycles_participants.staff_id
```

- **HR-App owns:** employee master, attendance, leave, payroll, grievance, onboarding, termination
- **SAMS owns:** appraisal cycles, 16-metric scoring, auto-measurement engine, HoD/Principal review, salary increment projection
- **Shared:** `staff` (master), `institutions` (tenancy), MyJKKN auth/SSO
- **Integration point:** SAMS reads `hr_employees.designation` + `hr_employees.date_of_joining` for context; writes `sams_increment_recommendation` which HR-App reads during annual salary review

No data duplication. Clean module boundary.

---

## 10. Final File Inventory

| File | Status |
|------|--------|
| `specs/myjkkn-hr-module-spec.md` | v1 foundational (read-only reference) |
| `specs/myjkkn-hr-module-spec-v2-deep.md` | v2 first-principles + reuse (read-only reference) |
| `specs/myjkkn-hr-module-spec-v3-final.md` | v3 consolidated (read-only reference) |
| `specs/myjkkn-hr-module-spec-v4-evidence.md` | **v4 FINAL — build from this (THIS FILE)** |
| `specs/hrapp-issues-capture.md` | Customer-evidence: 1,678 messages, 281 users, 55% attendance complaints |
| `specs/hrapp-features-benchmark.md` | Competitor benchmark from hrapp.in marketing site |
| `specs/myjkkn-hr-sprint-01-plan.md` | Sprint 1 task breakdown (unchanged across v1-v4) |
| `.claude/worktrees/sf100-exercise-form-fix/specs/SAMS-STAFF-APPRAISAL-SPEC.md` | Sibling module — handles Retain pillar separately |

---

*End of v4 evidence-driven spec. Build from here. Sprint 1 plan remains unchanged. Go.*
