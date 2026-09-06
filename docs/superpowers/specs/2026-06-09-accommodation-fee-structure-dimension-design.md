# Re-introduce Accommodation Type as an Optional Fee-Structure Dimension

- **Date:** 2026-06-09
- **Status:** Approved design — ready for implementation plan
- **Modules touched:** Admission (fee structure), Learners (enquiries), Database (RPC + trigger + data). Billing: verify-only, no code change.

---

## 1. Problem & Context

On 2026-05-28, accommodation type was removed as a fee-structure matching dimension by two migrations:

- `20260528000008_fee_structure_drop_accommodation_dimension.sql` — archived all `hostel`-coded structures, dropped `accommodation_type_id` from the resolution RPC `admission_resolve_fee_items_for_lead`, and removed accommodation from the overlap-prevention trigger `_fee_structure_community_no_overlap`.
- `20260528000009_fee_structure_accommodation_nullable.sql` — made `admission_fee_structures.accommodation_type_id` nullable (column kept, no longer used for matching).

The removal was tied to the **hostel-billing cutover**: hostel room/mess fees now live in campus-living (`hostel_category_fees`, billed via `campus_living_generate_hostel_year_bills`). The admission fee structure became "academic/common fees only."

We now need accommodation type back as a matching dimension so that:

1. When creating a fee structure, an operator can target **Day Scholar** vs **Hostel** (or leave it "Any").
2. The learner **enquiries** form fetches the matching structure using the learner's accommodation type.

This must happen **without** reintroducing the campus-living double-billing risk.

## 2. Confirmed Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | What does accommodation drive? | **Academic/common fees only.** Hostel room/mess fees stay in campus-living. |
| D2 | Match strictness | **Optional + fallback**, identical to the existing `gender` dimension. |
| D3 | Existing data | **Re-tag the 90 active `dayscholar` structures → NULL ("Any")** so they keep matching every learner. Accommodation-specific structures are created only where fees differ. |
| D4 | Gender vs accommodation tiebreak | **Accommodation-specific outranks gender-specific** when both partially match. |
| D5 | The 2 active `hostel` structures | Surface during implementation; archive if redundant with the re-tagged "Any" twin, keep if intentional. |
| D6 | Bulk / Excel import path | **Out of scope for v1** — manual create form only. Bulk is a fast follow. |

### Key safety guarantee (why this is low-risk)

`fees-structure-form.tsx` defines `FEE_STRUCTURE_EXCLUDED_CATEGORY_KINDS = ['transport', 'hostel']` and filters those out of the item picker. **Hostel-kind billing categories physically cannot be added to an admission fee structure.** Therefore re-adding accommodation as a *matching* dimension can only vary academic/common fees — the double-billing landmine stays defused with no extra guard.

## 3. Design Principle

`accommodation_type_id` becomes a **second optional matching dimension parallel to `gender`**:

- Nullable column; **NULL = "Any accommodation"** (wildcard).
- Resolution prefers an accommodation-specific structure, then falls back to a NULL structure.
- Optional UI selector that does **not** gate the "all required dims selected" check.

The required matching key stays at 6 dimensions (institution, degree, department, programme, quota, admission_year) + community (junction). `gender` and `accommodation_type_id` are the two optional refinements.

## 4. Live Data Snapshot (blast radius)

| status | accommodation | count |
|---|---|---|
| active | dayscholar | 90 |
| active | hostel | 2 |
| archived | hostel | 82 |

`accommodation_types`: 4 codes (`dayscholar`, `hostel`, `not_applicable`, `pg`) × 13 institutions. No active structure currently carries NULL accommodation. The archived hostel rows stay archived (not restored).

## 5. Resolution Semantics (the contract both paths must obey)

There are **two** resolution paths that MUST agree (one previews, one persists):

1. **Persist path** — RPC `admission_resolve_fee_items_for_lead` (writes `fee_items` JSONB onto `learners_profiles`).
2. **Preview path** — `FeeStructureService.findByDimensions` (read-only, used by the enquiry Finance tab).

### Matching rule

Given a learner with `accommodation_type_id = A` (possibly NULL) and `gender = G` (possibly NULL):

