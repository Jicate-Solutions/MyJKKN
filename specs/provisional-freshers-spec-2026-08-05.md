# Provisional Freshers — Discovery & Specification

**Date:** 2026-08-05
**Status:** Discovery complete · specification proposed · **no code written, no migration applied, no production write performed**
**Scope ceiling for the session that produced this:** documents and PRs only, zero production writes
**Production DB read:** Supabase ref `kvizhngldtiuufknvehv` (read-only, SELECT only)
**Production code read:** `jicate/main` via `git show` / `git ls-tree` (repo root sits on a foreign branch and was never used as the source of truth)

---

## 0. The headline, before the evidence

Three of the four locked decisions are **cheaper than they look**, and one is **more expensive than it looks**.

| # | Locked decision | Reality found | Verdict |
|---|---|---|---|
| 1 | Attendance markable from day one | **Blocked today.** `fn_attendance_roster` hard-codes `lifecycle_status = 'active'`. Zero attendance rows exist for any provisional learner, all-time. | **Needs work** — 3 roster paths |
| 2 | On lapse, keep on roster and flag | Nothing removes anyone today; there is no window and no lapse concept at all. | **Needs work** — but purely additive |
| 3 | Attendance counts toward the 75% rule | **Already satisfied.** No eligibility path filters on `lifecycle_status` — verified across 5 computing paths, live and in repo. | **NO CODE REQUIRED** |
| 4 | No auto-activation trigger | **Already satisfied.** `set_learner_activated_at` only stamps a timestamp after a status change; promotion runs solely through `evaluate_learner_status_after_payment`. | **NO CODE REQUIRED — and nothing proposed here touches it** |

And the recommendation that follows from the discovery:

> **Do NOT add a `provisional` value to the `lifecycle_status` enum.** The platform already has a live, proven, default-deny mechanism for exactly this population — the `induction_only` **access tier** — which already names `reserved` and `admitted` as its members. Provisional-fresher capability should be a **second access tier**, not a fifteenth lifecycle status. Rationale and the rejected alternatives are in §7.

The biggest surprise is in §4.6: **466 of the 992 provisional learners have no `section_id`**. Lifting the status filter would still leave ~47% of them invisible to the marking screen, because the roster is keyed on section. That is a data-readiness blocker, not a code blocker, and no locked decision currently covers it.

---

## 1. Mandatory production-code sweep

This project's non-negotiable rule: a plan without the sweep is invalid. Raw output follows.

### 1.1 `git ls-tree jicate/main -r --name-only | grep -iE "(provisional|lifecycle_status|admission_year|eligibilit|exam.?eligib|attendance.?eligib)"`

```
__tests__/lib/services/pde-tier-eligibility-service.test.ts
app/(routes)/campus-living/my-hostel/premium/_components/tier-eligibility-card.tsx
app/(routes)/campus-living/settings/allocations/_components/eligibility-resolver-preview.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/data-table.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/eligibility-detail-dialog.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/eligibility-filters.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/format.ts
app/(routes)/campus-living/settings/program-eligibility/_components/quota-multi-select.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/room-eligibility-form-dialog.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/room-rule-detail-dialog.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/room-rules-filters.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/room-rules-table.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/row-actions.tsx
app/(routes)/campus-living/settings/program-eligibility/_components/sync-categories-button.tsx
app/(routes)/campus-living/settings/program-eligibility/page.tsx
app/(routes)/internships/policy/eligibility/page.tsx
app/api/cron/hr-retirement-eligibility-detector/route.ts
app/api/pde/tier-eligibility/route.ts
docs/superpowers/plans/2026-06-06-campus-living-fee-aware-program-eligibility.md
docs/superpowers/plans/2026-06-15-campus-living-multi-quota-category-eligibility.md
docs/superpowers/specs/2026-06-06-campus-living-fee-aware-program-eligibility-design.md
docs/superpowers/specs/2026-06-15-campus-living-multi-quota-category-eligibility-design.md
hooks/academic/use-eligibility-thresholds.ts
hooks/campus-living/use-allocation-eligibility.ts
hooks/campus-living/use-program-eligibility.ts
hooks/campus-living/use-room-eligibility.ts
lib/services/campus-living/program-eligibility-service.ts
lib/services/campus-living/room-eligibility-service.ts
lib/services/events/tournament/eligibility.ts
lib/services/pde-tier-eligibility-service.ts
supabase/migrations/20260421_admission_years.sql
supabase/migrations/20260423_learners_profiles_admission_year_id_shadow_fk.sql
supabase/migrations/20260424_backfill_admission_year_id_active_graduated.sql
supabase/migrations/20260424_fix_seat_analytics_admission_years.sql
supabase/migrations/20260502000004_materialize_historical_admission_years_and_backfill.sql
supabase/migrations/20260502000011_drop_learners_profiles_admission_year_integer.sql
supabase/migrations/20260507100009_create_admission_year_quota_seats.sql
supabase/migrations/20260508140001_lifecycle_status_add_enquiry.sql
supabase/migrations/20260509063308_drop_enquiry_from_lifecycle_status_enum.sql
supabase/migrations/20260512140001_l_campaign_category_program_admission_year.sql
supabase/migrations/20260516143000_validate_learner_admission_year_scope_tolerate_cascade.sql
supabase/migrations/20260520120000_realign_lifecycle_statuses_enum.sql
supabase/migrations/20260520120100_realign_lifecycle_statuses_data_and_seed.sql
supabase/migrations/20260521100000_backfill_admission_year_id_2026_cohort.sql
supabase/migrations/2026052901000_program_category_eligibility.sql
supabase/migrations/20260531000007_hostel_room_eligibility_rules.sql
supabase/migrations/20260605150000_admission_year_backfill_program_seats.sql
supabase/migrations/20260605150010_admission_year_collapse_repoint.sql
supabase/migrations/20260605150020_admission_year_schema_ddl.sql
supabase/migrations/20260605150030_admission_year_rpcs.sql
supabase/migrations/20260605150040_admission_year_name_to_year_range_format.sql
supabase/migrations/20260605150050_backfill_admission_leads_current_admission_year.sql
supabase/migrations/20260605150060_capture_gate_entry_lead_add_admission_year.sql
supabase/migrations/20260605160000_fn_learner_year_of_study_repoint_admission_year.sql
supabase/migrations/20260606160000_fee_aware_eligibility_schema.sql
supabase/migrations/20260606160100_fee_aware_eligibility_functions.sql
supabase/migrations/20260606160400_program_eligibility_single_table.sql
supabase/migrations/20260608140000_v_learner_hostelites_expose_lifecycle_status.sql
supabase/migrations/20260610220000_upgrade_options_bypass_eligibility.sql
supabase/migrations/20260612180000_hostel_program_eligibility_hostel_type_both.sql
supabase/migrations/20260615120000_hostel_program_eligibility_multi_quota.sql
supabase/migrations/20260615130000_hostel_eligibility_both_gender_translation.sql
supabase/migrations/20260615230000_audit_program_eligibility_reverts.sql
supabase/migrations/20260617220000_backfill_inprogress_learners_current_admission_year.sql
supabase/migrations/20260619160000_transfer_enquiry_remap_admission_year.sql
supabase/migrations/20260629110000_induction_admission_year_group_enroll.sql
supabase/migrations/20260706143000_induction_peer_mentor_eligibility.sql
supabase/migrations/20260718211000_bug_feedback_humanpath_eligibility.sql
supabase/migrations/20260725_admission_years_is_current_flag.sql
supabase/migrations/20260726193000_exam_eligibility_thresholds_policy.sql
supabase/migrations/20260727060000_exam_eligibility_manage_permission.sql
supabase/migrations/20260729180000_backfill_historical_admission_years_2020_2025.sql
supabase/migrations/20260810140000_hostel_eligibility_admission_year_fee_anchor.sql
types/program-eligibility.ts
types/room-eligibility.ts
```

**Reading:** the word "provisional" appears **nowhere** in production code. Two migrations show the enum has been edited before and is therefore editable in principle (`20260508140001_lifecycle_status_add_enquiry.sql` added a value; `20260509063308_drop_enquiry_from_lifecycle_status_enum.sql` removed one the next day; `20260520120000_realign_lifecycle_statuses_enum.sql` realigned the whole set). That churn is itself an argument against adding a sixteenth value casually — see §7.

