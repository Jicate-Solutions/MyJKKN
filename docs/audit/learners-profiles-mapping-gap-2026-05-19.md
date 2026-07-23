# learners_profiles → profiles Mapping Gap Audit — 2026-05-19

**Workstream:** T2.1 (B3.3) — platform-wide profile-mapping audit
**Origin:** C1 (PR #1006) flagged "44 of 624 BPHARM learners not reached by `willingness_open` notification" as Finding 1
**Verdict:** Audit-only. **Recommendation matrix presented — no path chosen.**
**Scope:** ALL learner-targeted notifications across HR onboarding, admission flows, CDC drives, billing, etc. — not CDC-specific.

## TL;DR

| Metric | Count |
|---|---:|
| `learners_profiles` total rows | **5,262** |
| Unmapped — no `profiles.learner_id` pointing at the row | **565** (10.7%) |
| Unmapped — restricted to lifecycle_status `active` or `graduated` | **0** (0.0%) |
| Unmapped — admission funnel (enquiry/pending/approved/rejected) | **564** (99.8%) |
| Unmapped — `inactive` lifecycle | **1** (0.2%) |
| Orphan profiles — `role='student'` AND `learner_id IS NULL` | **273** (separate bug class) |

**The headline finding reframes C1.** Every actual learner (active or graduated) in prod has a valid `profiles.learner_id` link today. The 565 "gap" is the admission-funnel population — learners-in-the-making who haven't been activated yet and therefore should NOT be receiving any in-app notifications.

C1's specific "44 of 624 BPHARM" number resolves to: BPHARM has 473 active + 99 graduated = **572 actual learners (all 100% mapped)** plus 45 enquiry + 8 inactive that the C1 trigger query also matched because it joined `program_id` without filtering on `lifecycle_status`. **The fix is at the eligibility-query level, not the mapping level.**

There IS a real platform-wide bug — but it's the **opposite direction**: 273 student-role `profiles` rows have NULL `learner_id`, meaning auth accounts exist but aren't linked to their `learners_profiles` row.

## Reproducibility

Run `./scripts/audit-learners-profiles-mapping.sh` — produces the summary in ~20 seconds against prod (read-only).

## Numbers

### 1. Total population

```
total learners_profiles: 5,262
```

### 2. Unmapped (the C1-flagged class — no `profiles` row points at this `learners_profiles.id`)

| Lifecycle status | Total in class | Unmapped | % of class |
|---|---:|---:|---:|
| `active` | 4,051 | **0** | 0.0% |
| `graduated` | 445 | **0** | 0.0% |
| `exited` | 3 | **0** | 0.0% |
| `enquiry` | 554 | 554 | 100.0% |
| `inactive` | 198 | 1 | 0.5% |
| `rejected` | 5 | 5 | 100.0% |
| `approved` | 4 | 3 | 75.0% |
| `pending` | 2 | 2 | 100.0% |
| **Grand total** | **5,262** | **565** | **10.7%** |

**Reading**: the 565 unmapped rows are 98% admission-funnel (`enquiry`). They are learners-in-the-making, not actual learners. They have no auth account, no in-app session, and notifications targeting them by design cannot be delivered through in-app channels (the trigger would have nowhere to deliver).

### 3. Unmapped by institution

| Institution | Unmapped |
|---|---:|
| JKKN College of Arts and Science (Self) | 220 |
| JKKN College of Engineering and Technology | 146 |
| JKKN College of Pharmacy | 78 |
| JKKN College of Nursing and Research | 73 |
| JKKN College of Allied Health Sciences | 37 |
| JKKN Dental College and Hospital | 5 |
| JKKN Testing Institution | 3 |
| Jicate Solutions | 2 |
| JKKN College of Education | 1 |

(Pattern tracks admission-funnel volume; no surprise institutions.)

### 4. Unmapped by recency (created_at)

| Year-Month | Unmapped |
|---|---:|
| 2026-05 | 385 |
| 2026-04 | 128 |
| 2026-03 | 48 |
| 2026-01 | 1 |
| 2025-12 | 3 |

**Reading**: 91% of unmapped were created in the last 2 months — these are this admission cycle's fresh enquiries. They will either convert to `active` (and gain a `profiles` row via the activation flow) or stay enquiries indefinitely.

### 5. Unmapped — email coverage

| Field | Count with non-empty value | % of 565 |
|---|---:|---:|
| `student_email` | 44 | 7.8% |
| `college_email` | 1 | 0.2% |
| Neither | 521 | 92.2% |

**Reading**: 92% of unmapped rows have no email at all. Without an email there is no path to create an auth account, hence no `profiles` row. This is a data-entry property of the admission funnel — counselors enter enquiries with phone numbers (`student_mobile`, `father_mobile`) but typically not email until the lead progresses.

### 6. Non-enquiry unmapped (the 11 anomalies worth flagging)

11 rows have `lifecycle_status NOT IN ('enquiry')` AND no `profiles` link. Manual triage of these is the only learner-touching subset.

| Lifecycle | Count | Notes |
|---|---:|---|
| `rejected` | 5 | Rejected applications — by design will never have a learner profile |
| `pending` | 2 | Test/synthetic rows (e.g. "Caller 0094", created May 2026 — counselor test data) |
| `approved` | 3 | Approved but not yet activated; 2 of 3 have `student_email` populated, sat for ~6 months without activation — likely stalled MBA admissions |
| `inactive` | 1 | Single row from Jan 2026 in JKKN Engineering, has both emails — likely manual mis-state |

None of these 11 are silent-bug evidence; they're admission-funnel exceptions.

### 7. Orphan profiles — the OPPOSITE bug class

`profiles.role = 'student'` AND `profiles.learner_id IS NULL` — there is an auth account, but no link back to the learner row.

| Property | Count |
|---|---:|
| Total orphan student profiles | **273** |
| With email | 273 (100%) |
| Ever logged in (`last_login IS NOT NULL`) | 23 (8.4%) |

Distribution by institution:

| Institution | Orphan student profiles |
|---|---:|
| JKKN College of Engineering and Technology | 97 |
| JKKN College of Pharmacy | 89 |
| JKKN College of Arts and Science (Self) | 45 |
| JKKN Dental College and Hospital | 29 |
| JKKN College of Nursing and Research | 8 |
| JKKN College of Allied Health Sciences | 3 |
| JKKN College of Arts and Science (Aided) | 1 |
| JKKN Testing Institution | 1 |

Recency: 100 created in 2026, 173 in 2025.

**This is the real bug.** A student-role profile with NULL `learner_id` cannot receive any notification that targets via `learners_profiles` (CDC drives, HR onboarding waves, billing, etc.). 250 of these accounts have never logged in (no live user impact yet) but 23 have — those 23 users are silently dropped from every learner-targeted notification today.

There are ALSO 333 `faculty` role + 165 `staff` role profiles with NULL `learner_id` — for those roles `learner_id` should always be NULL, so those are correct, not bugs.

### 8. Cross-reference to C1

| C1 statement | Audit confirms |
|---|---|
| "624 learners in eligible program" | BPHARM = 625 `learners_profiles` rows total |
| "580 received willingness_open" | 572 active+graduated + 8 inactive-mapped = 580 mapped (matches within 1) |
| "44 missing" | 45 enquiry rows (admission funnel, never should have been counted) — off by 1 from C1's number; likely C1 did distinct on a slightly different field |
| Stated cause: "44 rows aren't linked from any `profiles.learner_id`" | True, but those 44 are enquiry-state — **the bug is in the eligibility query, not in the mapping**. The trigger should join through `lifecycle_status IN ('active','graduated')` |

## Recommendation Matrix

Three paths. Director chooses; this audit does not.

### Path A — Backfill: auto-create profiles for the 565 unmapped `learners_profiles` rows

**What it does**: write a migration that for every `learners_profiles` row with no matching `profiles.learner_id`, INSERT a new `profiles` row with `role = 'student'`, `learner_id = lp.id`, `email = COALESCE(lp.college_email, lp.student_email)`, `is_pre_registered = true`, `is_login_disabled = true` (no auth account exists).

**Pros**:
- Eliminates the "44 in trigger query" symptom cleanly — any future query that joins `learners_profiles` → `profiles` works.
- Makes the data model uniform: every learner has a profile row.

**Cons**:
- 521 of 565 rows have NO email — those profile rows would have `email IS NULL` which today is **legal** (the column is nullable) but contradicts the implicit invariant that student profiles have a contactable email. New invariant ambiguity.
- Creates 565 profile rows for enquiries that may never convert. Funnel-rejection rate is high; this adds noise to admin queries (`role='student'` count inflates by ~14%).
- Doesn't solve the actual blocking issue Director cares about: when a real notification IS sent, the trigger is filtering correctly today (active+graduated all have profiles).
- Does NOT address the 273 orphan profiles (real bug class).

**When to choose**: only if there's a downstream feature that needs a `profiles` row to exist for enquiry-stage learners (e.g. admission CRM dashboards that JOIN through profiles for activity logging).

### Path B — Document as expected and tighten the trigger query

**What it does**: leave the 565 alone. Update the eligibility query in `fn_cdc_drive_emit_willingness_open` (and any analogous learner-cohort triggers) to filter `lp.lifecycle_status IN ('active', 'graduated')`. Document the contract: "in-app notifications only target activated learners; enquiries are admission-funnel data and reach users through admission CRM channels, not in-app pushes."

**Pros**:
- Minimal change. One-line WHERE clause per learner-cohort trigger.
- Aligns the system to reality: enquiries don't have auth accounts, so notifications targeting them would be dropped at the delivery layer anyway.
- Zero new schema, zero new rows.
- Surfaces the trigger as the architectural choke-point — clean fix vs. distributed backfill.

**Cons**:
- Doesn't fix the 273 orphan profiles bug class. (But it doesn't make it worse, either.)
- Requires audit of every learner-cohort trigger function and notification dispatcher (not just CDC) to add the same lifecycle filter — that's a worktree-wide find/replace exercise.

