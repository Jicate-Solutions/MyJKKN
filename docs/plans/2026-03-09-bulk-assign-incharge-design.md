# Bulk Assign Class Incharge — Design

**Date**: 2026-03-09
**Status**: Approved

---

## Problem

Assigning the same staff member as class incharge to multiple sections requires opening each section's dialog individually. When one staff manages many sections (e.g. same semester, multiple sections), this is tedious.

## Solution

Add row-level checkboxes to the class incharges table. When ≥1 rows are selected, a "Bulk Assign Incharge" button appears. Clicking it opens the existing `AssignInchargeDialog` in **bulk mode** — adapted to show all selected sections with their current incharges, a single staff picker, and one "Add to All" confirmation.

---

## UI Flow

1. User checks one or more section rows (select all supported via header checkbox)
2. "Bulk Assign Incharge" button appears in card header
3. Dialog opens — title: **"Assign Incharge — N sections selected"**
4. Review panel: compact scrollable list of selected sections + their current incharges (or "None")
5. Staff combobox (same searchable dropdown, same fix for Dialog+Popover race)
6. "Add to All" button → assigns staff to all selected sections
7. Sections where the staff is already assigned are silently skipped
8. Toast: `"Incharge assigned to X of N sections (Y already assigned, skipped)"`

---

## Architecture

### Service Layer

**File**: `lib/services/staff/class-incharge-service.ts`

New static method:
```ts
static async bulkAssignIncharge(dto: {
  institution_id: string;
  section_ids: string[];
  staff_id: string;
}): Promise<{ assigned: number; skipped: number }>
```

- Uses `Promise.allSettled()` across all section IDs
- Calls existing `assignIncharge()` per section
- `23505` (unique constraint) = skipped
- Other errors = thrown
- No new Supabase table or RPC needed

### Types

**File**: `types/staff.ts`

```ts
export interface BulkAssignInchargeDto {
  institution_id: string;
  section_ids: string[];
  staff_id: string;
}
```

### Hook

**File**: `hooks/staff/use-class-incharges.ts`

```ts
export function useBulkAssignIncharge(): UseMutationResult<
  { assigned: number; skipped: number },
  Error,
  BulkAssignInchargeDto
>
```

Invalidates `classInchargeKeys.lists()` on success.

### Component Changes

| File | Change |
|------|--------|
| `class-incharges-list.tsx` | Checkbox column, `selectedIds: Set<string>` state, "Bulk Assign" button, pass selected sections to dialog |
| `assign-incharge-dialog.tsx` | Accept `sections?: SectionWithIncharges[]` for bulk mode; render review list + adapted title/button label |
| `class-incharge-service.ts` | Add `bulkAssignIncharge()` |
| `use-class-incharges.ts` | Add `useBulkAssignIncharge()` |
| `types/staff.ts` | Add `BulkAssignInchargeDto` |

### Dialog Mode Detection

```ts
// Single mode (existing):
<AssignInchargeDialog section={section} open={open} onOpenChange={...} />

// Bulk mode (new):
<AssignInchargeDialog sections={selectedSections} open={open} onOpenChange={...} />
```

Props union:
```ts
type Props =
  | { section: SectionWithIncharges; sections?: never; ... }
  | { sections: SectionWithIncharges[]; section?: never; ... }
```

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Duplicate handling | Skip silently | UX friction is low; user sees count in toast |
| Parallel vs sequential inserts | `Promise.allSettled()` parallel | Fast, independent per section |
| New dialog vs adapted dialog | Adapt existing | Reuse Popover fix, same staff picker logic |
| New RPC vs client-side loop | Client-side loop | No schema change needed; N is small (sections per page ≤ 20) |
