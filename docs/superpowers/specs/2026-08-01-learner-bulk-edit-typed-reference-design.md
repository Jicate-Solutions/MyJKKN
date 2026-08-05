# Typed Reference in the Learners Bulk-Edit Template

**Date:** 2026-08-01
**Scope:** `/learners/profiles` → **Bulk Edit Active** (4,343 active learners)
**Status:** design approved, pending implementation plan

---

## 1. Problem

The admission module captures a referral as a **typed link to a real record**: pick
`Consultant | Student | Faculty`, then pick the person from that type's table. New
admissions are therefore correctly attributed.

Existing learners are not. The only bulk surface that can fix them — the Bulk Edit
Active template — ships **three free-text columns** (`export-exited-for-edit/route.ts`
SECTION 10) that write the *legacy* text triple and link to nothing.

## 2. Current state (measured 2026-08-01)

### 2.1 `learners_profiles` carries two parallel reference systems

| | Legacy (in the template today) | Typed / FK (what admission writes) |
|---|---|---|
| Columns | `reference_type`, `reference_name`, `reference_contact` | `referral_type`, `referred_by_id`, `referred_by_name` |
| Constraint | none — free text | `referral_type` CHECK: `consultant \| student \| faculty \| learner_ambassador` |
| Written by | old enquiry form (UI deleted 2026-05-21), bulk-edit template, B2A API | leads module → `/api/admission/bridge/convert` → mirror trigger |
| Rendered on | `/learners/profiles/[id]` (`learner-detail.tsx:1041`) | `/learners/enquiries/[id]` (`enquiry-detail.tsx:1025`) |

Population, 7,165 profiles / 4,343 active:

- `reference_type` — 6,154 non-null, but **4,088 are empty string**, 1,011 null. Real
  values are dirty: `DIRECT APPLICATION` 1079, `EDUCATIONAL CONSULTANT` 295,
  `DIRECT` 149, `-` 122, `PERSONAL` 110, plus `BROTHER`, `NILL`, `DAY SCHOLAR`,
  `VENKATESHWARA COLLEGE - MR.RAMESH`.
- `referral_type` — 891 rows: `consultant` 561 (522 with an id), `faculty` 215 (177),
  `student` 115 (50).

**Not one of the 4,343 ACTIVE learners has any typed referral** — `referral_type`,
`referred_by_id` and `referred_by_name` are empty across all of them, while 1,290
hold legacy free text. All 891 typed rows sit on non-active lifecycle stages. So on
this scope the template is doing greenfield population, not correction: nothing to
overwrite, no name drift to reconcile, and the read-only legacy column is the only
reference data an editor will see for those 1,290 rows.

### 2.2 The admission picker

`app/(routes)/admission/leads/new/page.tsx:79` — `REFERRAL_TYPES = consultant | student | faculty`.

| Type | Table | Hook | Filter |
|---|---|---|---|
| Consultant | `education_consultants` | `useConsultantsForDropdown` | `status='active'` |
| Student | `learners_profiles` | `useStudentsForDropdown` | `lifecycle_status='active'` |
| Faculty | `staff` | `useFacultyForDropdown` | `is_active=true` |

