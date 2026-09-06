# Campus Living Dashboard — Block × Category Occupancy + Institution Residents

**Date:** 2026-08-12
**Page:** `/campus-living/dashboard`

## Problem

The dashboard's "Block-wise Summary" reports Residents / Capacity / Available / Occupancy%
per block, but gives no **category** breakdown (Classic / Deluxe / Premium / Premium+AC) and
no **gender** grouping. There is also no view of **which institution** the residents come
from. Wardens and management cannot answer "how many Deluxe beds are free in Girls Hostel C"
or "how many Dental girls are living in hostels" without leaving the page.

A second, subtler problem: the existing Capacity column reads `hostel_rooms.capacity` — an
*intent* field — while the allocator only ever places learners on real `hostel_beds` rows.
The page can therefore advertise free beds that cannot be allocated.

## Decisions (confirmed with operator)

1. **Filled / pending = beds**, not rooms. Filled = bed carries an allocation with
   `check_out_date IS NULL`; pending = genuinely free bed. Rooms shown as a count only.
2. **Institution counts = allocated residents only** (active bed), split boys/girls. This
   makes the two sections reconcile exactly.
3. **Expand Section 3 in place** — keep existing rows, group under Boys/Girls with subtotals,
   make each block expandable to reveal categories. Add institution section below.
4. **Count real beds everywhere**, including the existing Capacity/Available columns, with a
   drift warning where `sum(rooms.capacity)` disagrees with the bed inventory.

## Why "real beds" is the correct source

`hostel_rooms.capacity` is intent (how many beds a room is *meant* to hold); `hostel_beds`
rows are inventory (beds that exist and can carry an allocation). Every operational surface
in this module works on inventory: `fn_auto_allocate_plan`, the
`UNIQUE (room_id, bed_id) WHERE check_out_date IS NULL` index, and the allocation screen.
Reporting intent on a page next to allocation numbers is how "9 free beds" and "11 free
beds" both end up being true. See
`feedback-hostel-bed-uniqueness-is-check-out-date-not-status`.

Measured drift, student rooms only:

| Block | capacity | real beds | drift |
|---|---|---|---|
| Boys A / B / C | 287 / 43 / 48 | 287 / 43 / 48 | 0 |
| Girls Hostel A | 222 | 222 | 0 |
| Girls Hostel B | 98 | **107** | **-9** |
| Girls Hostel C | 208 | 208 | 0 |

Girls Hostel A's apparent +27 was entirely **non-student rooms** (accounts, mess_staff,
warden, tv_hall, office_room) — 13 such rooms exist across the girls blocks and none belong
in an occupancy report. Both new views filter `room_purpose = 'student'`. The only genuine
drift is Girls Hostel B, which is surfaced as a badge rather than silently corrected.

## Data layer

Two views, both `security_invoker = true` so RLS applies as the calling user — this page is
visible to wardens, not only admins, and `hostel_allocations` / `learners_profiles` are
RLS-gated.

**`v_hostel_block_category_occupancy`** — one row per block × category:
`block_id, block_name, block_code, hostel_type, category_id, category_name, sort_order,
rooms, beds, filled, vacant, room_capacity`

`room_capacity` is carried alongside `beds` purely so the UI can flag drift; it is never used
as the denominator.

**`v_hostel_institution_residents`** — one row per institution:
`institution_id, institution_name, boys, girls, total`

Counts allocations where `check_out_date IS NULL AND status = 'active'`, joined
`hostel_allocations.learner_id -> profiles.id -> learners_profiles.institution_id`
(NB: `hostel_allocations.learner_id` FKs to `profiles`, not `learners_profiles`).

Service: two static methods on `CampusLivingDashboard`, mirroring the existing
institution-narrowing pattern (`hostel_block_institutions` junction for block scope; direct
`institution_id` filter for the residents view). Hooks follow the existing query-key factory
with `staleTime: 2 * 60 * 1000` and `isSuperAdmin ? undefined : institutionId`.

## UI

**Section 3 (expanded).** Blocks grouped under Boys / Girls headers, each with a subtotal
row. Each block row gets a chevron; expanding reveals its category rows (rooms, beds,
filled, vacant, bar). Capacity/Available columns switch to the bed inventory. A `⚠` badge
appears on any block where `room_capacity <> beds`, with a tooltip naming both numbers.

**New section: Institution-wise Residents.** Table of institution × (Boys, Girls, Total)
with a totals row, sorted by total descending. Verified live: 684 residents — Dental 268,
Pharmacy 180, Nursing 161, Engineering 53, Allied Health 14, Arts & Science (Self) 8.
Girls total 419 matches the active-allocation count exactly.

## Out of scope

- Fixing the Girls Hostel B capacity/bed drift (reported, not corrected).
- The 13 non-student rooms (excluded from the report; not deleted or re-purposed).
- Unallocated learners per institution — deliberately excluded so the two sections reconcile.
