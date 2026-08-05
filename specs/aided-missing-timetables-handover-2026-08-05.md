# Arts & Science (Aided) — Missing Timetables: Build Specification

**For:** JKKN College of Arts and Science (Aided) — academic office / timetable team
**From:** MyJKKN platform team
**Date:** 5 August 2026
**Status:** Specification only. **Nothing in this document has been created or changed in MyJKKN.** No timetable, no period, no template row was written to production while producing it. Every number below was read live from production on 5 August 2026 and every query is reproduced in Appendix A so you can re-run it yourself.

---

## 1. The short version

MyJKKN's Intake Readiness panel says **10 sections and 164 first-year learners at Aided are blocked** — no timetable, attendance impossible.

We investigated before asking anyone to build anything. **The panel is substantially wrong.** Of those 10 sections:

| | Sections | Learners | What is actually true | Who acts |
|---|---:|---:|---|---|
| **A** | 3 | 94 | A complete, active timetable already exists and attendance can be marked today. Only the dashboard is reporting it wrongly. | MyJKKN — nothing for you to do |
| **B** | 4 | 50 | The timetable is **already built**, with real subject and team-member assignments — but it is saved as a **template** instead of a live timetable. | You — one setting, not a rebuild |
| **C** | 3 | 20 | Genuinely nothing exists. | You — build these |
| | **10** | **164** | | |

**You need to build three timetables, not ten.** Sections A and B between them account for 144 of the 164 learners, and the work for those is already done — it is either mis-reported or mis-flagged.

We would have told you to build seven before we checked. We are telling you this because a specification that sends you to rebuild work you already finished is worse than no specification.

---

## 2. Why the panel is wrong

Worth understanding, because it explains all three buckets.

MyJKKN stores a timetable's section in **two** places:

1. `timetables.section_id` — a single column on the timetable, and
2. `section_ids` inside each individual period slot, in the timetable's grid data.

**The marking flow reads the slot.** `lib/services/academic/faculty-attendance-service.ts:477` resolves the section as `timetable.section_id || slot.section_id || slot.section_ids?.[0]` — the column is merely the first candidate, and when it is empty the slot supplies the answer. The learner roster then comes from `fn_attendance_roster`, which filters on `learners_profiles.section_id` and whose own comment reads *"Section is AUTHORITATIVE."* That function does not query `timetables` at all.

**The readiness panel reads only the column.** `fn_attendance_fresher_readiness` matches sections to timetables with `WHERE t.section_id IN (...)` — the column, never the slot.

Eighteen of Aided's nineteen timetables were created as **Semester**-type, for which the section column is legitimately empty. So the panel sees nothing and reports "blocked", while the marking screen sees the slot and works fine.

**The decisive proof:** eleven Aided timetables currently hold attendance — 167 marked rows between 15 June and 31 July. **Every single one of them has an empty `section_id` column.** And the one Aided timetable that *does* have the column filled in (`II M.Com`, section A) has zero attendance rows. Linkage is not what makes marking work.

`⚠️` This is a MyJKKN defect and we are fixing it. The panel will keep showing these sections as blocked until we do — please do not treat the panel as your checklist until §7 says so.

---

## 3. Bucket C — the three timetables to actually build

These three sections have no timetable, no template, and no period slots. This is the real work.

| # | Programme | Department | Learners | Clone this template | Note |
|---|---|---|---:|---|---|
| 1 | MASTER OF COMMERCE | Commerce (PG) | 15 | **II M.SC CHEMISTRY** | shape only — see below |
| 2 | M.Sc. ZOOLOGY | Zoology (PG) | 4 | **II M.SC CHEMISTRY** | shape only |
| 3 | M.A. HISTORY | History (PG) | 1 | **II M.SC CHEMISTRY** | shape only |

All three are **Semester I, Section A, academic year 2026-2027**, and all three are postgraduate.

`II M.SC CHEMISTRY` is recommended only because it is the one postgraduate template available and its period grid is identical to every other template at Aided (§5). You are cloning the **shape**, not the content — every subject and team-member assignment must be replaced. Starting from scratch is equally valid; §5 is the grid to reproduce.

