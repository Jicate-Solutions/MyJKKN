# Bulk Bill Upload — Learner Name Matching

**Date:** 2026-07-27
**Module:** Billing → Schedule → Bulk Create (`/billing/schedule/bulk-create`)
**Status:** Approved for implementation

## Problem

The bulk bill upload identifies learners by **roll number alone**. Two consequences,
both measured against production data:

1. **112 same-institution duplicate roll-number groups.** The importer collapses
   duplicates into an `'__AMBIGUOUS__'` sentinel and rejects every row for that
   roll. Nobody gets billed. **104 of those 112 (93%) have distinguishable names.**
2. **~1,313 billable learners have no roll number at all** — 355 `active`,
   860 `reserved`, 98 `admitted`. `reserved` and `admitted` learners have not been
   assigned a roll number yet, and those are precisely the cohorts billed for
   admission fees. They cannot be billed through this flow today.

Adding learner name to the template and the matcher fixes both.

## Data findings that drive the design

Queried live against production on 2026-07-27.

Figures below marked **(verified)** were re-measured using the *exact* key
expressions the TypeScript uses (`upper(btrim(roll))`, and
`btrim(regexp_replace(lower(first||' '||last), '[^a-z0-9]+', ' ', 'g'))`), so
they describe real post-change behaviour rather than an approximation.

| Finding | Value | Design consequence |
|---|---|---|
| Duplicate roll-number groups | 113 **(verified)** | Sentinel must be replaced by a candidate list |
| ↳ learners currently unbillable because of them | **306 (verified)** | Every row for these is rejected today |
| ↳ **resolvable once a name is supplied** | **290 of 306 = 95% (verified)** | Name is a high-yield disambiguator |
| ↳ same roll *and* same name | 16 **(verified)** | Must still reject — name cannot fix these |
| Learners with no roll number | 1,836 **(verified)** | Name-only resolution is required, not optional |
| ↳ **uniquely named, so billable by name alone** | **1,380 (verified)** | The capability this change unlocks |
| ↳ name collides, stays unbillable | 456 **(verified)** | Correctly rejected — cannot be told apart |
| Global name-collision groups | 654 (1,760 learners) **(verified)** | Name alone is ambiguous for ~25% of learners |
| Roll numbers with trailing whitespace | 18 (12 `active`) **(verified)** | **Unmatchable by roll — needs a data fix, see Known Gaps** |
| Roll numbers with case-only variants | **0** | Case-insensitive roll matching is safe |
| Billable learners with multi-word `first_name` | 832 | Split point is unreliable |
| Billable learners with multi-word `last_name` | 281 | Split point is unreliable |
| Clean "one word + one word" names | 4,310 / 5,154 | Only 84% — field-wise matching is brittle |
| Collision groups, concatenated vs field-wise | **162 vs 162** | Concatenation costs no extra ambiguity |
| Bills created in last 12mo by lifecycle status | active 6,812 · reserved 3,302 · admitted 341 · account 180 · **rejected 174** · enquiry_submitted 35 · inactive 28 · withdrawal_pending 8 · waitlisted 4 · **graduated 0** | A lifecycle allowlist would break live workflows |

### Name storage is messier than "first + last"

`learners_profiles` has no `full_name` column; names exist only as
`first_name` (NOT NULL) and `last_name` (nullable). Real rows:

```
first_name: "JAI BOMMANNAN"      last_name: "R"       -- multi-word given name, initial surname
first_name: "PRIYADHARSHINI.S"   last_name: "BDS"     -- dotted initial; degree code in surname
first_name: "RAVEENA V.R V R"    last_name: "V.R"     -- initial duplicated across both fields
first_name: "KAVIN BASKAR"       last_name: "U"       -- roll PB23004, shared with "MONISHA R RAVI"
```

A user reading "KAVIN BASKAR U" would reasonably type `KAVIN` / `BASKAR U`.
Strict field-wise comparison rejects that; concatenate-then-normalize accepts it.
Since both approaches produce identical collision counts (162), concatenation is
strictly better.

## Design

### Matching rule

The template carries **two authoring columns** (`First Name`, `Last Name`) mirroring
the table shape. The importer joins them into **one matching key**:

```
nameKey  = normalize(first_name + " " + last_name)
normalize = lowercase → replace [^a-z0-9]+ with " " → collapse spaces → trim
rollKey  = trim(roll_number).toUpperCase()
```

Normalization is driven by the data: 302 billable learners have dots in their names,
so `"R. Kumar"`, `"R.Kumar"` and `"r  kumar"` must all collapse to `r kumar`.

### Resolution ladder

"Name present" means *either* name cell is non-blank.

