# Campus Living — Mark Attendance multi-select (bulk Present / Absent)

**Date:** 2026-08-01
**Status:** Approved
**Area:** `app/(routes)/campus-living/attendance/mark`

## Problem

Marking hostel attendance is one click per resident per status. A warden walking a
block of 200 residents clicks 200 times, even though the overwhelmingly common
outcome is "this entire room is present". The page already has a blunt
`Mark All Present` button, but nothing between "one resident" and "everyone".

## Goal

Let the marker tick a set of residents — individually, or a whole Room, Floor or
Block at once — and apply **Present** or **Absent** to that set in one action.

## Non-goals

- No change to the write path. `handleSubmit`, the resident block/institution
  resolution, the skip warnings and the confirmation dialog are untouched.
- No database, RLS, service or hook changes. This feature only changes how the
  existing in-memory `attendance` map gets populated before submit.
- No bulk `On Leave` / `Late Entry` / `Medical`. Those stay per-resident: they are
  individual determinations, and putting five buttons in the bar makes it wrap on
  phones.

## Design

### Selection state

The page gains one piece of state:

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

Keyed by `student.id` (`hostel_residents.id`) — the **same key** as the existing
`attendance` record. This is load-bearing: `page.tsx` documents a prior bug from
keying attendance by `learner_id`, and the pre-fill effect deliberately maps
`profile_id -> s.id` to stay consistent. Selection must use the same key or the
two structures drift.

### Selection is confined to what is visible

`selectedIds` is pruned to the ids present in `filteredStudents` whenever that
list changes, and cleared outright when the attendance **date** changes.

This is deliberately the opposite of how `attendance` behaves. The `attendance`
map intentionally sums across its whole contents so that narrowing a filter does
not reset the marked counts. That is safe because marks are *reviewable*: each one
renders on its resident card and is itemised in the confirmation dialog before
anything is written.

A bulk apply is instant and unreviewed. A selection that survives out of view
would let one click rewrite off-screen residents with no confirmation step. So the
rule is: **"selected" always means "visible and ticked".**

Changing the Hostel Block replaces `filteredStudents` wholesale, so pruning covers
that case for free. The date change is handled explicitly because the resident
list does not change with the date, only the pre-filled statuses do.

### Group select-all

Room, Floor and Block headings each carry a tri-state checkbox:

| Group state | Control shows | Click does |
|---|---|---|
| no members selected | empty box | select all members |
| some members selected | dash | select all members |
| all members selected | tick | deselect all members |

Group membership is computed from the already-grouped `groupedStudents`
structure, so it automatically respects the active Floor / Category / Search
filters.

### The single-block gap

The Block heading only renders when `groupedStudents.length > 1`. With one block
in view there is no heading, therefore no block-level checkbox. Rather than change
that conditional and disturb the existing layout, a **`Select all visible (N)`**
checkbox is added to the Quick Actions row. It covers the single-block case and is
useful regardless.

### Bulk action bar placement

The page already has a sticky container pinned at `bottom-4` holding the marked
counter and the Review & Submit button. A second sticky bar would overlap it, so
the bulk bar renders as a row *inside* that same container, above the existing
row. It appears only when the selection is non-empty, and pushes the submit row
down rather than covering it.

```
+------------------------------------------------+
| 12 selected   [OK Present] [X Absent] [Clear]   |  <- only when selection > 0
+------------------------------------------------+
| 34 of 42 students marked   [Cancel] [Review...] |  <- existing row
+------------------------------------------------+
```

Applying a status writes that status into `attendance` for every selected id, then
clears `selectedIds`. The bar disappears and the marker moves to the next room.
Clearing the selection does **not** clear the marks that were just applied.

### Tri-state checkbox implementation

`components/ui/checkbox.tsx` hardcodes a `CheckIcon` in its Radix `Indicator`, and
Radix renders that Indicator for both `checked` and `indeterminate`. Roughly twenty
files across the app already pass `"indeterminate"` to it and get a full tick — a
pre-existing cosmetic inconsistency in every data table.

This feature does **not** fix that shared primitive. The blast radius is every
data table in the application, and changing it would alter the appearance of
unrelated pages. Instead the group headings use a local `GroupCheckbox` built
directly on `@radix-ui/react-checkbox`, rendering `Minus` for indeterminate and
`Check` for checked. Individual resident rows are binary, so they use the shared
`Checkbox` unchanged.

### Mark All Present now respects the filters

`handleMarkAllPresent` currently iterates `students`, not `filteredStudents`, so it
marks every loaded resident regardless of the Floor / Category / Search filters —
while the counter beside it reads `{markedCount}/{filteredStudents.length}`.
Filtering to one floor and pressing it silently marks the other floors too.

Once `Select all visible -> Present` sits next to it, two adjacent controls that
look equivalent but disagree about filters is a trap. `handleMarkAllPresent` is
therefore scoped to `filteredStudents`, matching both the new selection model and
the counter that has always been displayed next to it.

This is a behaviour change to existing functionality, approved as part of this
design.

### Mark All Absent

Added alongside Mark All Present, with identical visible-roster scoping. It earns
its place on nights when a whole floor is out — mark the floor Absent, then
correct the handful who stayed back.

`Clear All` keeps its existing unscoped behaviour: it clears the entire
`attendance` map, not just the visible slice. That asymmetry is deliberate —
"Clear All" reads unambiguously as "everything", and unlike the mark actions it
destroys work rather than creating it, so the broader reading is the safer one.
Its icon moves from `XCircle` to `Eraser`, because `XCircle` now belongs to Mark
All Absent sitting immediately beside it.

## Files

| File | Change |
|---|---|
| `lib/campus-living/attendance-selection.ts` | New. Pure helpers: `groupSelectionState`, `toggleGroup`, `pruneToVisible`, `applyStatusToSelection`, `selectAll` |
| `__tests__/campus-living/attendance-selection.test.ts` | New. Unit tests for the above |
| `app/(routes)/campus-living/attendance/mark/_components/group-checkbox.tsx` | New. Tri-state checkbox |
| `app/(routes)/campus-living/attendance/mark/_components/bulk-action-bar.tsx` | New. Selection bar |
| `app/(routes)/campus-living/attendance/mark/page.tsx` | Wire selection state, checkboxes onto cards and headings, bar into the sticky container, scope `handleMarkAllPresent` |

The selection maths lives in `lib/` rather than in the page because this repo
tests pure logic (`__tests__/lib/...`, `__tests__/campus-living/hostel-fee-compute.test.ts`)
and does not do component-render tests. It also keeps a 770-line page from growing
by another 180 lines.

## Verification

- `npx vitest run __tests__/campus-living/attendance-selection.test.ts`
- `npm run typecheck`
- Manual: select a room, apply Present, confirm only that room's cards turn green
  and the selection clears; switch block and confirm the selection does not carry
  over; filter to one floor, press Mark All Present, confirm the other floors stay
  unmarked.
