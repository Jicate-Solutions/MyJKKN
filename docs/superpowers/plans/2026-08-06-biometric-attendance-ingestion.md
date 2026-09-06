# Biometric Attendance Ingestion — Implementation Plan

**Date:** 2026-08-06
**Source analysed:** `Main Office July 2026 Report.xls` (eSSL-style `Monthly_Performance_Report`)
**Depends on:** `docs/superpowers/plans/2026-08-06-hr-shift-timings.md` (`hr_shift_timings`, already shipped)

---

## 0. Answer to "does a staff attendance table exist?"

**Yes — `hr_attendance_records`.** It is the canonical design and it is *empty for a reason*.

| | |
|---|---|
| Columns | 20 — `employee_id` (FK `staff.id`), `institution_id`, `hr_organization_id`, `work_date`, `status_type_id` (FK `hr_attendance_status_types`), `in_at`, `out_at`, `source`, `day_calc`, `hours_worked`, GPS ×3, `recomputed_from_event_id`, `reconciled_by/at`, `notes`, timestamps |
| Unique | `(employee_id, work_date)` — the only real uniqueness guard in the whole attendance schema |
| Rows | **0** |
| RLS | **No SELECT policy. No INSERT policy.** UPDATE/DELETE only. Nothing can read or write it — this is why it is empty. |
| Triggers | Two recompute triggers (leave approval, holiday change) — both UPDATE-only, so permanent no-ops at 0 rows |

Related tables that also exist and are empty: `hr_biometric_punches`, `hr_biometric_devices`, `hr_attendance_exceptions`, `hr_attendance_regularizations`, `hr_attendance_audit_log`, `faculty_attendance_days`.

**Decision (confirmed): `hr_attendance_records` is canonical.** `faculty_attendance_days` is retired from the write path.

---

## 1. Confirmed decisions

| Question | Decision |
|---|---|
| Biometric code scope | **Each machine numbers separately** → code must be stored with its issuing institution |
| Institution identifier in the file | **Reuse `counselling_code`** (Dept. Name), with CompName as tiebreaker |
| Canonical attendance table | **`hr_attendance_records`** |
| Extra fields to store | **WORK, OT, Break, and the machine's own P/A status** (alongside our computed status, never instead of it) |

---

## 2. What the file gives us (recap)

Per employee block of 10 rows × 48 employees; days 1–31 across columns.

| Level | Fields |
|---|---|
| Report | `Dept. Name` → institution code · `CompName` → institution name · `Report Month` |
| Employee | `Empcode` · `Name` · Present · WO · Absent · Total Work · Total OT |
| Per day | day · weekday · `IN` · `OUT` · `WORK` · `Break` · `OT` · `Status` (P/A) |

Format facts that drive the design:

- File is **legacy BIFF `.xls`** (`d0cf11e0`), not `.xlsx`. ExcelJS cannot read it; **SheetJS (`xlsx`, already a dependency) can read both.**
- Times are `HH:MM`, no seconds, no date. Date = column position + Report Month.
- Exactly **one IN and one OUT per day** — the machine has already collapsed intermediate punches. Lunch punches are unrecoverable.
- `--:--` means no punch.

---

## 3. Phase 1 — Identity: which staff member is `00002`?

### 3.1 Two new columns on `staff`

```sql
ALTER TABLE public.staff
  ADD COLUMN biometric_id text NULL,
  ADD COLUMN biometric_institution_id uuid NULL REFERENCES public.institutions(id);
```

`biometric_institution_id` is **the institution that owns the machine**, which is deliberately NOT
`staff.institution_id`. Proven by the data: 13 people on the Main Office machine belong to other
institutions — Krishnaveni A is `00593` on the MO machine but her institution is Arts & Science (Self).
Scoping on `staff.institution_id` would fail to match all 13.

### 3.2 Code normalisation

The same file mixes zero-padded and bare codes (`00002`, `04158`, `30`, `605`). An `IMMUTABLE`
helper keeps matching and the unique index consistent:

```sql
CREATE OR REPLACE FUNCTION public.fn_norm_biometric_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_code IS NULL OR btrim(p_code) = '' THEN NULL
    -- All-digit codes compare numerically: 00002, 002 and 2 are one code.
    WHEN btrim(p_code) ~ '^[0-9]+$' THEN (btrim(p_code))::bigint::text
    ELSE upper(btrim(p_code))
  END;
$$;
```