### 1.2 `gh pr list --search "provisional in:title"`

```
2253	feat(rcltp): provisional scoring engine + live principal dashboard (Phases 1–2)	feat/rcltp-provisional-scoring-engine	MERGED	2026-07-22T06:36:56Z
```

Unrelated — RCLTP scoring, not learner lifecycle. **No prior provisional-fresher work exists.**

### 1.3 `gh pr list --search "eligibility in:title"`

```
2683	feat(attendance): approved tournament days must not cost a learner their exam eligibility	feat/sports-attendance-protection	MERGED	2026-07-31T02:52:07Z
2477	feat(academic): exam eligibility thresholds become one config row; practicals counted retroactively	feat/exam-eligibility-threshold-config	MERGED	2026-07-26T16:11:29Z
2171	fix(bug-reports): reporter-feedback eligibility learns the human path (walk-2 lesson)	fix/bug-feedback-humanpath	MERGED	2026-07-18T14:13:52Z
2502	feat(academic): only named holders may change the eligibility thresholds; explain the practicals correction to learners	feat/exam-eligibility-manage-permission	MERGED	2026-07-27T00:47:40Z
1992	feat(ai-lanes): translate backlog + spine-regen Max eligibility (voice-exception mandate)	feat/maxlane-translate-regen	MERGED	2026-07-12T07:15:43Z
2029	feat(academic): Exam IA Audit — CIA provenance + eligibility cross-check per program per exam	feat/exam-ia-audit	MERGED	2026-07-13T08:32:17Z
1834	feat(induction): Senior Peer Mentor P2 — 3rd-year eligibility + training program & gate	feat/spm-p2-eligibility	MERGED	2026-07-06T08:47:51Z
1994	feat(curriculum): lesson-spine regen as a real async task — task type + button + Max-lane eligibility	feat/lesson-spine-regen-task	MERGED	2026-07-12T07:31:39Z
1683	feat(campus-living): unified Allocations & Eligibility config page (super-admin, reads engine live)	feat/campus-living-allocations-config	MERGED	2026-06-30T02:24:46Z
1368	feat(campus-living): fee-condition program eligibility + Sync to Learner Profiles button	feat/campus-living-fee-conditions	MERGED	2026-06-12T09:57:20Z
1270	feat(campus-living): auto-allocation batch — semester column + per-resident eligibility modal	feat/campus-living/allocation-eligibility-details	MERGED	2026-06-09T18:27:08Z
1122	feat(campus-living): PR γ — allocation eligibility filter + upfront fee preview	feat/campus-living-allocation-eligibility-filter	MERGED	2026-05-29T08:18:52Z
1116	feat(campus-living): PR β — per-program eligibility matrix (institution default + override)	feat/campus-living-program-eligibility	MERGED	2026-05-29T04:25:42Z
993	feat(pde/tier2): HOD-escalation + course-tier eligibility services (T2.2 + T2.3)	feat/pde-tier2-hod-and-tier-gates	MERGED	2026-05-19T05:21:41Z
1031	fix(cdc): A1 trigger — filter eligibility by lifecycle_status (R5.B / B3.3.1)	fix/cdc-drive-notification-lifecycle-filter	MERGED	2026-05-19T20:48:01Z
```

**Reading:** PRs #2477, #2502 and #2683 are the live exam-eligibility lineage and are traced in §5. PR #1031 is the precedent for *adding* a `lifecycle_status` filter to a feature (CDC drive notifications) — i.e. the platform's habit is to add these filters, which is why 88 of them now exist (§6).

### 1.4 Sibling worktrees — **reconciliation finding**

```
git worktree list  (abridged)
/Users/omm/PROJECTS/MyJKKN/.claude/worktrees/agent-a80c5b9793b2cc0f7  884f7b474d [feat/fresher-attendance-readiness]
```

A **parallel workstream already exists on adjacent ground.** `git diff --stat jicate/main...feat/fresher-attendance-readiness`:

```
 .../_components/intake-readiness-panel.tsx         | 424 +++++++++++++++++++++
 .../academic/attendance/dashboard/page.tsx         |  56 ++-
 hooks/academic/use-attendance-dashboard.ts         |  66 ++++
 .../academic/attendance-dashboard-service.ts       | 105 ++-
 supabase/SQL_FILE_INDEX.md                         |  13 +
 ...60808120000_fn_attendance_fresher_readiness.sql | 187 +++++++++
 types/attendance-dashboard.ts                      |  43 +++
 7 files changed, 890 insertions(+), 4 deletions(-)
```

**The branch is unmerged, but its migration's function is already live in production.** `fn_attendance_fresher_readiness(integer, uuid, uuid)` exists in `pg_proc` on ref `kvizhngldtiuufknvehv` today (§4.7). Whoever picks up this specification must reconcile against that branch before writing code, and must not assume the repo's merge state describes the database.

Crucially, that live function **also** filters `lp.lifecycle_status = 'active'` — so the "fresher readiness" dashboard built to watch the incoming intake is structurally blind to all 992 provisional freshers it appears to be about. That is worth raising with its author.

---

## 2. Part 1 — What actually happens to a non-active learner today

### 2.1 `lifecycle_status` is an ENUM, not a CHECK constraint

The brief asked for "the CHECK constraint or enum definition". It is an enum. A constraint query returns empty:

```sql
SELECT c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='public' AND t.relname='learners_profiles'
  AND pg_get_constraintdef(c.oid) ILIKE '%lifecycle%';
-- []   (zero rows — there is no CHECK constraint)
```

The real definition — type `public.lifecycle_status`, **15 labels**:

| # | label | | # | label |
|---|---|---|---|---|
| 1 | `admitted` | | 9 | `exited` |
| 2 | `pending` | | 10 | `graduated` |
| 3 | `approved` | | 11 | `alumni` |
| 4 | `account` | | 12 | `enquiry` |
| 5 | `rejected` | | 13 | `enquiry_submitted` |
| 6 | `waitlisted` | | 14 | `reserved` |
| 7 | `active` | | 15 | `withdrawal_pending` |
| 8 | `inactive` | | | |

**This matters for the design.** A Postgres enum cannot have a value removed, and `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block in older PG versions and cannot be rolled back. The repo already shows one add-then-drop cycle (`20260508140001` → `20260509063308`) which required recreating the type. Adding `provisional` is a one-way door.

### 2.2 Live population by status

```sql
SELECT lifecycle_status, count(*) FROM learners_profiles GROUP BY 1 ORDER BY 2 DESC;
```

| lifecycle_status | n |
|---|---|
| active | 4,368 |
| graduated | 1,106 |
| **reserved** | **870** |
| enquiry_submitted | 362 |
| inactive | 180 |
| **admitted** | **122** |
| account | 73 |
| rejected | 54 |
| enquiry | 42 |
| approved | 4 |
| exited | 3 |
| withdrawal_pending | 2 |
| waitlisted | 1 |

Note `pending` and `alumni` exist in the enum but hold **zero** rows.

### 2.3 The provisional cohort — 992 across 7 institutions, not 988 across 6

```sql
SELECT i.name AS college, lp.lifecycle_status, count(*)
FROM learners_profiles lp
LEFT JOIN institutions i ON i.id = lp.institution_id
LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
WHERE lp.lifecycle_status::text IN ('reserved','admitted')
  AND COALESCE(ay.is_current,false) = true
GROUP BY 1,2 ORDER BY 3 DESC;
```

| College | reserved | admitted | total |
|---|---:|---:|---:|
| JKKN College of Arts and Science (Self) | 450 | 29 | 479 |
| JKKN College of Engineering and Technology | 202 | 3 | 205 |
| JKKN College of Pharmacy | 139 | 29 | 168 |
| JKKN College of Nursing and Research | 52 | 29 | 81 |
| JKKN College of Allied Health Sciences | 26 | 17 | 43 |
| **Nattraja Vidhyalya CBSE** | 0 | 15 | **15** |
| JKKN College of Education | 1 | 0 | 1 |
| **Total** | **870** | **122** | **992** |

Two corrections to the brief's framing, both material:

1. **992, not 988.** Live counts drift; nine panes write to this database. Treat 992 as "as at 2026-08-05" and never as a fixture.
2. **Seven institutions, and one is a school.** `Nattraja Vidhyalya CBSE` contributes 15 `admitted` learners. School learners are governed by different attendance and examination norms than college learners, and the 75% university exam-eligibility rule does not apply to a CBSE school class. **Any provisional-window design must decide explicitly whether the school is in or out of scope.** This is not covered by the four locked decisions.

Also note every `reserved` and `admitted` learner in the database is current-intake — the global counts (870 / 122) equal the current-intake counts exactly. There is no historical backlog at these two statuses.

### 2.4 `evaluate_learner_status_after_payment` — what it gates on and what it sets

Read in full from `pg_proc`. Signature: `evaluate_learner_status_after_payment(uuid)`. It is the **only** promotion path, and it is money-gated end to end.

**It refuses to act on anything but two statuses:**

```plpgsql
IF v_current_status::text NOT IN ('account', 'reserved') THEN
  RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
    'reason', 'no_op_for_status', 'current_status', v_current_status::text);