**Naming.** Follow the convention already in use: Roman numeral for the year, then the programme — `I M.Com`, `I M.Sc ZOOLOGY`, `I M.A HISTORY`.

---

## 4. Bucket B — four timetables you have already built, saved in the wrong place

| Programme | Department | Learners | Saved as | Period slots with subjects assigned |
|---|---|---:|---|---:|
| B.Sc. CHEMISTRY | Chemistry | 19 | template **I B.SC CHEMISTRY** | 28 |
| B.Sc. ZOOLOGY | Zoology | 17 | template **I B.Sc ZOOLOGY** | 30 |
| B.Sc. MATHEMATICS | Mathematics | 11 | template **I B.Sc (Mathematics)** | 7 ⚠️ |
| B.A. ENGLISH | English | 3 | template **I BA ENGLISH** | 28 |

Somebody at Aided built these properly. Each carries real course assignments against the correct Section A, and each is marked active. They are simply flagged `is_template = true`, which files them under Templates rather than under live timetables.

**What we know and what we do not, stated separately.** The query that finds a team member's periods for marking filters only on institution and `is_active` — it applies **no template filter** (`faculty-attendance-service.ts:170`). On that mechanism these four should already appear for marking today. We have not confirmed that at runtime with a real team-member login, so we are not claiming it as fact.

**Recommended action either way:** re-save each of the four as a normal timetable rather than a template. If they were already working, nothing breaks. If they were not, this fixes them. Either way it removes the ambiguity, and it is far less work than rebuilding.

`⚠️` **Mathematics is only partly filled** — 7 assigned slots against 28–30 for the others, roughly one day of a six-day cycle. Please complete it before relying on it.

---

## 5. The grid shape — identical across all six templates

| Field | Value |
|---|---|
| Timetable format | **Cycle** (not Regular, not Batch) |
| Number of cycles | **6** |
| Attendance mode | **Period-wise** |
| Days | Monday, Tuesday, Wednesday, Thursday, Friday, Saturday |
| Start date | 2026-06-15 |
| End date | 2026-10-31 |

**Seven period rows, in this order:**

| Order | Name | Start | End |
|---:|---|---|---|
| 1 | Period 1 | 09:45 | 10:45 |
| 2 | Period 2 | 10:45 | 11:45 |
| 3 | Break | 11:45 | 11:55 |
| 4 | Period 3 | 11:55 | 12:55 |
| 5 | Lunch Break | 12:55 | 13:45 |
| 6 | Period 4 | 13:45 | 14:45 |
| 7 | Period 5 | 14:45 | 15:45 |

Five teaching periods and two breaks, 09:45 to 15:45.

> **Two quirks, neither of which is your error.**
>
> **(a) The breaks are not flagged as breaks.** On all six templates the `Break` and `Lunch Break` rows carry `is_break = false`, and cloning inherits that. Whether MyJKKN should expect attendance against a break period is a platform question we are raising separately.
>
> **(b) The template picker will label these "Regular".** All six are Cycle format, but the dropdown only distinguishes "Batch" from everything else, so Cycle templates display as "Regular". The template is correct; the label is wrong. Logged as a defect.

---

## 6. Step by step, for the three in Bucket C

1. **Academic → Timetables**, click **New Timetable** (`/academic/timetables/new`).
2. **Start from template** — `II M.SC CHEMISTRY`.
3. **Timetable name** — `I M.Com`, `I M.Sc ZOOLOGY`, `I M.A HISTORY` respectively.
4. **Institution** — JKKN College of Arts and Science (Aided).
5. **Academic year** — 2026-2027.
6. **Degree** — Postgraduate (all three).
7. **Programme** — from the §3 table.
8. **Department** — from the §3 table.
9. **Semester** — Semester I.
10. **Timetable type** — either works, but prefer **Section**, then pick **Section A**. Semester type is what every existing Aided timetable uses and marking works fine with it; choosing Section additionally makes the readiness panel see it correctly even before we ship our fix.
11. **Timetable format** — Cycle. **Number of cycles** — 6. (Cloning should pre-fill; confirm.)
12. **Attendance mode** — Period-wise.
13. **Start date** 2026-06-15, **End date** 2026-10-31.
14. Save, then fill the grid: assign subject and teaching team member to each of the five teaching periods across all six cycles. **Make sure each slot names Section A** — that is what the marking screen reads.