```sql
CREATE UNIQUE INDEX staff_biometric_uq
  ON public.staff (biometric_institution_id, public.fn_norm_biometric_code(biometric_id))
  WHERE biometric_id IS NOT NULL AND btrim(biometric_id) <> '';
```

The index makes a genuine conflict (two staff given the same code on one machine) fail loudly at
save time rather than silently mis-attributing a month of attendance.

### 3.3 Institution resolution from the file header

No migration to `counselling_code`. The resolver uses both header fields:

```
1. Match Dept. Name against institutions.counselling_code (case-insensitive, trimmed)
   -> exactly 1 hit  : resolved
   -> more than 1    : disambiguate using CompName vs institutions.name   (this is the CAS case)
   -> 0 hits         : fall back to CompName vs institutions.name
   -> still 0 or >1  : hard error, name the candidates, import nothing
```

Known state to design around: `CAS` is shared by Arts and Science **(Self)** and **(Aided)**;
`1234` and `123` are placeholder codes on Testing Institution and Incubation Forum.

### 3.4 Bootstrapping the mapping — 48 codes, today

| Match method | Result |
|---|---|
| Empcode → `staff.staff_id` | **0 / 48** |
| Name, normalised | 26 / 48 |
| Name, normalised **+ honorifics stripped** | **36 / 48 unique, 0 ambiguous** |

The honorific is the whole gap: MyJKKN stores `Mr. RADHA KRISHNAN T`, the machine stores
`Radhakrishnan T`.

**A one-time assisted mapping screen** — not automatic matching at import time. Name matching is
75% accurate here and would silently misattribute the moment two staff share a name.

- New page `/hr/admin/biometric-mapping`
- Pick institution → upload a device file (or enter codes) → the screen proposes the confident
  name matches → HR confirms each → the remaining 12 are searched and mapped by hand
- Writes `staff.biometric_id` + `staff.biometric_institution_id`
- The existing staff edit form also exposes both fields for one-off corrections

**Accepted limits of the two-column approach** (both currently hypothetical — no staff works across
institutions today, `hr_staff_institution_allocation` is empty):

- One staff member can hold **one** code on **one** machine. Enrolment on a second machine needs a
  mapping table instead.
- **No re-issue history.** If a leaver's code is reassigned, past attendance re-attributes to the new
  holder. Relevant: 6 people in this file are 0-present/31-absent and may be leavers.

If either becomes real, the upgrade is `hr_biometric_enrollments (institution_id, biometric_code,
staff_id, effective_from, effective_until)` and the two columns become a view over it.

---

## 4. Phase 2 — Storage: extend `hr_attendance_records`

### 4.1 New columns

```sql
ALTER TABLE public.hr_attendance_records
  -- from the device
  ADD COLUMN overtime_minutes integer NULL CHECK (overtime_minutes >= 0),
  ADD COLUMN break_minutes    integer NULL CHECK (break_minutes >= 0),
  ADD COLUMN device_status    text    NULL,   -- 'P' / 'A' exactly as the machine reported
  -- computed by us against hr_shift_timings
  ADD COLUMN first_half_attended  boolean NULL,
  ADD COLUMN second_half_attended boolean NULL,
  ADD COLUMN late_minutes         integer NULL CHECK (late_minutes >= 0),
  ADD COLUMN shift_timing_id      uuid    NULL REFERENCES public.hr_shift_timings(id),
  -- provenance
  ADD COLUMN biometric_institution_id uuid NULL REFERENCES public.institutions(id),
  ADD COLUMN biometric_code           text NULL;
```

`hours_worked numeric` already exists and takes WORK. `day_calc` already exists and gains a CHECK:

```sql
ALTER TABLE public.hr_attendance_records
  ADD CONSTRAINT hr_attendance_records_day_calc_chk
  CHECK (day_calc IN ('FULL','HALF','NONE'));
```

`shift_timing_id` is the auditability column: it records **which rule produced this verdict**, so a
staff member disputing a half-day can be shown the exact timing row that was in force that day.

### 4.2 RLS — the reason the table is empty

Add the two missing policies, mirroring the `hr_attendance_status_types` idiom (with `(SELECT fn())`
wrapping for the 57014 once-eval fix):