Referrers are deliberately **not** scoped to the lead's institution
(`leads/new/page.tsx:148`: *"Referrer hierarchy filters — INDEPENDENT of the lead's
institution"*).

### 2.3 `referred_by_id` is polymorphic and has no foreign key

Confirmed absent from `pg_constraint` on `learners_profiles`, while every other FK
(`caste_id`, `quota_id`, …) is present. Consequences:

- a wrong-table UUID writes silently — no `23503` to catch it;
- validation must be done per-type in application code;
- a **name with a null id is a supported state**, not an error —
  `types/admission.ts:46` documents it as *"Free-text fallback when the referrer
  wasn't in the consultant list"*, and 63 rows live that way today
  (consultant 20, faculty 12, student 31).

### 2.4 Two triggers make this more than a column write

- **`trg_sync_learner_referral_to_attribution`** — `AFTER UPDATE OF referred_by_id`
  on `learners_profiles`. If the new id matches an `education_consultants` row it
  inserts a `consultant_lead_attributions` row at `attribution_type='primary'`,
  100%, `referral_source='auto_sync_learner'`, and deletes the prior auto row. That
  is the input to the consultant commission engine. **Fires only for consultants** —
  staff and student ids create nothing.
- **`trg_sync_lead_referral_to_learner_profile`** — on `admission_leads`, mirrors the
  lead's referral onto the linked profile. 1,470 profiles are lead-linked, **but not
  one of them is `active`** (863 reserved, 356 enquiry_submitted, 100 admitted, 66
  account, 53 rejected, 29 enquiry, 2 withdrawal_pending, 1 waitlisted). On this
  scope the mirror never fires.

### 2.5 Bare-name matching is provably unsafe

| Source | Rows | Duplicate names | Stable code |
|---|---|---|---|
| `education_consultants` | 151 (all active) | 2 (`MURALI`×2, `SURESH`×4) | **`code` empty on all 151** — only `phone`/`email` |
| `staff` | 741 active + 116 inactive | 7 dup full names | `staff_id` on 662 active / 111 inactive (1 dup) |
| `learners_profiles` active | 4,343 | **333 dup full names** | `roll_number` on 3,823 (75 dups) |

### 2.6 Records hidden by the picker's active-only filter

| | Rows | With code |
|---|---|---|
| `staff` `is_active=false` | 116 | 111 |
| `learners_profiles` `graduated` | 1,106 | 1,097 |
| `learners_profiles` `inactive` | 205 | 196 |
| `learners_profiles` `exited` | 3 | 3 |

≈ **1,430 real records** for "old staff / old student" referrers that would otherwise
degrade to free text.

### 2.7 Existing machinery to extend

- **`lib/services/bulk-learner-fk-fields.ts`** — the `<Field> ID` + `<Field>` label
  pattern for 5 FK columns: ID wins, label resolves through a 60 s-cached resolver,
  unresolvable values become a **preview warning with the field skipped**. Preview
  and write share it — that sharing is what killed the phantom-changes bug.
- **`app/api/learners/enquiries/template/route.ts`** — ExcelJS cascading dropdowns via
  `OFFSET`+`MATCH`+`COUNTA` against a hidden `Lists` sheet, headers as keys. No
  `INDIRECT`, no named ranges.
- **Blocker:** the bulk-edit export uses **SheetJS** (`XLSX.utils.json_to_sheet`),
  which cannot write data validation in the community edition. `exceljs ^4.4.0` is
  already a dependency.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Write **both triples in sync** — FK columns authoritative, legacy text mirrored | `/learners/profiles/[id]` renders only the legacy columns; mirroring avoids a UI change |
| D2 | **Allow** the consultant-attribution trigger, **count it in the preview** | Bulk edit behaves exactly like the leads picker; no trigger migration; reviewer consents with a number in front of them |
| D3 | **Profiles (Active) only** | The 4,343 rows in question. Enquiries bulk edit is a separate surface |
| D4 | Update the linked lead when one exists — **as a guard, not a feature** | Zero active profiles are lead-linked today; one batched query per upload makes it correct if that ever changes |
| D5 | Dropdowns include **past records with a status suffix** | Rescues ~1,430 records from the free-text path |
| D6 | Unmatched names **auto-fall back to name-only**, bucketed in the preview with a typo hint | The nullable id is the schema's own answer; the preview bucket is what separates "departed" from "typo" |

## 4. Design

### 4.1 Excel contract — SECTION 10 becomes 5 columns

Replaces the 3 columns at `export-exited-for-edit/route.ts:245-248`.

| Excel column | Export writes | Import writes to |
|---|---|---|
| **Reference Type** *(dropdown)* | display label from `referral_type`, else blank | `referral_type` **+** `reference_type` |
| **Reference ID** | `referred_by_id` | `referred_by_id` |
| **Reference Person** *(cascading dropdown)* | disambiguated label for `referred_by_id`, else raw `referred_by_name` | `referred_by_name` **+** `reference_name` |
| **Reference Contact** | `reference_contact` | `reference_contact` — derived on match, editor-supplied on name-only |
| **Current Reference (read-only)** | `reference_type / reference_name` when `referral_type` is null | nothing — context only |

Type mapping. **The label is not the stored value** — `Staff` stores `faculty`:

```
Consultant → referral_type 'consultant' → reference_type 'EDUCATIONAL CONSULTANT'
Student    → referral_type 'student'    → reference_type 'CURRENT/FORMER STUDENT'
Staff      → referral_type 'faculty'    → reference_type 'JKKN STAFF'
```

Those three `reference_type` values are members of the existing `EXCEL_REFERENCE_TYPE`
vocabulary (`lib/utils/mappings/enquiry-excel-mappings.ts:53`), so the legacy column
stays consistent with the enquiry template.

`reference_contact` sources, confirmed against the schema:
`education_consultants.phone` / `staff.phone` / `learners_profiles.student_mobile`.

### 4.2 Person labels

```
Consultant   SURESH — 9677029180                 (name alone when phone is null)
Staff        RAMESH KUMAR — JKKN0421
             MURUGAN S — JKKN0088 (Former)       is_active = false
             KAMALA D — Lecturer                 no staff_id → designation
Student      PRIYA S — BDS25012
             ARUN K — BDS19004 (Graduated)
             DEEPA M — BSC21077 (Inactive)
             RAJA V — BSC18003 (Exited)
```

List membership:

| List | Filter | Size |
|---|---|---|
| Consultant | all of `education_consultants` | 151 |
| Staff | all of `staff` | 857 |
| Student | `lifecycle_status IN ('active','graduated','inactive','exited')` | **5,657** |

Pre-admission stages (`reserved`, `enquiry_submitted`, `admitted`, `account`,
`rejected`, `approved`, `waitlisted`, `withdrawal_pending`) are excluded — someone
still in the funnel is not a student referrer.

### 4.3 Dropdown mechanic

Hidden `Lists` sheet, header cell as the key, column body as the dependent list —
the pattern already proven in `enquiries/template/route.ts:960-1000`.

```
Lists!A1 Consultant   B1 Staff        C1 Student        E1 (type values)
     A2 SURESH — …    B2 RAMESH — …   C2 PRIYA S — …    E2 Consultant
     …151 rows        …857 rows       …5,657 rows       E3 Staff  E4 Student

Reference Type   validation:  Lists!$E$2:$E$4
Reference Person validation (row N):
  OFFSET(Lists!$A$1,1,MATCH(<TypeCol>N,Lists!$A$1:$C$1,0)-1,
         COUNTA(OFFSET(Lists!$A$1,1,MATCH(<TypeCol>N,Lists!$A$1:$C$1,0)-1,6000,1)),1)
```

The existing template hardcodes a `100`-row `COUNTA` window; students need `6000`.
Both validations use `allowBlank: true` and `errorStyle: 'warning'`, matching the
enquiry template — a blank cell must never be flagged, since blank means "no change".

The export route ports from SheetJS to ExcelJS. **Every existing header string stays
byte-identical** and the sheet keeps the name `Active Learners`, because
`parseExcelFile(file, 'Active Learners', …)` targets it by name and `COLUMN_MAPPING`
matches on header text, not position.

### 4.4 Matching — three tiers

New module `lib/services/bulk-learner-reference-fields.ts`, imported by **both**
preview and write so they cannot diverge.

```
Tier 1  active record        → matched by id
Tier 2  past record          → matched by id, label carries (Former)/(Graduated)/…
Tier 3  no record at all     → name-only: referral_type + referred_by_name, id NULL
```

Resolution order per row:

```
1. Reference ID holds a UUID
     → verify it exists in the table implied by Reference Type
       wrong table → warning "ID is not a <Type> record", reference skipped

2. Reference Person matches a dropdown label exactly ("NAME — CODE [(Status)]")
     → split, match CODE exactly within type → resolved

3. Bare name, normalised (trim, collapse whitespace, uppercase)
     1 hit   → resolved
     >1 hits → AMBIGUOUS: warning listing candidates + codes, reference skipped,
               never guessed
     0 hits  → TIER 3 name-only

4. Type filled, Person blank  → write referral_type + reference_type only
4b. Contact ONLY, no type stored or supplied
     → write reference_contact alone, silently. It is a legacy free-text column
       and editing it by itself is legitimate. Found during implementation: 123
       active learners hold a legacy contact with no typed reference, so warning
       here fired on every one of them during an UNEDITED round-trip and buried
       the warnings that matter.
5. Type blank, ID or Person filled
     → fall back to the learner's STORED referral_type, exactly as
       resolveLearnerFkFields() falls back to ctx.existing.community_category_id
       when scoping caste. No stored type either → warning
       "Reference Type required to match a person", reference skipped
6. All three blank            → no change (existing engine semantics)
```

Matching is **global within the type**, not institution-scoped, mirroring the leads
picker. Ambiguity is resolved by the code suffix, not by tenancy.

**Typo hint** (tier 3 only): dedupe the unmatched names, bucket candidates by first
letter and length window, then normalised edit distance; surface the best candidate
when similarity ≥ 0.85. Capped at **100 distinct unmatched names** per upload so a
pathological sheet cannot turn into 5,657 × N comparisons.

**Resolver loading** mirrors `getLearnerFkResolvers`: three queries, 60 s process
cache. The student query returns 5,657 rows, so it **must** use `.range()` batching —
PostgREST caps at 1,000 by default and would silently truncate the list.

### 4.5 Write path

On a resolved reference, all six columns enter `updateData` together:

```ts
referral_type:     'consultant' | 'student' | 'faculty'
referred_by_id:    <uuid> | null            // null on tier 3
referred_by_name:  <plain name, code suffix stripped>
reference_type:    'EDUCATIONAL CONSULTANT' | 'CURRENT/FORMER STUDENT' | 'JKKN STAFF'
reference_name:    <plain name>
reference_contact: <record phone>  // tier 1/2 — editor's cell value on tier 3
```

Blank cells still mean "leave unchanged", so the 4,088 rows of legacy junk are only
touched on rows the editor actually filled in.

**Lead guard (D4):** one batched
`admission_leads.select('id, learner_profile_id, referral_type, referred_by_id, referred_by_name').in('learner_profile_id', ids)`
before the row loop. Returns 0 rows today. If a row *is* found, the lead's three
referral columns are updated and `trg_sync_lead_referral_to_learner_profile` mirrors
them back, keeping a single authority.

**Attribution counting (D2):** a row counts as `create` when the resolved type is
`consultant` and `referred_by_id` changes from null; `replace` when it changes from a
different consultant id. Staff and student rows count as neither — the trigger's
`EXISTS (SELECT 1 FROM education_consultants …)` guard excludes them.

### 4.6 Preview / Validate

The existing rail (`select → preview → validate → uploading → result`) is unchanged.

**Preview** renders reference changes as labels, never UUIDs — the same `fkLabel`
treatment the five FK fields already get.

**Validate** gains two blocks:

```
✓ 412 references linked to a record
ℹ  18 stored as NAME ONLY (no linked record)
     • SURESH KUMR    — did you mean SURESH KUMAR — JKKN0421 ?
     • K. BALAN (retired 2019)     no near match
     • THANGAVEL M                 no near match

⚠  137 rows set a CONSULTANT reference.
   This creates 137 consultant attributions (primary, 100%),
   which feed commission calculation.
   12 of them replace an existing auto-sync attribution.
```

Ambiguous and wrong-table rows join the existing `format` / `record` issue buckets.

### 4.7 Adjacent fix

`export-exited-for-edit/route.ts:207` reads `'Student Mobile': learner.mobile`, but
`learners_profiles` has no `mobile` column — only `father_mobile`, `mother_mobile`,
`student_mobile`. **That column exports blank for every learner today.** Corrected to
`learner.student_mobile` as part of the route rewrite.

## 5. Files

| File | Change |
|---|---|
| `lib/services/bulk-learner-reference-fields.ts` | **new** — resolvers, label builder, 3-tier matching, typo hint |
| `lib/services/bulk-learner-edit-workbook.ts` | **new** — the workbook itself (columns, Lists sheet, validation, instructions). Split out of the route during implementation: a route file may only export HTTP handlers, which left the column list and the validation formulas impossible to assert without an authenticated request |
| `app/api/learners/export-exited-for-edit/route.ts` | now just auth + filters + delivery; calls `buildBulkEditWorkbook`; `student_mobile` fix |
| `lib/services/learner-validation-service.ts` | `validateActiveLearner` also selects the six reference columns — needed for the stored-type fallback and for telling a real edit from a re-uploaded template. Must stay ONE string literal or Supabase's type-level select parser degrades the row to `GenericStringError` |
| `app/api/learners/bulk-edit-preview/route.ts` | `COLUMN_MAPPING` entries; reference resolution; warnings; attribution count |
| `app/api/learners/bulk-edit-exited/route.ts` | same mapping; write 6 columns; lead guard |
| `lib/services/bulk-learner-edit-service.ts` | reference pass in `previewChanges` + `processBulkEdit`; `FIELD_LABELS`; `REFERENCE_CONSUMED_KEYS` in both skip-loops |
| `app/(routes)/learners/profiles/_components/bulk-edit-exited-dialog.tsx` | name-only bucket + attribution banner in the validate step |

No migration. No permission-key change. No RLS change — these routes already run on
the service-role client.

## 6. Risks

1. **ExcelJS port regression** across the other ~60 columns. Mitigated by identical
   header strings and the round-trip test below.
2. **Generation cost** — 4,343 rows × ~64 columns × 2 validations. Measure; add a row
   warning if unacceptable.
3. **A 5,657-entry student dropdown is scroll-heavy.** The `Reference ID` column and
   bare-name matching are the escape hatches.
4. **Tier 3 orphans.** A name-only reference links to nothing by design; the preview
   bucket is the only thing standing between "departed staff" and "typo".

## 7. Verification — results

No IDE server was attached this session, so `mcp__ide__getDiagnostics` was
unavailable; a narrowed `tsc -p` over the touched files and their import graph
was used instead. All automated checks below were run against the live database
and **passed**; the temporary scripts were deleted afterwards.

| Check | Result |
|---|---|
| `tsc --noEmit` over all 8 touched files + import graph | clean (one real bug caught: concatenated `.select()` → `GenericStringError`) |
| Resolver suite, 20 assertions on live data | pass — list sizes 151 / 857 / **5,657** (not truncated), `(Former)` + `(Graduated)` suffixes, `Staff`→`faculty`, ambiguity refused (`SURESH` → 4 candidates), wrong-table uuid refused, tier-3 name-only, typo hint, stored-type fallback |
| **Round-trip:** build the real 4,343-row workbook, re-read with the importer's parser, resolve every row | **0 reference writes, 0 warnings** — caught the 123-row contact-only defect (rule 4b) on the first run |
| Data validation survives serialisation | pass — `Reference Type` = `Lists!$E$2:$E$4`; `Reference Person` = `OFFSET(…MATCH(BG2,Lists!$A$1:$C$1,0)-1…8000,1)`, `allowBlank`, `errorStyle: 'warning'`, applied through the last data row |
| Write path on one live learner, then reverted | pass — all six columns written, `referral_type='consultant'`, contact auto-filled, **one** `consultant_lead_attributions` row at `primary`/100/`auto_sync_learner`, `leads_updated: 0`; re-applying the same reference was a no-op (`skipped: 1`); revert restored the exact prior state and the trigger removed the attribution |
| Performance, 4,343 learners | fetch 3.1 s · workbook build 0.30 s · xlsx write 2.4 s · **1.80 MB** file |

**Still outstanding — browser verification.** Nothing above exercises the dialog
UI or Excel itself:

1. Download the template and confirm in **Excel** that picking a Reference Type
   filters the Reference Person dropdown. `OFFSET`/`MATCH` is asserted in the
   file but only Excel proves it renders.
2. Upload a smoke sheet — consultant via dropdown, `(Former)` staff, graduated
   student by roll number, a name-only near-typo, bare `SURESH`, a consultant
   uuid under Type=Staff, Type with no Person, Person with no Type — and confirm
   the validate step's name-only bucket and commission banner read correctly.
3. Confirm `/learners/profiles/[id]` shows the new reference through the mirrored
   legacy columns, for a **non-super-admin** role.

## 8. Out of scope

- Widening the leads module's own picker to include past records (D5 is
  template-only). Worth a follow-up for consistency.
- The Enquiries bulk edit (`/learners/enquiries`, 2,822 non-active rows).
- **Clearing** a reference — blank means "no change" throughout this engine, and no
  field has clear semantics today.
- `learner_ambassador`. Permitted by the `learners_profiles` CHECK but **not** by the
  `admission_leads` CHECK, and it has no source table.
