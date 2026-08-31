# Can we remove the class group (section) concept?

**Asked by the Director, 11 August 2026:** *"Why do you actually have class groups? Is it really necessary?"*

**Answer in one line: keep the concept, delete 238 of its instances, and fix the 133 that are broken.**

Removing it entirely would break the timetables of **866 learners** to tidy up a problem that is not caused by class groups at all.

This document changes nothing. It is evidence and a recommendation. Every number below was read live from the production database on 11 August 2026, or points at a line of code.

---

## 1. The short version

A class group is a **name** — nothing more. The `sections` table has exactly 10 columns:

```
id, section_name, is_active, created_at, updated_at,
institution_id, degree_id, department_id, program_id, semester_id
```

There is no room. No seat capacity. No Senior Learner. No timetable. A class group is a label pinned to a point in the hierarchy, and everything else hangs off it by reference.

That makes the Director's instinct reasonable: a label that carries no information of its own looks removable.

But the label turns out to carry one thing nothing else does — **which of two differently-taught halves of the same year a learner belongs to** — and 866 learners currently depend on it.

| The question | The finding |
|---|---|
| How many places would break? | 11 live tables, not 29 |
| Can it be worked out from other data? | No — for 866 learners (19% of active), no |
| Does attendance require it? | **No.** 45 timetables already run without one |
| Is there a cheaper fix? | **Yes** — archive 238 empty ones, zero risk |
| Should we remove the concept? | **No** |

---

## 2. What would actually break

The starting figure was "29 tables carry `section_id`". That is right, but it counts things that are not live tables.

| Category | Count | Note |
|---|---|---|
| Objects carrying `section_id` | 29 | Reconciles exactly |
| — of which are views, not tables | 2 | `v_learner_hostelites`, `v_learner_hostelites_scoped` |
| Base tables | 27 | |
| — of which are backups / rollback copies | 5 | Excluded below |
| **Live base tables** | **22** | |
| — of which hold zero rows | 9 | Features never used |
| — of which have the column but it is 100% empty | 2 | Dead columns |
| **Tables where the concept truly lives** | **11** | The real answer |

The five backup tables — `bak_learner_references_20260810` (787 rows), `pharmacy_ay_rollback_20260724` (555), `_bak_learner_scope_repair_20260808` (303), `_bak_learner_semester_repair_20260731` (260), `ahs_ay_rollback_20260724` (206) — hold 2,111 rows between them. They are snapshots taken during past repairs. They are not part of the design.

### The 11 tables that matter, classified

| Table | Rows | Rows carrying a class group | Verdict |
|---|---|---|---|
| `student_engagement_scores` | 243,704 | 243,704 | **Copied** — recomputed nightly, derivable |
| `user_sessions` | 37,609 | 26,840 | **Copied** — a stamp on a login record |
| `student_attendance` | 11,430 | 11,430 | **Load-bearing** |
| `learners_profiles` | 7,221 | 6,338 | **Load-bearing** — this *is* the placement |
| `ai_pulse_rotation_state` | 2,122 | 2,122 | **Load-bearing** — cannot be empty |
| `timetables` | 437 | 209 | **Load-bearing, but optional** |
| `leave_onduty_applications` | 89 | 89 | **Copied** |
| `event_registration_form_fields` | 34 | 34 | Load-bearing, small |
| `tracker_items` | 7 | 7 | Trivial |
| `pde_case_assignments` | 1 | 1 | Trivial |
| `pp_homework` | 1 | 1 | Trivial |

**Two dead columns worth naming.** `session_feedback` holds **149,508 rows and not one of them carries a class group** — the column has never been filled. `scf_ai_suggestions` is the same: 26 rows, all empty. The second-largest "dependant" in the original count depends on nothing.

The two biggest real tables — engagement scores and login sessions — only *copy* the class group from the learner's own record. Remove the concept and they lose a column they could recompute.

### The full removal bill

If the concept were genuinely deleted, this is the surface area:

| What | Amount |
|---|---|
| Application code files mentioning `section_id` | **233 files** |
| Lines of code | **1,201** |
| Database functions referencing it | **88** |
| Past migration files referencing it | **159** (of 2,398) |
| Rows to rewrite | **300,000+** |

---

## 3. Can it be worked out instead of stored?

The test: are there learners who share the same programme, semester **and** batch, but sit in different class groups that teach differently? If yes, the class group knows something nothing else knows.

**Step 1 — do cohorts split at all?** Yes, but rarely.

