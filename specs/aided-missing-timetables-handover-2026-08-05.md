# Arts & Science (Aided) — Missing Timetables: Build Specification

**For:** JKKN College of Arts and Science (Aided) — academic office / timetable team
**From:** MyJKKN platform team
**Date:** 5 August 2026
**Status:** Specification only. **Nothing in this document has been created in MyJKKN.** No timetable, no period, no template row was written to production while producing it. Every number below was read live from production on 5 August 2026 and every query is reproduced in Appendix A so you can re-run it yourself.

---

## 1. Why this document exists

164 first-year learners at Aided are enrolled, active and fee-paid — and **attendance cannot be marked for any of them**, because the sections they sit in have no timetable attached.

This is easy to miss, and the reason is worth understanding. MyJKKN's "Pending Attendance" screen builds its list of *expected* classes from timetables. A section with no timetable produces no expected classes, therefore produces no pending rows, and therefore renders as **perfectly healthy** on the very dashboard meant to catch unmarked attendance. Silence there means "nothing scheduled", not "nothing missing".

So the exposure is invisible by default. This document makes it explicit.

---

## 2. The headline

| | Sections | Learners |
|---|---:|---:|
| **Bucket A** — a timetable already exists, but is not attached to the section | 3 | 94 |
| **Bucket B** — nothing exists; a timetable must be built | 7 | 70 |
| **Total blocked** | **10** | **164** |

These are two genuinely different problems with two different owners.

- **Bucket B is your work.** A timetable encodes which team member teaches which period in which room. Only the college holds that information. This document tells you exactly what to build.
- **Bucket A is not your work.** Those three timetables already exist and are already active. They are simply not linked to a section. Rebuilding them from scratch would be wasted effort and would leave two copies. See §6.

---

## 3. The single most important instruction

When you create each timetable, on the **Timetable Type** field choose **Section**, not Semester — and then pick **Section A**.

This is not a preference. It is the exact reason the current 18 timetables at Aided are invisible.

MyJKKN's create-timetable form makes the section optional when Timetable Type is "Semester" (`app/(routes)/academic/timetables/new/page.tsx`, form schema — `section_id` is `.optional()`, required only when `timetable_type === 'section'`). Eighteen of Aided's nineteen existing timetables were created that way, so they carry no section. Attendance readiness is computed by matching a timetable to a section, so a timetable with no section matches nothing and its learners read as blocked.

**If you build these seven as "Semester" type, you will do all the work and the 70 learners will still show as blocked.**

---

## 4. Bucket B — the seven timetables to build

All seven are **Semester I, Section A, academic year 2026-2027**. Each row is one timetable.

| # | Programme | Department | Learners | Clone this template | Exact match? |
|---|---|---|---:|---|---|
| 1 | B.Sc. CHEMISTRY | Chemistry | 19 | **I B.SC CHEMISTRY** | ✅ same programme & year |
| 2 | B.Sc. ZOOLOGY | Zoology | 17 | **I B.Sc ZOOLOGY** | ✅ same programme & year |
| 3 | MASTER OF COMMERCE | Commerce (PG) | 15 | **II M.SC CHEMISTRY** | ⚠️ shape only — see note |
| 4 | B.Sc. MATHEMATICS | Mathematics | 11 | **I B.Sc (Mathematics)** | ✅ same programme & year |
| 5 | M.Sc. ZOOLOGY | Zoology (PG) | 4 | **II M.SC CHEMISTRY** | ⚠️ shape only |
| 6 | B.A. ENGLISH | English | 3 | **I BA ENGLISH** | ✅ same programme & year |
| 7 | M.A. HISTORY | History (PG) | 1 | **II M.SC CHEMISTRY** | ⚠️ shape only |

**Four of the seven already have a template built for that exact programme and year, sitting unused.** They were created in June–July 2026 and have never been cloned (`usage_count = 0`, zero timetables reference them). For those four, cloning gives you the right period grid immediately and you only need to fill in the teaching assignments.