```
hasRoll  → candidates = rollIndex[rollKey]
   0 candidates  → REJECT "No learner found with roll number X."
   1 candidate   → name given and nameKey mismatch
                     → REJECT "Name 'A' does not match roll number X (on record: 'B')."
                   otherwise MATCH            matched_by = roll | roll+name
   N candidates  → no name given
                     → REJECT "Roll number X matches N learners — add First/Last Name."
                   name narrows to 1 → MATCH  matched_by = roll+name
                   name narrows to 0 → REJECT "…matches N learners, none named 'A'."
                   name narrows to N → REJECT "…all named 'A' — cannot disambiguate."

name only → candidates = nameIndex[nameKey]
   0 → REJECT "No learner found named 'A'. Check spelling on the Learners sheet."
   1 → MATCH                                  matched_by = name
   N → REJECT "Name 'A' matches N learners — add their Roll Number."

neither  → REJECT "Provide a Roll Number, or a First/Last Name."
```

**A present-but-unmatched roll number never falls through to name matching.**
Silently re-routing a wrong roll to a name lookup could bill a different person
than the sheet intended. Reject instead.

**Ambiguity always rejects; it never guesses.** In a billing flow, an unbilled
learner is recoverable and a wrongly-billed learner is not.

### Lifecycle status is NOT filtered

Deliberate. Bills are created against nearly every status in production, including
`rejected` (174) and `account` (180). A hardcoded allowlist would break live
workflows and would drift on the next lifecycle realignment. The lookup stays
unfiltered, matching current behaviour; ambiguity is handled by rejection.

The Instructions sheet currently claims rows are rejected if the roll "does not
match any **active** student". No such filter exists and never has. The docs are
wrong, not the code — correct the wording, do not add a filter.

## Files touched

No DB migration, no RLS change, no permission key, no new route.

### 1. `lib/utils/mappings/student-bill-excel-mappings.ts`

- `STUDENT_BILL_TEMPLATE_HEADERS` gains `'First Name'`, `'Last Name'` at indices 1-2.
- `STUDENT_BILL_HEADER_ALIASES` — normalized header text → canonical field key.
  Accepts the legacy 7-column headers so old sheets still parse.
- `STUDENT_BILL_LEGACY_COLUMN_ORDER` — positional fallback for sheets with
  unrecognizable headers.
- `normalizeNameKey(first, last)`, `normalizeRollKey(roll)`,
  `normalizeHeaderKey(header)` and `formatLearnerName(first, last)` — shared so
  template and importer cannot drift.
- `StudentBillRow` gains `first_name?`, `last_name?`.
- `ImportSuccessRow` / `ImportError` gain `matched_by: 'roll' | 'roll+name' | 'name'`.

### 2. `app/api/billing/schedule/bills/template/route.ts`

New `Bills` layout — validation cell references shift with the columns:

| Col | Header | Validation | Was |
|---|---|---|---|
| A | Roll Number | — | A |
| **B** | **First Name** | — | new |
| **C** | **Last Name** | — | new |
| D | Billing Category | list dropdown | B |
| E | Bill Description | — | C |
| F | Due Date | date ≥ 2000-01-01 | D |
| G | Billing Amount | decimal ≥ 0 | E |
| H | Remarks | — | F |
| I | Academic Year (optional) | list dropdown, blank ok | G |

**Replace the positional header reads.** Lines 96-102 currently pair
`STUDENT_BILL_TEMPLATE_HEADERS[n]` with a `key`. Inserting at index 1 would leave
`[1]` paired with `key: 'billing_category'` — a column *labelled* "First Name" that
the generator still treats as the category column, dropdown and all. TypeScript
cannot catch it; every index is still a valid `string`. Write the header text
explicitly instead, removing the index-drift trap permanently.

**New hidden `Learners` sheet**, positioned between `Bills` and `Lists`:

```
Roll Number | First Name | Last Name | Institution | Status
```

Columns A:C deliberately mirror the `Bills` sheet A:C so a user can copy a
three-cell block straight across without re-typing. This is the main lever on
rejection rate.

Fetched with the caller's session client, so **RLS scopes the roster
automatically** — a non-super-admin sees only their accessible institutions.
**Paginate at 1,000 rows per `.range()` call.** PostgREST caps a plain `select()`
at 1,000 rows; a single query would silently return a truncated roster that looks
complete. Cap total at 20,000 rows as a runaway guard.

Rewrite the Instructions sheet to document the ladder and correct the "active"
claim.

### 3. `app/api/billing/schedule/bills/import/route.ts`

**Header-aware parsing.** Replace positional `cells[0]`…`cells[6]` reads: read
row 1, normalize each header, map to canonical field keys. Old 7-column templates
still carry recognizable headers so they map correctly and simply have no name
columns. Fall back to `STUDENT_BILL_LEGACY_COLUMN_ORDER` only when the required
headers (category, due date, amount) cannot be resolved.

**Candidate lists replace the sentinel.** `studentByRoll` becomes
`Map<rollKey, Candidate[]>`; drop `'__AMBIGUOUS__'` entirely.