**When to choose**: if Director agrees that admission-funnel learners legitimately shouldn't get in-app notifications today. This is the **most conservative, most defensible** path.

### Path C — Differentiate by root cause; fix the bugs, leave the expected gaps

**What it does**: split the 565 + 273 into three reason-buckets and handle each:

| Reason bucket | Count | Action |
|---|---:|---|
| Enquiry/funnel learners with no email | 521 of 565 | **Leave**. Document as funnel data. Add lifecycle filter to triggers (Path B's fix). |
| Enquiry/funnel learners with email | 44 of 565 | **Leave** until they activate. Same trigger filter. |
| Non-enquiry unmapped (`pending`/`approved`/`inactive`/`rejected`) | 11 of 565 | **Manual triage**. 5 rejected = leave. 2 pending = delete test data. 3 approved = nudge activation flow. 1 inactive = check why no profile exists. |
| Orphan student profiles (`learner_id IS NULL`, ever logged in) | 23 of 273 | **Investigate**. These users CAN log in but get dropped from every learner notification. Either (a) link them back by matching `profiles.email` to `learners_profiles.student_email`/`college_email`, or (b) figure out why activation didn't set `learner_id`. |
| Orphan student profiles (`learner_id IS NULL`, never logged in) | 250 of 273 | **Leave**. No live user impact; clean up via same activation fix once root cause for the 23 is known. |

**Pros**:
- Touches every real bug. Each subset gets the right fix.
- Honest about what's a bug vs. what's data hygiene.

**Cons**:
- Most engineering work (3 PRs minimum: trigger filter + activation fix + manual SQL for the 11 non-enquiry rows).
- Investigation step for the 23 logged-in orphan profiles may surface a deeper auth/activation flow gap that broadens scope.

**When to choose**: if Director wants the platform's notification fan-out to actually reach every legitimately-active user (the 23 logged-in orphans being the highest-stakes class).

## Recommendation matrix — at a glance

| Question Director needs to answer | If "yes" → choose |
|---|---|
| Do enquiry-stage learners need to receive in-app notifications? | A (backfill profiles for them) |
| Should the architectural fix be at the trigger level? | B |
| Are there live users today being silently dropped from notifications? | C (the 23 logged-in orphans) |
| Do you want minimum-touch resolution? | B |
| Do you want to maximally clean the data model? | A + C |

The **23 logged-in student-role profiles with NULL learner_id** is the only set with confirmed live-user impact. If only one thing gets fixed, fix those.

## Files

- `docs/audit/learners-profiles-mapping-gap-2026-05-19.md` — this doc
- `scripts/audit-learners-profiles-mapping.sh` — reusable read-only audit script
- (no migrations, no schema changes, no RLS changes)