END IF;
```

**Note the consequence for decision 4:** a learner at `admitted` is a **no-op** for this function. The 122 `admitted` learners cannot be promoted by it at all. Promotion to `active` for them runs through some other path (manual edit, bulk tooling) — this specification does not establish which, and §9 records that as undetermined.

**Stage A gate** (`account` → the universal-paid target status): every existing `application_fee` + `university_fee` bill must have at least a partial payment.

```plpgsql
SELECT
  count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')),
  count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')
      AND (b.status::text = 'paid'
           OR (b.final_amount - COALESCE(b.balance_amount, b.final_amount)) > 0)),
  ...
INTO v_gate_bills, v_gate_paid, v_app_paid, v_universals_paid
FROM public.billing_student_bills b
JOIN public.billing_categories bc ON bc.id = b.item_category_id
WHERE b.student_id = p_learner_id
  AND b.status::text <> 'superseded';

IF v_current_status::text = 'account' AND v_gate_bills > 0 AND v_gate_paid = v_gate_bills THEN
```

The target is **not hardcoded** — it is read from config:

```plpgsql
SELECT s.code INTO v_universal_target
FROM public.admission_statuses s
WHERE s.scope = 'learner' AND s.is_active = true
  AND s.auto_promote_when_universal_paid = true
LIMIT 1;
```

**Stage B gate** (`account`/`reserved` → threshold status, i.e. `active`): a percentage-of-fees-paid threshold, also read from config:

```plpgsql
SELECT s.code, s.fee_paid_threshold_percent
  INTO v_target_code, v_threshold
FROM public.admission_statuses s
WHERE s.scope = 'learner' AND s.is_active = true
  AND s.fee_paid_threshold_percent IS NOT NULL
  AND s.gates_login = false
  AND s.auto_promote_when_universal_paid = false
  AND v_paid_pct >= s.fee_paid_threshold_percent
ORDER BY s.fee_paid_threshold_percent DESC
LIMIT 1;
```

Every promotion writes an audit row to `learners_profile_status_history` with `reason_code` `auto_universal_paid` or `auto_threshold`, plus `paid_pct_at_change` and `threshold_at_change`.

> ⚠️ **A live subtlety that constrains any new status.** Stage B's selector requires `gates_login = false`. Today `active` is the only learner status with `gates_login = true` — which means **`active` cannot satisfy Stage B's own WHERE clause**. Yet `active` carries `fee_paid_threshold_percent = 60.00`. Whether Stage B can currently promote anyone to `active` at all should be verified before this function is relied upon as "the promotion path". Recorded in §9 as undetermined — it is a read-only observation, not something this session tested by writing.

### 2.5 `admission_statuses` — the config table behind the enum

The enum labels are shadowed by a config table that carries their **behaviour**. Learner-scope rows (26 lead-scope rows omitted):

| code | sort | terminal | seat_filled | fee_paid_threshold_% | gates_login | auto_promote_when_universal_paid |
|---|---:|---|---|---:|---|---|
| enquiry | 1 | | | | | |
| enquiry_submitted | 2 | | | | | |
| pending | 3 | | | | | |
| approved | 4 | | | | | |
| account | 5 | | | | | |
| **reserved** | 6 | | | | | **true** |
| **admitted** | 7 | | | **30.00** | | |
| waitlisted | 8 | | | | | |
| rejected | 9 | ✔ | | | | |
| **active** | 10 | | **✔** | **60.00** | **✔** | |
| withdrawal_pending | 11 | | | | | |
| inactive | 11 | | | | | |
| exited | 12 | ✔ | | | | |
| graduated | 13 | ✔ | | | | |
| alumni | 14 | ✔ | | | | |

This is the platform's "every policy decision = a config row" pattern, and it is the natural home for provisional behaviour flags (§7.3).

**A defect worth reporting separately:** `gates_login` is **not enforced anywhere at runtime**. Its only appearances in production code are the settings form, the settings table cell, and the Zod type:

```
app/(routes)/admission/settings/statuses/_components/status-form-dialog.tsx:40, :184
app/(routes)/admission/settings/statuses/_components/statuses-data-table.tsx:81
types/admission-status.ts:19, :40, :46, :47
types/supabase.ts:8228, 8248, 8268
```

The actual login gate is a **hardcoded list in two places** (§2.8). So a Director toggling `gates_login` in the admin UI today would change nothing. Out of scope for this specification; flagged because a provisional design that assumed `gates_login` works would be built on sand.

### 2.6 Can attendance be marked for a provisional learner today? **No.**

Three roster paths feed the marking screen, and **all three** filter to `active`.

**Path 1 — the RPC, which is the primary path.** `fn_attendance_roster`, current definition `supabase/migrations/20260723140000_attendance_roster_section_authoritative.sql:80-82`:

```sql
  FROM public.learners_profiles lp
  WHERE lp.lifecycle_status = 'active'
    AND lp.institution_id = p_institution_id
```

Called from `lib/services/academic/attendance-roster-service.ts:651`:

```
lib/services/academic/attendance-roster-service.ts:636:  // Updated: 2026-06-19 (FIX 1) - Route roster reads through fn_attendance_roster,
lib/services/academic/attendance-roster-service.ts:651:  const { data, error } = await (this.supabase as any).rpc('fn_attendance_roster', {
```

**Path 2 —** `lib/services/academic/attendance-roster-service.ts:434`: `.eq('lifecycle_status', 'active')`
**Path 3 —** `lib/services/academic/attendance-service.ts:800`: `.eq('lifecycle_status', 'active')`

```
lib/services/academic/attendance-roster-service.ts:431:          lifecycle_status
lib/services/academic/attendance-roster-service.ts:434:        .eq('lifecycle_status', 'active')
lib/services/academic/attendance-service.ts:793:          lifecycle_status,
lib/services/academic/attendance-service.ts:800:        .eq('lifecycle_status', 'active')
```

### 2.7 Corroboration against real data — the filter is not merely present, it is effective

Code inspection alone cannot prove nobody has ever been marked. `student_attendance` has **no learner foreign key** — attendance is a JSONB blob:

```
student_attendance columns: id, attendance_date, institution_id, created_at, updated_at,
  timetable_id, section_id, attendance_data (jsonb), semester_id, program_id,
  department_id, degree_id, academic_year_id, period_slot_id, section_ids (array)
```

Shape: `{ "<timetable/slot uuid>": { "students": [ {"student_id": "...", "status": "Present", "section_id": "...", "marked_at": "..."} ], ... } }`

Unnesting the blob across **all history** and joining to current status:

```sql
WITH marked AS (
  SELECT DISTINCT (stu->>'student_id')::uuid AS learner_id
  FROM student_attendance sa,
       LATERAL jsonb_each(sa.attendance_data) AS slot(k, v),
       LATERAL jsonb_array_elements(COALESCE(v->'students','[]'::jsonb)) AS stu
  WHERE jsonb_typeof(v->'students') = 'array'
)
SELECT lp.lifecycle_status, count(*) AS learners_with_attendance_all_time
FROM marked m JOIN learners_profiles lp ON lp.id = m.learner_id
GROUP BY 1 ORDER BY 2 DESC;
```

| lifecycle_status | learners with any attendance, all time |
|---|---:|
| active | 3,738 |
| graduated | 440 |
| inactive | 89 |
| exited | 2 |
| **reserved** | **0** |
| **admitted** | **0** |
| **account** | **0** |
| **approved** | **0** |
| **waitlisted** | **0** |

**Conclusion: the capability does not partly exist. It is zero.** Not one of the 992 provisional learners has ever had a single attendance mark, across the entire history of the table. The `graduated` / `inactive` / `exited` rows are consistent with learners marked while `active` who later moved to a downstream status — the blob retains the record because nothing at read time removes it.

> **Honest caveat on that last inference.** I attempted to prove the "was active when marked" hypothesis via `learners_profile_status_history` and got `were_active_before = 0` for all 531 non-active learners with attendance. That does **not** refute the hypothesis — it shows the history table only records transitions made through `evaluate_learner_status_after_payment`, so manual and bulk status changes leave no trace. The hypothesis is unproven either way. What is proven, and is what matters, is the zero for reserved/admitted.

### 2.8 Two further locks beyond the roster

**Lock 2 — a provisional learner cannot view their own attendance.** The single RLS policy in the entire database that gates on `lifecycle_status`:

```sql
-- pg_policies: student_attendance / student_attendance_select_own_student / SELECT
((( SELECT get_current_user_role()) = 'student'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'student'::text)
    AND (p.learner_id IN ( SELECT learners_profiles.id
           FROM learners_profiles
          WHERE ((learners_profiles.section_id = student_attendance.section_id)
            AND (learners_profiles.lifecycle_status = ANY
                 (ARRAY['active'::lifecycle_status, 'graduated'::lifecycle_status])))))))))