**Roster fetch is conditional.** Rows carrying a roll number use the existing
targeted `.in()` query. The full roster (for the `nameIndex`) is fetched **only
when at least one row lacks a roll number**, so the common case costs exactly what
it costs today. Paginate at 1,000.

**Chunk the roll-number `.in()` query at 200 per request.** Currently unbounded:
a 2,000-row upload builds a 2,000-element `IN` list and PostgREST 400s on URL
length. Pre-existing latent bug; name matching makes larger uploads likelier.

Zod schema: `roll_number` and the name fields all become individually optional,
with a refinement requiring at least one identity input per row.

### 4. `app/(routes)/billing/schedule/bulk-create/_components/import-bills-dialog.tsx`

- Report workbook: `Successful Bills` and `Failed Rows` sheets gain `First Name`,
  `Last Name`, and `Matched By`. In a billing run, "this bill came from a name-only
  match" is audit information worth persisting.
- Dialog copy describes the ladder and points at the `Learners` sheet.
- Existing formula-injection sanitizer already covers the new free-text columns.

### 5. `app/(routes)/billing/schedule/bulk-create/page.tsx`

One copy string on the "Upload Excel" card still told users "Each row needs a
roll number…", which the change makes false. Corrected to describe the three
identification modes. No logic touched.

## Terminology

`.github/workflows/jkkn-conventions.yml` runs `scripts/ci/check-terminology-delta.py`,
which flags new **user-facing prose** using "student" where "learner" is standard.
It explicitly does not flag code identifiers. So: new sheet headers, instructions
and dialog copy say "Learner"; existing field names such as `student_name` and
`student_id` stay as they are.

## Known gaps

### 18 roll numbers carry trailing whitespace (pre-existing data defect)

`learners_profiles` holds 18 roll numbers stored with a trailing space —
`'BDS25010 '`, `'MDS 202601 '`, `'03 '` and so on. 12 belong to `active`
learners.

The roll lookup is an equality filter (`.in('roll_number', …)`), so a sheet
saying `BDS25010` does not match a stored `'BDS25010 '`. Those learners are
therefore unmatchable by roll number — **both before and after this change**;
it is not a regression. They are rejected with "No learner found with roll
number X", and can still be billed by leaving the roll blank and using the
name columns.

Designing around it in code would mean a second-chance roster fetch for every
sheet containing any unmatched roll — an expensive path that fires on ordinary
typos — to compensate for 0.35% dirty data. The proportionate fix is to clean
the column:

```sql
UPDATE learners_profiles
SET roll_number = btrim(roll_number)
WHERE roll_number IS NOT NULL AND roll_number <> btrim(roll_number);
```

Not applied: it is a write to production identity data and belongs to the
data owner, not to this change.

### Name-only matching is scoped by RLS, not by institution

There is no institution column in the sheet, so the name index is keyed on
name alone within whatever `learners_profiles` rows RLS exposes to the caller.
Global collisions (654 groups) are worse than per-institution ones (333), so a
super-admin will hit more name-only ambiguity than an institution-scoped user
— for whom RLS narrows the candidate set and *improves* precision. Ambiguity
rejects in both cases, so this is a usability gradient, not a correctness risk.

## Verification

No test runner exists in this repo — do not claim tests pass.

**Completed:**
- Scoped `tsc` (project settings, narrowed `include`) — zero errors in the
  touched files. Two pre-existing baseline errors elsewhere are untouched:
  `bulk-create/page.tsx:403` (`CreateStudentBillDto.institution_id`) and
  several `lib/services/*` modules. The full-project `tsc` OOMs, hence the
  narrowed project file.
- ESLint — clean on all 5 touched files.
- 50-assertion harness over the pure functions, run against real production
  name shapes: split-point drift, dotted initials, duplicated initials, case
  and whitespace, plus header mapping for the new template, **the legacy
  7-column template**, reordered columns, single whole-name columns, and the
  garbage-header fallback trigger. All pass.

**Not yet done — requires a running app and a login:**

1. Browser-exercise the flow end to end (below).
2. Download the template. Confirm the `Learners` sheet is populated beyond 1,000
   rows (proves pagination), and that dropdowns/validation land on D, F, G, I.
3. Upload sheets covering every ladder branch:
   - clean unique roll → created
   - duplicate roll (`PB23004`) with name → created, `matched_by: roll+name`
   - duplicate roll without name → rejected, message names the candidate count
   - name-only for a `reserved` learner → created, `matched_by: name`
   - roll + wrong name → rejected, message shows the on-record name
   - ambiguous name-only → rejected
   - **old 7-column template** → still imports correctly (header-aware fallback)
4. Confirm rejection messages name the learner, and the downloaded report
   classifies every row.
5. Confirm as a non-super-admin that the `Learners` sheet contains only their
   accessible institutions.