| Measure | Value |
|---|---|
| Cohort keys (programme + semester + batch) that split across 2+ class groups | **12** |
| Class groups involved | 41 |
| Active learners involved | 775 |

**Step 2 — the key itself is incomplete.** Of 4,465 active learners, **1,652 (37%) have no batch recorded at all.** So "programme + semester + batch" cannot be the replacement key — it does not exist for more than a third of learners.

**Step 3 — do the split groups actually teach differently?** Mostly not. Of the 41 class groups in split cohorts, only **9** have a live timetable. The other 32 exist on paper only.

**Step 4 — control for semester.** This is where the original premise overstates the case. The headline "23 programmes run genuinely different timetables" counts a programme as split if it has two or more timetables anywhere. But Semester 1 and Semester 3 naturally have different timetables — that is a semester difference, not a class-group difference.

Comparing only **within the same programme and the same semester**:

| Measure | Value |
|---|---|
| Programme + semester groups running 2+ live timetables | 13 |
| — where the timetable content genuinely differs | **11** |
| — where the two timetables are byte-identical (the split does nothing) | 2 |
| Distinct programmes with a true class-group split | **8** |

**The answer to "is it derivable?" is no — for a specific, countable group of people.**

> **866 active learners** — 19% of all 4,465 — sit in a programme and semester where the class group genuinely decides which timetable they follow. Across 64 class groups in 6 programmes. For these learners the class group cannot be computed from anything else. Remove it and they lose their timetable.

For the other 81%, the class group is decoration.

---

## 4. What attendance actually needs

Attendance is recorded against a timetable period. The question is whether the class group is *required* for that.

**It is not, and the platform already proves it.**

The roster function `fn_attendance_roster` declares its class-group parameter as optional:

```sql
fn_attendance_roster(
  p_institution_id uuid,
  p_section_ids    uuid[] DEFAULT NULL,   -- optional
  p_degree_id      uuid DEFAULT NULL,
  p_program_id     uuid DEFAULT NULL,
  p_semester_id    uuid DEFAULT NULL)
```

Its own comment states the rule: *"Section is AUTHORITATIVE. When a section scope is given it alone determines the roster."* When it is **not** given, the function falls back to programme and semester and returns a complete roster.

There are already two kinds of timetable in production:

| Timetable mode | Live timetables | Carrying a class group |
|---|---|---|
| `section` — one class group | 133 | 133 |
| `semester` — whole year together | **45** | 1 |

**4,041 attendance records have already been taken against timetables that have no class group.** A further **919 records cover two or more class groups sitting together** in one combined session, using a list rather than a single value.

So attendance at programme-and-semester level is not hypothetical. A quarter of live timetables work that way today.

### What would be lost

| Thing | Lost if class groups are removed? |
|---|---|
| Room | **No** — a class group never stored a room, and 0 of 178 live timetables record one either |
| Seat capacity | **No** — never stored |
| Time / periods | **No** — held on the timetable |
| Senior Learner allocation | **No** — held on `timetables.class_incharge_id` (124 of 178 live timetables), not on the class group |
| Splitting one year into two differently-taught halves | **Yes** — this is the real loss, affecting 866 learners |
| Per-class-group attendance reporting | **Yes** — would become per-year only |

There is also a warning in the code worth reading. A comment dated 6 August 2026 in the attendance marking screen records a live incident:

A Semester V class group was listed against a Semester III practical session, putting the wrong year on the register. The comment's own warning:

> *"the wrong section yields a complete, plausible, wrong roster."*

Class groups are not only useful — they are also a live source of error when they drift out of alignment. That argues for **fewer and cleaner** class groups, not for keeping all 504.

---

## 5. The cheaper alternative: archive, don't remove

Today there are **504 active class groups**. Here is what they are doing:

| | Class groups | Active learners in them | Holding learners | Completely empty |
|---|---|---|---|---|
| **Teaches** (has a live timetable) | 133 | 1,991 | 129 | 4 |
| **Teaches nothing** | **371** | **2,472** | **133** | **238** |

Two very different problems are hiding in that second row:

**238 class groups are completely empty and teach nothing.** No learners, no timetable. These are pure clutter. Archiving them carries **zero risk** — nothing points at them.

**133 class groups hold 2,472 active learners but never meet.** These cannot simply be archived. Those learners are real. They are sitting in a group that has no timetable — which means, today, they have no sessions to attend.

**This is the finding that answers the Director's question.** The problem is not that class groups exist. The problem is that **2,472 learners — more than half the active population — are in one that never meets.** Deleting the concept would not give those learners a timetable. It would just move the same hole somewhere less visible.