**The three PG sections (#3, #5, #7) have no programme-specific template.** `II M.SC CHEMISTRY` is recommended only because it is the one postgraduate template available and its period grid is identical to every other template at Aided (§5). You are cloning the *shape*, not the content — every subject and team-member assignment must be replaced. If you would rather start those three from scratch, that is equally valid; the grid in §5 is what to reproduce.

**Naming.** Follow the convention already in use at Aided: Roman numeral for the year, then the programme — `I M.Com`, `I M.Sc ZOOLOGY`, `I M.A HISTORY`, and so on. This matters because the existing `I B.Com`, `I B.A HISTORY` and `I M.SC CHEMISTRY` names are already taken by the Bucket A timetables.

---

## 5. The grid shape — identical across all six templates

Every existing template at Aided uses the same structure, verified row by row:

| Field | Value |
|---|---|
| Timetable format | **Cycle** (not Regular, not Batch) |
| Number of cycles | **6** |
| Attendance mode | **Period-wise** |
| Timetable type | Semester ← **change this to Section** (§3) |
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

That is five teaching periods and two breaks, 09:45 to 15:45.

> **Two things to be aware of, neither of which is your error.**
>
> **(a) The breaks are not flagged as breaks.** On all six templates, the `Break` and `Lunch Break` rows carry `is_break = false`. If you clone a template you will inherit that. Whether MyJKKN should expect attendance to be marked against a break period is a platform question we are raising separately — flagged here only so the behaviour does not surprise you.
>
> **(b) The template picker will label these "Regular".** All six templates are Cycle format, but the dropdown on the create screen only distinguishes "Batch" from everything else, so Cycle templates display as "Regular". The template itself is correct; the label is wrong. We are logging that as a defect.

---

## 6. Bucket A — the three that are not your work

| Programme | Department | Learners | Timetable that already exists | State |
|---|---|---:|---|---|
| BACHELOR OF COMMERCE | Commerce | 54 | **I B.Com** | active, no section attached |
| B.A. HISTORY | History | 38 | **I B.A HISTORY** | active, no section attached |
| M.Sc. CHEMISTRY | Chemistry (PG) | 2 | **I M.SC CHEMISTRY** | active, no section attached |

These three timetables cover exactly the right programme and Semester I. They were created as "Semester" type, so they carry no section link, which is why the readiness panel counts their learners among the blocked.

**Please do not rebuild these.** The fix is to attach the existing timetable to Section A — a single field, on the MyJKKN side. Doing it as a fresh build would leave Aided with two competing timetables for the same class.

> **Open item, honestly flagged:** at the time of writing we had confirmed the *linkage* gap but had not yet finished confirming whether attendance can nonetheless be marked against these three today by opening the timetable directly. A companion investigation is running. If it turns out marking already works, then the only thing broken for these 94 learners is the dashboard's reporting — still worth fixing, but not urgent. If marking is also broken, these 94 learners are as blocked as the other 70 and this becomes the highest-priority item in the document. **This section will be updated with that verdict; do not treat Bucket A as resolved until it is.**

---

## 7. Step by step, on screen

For each of the seven rows in §4:

1. Go to **Academic → Timetables**, click **New Timetable** (`/academic/timetables/new`).
2. **Start from template** — pick the template named in the §4 table. (The dropdown shows six; the four exact matches are named for their programme.)
3. **Timetable name** — per the naming convention in §4.
4. **Institution** — JKKN College of Arts and Science (Aided).
5. **Academic year** — 2026-2027.
6. **Degree** — Undergraduate for #1, #2, #4, #6; Postgraduate for #3, #5, #7.
7. **Programme** — from the §4 table.
8. **Department** — from the §4 table.
9. **Semester** — Semester I.
10. **Timetable type** — **Section**. ← §3. Do not leave this as Semester.
11. **Section** — **A**. This field only appears once step 10 is set to Section.
12. **Timetable format** — Cycle. **Number of cycles** — 6. (Cloning a template should pre-fill these; confirm them.)
13. **Attendance mode** — Period-wise.
14. **Start date** 2026-06-15, **End date** 2026-10-31.
15. Save, then fill the grid: assign subject and teaching team member to each of the five teaching periods across all six cycles.

**Required fields, so nothing blocks you at save time:** timetable name (minimum 3 characters), institution, academic year, degree, programme, department, semester. Section becomes required once type is Section. Number of cycles is required because the format is Cycle. Class incharge is required *only* for session-wise attendance — you are using period-wise, so you can leave it blank.

---

## 8. How to check you are done

After building all seven, open **Academic → Attendance → Dashboard**, tab **Current Intake Readiness**, filtered to Arts and Science (Aided).

- Before your work: **10 sections blocked, 164 learners**.
- After the seven in Bucket B: **3 sections blocked, 94 learners** — the Bucket A three, which are ours.
- After Bucket A is fixed too: **0 blocked**.

If a section you built still shows blocked, the most likely cause by far is step 10 — the timetable saved as Semester type with no section.

---

## 9. What we could not determine

Stated plainly rather than guessed:

- **Which team member teaches which period.** Not held in MyJKKN for these sections. Only the college has it.
- **Room allocation.** Same.
- **Whether Semester I of 2026-2027 genuinely runs 2026-06-15 to 2026-10-31 for all seven programmes.** Those dates are copied from the existing templates. If a programme's term differs, use its real dates.
- **Whether any of the seven sections should be split into more than one section.** Every one currently has exactly one section, "A". The 54-learner Commerce section and 38-learner History section are in Bucket A, so the largest you are building is 19.
- **Whether attendance is markable today for Bucket A.** See the flag in §6.

---

## Appendix A — every query behind this document

Run against production ref `kvizhngldtiuufknvehv`, read-only, 5 August 2026.
Aided institution id: `a33138b6-4eea-4675-941f-1071bf88b127`.

**A1 — the 10 blocked sections and their learner counts.** Mirrors the logic of `public.fn_attendance_fresher_readiness`, inlined because that function requires a signed-in caller.

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
JOIN sections sc      ON sc.id = f.sec_id
LEFT JOIN departments d  ON d.id  = sc.department_id
LEFT JOIN semesters   sm ON sm.id = sc.semester_id
ORDER BY d.department_name;
```
Result: 10 rows, `timetables_linked = 0` on every one, learner counts summing to 164.

**A2 — the Bucket A / Bucket B split.** For each blocked section, is there an unlinked timetable for the same department and semester?

```sql
SELECT d.department_name, sm.semester_name, sc.section_name,
       (SELECT string_agg(t.timetable_name, ' | ')
          FROM timetables t
         WHERE t.institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127'
           AND t.is_template IS NOT TRUE
           AND t.section_id IS NULL
           AND t.department_id = sc.department_id
           AND t.semester_id   = sc.semester_id) AS unlinked_timetable
FROM sections sc
LEFT JOIN departments d  ON d.id  = sc.department_id
LEFT JOIN semesters   sm ON sm.id = sc.semester_id
WHERE sc.id IN (
  '442bdd4d-1af3-40dd-9750-bf3f7f3dce3b','cebfbd9a-da76-4f86-b608-e49d939186e8',
  '54f6f44a-026f-450e-a24c-d505f19fdead','44e2a669-c233-42c1-8010-69406d5d5068',
  '2c41b22f-51b3-439f-bcd6-cb7c4270a482','f2cf7de7-2020-4e3f-a455-3e54bcad7aa1',
  '346e853e-188d-4375-83eb-2f950e95986f','d7f00d41-3306-4224-a9da-c86badb4982d',
  '27b650fc-cdeb-400b-aeb7-acc79d626f91','8096de5d-cebb-4878-b606-1f91b3e32224');
```
Result: 3 sections return a timetable name (Bucket A), 7 return null (Bucket B).

**A3 — the six templates, and proof they are unused.**

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

**A4 — the period grid.**

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

**A5 — baseline, to prove nothing was written.**

```sql
SELECT count(*) FILTER (WHERE is_template IS NOT TRUE) AS real_timetables,
       count(*) FILTER (WHERE is_template = true)      AS templates
FROM timetables
WHERE institution_id = 'a33138b6-4eea-4675-941f-1071bf88b127';
```
Reading on 5 August 2026, before and after this document was produced: **19 timetables, 6 templates.**

---

## Appendix B — identifiers, for audit

| Item | Value |
|---|---|
| Institution — Arts and Science (Aided) | `a33138b6-4eea-4675-941f-1071bf88b127` |
| Academic year 2026-2027 (Aided) | `4524bd15-dcce-4822-a598-74c52332664b` |
| Degree — Undergraduate | `9a434ae9-e3dd-4a2b-a8cc-0851cfd98a57` |
| Degree — Postgraduate | `193e34f6-dee0-45ad-94eb-ad02dbfdc29a` |

**Bucket B — the seven sections to build for**

| Programme | Section id | Semester id | Programme id | Template id to clone |
|---|---|---|---|---|
| B.Sc. CHEMISTRY | `442bdd4d-1af3-40dd-9750-bf3f7f3dce3b` | `21cf48c2-0219-4f30-a710-6fbb8e851360` | `405fece5-b0f5-4a77-912e-ec53ce3afa51` | `e9d019bd-c8e9-45de-8e12-c910af5d4ae8` |
| B.Sc. ZOOLOGY | `27b650fc-cdeb-400b-aeb7-acc79d626f91` | `19d9feac-ae6b-40f2-b31a-e4a2f460e67a` | `3ad421a0-0aa5-4ebf-9ec4-5a54cd184cb2` | `75a7ef78-c134-4175-b7cb-4c3ac9f331ff` |
| MASTER OF COMMERCE | `44e2a669-c233-42c1-8010-69406d5d5068` | `a2ade7db-c50e-4c62-a552-0cd3d81353ec` | `da57fabf-4c0d-495d-b934-c2d22d302583` | `5816f495-4eb6-4e0d-afd8-49da9c9493a1` |
| B.Sc. MATHEMATICS | `d7f00d41-3306-4224-a9da-c86badb4982d` | `d0275ff5-235e-4c42-8b05-dfbc881b7d56` | `f0c3247a-4698-47df-aa68-447b7eac69f3` | `8a758ded-864e-4a57-ac0c-97388e6bf158` |
| M.Sc. ZOOLOGY | `8096de5d-cebb-4878-b606-1f91b3e32224` | `5377c868-89f9-4680-a93e-f8469effb859` | `36c02a56-f3af-4600-b3e5-e849b0611e71` | `5816f495-4eb6-4e0d-afd8-49da9c9493a1` |
| B.A. ENGLISH | `2c41b22f-51b3-439f-bcd6-cb7c4270a482` | `7204d03c-8408-417d-bd16-8e632aad7434` | `6a7bb4e3-f2ad-4cc1-9967-c45d7921f1df` | `5095857a-b717-43db-8e20-adb0ee2424ae` |
| M.A. HISTORY | `346e853e-188d-4375-83eb-2f950e95986f` | `75f5b6ef-665d-4583-8e9d-f72e54c13ba4` | `320c71d3-7d2f-4aa7-b4dc-b94176518a3b` | `5816f495-4eb6-4e0d-afd8-49da9c9493a1` |

**Bucket A — the three MyJKKN must link, not rebuild**

| Programme | Section id | Existing timetable |
|---|---|---|
| BACHELOR OF COMMERCE | `54f6f44a-026f-450e-a24c-d505f19fdead` | I B.Com |
| B.A. HISTORY | `f2cf7de7-2020-4e3f-a455-3e54bcad7aa1` | I B.A HISTORY |
| M.Sc. CHEMISTRY | `cebfbd9a-da76-4f86-b608-e49d939186e8` | I M.SC CHEMISTRY |