**Required fields:** timetable name (minimum 3 characters), institution, academic year, degree, programme, department, semester. Section becomes required only if you choose Section type. Number of cycles is required because the format is Cycle. Class incharge is required *only* for session-wise attendance — you are using period-wise, so leave it blank.

---

## 7. How to check you are done

Because the readiness panel is currently unreliable (§2), check the real thing instead: **have a team member open Attendance → Mark and confirm the learner list appears** for each section.

Expected end state:

- **Bucket C (3 sections, 20 learners)** — markable once you build them.
- **Bucket B (4 sections, 50 learners)** — markable once re-saved as timetables; possibly already markable now.
- **Bucket A (3 sections, 94 learners)** — already markable today. Nothing for you to do.

Once MyJKKN ships the readiness fix, the panel should drop from 10 blocked sections to 0. Until then it will overstate the problem.

---

## 8. What we could not determine

Stated plainly rather than guessed:

- **Whether the four Bucket B templates surface for marking today.** The mechanism says yes; not confirmed at runtime. §4.
- **Whether the assigned team members hold the `academic.attendance.mark` permission.** The roster function refuses without it. We confirmed slot assignments exist, not the permission grants — so if a team member sees an empty learner list, tell us; it may be permissions, not the timetable.
- **Why none of Bucket A has ever been marked.** The mechanism works and a structurally identical timetable (`II B.Com`) is marked daily. Zero rows is a usage fact, not a technical one — we found no blocker. Worth asking those departments directly.
- **Which team member teaches which period, and room allocation.** Not held in MyJKKN. Only the college has it.
- **Whether Semester I of 2026-2027 genuinely runs 2026-06-15 to 2026-10-31 for all three Bucket C programmes.** Copied from existing templates; use real dates if they differ.

---

## Appendix A — every query behind this document

Read-only against production ref `kvizhngldtiuufknvehv`, 5 August 2026.
Aided institution id: `a33138b6-4eea-4675-941f-1071bf88b127`.

**A1 — the 10 sections the panel reports as blocked.** Mirrors `public.fn_attendance_fresher_readiness`, inlined because that function requires a signed-in caller.

```sql
WITH fresher AS (
  SELECT lp.section_id AS sec_id, count(*)::bigint AS learners
  FROM learners_profiles lp
  WHERE lp.lifecycle_status = 'active'
    AND lp.section_id IS NOT NULL
    AND lp.institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127'
    AND lp.admission_year_id IN (SELECT id FROM admission_years WHERE is_current = true)
  GROUP BY 1
)
SELECT d.department_name, sm.semester_name, sc.section_name, f.learners,
       (SELECT count(*) FROM timetables t WHERE t.section_id = f.sec_id) AS timetables_linked
FROM fresher f
JOIN sections sc         ON sc.id = f.sec_id
LEFT JOIN departments d  ON d.id  = sc.department_id
LEFT JOIN semesters   sm ON sm.id = sc.semester_id
ORDER BY d.department_name;
```
Result: 10 rows, `timetables_linked = 0` on every one, learners summing to 164.

**A2 — the real coverage, read from the period slots rather than the column.** This is the query that produced the A/B/C split.