- **Filter:** a candidate structure qualifies when
  - all 6 hard dims match, AND it covers the learner's community via the junction, AND
  - `(structure.gender = G OR structure.gender IS NULL)`, AND
  - `(structure.accommodation_type_id = A OR structure.accommodation_type_id IS NULL)`.
- **Rank (most specific wins):**
  1. `accommodation_type_id IS NOT NULL` DESC (accommodation-specific beats Any) — **D4**
  2. `gender IS NOT NULL` DESC (gender-specific beats Any)
  3. deterministic final tiebreak (`updated_at` DESC)
- **Pick:** the top-ranked single row (`LIMIT 1`).

Edge case: a learner with `accommodation_type_id = NULL` (not yet chosen) only matches NULL ("Any") structures — correct fallback behavior.

## 6. Layer-by-Layer Changes

### 6a. Database

**RPC `admission_resolve_fee_items_for_lead`** (migration + mirror into `supabase/setup/02_functions.sql`):
- Add to the structure-match WHERE: `AND (afs.accommodation_type_id = v_lead.accommodation_type_id OR afs.accommodation_type_id IS NULL)`.
- Change `ORDER BY afs.gender IS NOT NULL DESC` → `ORDER BY afs.accommodation_type_id IS NOT NULL DESC, afs.gender IS NOT NULL DESC, afs.updated_at DESC` (keep `LIMIT 1`). The trailing `updated_at DESC` is the deterministic final tiebreak from §5.
- `v_lead` already selects `accommodation_type_id` — no change to the SELECT INTO.

**Trigger `_fee_structure_community_no_overlap`** (migration + mirror into `supabase/setup/04_triggers.sql`):
- Add `AND fs.accommodation_type_id IS NOT DISTINCT FROM v_self.accommodation_type_id` to the overlap-EXISTS predicate.
- Rationale: `IS NOT DISTINCT FROM` treats NULL as its own bucket, so an "Any" structure and a "Hostel" structure can coexist for the same dims+community, but two structures targeting the *same* bucket (both Hostel, or both Any) still collide. This is exactly the coexistence the feature needs.
- Update the raised error message to mention accommodation.

**Data migration** (separate migration; committed real SQL, no placeholder):
```sql
UPDATE admission_fee_structures
   SET accommodation_type_id = NULL, updated_at = now()
 WHERE status = 'active'
   AND accommodation_type_id IN (
     SELECT id FROM accommodation_types WHERE code = 'dayscholar'
   );
```
Safe because the overlap trigger fires on `admission_fee_structure_communities` (junction) INSERT/UPDATE, not on parent-row updates — re-tagging the parent will not trip it.

**No DDL** on `accommodation_type_id` (already nullable).

### 6b. Types (`types/admission.ts`)
- `FeeStructureMatrixDimensions.accommodation_type_id` — keep `?: string`; replace the stale "No longer a fee-matching dimension / ignored by resolution" comment with the optional-dimension semantics.
- `CreateAdmissionFeeStructureInput` — add `accommodation_type_id` to the `Partial<Pick<…>>` optional set (next to `gender`).
- `UpdateAdmissionFeeStructureInput` — add `accommodation_type_id` to the editable optional dims.

### 6c. Create form (`app/(routes)/admission/settings/fees-structure/`)
- **`_components/fees-structure-dimension-selector.tsx`** — add an optional **Accommodation** `<Select>` (Any / + each `accommodation_types` row for the selected institution), loaded via `LookupService.listAccommodationTypes(institutionId, true)`. Mirror the gender selector: a `setAccommodation` handler, value `'__any__'` → `undefined`. Reset accommodation when institution changes. Must **not** be part of `allDimsSelected` / `missingDims`. Update the helper copy ("Gender and Accommodation are optional…").
- **`_components/fees-structure-form.tsx`** — thread `accommodation_type_id` through every `dims` object that currently hardcodes the 7-field list:
  - `FeeStructureService.findByDimensions(sevenDims, …)` call site — include accommodation in `sevenDims`.
  - `NewStructureForm dims={{…}}` prop — include accommodation.
  - `ExistingStructureEditor` `initialDims`, `editableDims` reset, `dimsChanged` key list, and `handleSaveAll`'s `...(dimsChanged ? {…} : {})` payload — include accommodation (otherwise editing a structure silently wipes its accommodation to NULL on save).
  - `create()` / `update()` already spread `...dims`, so no service-signature change beyond the type.
