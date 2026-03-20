# Bulk Assign Class Incharge — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to select multiple sections via checkboxes and assign one staff member as incharge to all of them in a single action.

**Architecture:** Reuse the existing `AssignInchargeDialog` with a new bulk mode (array of sections instead of single). Add checkbox selection to `ClassInchargesList`. New `bulkAssignIncharge` service method uses `Promise.allSettled()` and silently skips duplicates (error code `23505`).

**Tech Stack:** Next.js 15 App Router, TypeScript, React Query (`@tanstack/react-query`), shadcn/ui, Supabase client-side

---

## Task 1: Add `BulkAssignInchargeDto` type

**Files:**
- Modify: `types/staff.ts` — after line 387 (end of `AssignInchargeDto`)

**Step 1: Add the type**

In `types/staff.ts`, find the `AssignInchargeDto` interface (line ~383) and add directly after it:

```typescript
export interface BulkAssignInchargeDto {
  institution_id: string;
  section_ids: string[];
  staff_id: string;
}

export interface BulkAssignResult {
  assigned: number;
  skipped: number;
}
```

**Step 2: Commit**
```bash
git add types/staff.ts
git commit -m "feat(class-incharges): add BulkAssignInchargeDto and BulkAssignResult types"
```

---

## Task 2: Add `bulkAssignIncharge` service method

**Files:**
- Modify: `lib/services/staff/class-incharge-service.ts`

**Step 1: Add import for new types at top of file**

In `lib/services/staff/class-incharge-service.ts`, update the import from `@/types/staff` to include the new types:

```typescript
import {
  ClassIncharge,
  ClassInchargeFilters,
  AssignInchargeDto,
  BulkAssignInchargeDto,
  BulkAssignResult,
  SectionWithIncharges,
  SectionWithInchargesResponse,
} from '@/types/staff';
```

**Step 2: Add `bulkAssignIncharge` method after `assignIncharge` (after line 177)**

Add this method inside the `ClassInchargeService` class, right after `assignIncharge`:

```typescript
/**
 * Assign a staff member as class incharge for multiple sections at once.
 * Silently skips sections where the staff is already assigned (23505).
 * Throws on any other error.
 */
static async bulkAssignIncharge(dto: BulkAssignInchargeDto): Promise<BulkAssignResult> {
  const results = await Promise.allSettled(
    dto.section_ids.map((section_id) =>
      this.assignIncharge({
        institution_id: dto.institution_id,
        section_id,
        staff_id: dto.staff_id,
      })
    )
  );

  let assigned = 0;
  let skipped = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      assigned++;
    } else {
      // 23505 = unique constraint violation = already assigned → skip silently
      const msg = result.reason?.message ?? '';
      if (msg.includes('already assigned')) {
        skipped++;
      } else {
        throw result.reason;
      }
    }
  }

  return { assigned, skipped };
}
```

**Step 3: Commit**
```bash
git add lib/services/staff/class-incharge-service.ts
git commit -m "feat(class-incharges): add bulkAssignIncharge service method"
```

---

## Task 3: Add `useBulkAssignIncharge` React Query hook

**Files:**
- Modify: `hooks/staff/use-class-incharges.ts`

**Step 1: Add import for new types at top of file (line 4)**

```typescript
import { ClassInchargeFilters, AssignInchargeDto, BulkAssignInchargeDto, BulkAssignResult } from '@/types/staff';
```

**Step 2: Add hook at the end of the file (after `useRemoveIncharge`)**

```typescript
/**
 * Bulk-assign one staff member to multiple sections.
 * Invalidates the list cache on success.
 */
export function useBulkAssignIncharge() {
  const queryClient = useQueryClient();

  return useMutation<BulkAssignResult, Error, BulkAssignInchargeDto>({
    mutationFn: (dto) => ClassInchargeService.bulkAssignIncharge(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classInchargeKeys.lists() });
    },
  });
}
```

**Step 3: Commit**
```bash
git add hooks/staff/use-class-incharges.ts
git commit -m "feat(class-incharges): add useBulkAssignIncharge hook"
```

---

## Task 4: Adapt `AssignInchargeDialog` for bulk mode

**Files:**
- Modify: `app/(routes)/staff/class-incharges/_components/assign-incharge-dialog.tsx`

**Step 1: Replace the Props type and imports**

Replace the current `Props` interface and add new imports:

```typescript
import { useState } from 'react';
import { SectionWithIncharges, BulkAssignInchargeDto } from '@/types/staff';
import {
  useInchargesBySection,
  useAssignIncharge,
  useRemoveIncharge,
  useBulkAssignIncharge,
} from '@/hooks/staff/use-class-incharges';
import { useStaffForSelection } from '@/hooks/staff/use-staff';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, Plus, Loader2, ChevronsUpDown, Check, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// Discriminated union — single section OR multiple sections (bulk mode)
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | { section: SectionWithIncharges; sections?: never }
  | { sections: SectionWithIncharges[]; section?: never }
);
```

**Step 2: Replace the component body**

Replace the entire `AssignInchargeDialog` function with:

```typescript
export function AssignInchargeDialog({ open, onOpenChange, ...rest }: Props) {
  const isBulk = 'sections' in rest && Array.isArray(rest.sections);
  const sections = isBulk ? rest.sections! : [rest.section!];
  const primarySection = sections[0];

  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const { canAccess } = usePermissions();
  const canCreate = canAccess('staff', 'class_incharges.create') || canAccess('staff', 'edit');
  const canDelete = canAccess('staff', 'class_incharges.delete') || canAccess('staff', 'edit');

  // Single mode: fetch live incharges for the section
  const { data: incharges = [], isLoading: inchargesLoading } =
    useInchargesBySection(!isBulk ? primarySection.id : null);

  const { data: allStaff = [], isLoading: staffLoading } = useStaffForSelection({
    institution_id: primarySection.institution_id,
    isActive: true,
  });

  const assignMutation = useAssignIncharge();
  const removeMutation = useRemoveIncharge(!isBulk ? primarySection.id : '');
  const bulkAssignMutation = useBulkAssignIncharge();

  // In single mode: exclude already-assigned staff
  const assignedStaffIds = new Set(!isBulk ? incharges.map((ic) => ic.staff_id) : []);
  const availableStaff = allStaff.filter((s) => !assignedStaffIds.has(s.id));

  // ── Single mode handlers ──────────────────────────────────────
  async function handleAssign() {
    if (!selectedStaffId) return;
    try {
      await assignMutation.mutateAsync({
        institution_id: primarySection.institution_id,
        section_id: primarySection.id,
        staff_id: selectedStaffId,
      });
      setSelectedStaffId('');
      toast.success('Incharge assigned successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign incharge');
    }
  }

  async function handleRemove(id: string, name: string) {
    try {
      await removeMutation.mutateAsync(id);
      toast.success(`${name} removed as incharge`);
    } catch {
      toast.error('Failed to remove incharge');
    }
  }

  // ── Bulk mode handler ─────────────────────────────────────────
  async function handleBulkAssign() {
    if (!selectedStaffId) return;
    try {
      const { assigned, skipped } = await bulkAssignMutation.mutateAsync({
        institution_id: primarySection.institution_id,
        section_ids: sections.map((s) => s.id),
        staff_id: selectedStaffId,
      });
      setSelectedStaffId('');
      const msg = skipped > 0
        ? `Assigned to ${assigned} of ${sections.length} sections (${skipped} already assigned, skipped)`
        : `Incharge assigned to ${assigned} section${assigned !== 1 ? 's' : ''}`;
      toast.success(msg);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to bulk assign incharge');
    }
  }

  // ── Shared helpers ────────────────────────────────────────────
  function getInitials(first: string, last: string) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }

  const hierarchyLabel = !isBulk
    ? [
        primarySection.degree?.degree_name,
        primarySection.department?.department_name,
        primarySection.semester?.semester_name,
      ]
        .filter(Boolean)
        .join(' › ')
    : '';

  const isPending = assignMutation.isPending || bulkAssignMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={(e) => {
          const target = e.target as Element;
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          const target = e.target as Element;
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isBulk
              ? `Assign Incharge — ${sections.length} sections selected`
              : `Manage Class Incharges — ${primarySection.section_name}`}
          </DialogTitle>
          {!isBulk && hierarchyLabel && (
            <DialogDescription>{hierarchyLabel}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">

          {/* ── SINGLE MODE: currently assigned badges ── */}
          {!isBulk && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Currently Assigned</Label>
              {inchargesLoading ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : incharges.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No incharges assigned yet
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {incharges.map((ic) => {
                    const name = ic.staff
                      ? `${ic.staff.first_name} ${ic.staff.last_name}`
                      : 'Unknown';
                    return (
                      <Badge
                        key={ic.id}
                        variant="secondary"
                        className="flex items-center gap-1.5 pl-1 pr-2 py-1 h-auto"
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px]">
                            {ic.staff
                              ? getInitials(ic.staff.first_name, ic.staff.last_name)
                              : '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs">{name}</span>
                        <button
                          className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                          disabled={removeMutation.isPending || !canDelete}
                          onClick={() => handleRemove(ic.id, name)}
                          aria-label={`Remove ${name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── BULK MODE: section review list ── */}
          {isBulk && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Selected Sections
              </Label>
              <ScrollArea className="max-h-48 rounded-md border">
                <div className="p-2 space-y-1">
                  {sections.map((sec) => {
                    const currentIncharges = sec.class_incharges ?? [];
                    return (
                      <div
                        key={sec.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-xs">{sec.section_name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {[sec.semester?.semester_name, sec.program?.program_name]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {currentIncharges.length === 0 ? (
                            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                              None
                            </Badge>
                          ) : (
                            currentIncharges.map((ic) => (
                              <Badge key={ic.id} variant="secondary" className="text-[10px] font-normal">
                                {ic.staff
                                  ? `${ic.staff.first_name} ${ic.staff.last_name}`
                                  : 'Unknown'}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ── Staff picker (shared: single + bulk) ── */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">
              {isBulk ? 'Add Incharge to All' : 'Add Incharge'}
            </Label>
            <div className="flex gap-2">
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboboxOpen}
                    className="flex-1 h-9 justify-between text-sm font-normal"
                    disabled={staffLoading || availableStaff.length === 0}
                  >
                    {selectedStaffId
                      ? (() => {
                          const s = allStaff.find((s) => s.id === selectedStaffId);
                          return s
                            ? `${s.first_name} ${s.last_name}${s.staff_id ? ` (${s.staff_id})` : ''}`
                            : 'Select staff...';
                        })()
                      : staffLoading
                      ? 'Loading staff...'
                      : availableStaff.length === 0 && !isBulk
                      ? 'No staff available'
                      : 'Search staff by name...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name or staff ID..." />
                    <CommandList>
                      <CommandEmpty>No staff found.</CommandEmpty>
                      <CommandGroup>
                        {(isBulk ? allStaff : availableStaff).map((s) => (
                          <CommandItem
                            key={s.id}
                            value={`${s.first_name} ${s.last_name} ${s.staff_id || ''} ${s.email || ''}`}
                            onSelect={() => {
                              setSelectedStaffId(s.id === selectedStaffId ? '' : s.id);
                              setComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedStaffId === s.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <div className="flex flex-col">
                              <span>
                                {s.first_name} {s.last_name}
                                {s.staff_id ? ` (${s.staff_id})` : ''}
                              </span>
                              {s.email && (
                                <span className="text-xs text-muted-foreground">{s.email}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <Button
                size="sm"
                disabled={!selectedStaffId || isPending || !canCreate}
                onClick={isBulk ? handleBulkAssign : handleAssign}
                className="h-9"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isBulk ? (
                  <>
                    <Users className="h-4 w-4 mr-1" />
                    Add to All
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </>
                )}
              </Button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Commit**
```bash
git add app/(routes)/staff/class-incharges/_components/assign-incharge-dialog.tsx
git commit -m "feat(class-incharges): adapt AssignInchargeDialog for bulk mode"
```

---

## Task 5: Add checkbox selection + Bulk Assign button to `ClassInchargesList`

**Files:**
- Modify: `app/(routes)/staff/class-incharges/_components/class-incharges-list.tsx`

**Step 1: Add `selectedIds` state and bulk dialog state**

In the component body, add after existing `useState` declarations:

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
```

**Step 2: Add `selectedSections` derived value**

Add after the `sections` and `metadata` declarations:

```typescript
const selectedSections = sections.filter((s) => selectedIds.has(s.id));
```

**Step 3: Add toggle and select-all handlers**

Add these handlers after `handleRemoveAllClick`:

```typescript
const handleToggleSelect = useCallback((id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
}, []);

const handleSelectAll = useCallback((checked: boolean) => {
  setSelectedIds(checked ? new Set(sections.map((s) => s.id)) : new Set());
}, [sections]);
```

**Step 4: Reset selection when filters change**

Add a `useEffect` after the handlers to clear selection on filter changes:

```typescript
import { useState, useCallback, useMemo, useEffect } from 'react';

// Inside the component, after handleSelectAll:
useEffect(() => {
  setSelectedIds(new Set());
}, [filters]);
```

**Step 5: Pass selection props to `getClassInchargeColumns`**

Update the `columns` useMemo to pass the new props:

```typescript
const columns = useMemo(
  () =>
    getClassInchargeColumns({
      onManage: handleManage,
      onRemoveAll: handleRemoveAllClick,
      canDelete,
      selectedIds,
      onToggleSelect: handleToggleSelect,
      onSelectAll: handleSelectAll,
      totalCount: sections.length,
    }),
  [handleManage, handleRemoveAllClick, canDelete, selectedIds, handleToggleSelect, handleSelectAll, sections.length]
);
```

**Step 6: Add Bulk Assign button above the DataTable**

Wrap the `DataTable` in a fragment and add the bulk action bar above it:

```typescript
return (
  <>
    {/* Bulk Action Bar — shows when ≥1 row selected */}
    {selectedIds.size > 0 && (
      <div className="flex items-center justify-between px-1 py-2 mb-2 rounded-lg border bg-muted/40">
        <span className="text-sm text-muted-foreground">
          {selectedIds.size} section{selectedIds.size !== 1 ? 's' : ''} selected
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setBulkDialogOpen(true)}
          >
            <Users className="h-3.5 w-3.5" />
            Bulk Assign Incharge
          </Button>
        </div>
      </div>
    )}

    <DataTable ... /> {/* existing DataTable unchanged */}

    {/* Existing single-section dialog */}
    {selectedSection && (
      <AssignInchargeDialog
        section={selectedSection}
        open={!!selectedSection}
        onOpenChange={(open) => { if (!open) setSelectedSection(null); }}
      />
    )}

    {/* Bulk assign dialog */}
    {bulkDialogOpen && selectedSections.length > 0 && (
      <AssignInchargeDialog
        sections={selectedSections}
        open={bulkDialogOpen}
        onOpenChange={(open) => {
          setBulkDialogOpen(open);
          if (!open) setSelectedIds(new Set());
        }}
      />
    )}

    {/* Existing AlertDialog (remove all) — unchanged */}
    ...
  </>
);
```

**Step 7: Add missing imports**

Add to the import block at the top:

```typescript
import { useEffect } from 'react'; // add to existing react import
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
```

**Step 8: Commit**
```bash
git add app/(routes)/staff/class-incharges/_components/class-incharges-list.tsx
git commit -m "feat(class-incharges): add row checkbox selection and bulk assign UI"
```

---

## Task 6: Add checkbox column to `class-incharge-columns.tsx`

**Files:**
- Modify: `app/(routes)/staff/class-incharges/_components/class-incharge-columns.tsx`

Read this file first to understand its current structure. Then:

**Step 1: Extend the column options type**

Find the existing options type (something like `GetClassInchargeColumnsOptions`) and add:

```typescript
selectedIds: Set<string>;
onToggleSelect: (id: string) => void;
onSelectAll: (checked: boolean) => void;
totalCount: number;
```

**Step 2: Add checkbox as the FIRST column in the returned columns array**

```typescript
import { Checkbox } from '@/components/ui/checkbox';

// First column in the array:
{
  id: 'select',
  header: ({ table }) => (
    <Checkbox
      checked={
        options.totalCount > 0 &&
        options.selectedIds.size === options.totalCount
      }
      onCheckedChange={(checked) => options.onSelectAll(!!checked)}
      aria-label="Select all"
      className="translate-y-[2px]"
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={options.selectedIds.has(row.original.id)}
      onCheckedChange={() => options.onToggleSelect(row.original.id)}
      aria-label="Select row"
      className="translate-y-[2px]"
      onClick={(e) => e.stopPropagation()}
    />
  ),
  enableSorting: false,
  enableHiding: false,
  size: 40,
},
```

**Step 3: Commit**
```bash
git add app/(routes)/staff/class-incharges/_components/class-incharge-columns.tsx
git commit -m "feat(class-incharges): add checkbox column for row selection"
```

---

## Task 7: Verify end-to-end

**Manual testing checklist:**

1. Open Class Incharges page, select institution → sections load
2. Check a single row → bulk action bar appears with "1 section selected"
3. Check multiple rows → count updates correctly
4. Check header checkbox → all visible rows selected
5. Click "Bulk Assign Incharge" → dialog opens with "Assign Incharge — N sections selected"
6. Review list shows each section name + current incharges (or "None")
7. Search for a staff member → combobox works, dialog does NOT close when clicking search
8. Click "Add to All" → toast shows "Assigned to X of N sections"
9. If some sections already had that staff → toast shows "(Y already assigned, skipped)"
10. Dialog closes, table refreshes, incharges updated
11. Filter change → selection cleared automatically
12. "Clear" button in bulk bar → deselects all

**Step 1: Final commit**
```bash
git add -A
git commit -m "feat(class-incharges): bulk assign incharge to multiple sections"
```