```sql
-- SELECT: self, team-approvers, HR, admins
-- INSERT: hr.attendance.override + role_has_institution_access(institution_id)
```

Both gate on existing declared keys (`hr.attendance.view_self`, `.view_all`, `.override`) held by
`hr_admin` / `hr_head`. No new permission keys needed.

### 4.3 One new status type

`hr_attendance_status_types` has PRESENT, ABSENT, HALF_DAY, LEAVE, HOLIDAY, ON_DUTY, REGULARIZED,
on_clinical_posting — but **no weekly-off**. Seed one system row:

```sql
INSERT INTO hr_attendance_status_types (institution_id, code, label, affects_lop, is_system, is_active)
VALUES (NULL, 'WEEKLY_OFF', 'Weekly Off', false, true, true);
```

Needed because the machine marks **all 192 Sundays as `A` (Absent)** with `WO = 0` — it has no weekly
off configured. Recording those as HOLIDAY would be semantically wrong.

### 4.4 Not building: raw punch storage

`hr_biometric_punches` stays unused. The file supplies only one IN and one OUT per day, and both are
stored on `hr_attendance_records` — so re-evaluation against changed shift timings is already
possible without the file. Adding a staging table would duplicate data for no gain.

---

## 5. Phase 3 — Parser and evaluation engine

### 5.1 Parser: `lib/hr/biometric/parse-monthly-report.ts`

- **SheetJS (`xlsx`), not ExcelJS** — reads `.xls` (BIFF) and `.xlsx` alike. ExcelJS cannot open this file at all.
- Walks 10-row blocks; a block starts where col A is `Dept. Name` and the next row's col A is `Empcode`.
- Emits `{ institutionCode, institutionName, month, employees[{ code, name, summary, days[] }] }`.
- Pure and side-effect free, so it is unit-testable offline against the real file.

### 5.2 Evaluation, per (staff, date)

```
resolve timing := fn_resolve_shift_timing(staff_id, work_date)

1. no timing row            -> EXCEPTION "no shift configured"        (import nothing for that day)
2. not is_working_day       -> WEEKLY_OFF        (overrides the machine's 'A')
3. no IN and no OUT         -> ABSENT
4. IN xor OUT missing       -> EXCEPTION "missing punch"              + hr_attendance_exceptions row
5. both present             -> cover-the-window:
      FN = IN <= first_half_start + grace  AND  OUT >= first_half_end
      AN = IN <= second_half_start         AND  OUT >= second_half_end
      FN and AN  -> PRESENT   day_calc FULL
      FN xor AN  -> HALF_DAY  day_calc HALF
      neither    -> ABSENT    day_calc NONE   (on-site but covering neither window)

late_minutes := max(0, IN - (first_half_start + grace))     -- flagged, day still counts
```

Step 2 is the important one: **our shift config corrects the machine, not the reverse.** Sundays and
second Saturdays resolve to non-working from `hr_shift_timings` regardless of the `A` in the file.

Both statuses are stored: `device_status` = `'A'`, `status_type_id` = WEEKLY_OFF. Disagreements stay
auditable instead of being silently overwritten.

### 5.3 Exceptions

`hr_attendance_exceptions` (exists, empty) receives the missing-punch days. **33 in this one file**,
including 9 for `00202 SAMBOORNAM` alone, and several where the day's only punch is plainly an
evening OUT that the machine filed under IN (`17:31`, `17:51`). These feed the existing
regularization queue rather than being guessed at.

### 5.4 Idempotency

Upsert on the existing `(employee_id, work_date)` unique constraint. Re-uploading the same month
overwrites cleanly — biometric is the system of record.

---

## 6. Phase 4 — UI

| Surface | Change |
|---|---|
| `/hr/admin/biometric-mapping` | **New.** The assisted code→staff mapping screen (§3.4) |
| `/hr/attendance/import` | Accept `.xls` + `.xlsx`. Wizard steps stay Upload → Preview → Validate → Submit → Result |
| Preview step | Now shows resolved institution, month, employee count, and a per-day grid with our computed status beside the machine's |
| Validate step | Unmapped codes (blocking), staff on this machine belonging to other institutions (warning), missing-punch days, days with no shift configured |
| Template | Regenerate to mirror the **device's own monthly format**, so HR uploads the machine file unchanged rather than reshaping it |
| `hr.attendance.import` role filter | **Remove the `faculty`/`hod` filter.** With `hr_attendance_records` keyed on `staff.id` there is no reason to exclude non-teaching staff — and this file is 44/48 non-teaching |