- **List + detail polish** (`_components/columns.tsx`, `[id]/page.tsx`) — render an "Accommodation" badge (Any / Hostel / Day Scholar) so operators can tell structures apart. Small, quality-of-life.

### 6d. Enquiry form (`app/(routes)/learners/enquiries/`)
- **`_components/form-sections/finance-details.tsx`** — already resolves `resolvedAccommodationId` and includes `accommodation_type_id` in `dims`. **No structural change**; it simply starts mattering. Verify the TEXT→FK resolution actually resolves `'HOSTEL'` / `'DAY SCHOLAR'` radio values against `accommodation_types` (code/name); fix the local `resolveLookupId` matching only if it fails (e.g. add the space-insensitive variants the shared `accommodation-type-resolver.ts` already handles).
- **`lib/services/admission/fee-resolution-service.ts`** — no change to `isValidDimensions` (accommodation stays optional). It forwards `dims` to `findByDimensions`.
- **`lib/services/admission/fee-structure-service.ts` → `findByDimensions`** — the core preview-side change. It currently selects `accommodation_type_id` but ignores it. Refactor the two-query gender logic into a single candidate fetch (hard dims + community + `(gender = X OR NULL)` + `(accommodation = Y OR NULL)`) and rank client-side by the §5 precedence, or keep the staged approach but layer accommodation in. Must produce **identical** results to the RPC. Keep year-of-study item filtering unchanged.

### 6e. Billing
**Verify-only, no code change.** Confirm billing consumes the `fee_items` snapshot (`learners_profiles.fee_items`) and does not independently re-match fee structures. Expected outcome: no change required.

### 6f. Clone path (`fee-structure-service.ts → cloneToAcademicYear`)
- Preserve source accommodation: add `accommodation_type_id: overrides?.accommodation_type_id ?? source.accommodation_type_id` to the cloned dims so a cloned structure keeps its accommodation targeting.

## 7. Rollout Order
1. Migration A — resolution RPC + overlap trigger (logic in place before data moves).
2. Migration B — re-tag 90 active `dayscholar` → NULL.
3. Types → `findByDimensions` → create-form selector + threading → enquiry verification.
4. Mirror RPC into `supabase/setup/02_functions.sql`, trigger into `04_triggers.sql`.
5. Surface the 2 active `hostel` structures (D5) and decide archive vs keep.

## 8. Out of Scope / Non-Goals
- No reversal of the campus-living hostel-billing cutover.
- No change to `gender`'s existing overlap semantics.
- No retro-reconciliation of already-admitted learners' frozen `fee_items` (consistent with the existing "edits don't retro-change admitted leads" behavior; an explicit reconciliation tool is a separate, future plan).
- Bulk-create / Excel-import accommodation support (D6) — fast follow.

## 9. Verification Plan
- **Diagnostics:** every touched `.ts`/`.tsx` passes `mcp__ide__getDiagnostics`.
- **DB parity:** for a sample of dim combinations, the RPC and `findByDimensions` return the same structure (preview == persist), including the prefer-specific-then-Any cases.
- **No regression:** a learner whose dims are covered only by a re-tagged "Any" structure still resolves to it (the 90-row re-tag did not orphan anyone).
- **Accommodation-specific match:** create a Hostel-specific structure for a dim combo that also has an "Any" structure; confirm a hosteller enquiry resolves to the Hostel one and a day-scholar resolves to the "Any" one.
- **Overlap trigger:** creating an "Any" + a "Hostel" structure for the same dims+community succeeds; creating two "Hostel" structures for the same dims+community is rejected with the updated 23505 message.
- **Browser smoke (non-super-admin role):** create-form accommodation selector renders and persists; enquiry Finance tab shows the correct structure and subtotal for both a hosteller and a day-scholar test lead.
- **Gates:** if routes/permission keys are touched (not expected), `npm run check:menus` passes. (This change touches no routes or permission keys.)

## 10. Open Items to Resolve During Implementation
- D5: classify the 2 active `hostel` structures (archive vs keep).
- Confirm `finance-details.tsx`'s `resolveLookupId` resolves the legacy `'DAY SCHOLAR'` radio string against `accommodation_types.name` (space handling).