```

Only `active` and `graduated` may read their own attendance. **RLS denial is silent** — it returns zero rows with `error = null`, indistinguishable from "no data". A provisional learner opening an attendance page would see an empty screen with no explanation.

**Lock 3 — the login/profile gate.** Trigger function `sync_learner_status_to_profile` mirrors status into `profiles.is_active`:

```plpgsql
-- Learners who can log in: active OR graduated.
-- Mirrors StudentValidationService.validateStudentAccess allow-list.
should_be_active := (NEW.lifecycle_status IN ('active', 'graduated'));
```

and the TypeScript half, `lib/services/auth/student-validation-service.ts:131`:

```ts
const fullAccessStatuses: LifecycleStatus[] = ['active', 'graduated'];
```

These are the hardcoded lists that `gates_login` was presumably meant to drive (§2.5).

### 2.9 RLS on `learners_profiles` does **not** exclude non-active learners

All five policies on `learners_profiles` gate on permission + institution scope only — none mention `lifecycle_status`:

| policy | cmd | gates on |
|---|---|---|
| `learners_profiles_select_policy` | SELECT | `is_super_admin()` OR (institution scope AND `user_has_permission('learners.admissions.view')`) |
| `learners_profiles_insert_policy` | INSERT | permission/scope |
| `learners_profiles_update_policy` | UPDATE | permission/scope |
| `learners_profiles_delete_policy` | DELETE | permission/scope |
| `students_view_own_learner_profile` | SELECT | `profiles.learner_id = learners_profiles.id AND role='student'` |

Same for the 13 policies on `student_attendance` — only `student_attendance_select_own_student` (§2.8) touches lifecycle. **So a team member with the right permission can already see provisional learners in the database.** The invisibility is entirely a query-filter phenomenon in application code and RPCs, not an RLS phenomenon. That is good news: it means the fix is in queries, and no policy rewrite is needed for team-member-facing surfaces.

---

## 3. Decision 4 is already satisfied, and nothing here touches it

`set_learner_activated_at`, read live:

```plpgsql
BEGIN
  IF NEW.lifecycle_status = 'active'
     AND OLD.lifecycle_status IS DISTINCT FROM 'active'
     AND NEW.activated_at IS NULL THEN
    NEW.activated_at := now();
  END IF;
  RETURN NEW;
END;
```

It reacts to a status change; it never causes one. Confirmed exactly as the brief states.

**Design constraint carried forward:** nothing in §7 or §8 writes to `learners_profiles.lifecycle_status`, adds a trigger that could, or introduces any path to `active` that bypasses `evaluate_learner_status_after_payment`. The ₹6.26 crore gate is untouched. The provisional tier is deliberately specified as a **capability overlay on the existing status**, which is the design property that makes bypassing structurally impossible rather than merely prohibited.

---

## 4. What the discovery adds that the brief did not anticipate

### 4.1–4.5 (see §2)

### 4.6 **The section gap — the biggest surprise**

The roster is keyed on `section_id`. A learner with no section cannot appear on any section's marking screen regardless of status.

```sql
SELECT lp.lifecycle_status, count(*) AS total,
       count(lp.section_id) AS has_section, count(lp.semester_id) AS has_semester,
       count(lp.program_id) AS has_program, count(lp.degree_id) AS has_degree
FROM learners_profiles lp
LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
WHERE lp.lifecycle_status::text IN ('reserved','admitted')
  AND COALESCE(ay.is_current,false)=true