```sql
WITH blocked(sec_id, label) AS (VALUES
 ('442bdd4d-1af3-40dd-9750-bf3f7f3dce3b'::uuid,'Chemistry 19'),
 ('cebfbd9a-da76-4f86-b608-e49d939186e8'::uuid,'Chemistry PG 2'),
 ('54f6f44a-026f-450e-a24c-d505f19fdead'::uuid,'Commerce 54'),
 ('44e2a669-c233-42c1-8010-69406d5d5068'::uuid,'Commerce PG 15'),
 ('2c41b22f-51b3-439f-bcd6-cb7c4270a482'::uuid,'English 3'),
 ('f2cf7de7-2020-4e3f-a455-3e54bcad7aa1'::uuid,'History 38'),
 ('346e853e-188d-4375-83eb-2f950e95986f'::uuid,'History PG 1'),
 ('d7f00d41-3306-4224-a9da-c86badb4982d'::uuid,'Mathematics 11'),
 ('27b650fc-cdeb-400b-aeb7-acc79d626f91'::uuid,'Zoology 17'),
 ('8096de5d-cebb-4878-b606-1f91b3e32224'::uuid,'Zoology PG 4')),
slots AS (
  SELECT t.id, t.timetable_name, t.is_template, t.is_active,
         (jsonb_array_elements_text(p.slot->'section_ids'))::uuid AS sec_id,
         p.slot->>'course_id' AS course_id
  FROM timetables t,
       jsonb_each(t.timetable_data)  d(daykey, dayslots),
       jsonb_each(d.dayslots)        p(pkey, slot)
  WHERE t.institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127'
    AND jsonb_typeof(p.slot->'section_ids') = 'array'
    AND jsonb_array_length(p.slot->'section_ids') > 0
)
SELECT b.label, s.timetable_name, s.is_template, s.is_active,
       count(*) AS slots, count(s.course_id) AS slots_with_course
FROM blocked b LEFT JOIN slots s ON s.sec_id = b.sec_id
GROUP BY 1,2,3,4 ORDER BY 1;
```
Result — the three buckets, verbatim:

| label | timetable | is_template | slots | slots_with_course |
|---|---|---|---:|---:|
| Chemistry 19 | I B.SC CHEMISTRY | **true** | 28 | 28 |
| Chemistry PG 2 | I M.SC CHEMISTRY | false | 30 | 30 |
| Commerce 54 | I B.Com | false | 28 | 28 |
| Commerce PG 15 | *(none)* | — | 1 | 0 |
| English 3 | I BA ENGLISH | **true** | 28 | 28 |
| History 38 | I B.A HISTORY | false | 56 | 56 |
| History PG 1 | *(none)* | — | 1 | 0 |
| Mathematics 11 | I B.Sc (Mathematics) | **true** | 7 | 7 |
| Zoology 17 | I B.Sc ZOOLOGY | **true** | 30 | 30 |
| Zoology PG 4 | *(none)* | — | 1 | 0 |

The three `(none)` rows have a single slot carrying no course — a free period, not teaching.

**A3 — the proof that an empty `section_id` does not stop marking.**

```sql
SELECT t.timetable_name, t.section_id,
       (SELECT count(*) FROM student_attendance sa WHERE sa.timetable_id = t.id) AS marked_rows
FROM timetables t
WHERE t.institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127'
  AND t.is_template IS NOT TRUE
ORDER BY marked_rows DESC;
```
Result: 11 timetables carry attendance — **167 rows, 2026-06-15 to 2026-07-31** — and **every one has `section_id` empty**. Exactly one Aided timetable has `section_id` populated (`II M.Com`, id `3d000c15…`, section A) and it has **zero** rows.

**A4 — the six templates, and proof none has been cloned.**

```sql
SELECT t.id, t.template_name, t.timetable_name, t.timetable_format,
       t.attendance_mode, t.num_cycles, t.selected_days, t.usage_count,
       (SELECT count(*) FROM timetables c WHERE c.created_from_template_id = t.id) AS clones
FROM timetables t
WHERE t.institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127'
  AND t.is_template = true
ORDER BY t.created_at;
```
Result: 6 rows, every one `usage_count = 0` and `clones = 0`, all `cycle` / `period_wise` / `num_cycles = 6` / Monday–Saturday.

**A5 — the period grid.**

```sql
SELECT t.timetable_name,
       (SELECT string_agg(p->>'period_name' || ' ' || (p->>'start_time') || '-' || (p->>'end_time'),
                          ' | ' ORDER BY (p->>'sort_order')::int)
          FROM jsonb_array_elements(t.periods) p) AS grid,
       t.num_cycles, t.start_date, t.end_date
FROM timetables t
WHERE t.institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127' AND t.is_template = true;
```
Result: all six identical — the seven rows in §5.

**A6 — baseline, proving nothing was written.**

```sql
SELECT count(*) FILTER (WHERE is_template IS NOT TRUE) AS real_timetables,
       count(*) FILTER (WHERE is_template = true)      AS templates,
       count(*) FILTER (WHERE created_at::date = current_date) AS created_today
FROM timetables
WHERE institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127';
```
Reading on 5 August 2026, taken twice — before and after this document was produced: **19 timetables, 6 templates, 0 created today.**