### What archiving does for the 458 waiting to be placed

458 learners are admitted or reserved and not yet placed (409 reserved + 49 admitted). Today the placement screen offers them 255 class groups across 47 programmes. After archiving the ones that teach nothing:

| Situation | Programmes | Learners | Groups offered today | Groups offered after |
|---|---|---|---|---|
| No teaching group at all | 27 | **206** | 137 | **0** |
| Exactly one teaching group (no real choice) | 5 | 49 | 28 | 5 |
| A genuine choice of 2 or more | 15 | 203 | 90 | 58 |
| **Total** | **47** | **458** | **255** | **63** |

The picker drops from **255 options to 63** — a 75% reduction in noise.

More importantly, it stops lying. Right now the screen offers 137 class groups to 206 learners across 27 programmes where **not one of those groups teaches anything.** Whoever places those learners is choosing between 137 doors that all open onto an empty room. After archiving, the screen would correctly show zero — and the real blocker (27 programmes have no timetable) becomes visible instead of hidden.

---

## 6. Recommendation

**Keep the class group concept. Archive the dead instances. Fix the broken ones.**

I disagree with the premise that the concept should be removed, for three reasons.

**One — it is load-bearing for real people.** 866 learners depend on it to know which timetable they follow. There is no other field that answers that question, and the obvious candidate (batch) is missing for 37% of learners.

**Two — the cost is out of proportion.** Removal touches 233 code files, 1,201 lines, 88 database functions, 27 tables and over 300,000 rows. That is a multi-month programme carrying real risk to attendance, billing and reporting — to remove a label that is already optional in the parts of the system that matter.

**Three — it would not fix the actual problem.** The complaint underneath the question is almost certainly *"why does this screen show me dozens of meaningless options?"* That is true, and the cause is that **371 of 504 class groups teach nothing.** Deleting the concept and deleting 371 bad rows both fix that screen. Only one of them takes a week.

### Proposed sequence

| Step | Action | Scale | Risk |
|---|---|---|---|
| 1 | Archive the 238 class groups that are empty **and** teach nothing | 238 rows | **None** — nothing references them |
| 2 | Report the 133 groups holding 2,472 learners with no timetable, to the departments that own them | Report only | None |
| 3 | Either give those 133 a timetable, or merge their learners into a group that has one | 2,472 learners | Medium — needs department decisions |
| 4 | Hide non-teaching groups from the placement picker | 1 screen | Low |
| 5 | Drop the dead `section_id` column from `session_feedback` (149,508 rows, never populated) | 1 column | Low |
| 6 | Revisit the question once steps 1–4 are done | — | — |

Steps 1, 2, 4 and 5 are safe and would remove most of the visible annoyance. Step 3 is the real work, and it is work the institution has to do regardless of whether class groups exist.

**If after step 4 the concept still feels unnecessary, the question is worth asking again** — but at that point it would be a decision about 133 working class groups, not 504 mostly-broken ones.

### An honest note on what I could not settle

Two class groups in the same programme and semester run **byte-identical** timetables. That split genuinely does nothing and those two are merge candidates. And 44 live timetables carry no class group yet still have attendance recorded against a real class group on the attendance row itself — meaning the year-wide timetable is shared while the register is kept per group. Whether that is deliberate or accidental is a question for the departments running them, not something the data can answer.

---

## Appendix: how to re-run these numbers

Every figure above came from read-only queries against the production database via the Supabase Management API (`POST /v1/projects/kvizhngldtiuufknvehv/database/query`). No data was changed and no migration was written.

The three-bucket breakdown quoted in the original brief reproduces exactly:

| Bucket | Programmes | Class groups |
|---|---|---|
| 2+ timetables (looks genuinely different) | 23 | 187 |
| All share one timetable | 13 | 56 |
| No timetable at all | 46 | 239 |
| **Total multi-group programmes** | **82** | **482** |

Controlling for semester reduces the first bucket from 23 programmes to **8**, which is the correction this review adds.

Code references:
- `app/(routes)/academic/attendance/mark/page.tsx` — class-group resolution, the `section` vs `semester` timetable branch, and the 6 August 2026 incident comment
- `app/(routes)/academic/attendance/page.tsx` — period and multi-group selection
- `fn_attendance_roster` — optional class-group parameter with programme/semester fallback

---

*Review prepared 11 August 2026. Evidence only — no application code, migration, or data was changed.*