GROUP BY 1;
```

| status | total | has_section | has_semester | has_program | has_degree |
|---|---:|---:|---:|---:|---:|
| reserved | 870 | **439** | 866 | 870 | 870 |
| admitted | 122 | **87** | 107 | 107 | 107 |
| **total** | **992** | **526** | **973** | **977** | **977** |

**466 of 992 (47.0%) have no `section_id`.** Programme and degree are nearly complete; section is the gap. Lifting the status filter alone therefore delivers attendance for **526** learners, not 992 — and the remaining 466 would fail silently, appearing simply as "not on the roster", which is exactly the invisibility the initiative exists to end.

This needs a decision that the four locked ones do not cover. Options, not recommended here because it is a business call: section-assign the 466 as part of provisional onboarding; or allow a section-less provisional learner onto a programme+semester roster (the RPC's no-section path already supports programme/semester scoping); or accept partial coverage in phase 1 and report the gap.

### 4.7 The fresher-readiness function is blind to freshers

`fn_attendance_fresher_readiness(integer, uuid, uuid)` — **live in production now**, though its branch is unmerged (§1.4). Its population CTE:

```plpgsql
  fresher AS (
    -- THE INVERSION: the row set starts here, at learners, not at timetables.
    SELECT lp.institution_id AS inst_id, lp.section_id AS sec_id,
           count(*)::bigint AS learner_count
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = 'active'
      AND lp.section_id IS NOT NULL
      AND lp.institution_id IN (SELECT a.id FROM accessible a)
      AND lp.admission_year_id IN (
            SELECT ay.id FROM public.admission_years ay WHERE ay.is_current = true)
```

`lifecycle_status = 'active'` **AND** `section_id IS NOT NULL` — the two exact filters that exclude the provisional cohort. A dashboard built to answer "is the incoming intake being marked?" cannot see the 992 learners who are the problem.

---

## 5. Decision 3 — exam eligibility **already ignores `lifecycle_status`**

This is the most valuable finding in the document: **decision 3 requires no code at all.**

### 5.1 Where the threshold lives

Two `platform_policies` rows, `scope_type = 'global'`, `scope_id = NULL`, seeded by `supabase/migrations/20260726193000_exam_eligibility_thresholds_policy.sql` (PR #2477). Read live:

| policy_key | scope_type | value | data_type | ui_category |
|---|---|---:|---|---|
| `academic.exam_eligibility.attendance_pct` | global | **75** | number | Exam Eligibility |
| `academic.exam_eligibility.condonation_floor_pct` | global | **65** | number | Exam Eligibility |

Three-band rule, from the migration header (`:18-21`):

```
--   pct >= attendance_pct                          -> eligible
--   condonation_floor_pct <= pct < attendance_pct  -> needs condonation
--   pct <  condonation_floor_pct                   -> at risk of ineligibility
```

Keys in `lib/policies/keys.ts:353-354`; code fallbacks that must stay in sync in `lib/services/exam-audit/compute.ts:331-332`. Write access is narrowed to `academic.exam_eligibility.manage` by `supabase/migrations/20260727060000_exam_eligibility_manage_permission.sql:39-56` (PR #2502).

`fn_get_policy` resolves `user > institution > role > global` (`lib/policies/get-policy.ts:18`), so an **institution**-scoped override already works with zero code change. A **programme**-scoped override does not exist — see §8.

### 5.2 The five computing paths, and the answer for each

| # | Path | Kind | Filters `lifecycle_status`? |
|---|---|---|---|
| 1 | `fn_exam_audit_attendance(uuid[],date,date)` — Registrar's authoritative figure | PG function | **No** |
| 2 | `fn_my_running_attendance()` → `fn_vsr_attendance_core(uuid,uuid)` — learner's own card | PG function | **No** |
| 3 | `fn_attendance_protected_days(_core)` — excused-day credit | PG function | **No** |
| 4 | `mv_learner_attendance_summary` — learner-360 badge (14-day window) | matview | **No** |
| 5 | `fn_scf_effective_attendance` — advisory only, dark by default | PG function | **No** |

Verified two independent ways.

**(a) Live database, my own query** — the authoritative path carries no reference at all:

```sql
SELECT p.oid::regprocedure::text AS sig,
       (p.prosrc ILIKE '%lifecycle_status%') AS mentions_lifecycle
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_exam_audit_attendance';
```
→ `fn_exam_audit_attendance(uuid[],date,date) | mentions_lifecycle = false`

And no eligibility function exists under any `%eligib%` name that touches lifecycle:

```sql
SELECT p.proname, (p.prosrc ILIKE '%lifecycle_status%') AS mentions_lifecycle
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname ILIKE '%eligib%' OR p.prosrc ILIKE '%exam_eligibility.attendance_pct%');
```
→ 5 rows (`fn_learner_eligible_for_room`, `fn_learner_strictly_eligible_for_room`, `fn_room_has_eligibility_rule`, `fn_set_referral_eligibility`, `tms_staff_boarding_eligibility`) — **all campus-living/HR, all `mentions_lifecycle = false`.** No exam-eligibility function exists in the database at all; the bucketing is TypeScript.

**(b) Repo trace (independent sub-investigation).** Population selection of `fn_exam_audit_attendance`, verbatim from `supabase/migrations/20260731223500_attendance_protection_approved_onduty.sql:372-393`:

```sql
  RETURN QUERY
  WITH periods AS (
    SELECT CASE WHEN (e.val->>'course_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (e.val->>'course_id')::uuid END AS cid,
           sa.attendance_date AS adate, e.val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = ANY(v_ids)
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND sa.attendance_date >= p_from
      AND sa.attendance_date <= v_to
  ),
  studs AS (
    SELECT p.cid, p.adate, (s->>'student_id')::uuid AS sid,
           CASE WHEN lower(s->>'status') = 'present' THEN 1 ELSE 0 END AS is_present
    FROM periods p,
         LATERAL jsonb_array_elements(p.period->'students') AS s
    WHERE p.period ? 'students' AND COALESCE(s->>'student_id','') <> ''
  ),
```

**`learners_profiles` is never joined.** The only `FROM`/`JOIN` targets in the whole function are `student_attendance`, `fn_attendance_protected_days`, and `courses`. The population predicates are exactly three: institution membership, JSONB well-formedness, date window. Whoever's UUID sits in the blob is counted.

### 5.3 What this means

**Attendance marked for a provisional learner will count toward their 75% automatically, with no eligibility code change.** Decision 3 is a consequence of decision 1, not separate work.

The corollary is equally important and is the reason decision 2 (never remove them) is well-judged: because eligibility reads the blob and the blob is never pruned, **attendance already survives a status change**. A learner who is marked provisionally and then never pays keeps every day they attended. Conversely, nothing needs to "retro-credit" them later.

Numerator/denominator, for the record (`20260731223500_...:404-409`): numerator = `present + protected` (protected = absent days covered by an approved tournament or approved full-day on-duty, PR #2683); denominator = `COUNT(*)` of blob student-elements, i.e. **marked** sessions, not scheduled or enrolled ones.

> **A consequence the Director should see, because it cuts against the initiative's intent.** The denominator counts only sessions the learner was *listed in*. A provisional learner switched on mid-term gets a denominator that starts at switch-on — so their percentage reflects only the period they were visible, and the sessions they physically attended *before* the switch are permanently lost. "Count it, they were really there" is fully honoured going forward, and cannot be honoured backwards, because no record of those days exists in any form. The earlier the provisional window opens, the smaller this loss. **There is no backfill available** — the data was never captured.

> **A second consequence, in the other direction.** Since eligibility does not filter status, a provisional learner who never pays and is eventually exited still appears in the Registrar's exam audit with a computed percentage, for as long as their blob rows sit in the window. Whether they should appear there is a reporting decision (§7.5), not an eligibility-computation one.

---

## 6. Counted enumeration of affected surfaces

Counted from `jicate/main` and the live catalog — **not estimated**. Every count is reproducible from §10.

### 6.1 Totals

| Layer | Metric | Count |
|---|---|---:|
| Code | TS/TSX files referencing `lifecycle_status` (excl. generated `types/supabase.ts`) | **155** |
| Code | TS/TSX files that **filter** on `lifecycle_status` | **51** |
| Code | ↳ line-sites using `.in('lifecycle_status', [...])` | 31 (across 19 files) |
| Code | ↳ line-sites using `.neq`/`.not` on `lifecycle_status` | 3 |
| DB | functions in `public` whose body mentions `lifecycle_status` | **93** |
| DB | functions that **filter to `'active'`** | **36** |
| DB | views/matviews mentioning `lifecycle_status` | 4 (**0** filter to `'active'`) |
| DB | RLS policies gating on `lifecycle_status` | **1** |
| | **Total filtering surfaces (51 code + 36 DB fn + 1 RLS)** | **88** |

The 4 views (`v_learner_hostelites`, `v_learner_hostelites_scoped`, `vw_learner_payment_progress`, `vw_learners_profile_fee_backfill_status`) **expose** the column but do not filter on it, so they need no change.

### 6.2 The 36 database functions filtering to `'active'`

```
ai_rpc_attendance_defaulters              fn_ai_pulse_scored_learners        fn_institution_comparison
ai_rpc_hierarchy_summary                  fn_apply_hostel_fee_categories_bulk get_geography_analytics
ai_rpc_kpi_summary                        fn_attendance_dashboard_section_stats get_learner_participation_stats
ai_rpc_students                           fn_attendance_fresher_readiness    get_learners_missing_profiles
ai_rpc_students_by_department             fn_attendance_roster               get_lti_roster
ai_rpc_students_summary                   fn_auto_allocate_candidates        get_not_participated_by_institution
compute_learner_contribution_score        fn_auto_allocate_classic           get_not_participated_learners
compute_learner_risk_assessment           fn_auto_allocate_preview           get_source_analytics
compute_student_engagement_scores         fn_cdc_emit_drive_email_notification set_learner_activated_at
fn_ai_pulse_domain_starter_candidates     fn_cdc_emit_drive_notification     sync_learner_status_to_profile
fn_ai_pulse_leaderboard_dept              fn_compute_input_peer_benchmark
fn_hostel_unallocated_candidates          fn_hr_refresh_naac_evidence
fn_preview_hostel_fee_categories          fn_teaching_cohort_sync
```

### 6.3 The 51 code files that filter, by area

| Area | files |
|---|---:|
| `lib/services/**` | 19 |
| `app/api/**` | 17 |
| `app/(routes)/learners/**` | 7 |
| `lib/mcp/tools/**` | 3 |
| `hooks/`, `components/`, `app/auth/`, `admission/`, `rcltp/` | 5 |

Full list in §10.6.

### 6.4 **The blast radius that actually matters — 8 surfaces, not 88**

88 is the number of places that *could* be touched. Changing all 88 would be wrong: most of them filter to `active` for good reasons that the four locked decisions do not disturb (hostel auto-allocation should not allocate rooms to unpaid learners; CDC placement pickers should not offer jobs to them; NAAC evidence counts should not inflate).

The surfaces that **must** learn about provisional, to satisfy decisions 1 and 2 and nothing more:

| # | Surface | Layer | Why | Decision |
|---|---|---|---|---|
| 1 | `fn_attendance_roster` | PG fn | primary marking roster | 1 |
| 2 | `lib/services/academic/attendance-roster-service.ts:434` | code | secondary roster path | 1 |
| 3 | `lib/services/academic/attendance-service.ts:800` | code | third roster path | 1 |
| 4 | `student_attendance_select_own_student` | RLS | learner sees own attendance | 1 (learner-facing) |
| 5 | `fn_attendance_dashboard_section_stats` | PG fn | denominators would exclude them | 1 |
| 6 | `fn_attendance_fresher_readiness` | PG fn | the readiness dashboard is blind (§4.7) | 1 |
| 7 | Roster / marking UI | UI | render the provisional badge + lapse flag | 2 |
| 8 | Learner profile & learner-360 | UI | render provisional state + window countdown | 2 |

**Eight.** Everything else in the 88 stays exactly as it is, deliberately. That restraint is the design: a capability overlay changes the surfaces that grant the capability, not every surface that mentions the status.

---

## 7. Part 2 — The specification

### 7.1 Recommended representation for "provisional": a **derived condition surfaced as an access tier**

**Recommendation: do not add an enum value. Do not add a boolean column. Define provisional as a derived condition, and express it the way the platform already expresses exactly this idea — as an access tier keyed off a shared constant list.**

The provisional condition:

```
provisional(learner) :=
      lifecycle_status IN ('reserved','admitted')
  AND admission_year is current
  AND now() <= provisional_window_end(learner)
```

with `lapsed(learner)` being the same predicate once `now() > provisional_window_end(learner)`. Neither state is ever written to `lifecycle_status`.

**Why this, over the two alternatives:**

| Option | Verdict | Reasoning |
|---|---|---|
| **New enum value `provisional`** | **Rejected** | (a) One-way door — Postgres enum values cannot be dropped; the repo already shows an add-then-drop cycle (`20260508140001` → `20260509063308`) that required recreating the type. (b) It would silently change the meaning of **all 88 filtering surfaces at once**: every `IN (...)` list that omits the new value starts excluding a population it used to include, and every `NOT IN` list starts including one. That is an 88-surface audit for a 8-surface benefit. (c) It fights `evaluate_learner_status_after_payment`, which keys on exact status strings — a learner moved to `provisional` would fall out of its `IN ('account','reserved')` guard and become **unpromotable**, silently stranding them behind the fee gate forever. This alone disqualifies it. (d) It destroys the fee-state information the status currently carries (`reserved` vs `admitted` are different points in the payment funnel with different `fee_paid_threshold_percent`). |
| **Boolean column `is_provisional`** | **Rejected** | Requires a writer, and any writer is a new state machine that must be kept in sync with payment events — precisely the auto-promotion machinery decision 4 forbids building. It can also drift from reality (a learner pays, becomes `active`, and a stale `true` lingers). A derived condition cannot drift. |
| **Derived condition + access tier** | **Recommended** | Nothing to write, nothing to migrate, nothing to keep in sync, no new value for 88 surfaces to mis-handle, and it cannot bypass the money gate because it never touches `lifecycle_status`. It also reuses a mechanism already proven in production. |

### 7.2 The precedent this reuses — `induction_only` is the same shape, already live

The platform solved this exact problem on 2026-06-29 for a different capability. Spec: `specs/pre-onboarding-induction-access-2026-06-29.md`, which records the architecture decision verbatim:

> | 5 | Architecture | **Approach A** — keep `role='student'`, add a restricted `induction_only` access tier. (Rejected Approach B "dedicated role" — higher blast radius, requires role-flip at onboarding.) |

The shared constant, `lib/constants/induction-access.ts`, **already names the provisional population**:

```ts
export const INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES = [
  'admitted',
  'reserved',
  'enquiry_submitted',
  'enquiry',
  'account',
] as const;
```

Its live machinery, all of which the provisional tier should extend rather than duplicate:

| Piece | File | Role |
|---|---|---|
| Single source of truth | `lib/constants/induction-access.ts` | the status list |
| Tier decision | `lib/services/auth/student-validation-service.ts:137-146` | returns `accessTier: 'induction_only'` |
| Route gate (default-deny) | `proxy.ts:229-239`, enforced `:553-562` | whitelist; everything else redirects |
| Nav filter | `lib/sidebarMenuLink.ts:3532-3545` (`filterToInductionOnlyMenu`) | shows only reachable pages |
| Client flag | `hooks/use-my-lifecycle-status.ts` (`useIsInductionOnly`) | backed by `fn_my_lifecycle_status()` |

The proxy is explicitly default-deny, which is the property that makes widening it safe:

```ts
const INDUCTION_ONLY_EXACT_PATHS = new Set([
  '/learners/my-profile', // profile completion — the My Induction nudge target
  '/unauthorized',
  '/error'
]);
const INDUCTION_ONLY_PREFIXES = ['/learners/my-induction'];
```

**Therefore:** a provisional learner is an `induction_only` learner who has additionally been granted *attendance visibility*. The work is to add a capability to an existing tier, not to invent a tier.

> ⚠️ **One caution the induction spec itself flags.** The status list is mirrored **manually** into SQL — `auto_link_profile_to_approved_learner` keys off the same list in a trigger. The spec says: *"Both gate on the same status list — they must widen together."* Any change to the provisional predicate must update both halves in the same PR, or a learner will pass one gate and fail the other.

### 7.3 Where provisional behaviour is configured — reuse `admission_statuses`

`admission_statuses` already carries per-status behaviour flags (`gates_login`, `is_seat_filled`, `is_terminal`, `fee_paid_threshold_percent`, `auto_promote_when_universal_paid`) and already has a super-admin UI at `/admission/settings/statuses`. Adding the provisional capability flags there keeps the platform's "every policy decision = a config row" pattern and requires no new admin screen:

| Proposed column | Type | Meaning | Set true for |
|---|---|---|---|
| `allows_provisional_attendance` | boolean, default false | learners at this status may be marked present | `reserved`, `admitted` |
| `counts_toward_exam_eligibility` | boolean, default false | documentation-only today (§5 shows eligibility already ignores status); exists so a future change cannot silently break decision 3 | `reserved`, `admitted`, `active`, `graduated` |

The **window length** is deliberately NOT specified here — see §8.

**Before implementing:** fix or explicitly retire `gates_login` (§2.5). Adding two more flags beside a flag that does nothing would compound the trap.

### 7.4 The provisional window, and what "flag it when it lapses" renders as

**Window definition.** Start = the later of (a) the learner reaching `reserved`/`admitted`, and (b) the academic term start for their programme. End = start + window length. Length is configuration; its shape is §8.

**Lapse behaviour, per decision 2 — nothing is removed.** On lapse:

- the learner **stays on every roster** they were on;
- attendance **stays markable** (removing it would destroy the history decision 3 requires);
- every attendance record already written **stays counted** (automatic — §5.3);
- a **flag** appears.

**Where the flag renders — 4 surfaces:**

| Surface | Rendering | Audience |
|---|---|---|
| Attendance marking roster | Amber chip beside the name: `Provisional — fees pending` → on lapse `Provisional — window lapsed (N days)`. Row stays fully interactive. | marking team member |
| Attendance dashboard / fresher readiness | A counted band: *"N provisional (M lapsed)"* separate from the active count, so a college can see the exposure without the two populations being conflated | HOD, Principal |
| Learner profile / learner-360 | Status line: provisional, window end date, days remaining or days lapsed, outstanding amount | admin, accounts |
| Learner's own view | Plain-language notice: they are attending provisionally, their attendance is being recorded and does count, and their fee status is pending | the learner |

**Explicitly out of scope, and worth stating so it is not assumed:** lapse must **not** auto-trigger removal, auto-notify the learner's guardian, auto-escalate to collections, or change `lifecycle_status`. It renders a flag. Any action taken on that flag is a human collections decision — which is the same boundary decision 4 draws.

### 7.5 Exam eligibility — the change required is **none**

Per §5: no eligibility path filters on `lifecycle_status`, so provisional attendance counts the moment it is marked. **Do not add a filter, and do not add a "provisional" carve-out.** Decision 3 is satisfied by inaction.

Two reporting questions this raises, neither of which is an eligibility-engine change and neither of which is covered by the locked decisions:

1. Should the Registrar's exam audit **visually distinguish** a provisional learner's row? (Recommend: yes, same amber chip — the number is correct, the context is useful.)
2. Should a **lapsed, never-paid, eventually-exited** learner still appear in the audit for the window their blob rows cover? (Recommend: yes, unchanged — suppressing them would be a retroactive edit of attendance history, which decision 3's rationale rejects.)

### 7.6 Build sequence

Ordered so each step is independently shippable and independently verifiable.

| # | Step | Layer | Risk |
|---|---|---|---|
| 0 | **Reconcile with `feat/fresher-attendance-readiness`** (§1.4) — its function is live, its branch is not merged | — | blocks everything |
| 1 | **Data readiness: resolve the 466 section-less learners** (§4.6) — business decision first, then backfill | data | **blocks real coverage**; without it the feature reaches 53% of the cohort |
| 2 | Shared predicate constant + `fn_is_provisional_learner(uuid)` helper, mirrored into the SQL trigger half (§7.2 caution) | code + PG | low, additive |
| 3 | `admission_statuses` capability columns + settings UI (§7.3), after resolving `gates_login` | PG + UI | low, additive |
| 4 | Widen the 3 roster paths to `active OR provisional` (surfaces 1-3, §6.4) | PG + code | **medium — the real change** |
| 5 | Widen `student_attendance_select_own_student` RLS (surface 4) | RLS | medium — silent-denial class |
| 6 | Widen `fn_attendance_dashboard_section_stats` + `fn_attendance_fresher_readiness` (surfaces 5-6) | PG | low |
| 7 | Provisional/lapsed chip on the 4 UI surfaces (§7.4) | UI | low |
| 8 | Verification sweep (§7.7) | — | — |

Migration-vs-deploy ordering is per-PR and must be read off each PR's own `.select()` — do not assume a global direction.

### 7.7 Definition of done

Green checks are not done. This feature is done when all of the following hold:

1. A **real marking team member**, in production, opens the marking screen for a section containing provisional learners and **sees them, marks them, and saves**. Not a screenshot of a roster — a saved record.
2. The saved record is confirmed by re-running the §2.7 corroboration query and seeing a **non-zero** count for `reserved`/`admitted`. That query is the feature's acceptance test and it is currently zero.
3. `fn_exam_audit_attendance` returns those learners with a computed percentage — confirming §5 empirically rather than by inspection.
4. A **provisional learner**, impersonated as a real user, sees their own attendance (surface 4) — the RLS half is the one most likely to fail silently and pass every automated check.
5. `lifecycle_status` distribution is **unchanged** before and after: no learner was promoted as a side effect. Assert the relationship (`count(active) after == count(active) before`), never a fixed number — live counts drift.
6. Outstanding fee total is unchanged. The ₹6.26 crore gate is still closed.

---

## 8. CONFIG SHAPE — TO BE FILLED FROM THE PROGRAMME-SETTINGS DESIGN

**This section is deliberately incomplete.** A parallel workstream is deciding how programme-scoped configuration will work. `platform_policies.scope_type` today permits only five values — verified live:

```sql
SELECT c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='platform_policies' AND c.contype='c';
```
→ `platform_policies_scope_type_check CHECK ((scope_type = ANY (ARRAY['global'::text, 'institution'::text, 'role'::text, 'user'::text, 'cohort'::text])))`

**There is no `programme` scope.** No mechanism is invented here. What follows is only the list of values that need to be configurable, and at which scopes — for the programme-settings design to satisfy.

| Value | Type | Needed scopes | Why programme-level |
|---|---|---|---|
| `provisional_window_days` | number | global → institution → **programme** | A 4-year engineering degree and a 2-year diploma cannot share one grace period; professional programmes with regulator-set reporting dates differ again |
| `provisional_window_anchor` | enum (`term_start`, `status_entry`, `admission_date`) | global → institution → **programme** | Programmes start on different dates; anchoring all to a cluster-wide term start would open the window before some programmes begin |
| `provisional_attendance_enabled` | boolean | global → institution → **programme** | A programme may opt out entirely (e.g. one whose regulator forbids provisional attendance) |
| `lapsed_flag_visible_to_learner` | boolean | global → institution | Whether the learner sees the lapse or only team members do — a communications decision, plausibly uniform per college |

**Open questions for that design, which this specification cannot answer:**

1. Does programme scope resolve **through** institution (programme → institution → global), or is it a sibling? `fn_get_policy` today resolves `user > institution > role > global` and takes **one** `scope_id`.
2. If a learner's programme has no override, does it fall back to institution or to global?
3. **The school case (§2.3).** `Nattraja Vidhyalya CBSE` has 15 provisional learners and is not a programme in the college sense. Does it get institution-scope config, a programme-scope row, or an explicit exclusion?

Until that design lands, an implementation may seed a **single global** `provisional_window_days` row and read it via the existing `fn_get_policy`, provided the reading code is written so that adding a narrower scope later requires no change at the call site.

---

## 9. What I could not determine

Stated plainly rather than guessed.

1. **How the 122 `admitted` learners are promoted to `active`.** `evaluate_learner_status_after_payment` no-ops on any status outside `('account','reserved')` (§2.4), so it cannot promote them. Some other path exists — manual edit, bulk tooling, or none at all. Not traced; it is adjacent to the money gate and I did not want to assert a mechanism I had not read end to end.
2. **Whether Stage B can currently promote anyone to `active`.** Its selector requires `gates_login = false`, and `active` is the only learner status with `gates_login = true` (§2.4). This looks like a live contradiction, but proving it would require executing the function, which is a production write. **Verify before relying on this function as "the promotion path."**
3. **Whether the 531 non-active learners with attendance were `active` when marked.** `learners_profile_status_history` shows `from_status='active'` for zero of them, but that table only records transitions made through the RPC, so it cannot distinguish "never was active" from "changed by another path" (§2.7). The hypothesis is unproven either way; the zero for reserved/admitted is unaffected.
4. **Why `fn_attendance_fresher_readiness` is live while its branch is unmerged** (§1.4). Applied by hand, or the branch is a repo-side catch-up. Not investigated.
5. **Whether the 466 section-less learners are missing sections by process or by defect** (§4.6). A programme/semester-complete but section-null learner suggests section assignment is a later manual step, but I did not trace the assignment workflow.
6. **The correct provisional window length.** Deliberately not researched — it is configuration and belongs to the programme-settings workstream (§8).
7. **Whether school learners are in scope** (§2.3). A business decision, not discoverable from code.
8. **Live grants on `mv_learner_attendance_summary`.** The migration that created it warns its REVOKEs may not have reached production. Not verified; it is out of this specification's path but relevant to anyone touching the learner-360 badge.

---

## 10. Appendix — every query and command, verbatim

### 10.1 Sweep commands

```bash
git ls-tree jicate/main -r --name-only | grep -iE "(provisional|lifecycle_status|admission_year|eligibilit|exam.?eligib|attendance.?eligib)"
gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "provisional in:title"
gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "eligibility in:title"
gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 40 --search "fresher in:title"
gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 20 --search "lifecycle in:title"
git worktree list
git log --oneline -5 feat/fresher-attendance-readiness
git diff --stat jicate/main...feat/fresher-attendance-readiness
```

### 10.2 Enum, constraint, population

```sql
-- No CHECK constraint exists (returns [])
SELECT c.conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='public' AND t.relname='learners_profiles'
  AND pg_get_constraintdef(c.oid) ILIKE '%lifecycle%';

-- The enum
SELECT t.typname, e.enumsortorder, e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
WHERE t.typname='lifecycle_status' ORDER BY e.enumsortorder;

-- Population
SELECT lifecycle_status, count(*) AS n
FROM learners_profiles GROUP BY 1 ORDER BY 2 DESC;

-- Provisional cohort by college
SELECT i.name AS college, lp.lifecycle_status, count(*) AS n
FROM learners_profiles lp
LEFT JOIN institutions i ON i.id = lp.institution_id
LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
WHERE lp.lifecycle_status::text IN ('reserved','admitted')
  AND COALESCE(ay.is_current, false) = true
GROUP BY 1,2 ORDER BY 3 DESC;

-- Section/semester readiness (§4.6)
SELECT lp.lifecycle_status, count(*) AS total,
       count(lp.section_id) AS has_section, count(lp.semester_id) AS has_semester,
       count(lp.program_id) AS has_program, count(lp.degree_id) AS has_degree
FROM learners_profiles lp
LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
WHERE lp.lifecycle_status::text IN ('reserved','admitted')
  AND COALESCE(ay.is_current,false)=true
GROUP BY 1;
```

### 10.3 Functions and config

```sql
SELECT p.oid::regprocedure::text AS sig, p.prosrc
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname='evaluate_learner_status_after_payment';

SELECT p.proname, left(p.prosrc,1200) AS src
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('set_learner_activated_at','sync_learner_status_to_profile')
ORDER BY 1;

SELECT p.oid::regprocedure::text AS sig, left(p.prosrc, 3000) AS src
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_attendance_fresher_readiness';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='admission_statuses' ORDER BY ordinal_position;

SELECT scope, code, label, sort_order, is_active, is_terminal, is_seat_filled,
       fee_paid_threshold_percent, gates_login, auto_promote_when_universal_paid
FROM admission_statuses ORDER BY scope, sort_order;

SELECT c.conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='platform_policies' AND c.contype='c';

SELECT policy_key, scope_type, scope_id, left(value::text,300) AS value,
       data_type, is_active, ui_category
FROM platform_policies
WHERE policy_key ILIKE '%eligib%' OR policy_key ILIKE '%attendance%'
   OR policy_key ILIKE '%threshold%'
ORDER BY policy_key;
```

### 10.4 The corroboration queries (§2.7) and eligibility check (§5.2)

```sql
-- Attendance blob shape
SELECT id, attendance_date, jsonb_typeof(attendance_data) AS jtype,
       left(attendance_data::text, 600) AS sample
FROM student_attendance WHERE attendance_data IS NOT NULL
ORDER BY attendance_date DESC LIMIT 2;

-- ALL-TIME attendance by current lifecycle_status  ← the acceptance test
WITH marked AS (
  SELECT DISTINCT (stu->>'student_id')::uuid AS learner_id
  FROM student_attendance sa,
       LATERAL jsonb_each(sa.attendance_data) AS slot(k, v),
       LATERAL jsonb_array_elements(COALESCE(v->'students','[]'::jsonb)) AS stu
  WHERE jsonb_typeof(v->'students') = 'array'
)
SELECT lp.lifecycle_status, count(*) AS learners_with_attendance_all_time
FROM marked m JOIN learners_profiles lp ON lp.id = m.learner_id
GROUP BY 1 ORDER BY 2 DESC;

-- Eligibility: does the authoritative path know about lifecycle_status?
SELECT p.oid::regprocedure::text AS sig,
       (p.prosrc ILIKE '%lifecycle_status%') AS mentions_lifecycle
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_exam_audit_attendance';
-- → mentions_lifecycle = false

SELECT p.proname, (p.prosrc ILIKE '%lifecycle_status%') AS mentions_lifecycle
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname ILIKE '%eligib%' OR p.prosrc ILIKE '%exam_eligibility.attendance_pct%')
ORDER BY 1;
```

### 10.5 Surface-count queries

```sql
SELECT 'function' AS kind, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%lifecycle_status%'
UNION ALL
SELECT 'function_filters_active', count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ~* $re$lifecycle_status[^,;)]{0,40}'active'$re$
UNION ALL
SELECT 'view_or_matview', count(*)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m')
  AND pg_get_viewdef(c.oid) ILIKE '%lifecycle_status%'
UNION ALL
SELECT 'rls_policy', count(*)
FROM pg_policies WHERE schemaname='public'
  AND (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%lifecycle_status%';
-- → 93 / 36 / 4 / 1

SELECT tablename, policyname, cmd, roles::text, left(COALESCE(qual,''),260) AS qual
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('learners_profiles','student_attendance')
ORDER BY tablename, cmd, policyname;
```

```bash
# 155 files reference it
git grep -l "lifecycle_status" jicate/main -- 'app/*' 'lib/*' 'hooks/*' 'components/*' | wc -l

# 51 files filter on it
git grep -lE "(eq|in|neq|not)\(\s*['\"]lifecycle_status|lifecycle_status\s*(===|!==|==)|lifecycle_status\s+(=|IN|<>)" \
  jicate/main -- 'app/*' 'lib/*' 'hooks/*' 'components/*' | wc -l

# 31 .in() line-sites across 19 files; 3 .neq/.not line-sites
git grep -nE "\.in\(\s*['\"]lifecycle_status['\"]"        jicate/main -- 'app/*' 'lib/*' 'hooks/*' 'components/*' | wc -l
git grep -nE "\.(neq|not)\(\s*['\"]lifecycle_status['\"]" jicate/main -- 'app/*' 'lib/*' 'hooks/*' 'components/*' | wc -l
```

### 10.6 The 51 filtering code files

```
app/(routes)/admission/counselors/_components/add-counselor-dialog.tsx
app/(routes)/learners/alumni/_data/get-alumni.ts
app/(routes)/learners/enquiries/_data/get-enquiries.ts
app/(routes)/learners/onboarding/_data/get-onboarding-learners.ts
app/(routes)/learners/onboarding/_data/get-onboarding-stats.ts
app/(routes)/learners/profiles/_components/lifecycle-status.ts
app/(routes)/learners/profiles/_components/profiles-table-server.tsx
app/(routes)/learners/profiles/_data/get-learner-profiles.ts
app/(routes)/rcltp/teacher/assessments/_components/assessments-console.tsx
app/api/accreditation/stakeholder-surveys/[id]/build-roster/route.ts
app/api/admission/referral-dropdowns/route.ts
app/api/api-management/learners/alumni/route.ts
app/api/api-management/learners/enquiries/[id]/route.ts
app/api/api-management/learners/enquiries/route.ts
app/api/api-management/learners/profiles/route.ts
app/api/b2a/admission/route.ts
app/api/b2a/admission/stats/route.ts
app/api/b2a/learners/route.ts
app/api/cdc/internships/new/learners/route.ts
app/api/cdc/pickers/learners-detailed/route.ts
app/api/cdc/pickers/learners/route.ts
app/api/cdc/placements/new/learners/route.ts
app/api/events/committees/member-directory/route.ts
app/api/internal-marks/learners/route.ts
app/api/learners/check-missing-profiles/route.ts
app/api/learners/create-missing-profiles/route.ts
app/auth/callback/route.ts
components/admin/id-cards/id-card-batch-print.tsx
hooks/admission/use-referral-dropdowns.ts
lib/mcp/tools/admission.ts
lib/mcp/tools/department-health.ts
lib/mcp/tools/learners.ts
lib/services/academic/attendance-roster-service.ts          ← surface 2
lib/services/academic/attendance-service.ts                 ← surface 3
lib/services/academic/daily-session-attendance-service.ts
lib/services/admission/student-form-service.ts
lib/services/ai-pulse/rotation-engine-service.ts
lib/services/billing/onboarding/onboarding-service.ts
lib/services/billing/schedule/student-search-service.ts
lib/services/bulk-learner-edit-service.ts
lib/services/bulk-learner-reference-fields.ts
lib/services/dashboard/admin-dashboard-service.ts
lib/services/dashboard/celebration-service.ts
lib/services/learner-advanced-analytics-service.ts
lib/services/learner-profile-service.ts
lib/services/lti/lti-roster-service.ts
lib/services/marketing/remarketing-service.ts
lib/services/solutions/ai-solution-compliance-service.ts
lib/services/solutions/builders-service.ts
lib/services/startup-studio/student-search-service.ts
lib/services/vac/vac-service.ts
```

### 10.7 Key code reads

```bash
git show jicate/main:supabase/migrations/20260723140000_attendance_roster_section_authoritative.sql
git show jicate/main:lib/services/auth/student-validation-service.ts
git show jicate/main:lib/constants/induction-access.ts
git show jicate/main:specs/pre-onboarding-induction-access-2026-06-29.md
git show jicate/main:proxy.ts            # lines 220-240, 548-566
git show jicate/main:lib/sidebarMenuLink.ts   # lines 3525-3545
git show jicate/main:hooks/use-my-lifecycle-status.ts
git show jicate/main:lib/services/exam-audit/compute.ts
git show jicate/main:app/api/internal-marks/exam-audit/route.ts
git grep -n "gates_login" jicate/main -- '*.ts' '*.tsx'
git grep -rln "induction-access\|INDUCTION_ELIGIBLE\|induction_only" jicate/main -- 'app/*' 'lib/*' 'hooks/*' 'components/*' 'middleware.ts'
```

---

*Discovery performed 2026-08-05 against `jicate/main` and production ref `kvizhngldtiuufknvehv`. Read-only throughout: no production write, no migration applied, no merge, no deploy. All counts are as at that date and will drift — assert relationships, never fixed numbers.*