---

## Appendix B — identifiers, for audit

| Item | Value |
|---|---|
| Institution — Arts and Science (Aided) | `a33138b6-4eea-4675-941f-1071bf88b127` |
| Academic year 2026-2027 (Aided) | `4524bd15-dcce-4822-a598-74c52332664b` |
| Degree — Postgraduate | `193e34f6-dee0-45ad-94eb-ad02dbfdc29a` |
| Degree — Undergraduate | `9a434ae9-e3dd-4a2b-a8cc-0851cfd98a57` |

**Bucket C — build these three**

| Programme | Section id | Semester id | Programme id | Template to clone |
|---|---|---|---|---|
| MASTER OF COMMERCE | `44e2a669-c233-42c1-8010-69406d5d5068` | `a2ade7db-c50e-4c62-a552-0cd3d81353ec` | `da57fabf-4c0d-495d-b934-c2d22d302583` | `5816f495-4eb6-4e0d-afd8-49da9c9493a1` |
| M.Sc. ZOOLOGY | `8096de5d-cebb-4878-b606-1f91b3e32224` | `5377c868-89f9-4680-a93e-f8469effb859` | `36c02a56-f3af-4600-b3e5-e849b0611e71` | `5816f495-4eb6-4e0d-afd8-49da9c9493a1` |
| M.A. HISTORY | `346e853e-188d-4375-83eb-2f950e95986f` | `75f5b6ef-665d-4583-8e9d-f72e54c13ba4` | `320c71d3-7d2f-4aa7-b4dc-b94176518a3b` | `5816f495-4eb6-4e0d-afd8-49da9c9493a1` |

**Bucket B — re-save these four as timetables, not templates**

| Programme | Section id | Template id (currently) |
|---|---|---|
| B.Sc. CHEMISTRY | `442bdd4d-1af3-40dd-9750-bf3f7f3dce3b` | `e9d019bd-c8e9-45de-8e12-c910af5d4ae8` |
| B.Sc. ZOOLOGY | `27b650fc-cdeb-400b-aeb7-acc79d626f91` | `75a7ef78-c134-4175-b7cb-4c3ac9f331ff` |
| B.Sc. MATHEMATICS | `d7f00d41-3306-4224-a9da-c86badb4982d` | `8a758ded-864e-4a57-ac0c-97388e6bf158` |
| B.A. ENGLISH | `2c41b22f-51b3-439f-bcd6-cb7c4270a482` | `5095857a-b717-43db-8e20-adb0ee2424ae` |

**Bucket A — MyJKKN reporting fix only, no college action**

| Programme | Section id | Existing timetable |
|---|---|---|
| BACHELOR OF COMMERCE | `54f6f44a-026f-450e-a24c-d505f19fdead` | I B.Com |
| B.A. HISTORY | `f2cf7de7-2020-4e3f-a455-3e54bcad7aa1` | I B.A HISTORY |
| M.Sc. CHEMISTRY | `cebfbd9a-da76-4f86-b608-e49d939186e8` | I M.SC CHEMISTRY |

---

## Appendix C — the MyJKKN-side fix, for our own record

`fn_attendance_fresher_readiness` classifies on the `timetables.section_id` column alone. Its `tt` CTE needs to union the slot-level link, the same both-shapes treatment the adjacent `marked` CTE already applies to `student_attendance`:

```sql
tt AS (
  SELECT t.section_id AS sec_id, ... FROM timetables t WHERE t.section_id IN (...)
  UNION ALL
  SELECT (jsonb_array_elements_text(slot->'section_ids'))::uuid, ...
  FROM timetables t,
       jsonb_each(t.timetable_data) d(day, dayslots),
       jsonb_each(d.dayslots)       p(pkey, slot)
  WHERE jsonb_array_length(coalesce(slot->'section_ids', '[]'::jsonb)) > 0
)
```

Described only — **not applied**. Open questions before it ships: whether template timetables should count toward readiness at all, and whether a slot with no `course_id` (a free period) should. Both change the resulting number.