---

## 7. Phase 5 — Correct the Main Office shift timing

Seeded Main Office as **09:00–13:00 / 12:30–16:30**. The device data shows the real day:

| Observed | Value |
|---|---|
| IN | 08:53 – 09:05 (typical 08:57) |
| OUT | 17:30 – 18:15 |
| WORK | `08:30` for a normal day |

So Main Office actually works **09:00 – 17:30**. The seeded 16:30 end is **lenient, not strict** —
`OUT 17:30 >= 16:30` still credits the afternoon, so nobody is wrongly marked half-day. But it would
also credit someone who left at 16:35. Correct it to `second_half_end = 17:30` before the first real
evaluation run, via the existing scheduled-change path so history stays intact.

**Needed from you:** the correct first-half/second-half boundaries for Main Office, and whether the
other 13 institutions differ. WORK of 8:30 suggests a ~30 min unpaid break that the machine reports
as `Break 00:00`.

---

## 8. File-by-file work list

**Migrations**
1. `staff` biometric columns + `fn_norm_biometric_code` + unique index
2. `hr_attendance_records` new columns + `day_calc` CHECK
3. `hr_attendance_records` SELECT + INSERT RLS policies
4. `WEEKLY_OFF` status type seed
5. Mirror all of it into `supabase/setup/*.sql`

**Server**
6. `lib/hr/biometric/parse-monthly-report.ts` — matrix parser (SheetJS)
7. `lib/hr/biometric/resolve-institution.ts` — code + name resolver
8. `lib/hr/biometric/evaluate-day.ts` — pure cover-the-window evaluator
9. `app/api/hr/attendance/import/route.ts` — rewrite around the above, keep `dryRun`
10. `app/api/hr/attendance/import/template/route.ts` — regenerate to device format
11. `app/api/hr/biometric-mapping/**` — mapping CRUD

**Client**
12. `types/hr-biometric.ts`
13. `lib/services/hr/biometric-mapping-service.ts` + `hooks/hr/use-biometric-mapping.ts`
14. `app/(routes)/hr/admin/biometric-mapping/page.tsx` + components
15. Rework `biometric-import-dialog.tsx` for the new preview/validate content
16. `types/supabase.ts`, `MENU_PERMISSIONS`, sidebar entry, `gen:routes`

---

## 9. Verification

1. Parser unit-tested **against the real `.xls`** offline — 48 employees, 31 days, 1,488 cells, 924 P / 564 A, 33 missing-punch days. These are known-good numbers from the analysis.
2. Evaluator unit-tested on the documented cases: Velayutham day 18 (IN 08:52 / OUT 13:12) → HALF_DAY; any Sunday → WEEKLY_OFF; Sekar day 11 (IN 17:31, no OUT) → EXCEPTION.
3. Dry-run the real file end to end and reconcile our Present/Absent counts against the machine's own per-employee summary — **the file grades our own arithmetic**, and every disagreement should be explainable (Sundays, half-days).
4. RLS proven as a **non-super-admin** holding only `hr.attendance.override`.
5. `mcp__ide__getDiagnostics` per file; `check:menus`, `check:sidebar`, `check:reachability`, `check:audit-coverage`.

---

## 10. Open items needing your input

1. **Correct Main Office shift boundaries** (§7) — and whether other institutions differ from the 09:00–13:00 / 12:30–16:30 seed.
2. **The 12 unmapped device users** — are Sekar, SAMBOORNAM, Vaikai, N.HARI, MONISHA.A etc. real staff missing from MyJKKN, or leavers/duplicates to ignore?
3. **The 6 zero-attendance employees** (Anandhi A, Vinodhini S, NANDHAGOPALAN. S, NITHYA. S, MANIMEKALAI.B, RAJAKRISHNAN.K V) — enrolled but never punched. Leavers, or a device fault?
4. **Break** is `00:00` on every row. Will the machine be reconfigured to capture lunch punches? If yes, the parser should expect a second IN/OUT pair and the half-day rule gets materially more accurate.
5. **Do all 14 institutions have a machine**, and will each be configured with its own `counselling_code` in Dept. Name?
