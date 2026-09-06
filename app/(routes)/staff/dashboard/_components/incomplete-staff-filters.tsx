'use client';
// ============================================
// INCOMPLETE EMPLOYEE PROFILES — FILTER BAR
// ============================================
// Created: 2026-08-10
// Fifteen controls in flow order: Field Scope > Missing Field > Institution >
// Department > Category > Designation > Status > Record Status > Gender >
// Marital Status > Blood Group > Joined From/To > Staff ID > Biometric Code >
// Biometric Machine.
//
// Only Institution -> Department cascades. Everything else is independent, so
// a filter stays usable at "All institutions".
//
// Employment Type and Role Type are deliberately absent: production holds a
// single value for each (full_time / teacher, 866 rows), so the control could
// never change a result set.
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { CategoryService } from '@/lib/services/staff/category-service';
import {
  ALL,
  FIELD_ASSIGNED,
  FIELD_MISSING,
  applyFilterPatch,
  countActiveFilters,
  DEFAULT_INCOMPLETE_STAFF_FILTERS,
  type IncompleteStaffFilterState,
} from '@/lib/utils/staff/incomplete-profile-filters';
import {
  STAFF_FIELD_LABELS,
  STAFF_OPTIONAL_FIELDS,
  STAFF_REQUIRED_FIELDS,
  fieldsForScope,
} from '@/lib/utils/staff/incomplete-profile-fields';
import type { IncompleteStaffFilterOptions, StaffFilterOption } from '@/types/staff';

/** A real id — neither "All" nor the "Not set" sentinel. */
function isConcreteId(value: string): boolean {
  return value !== ALL && value !== FIELD_MISSING;
}

/**
 * Prefix a list with "All …" and "Not set".
 *
 * "Not set" is offered at every level and never depends on the level above:
 * "employees with no department" must be askable without first naming an
 * institution, and 328 of the 866 production rows are in exactly that state.
 */
function withSentinels(
  options: StaffFilterOption[] | undefined,
  allLabel: string
): StaffFilterOption[] {
  return [
    { value: ALL, label: allLabel },
    { value: FIELD_MISSING, label: 'Not set (missing)' },
    ...(options ?? []),
  ];
}

const loadDepartments = (institutionId: string): Promise<StaffFilterOption[]> =>
  DepartmentService.getDepartmentsByInstitution(institutionId).then((rows: any[]) =>
    (rows || []).map((row) => ({ value: row.id, label: row.department_name }))
  );

/**
 * One cascade level. The loaded list is cached WITH the parent it belongs to
 * and gated on that parent still matching, so switching parents never flashes
 * the previous parent's children, and clearing is derived rather than stored
 * (no setState in the effect body, no cascading second render).
 */
function useCascadeOptions(
  parentId: string,
  load: (parentId: string) => Promise<StaffFilterOption[]>,
  label: string
): { options: StaffFilterOption[]; loading: boolean } {
  const [cache, setCache] = useState<{ parent: string; options: StaffFilterOption[] }>({
    parent: '',
    options: [],
  });

  useEffect(() => {
    if (!isConcreteId(parentId)) return;
    if (cache.parent === parentId) return;
    let ignore = false;
    load(parentId)
      .then((options) => {
        if (!ignore) setCache({ parent: parentId, options });
      })
      .catch((error) => {
        if (ignore) return;
        console.error(`[staff/dashboard] Error fetching ${label}:`, error);
        // Stamp the parent even on failure so `loading` resolves instead of
        // spinning forever on a level whose fetch errored.
        setCache({ parent: parentId, options: [] });
      });
    return () => {
      ignore = true;
    };
  }, [parentId, load, label, cache.parent]);

  const settled = cache.parent === parentId;
  return {
    options: settled ? cache.options : [],
    loading: isConcreteId(parentId) && !settled,
  };
}

interface IncompleteStaffFiltersProps {
  value: IncompleteStaffFilterState;
  onChange: (next: IncompleteStaffFilterState) => void;
  options: IncompleteStaffFilterOptions | undefined;
  optionsLoading: boolean;
}

export function IncompleteStaffFilters({
  value,
  onChange,
  options,
  optionsLoading,
}: IncompleteStaffFiltersProps) {
  const { institutions, loading: loadingInstitutions } = useInstitutionsWithAccess();
  const { options: departments, loading: loadingDepartments } = useCascadeOptions(
    value.institutionId,
    loadDepartments,
    'departments'
  );

  const [categories, setCategories] = useState<StaffFilterOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    let ignore = false;
    CategoryService.getCategories({ isActive: true, limit: 100 })
      .then((result: any) => {
        if (ignore) return;
        const rows = result?.data ?? result ?? [];
        setCategories(
          (rows as any[]).map((row) => ({ value: row.id, label: row.category_name }))
        );
      })
      .catch((error) => {
        if (!ignore) console.error('[staff/dashboard] Error fetching categories:', error);
      })
      .finally(() => {
        if (!ignore) setLoadingCategories(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const set = (patch: Partial<IncompleteStaffFilterState>) =>
    onChange(applyFilterPatch(value, patch));

  const institutionOptions = useMemo<StaffFilterOption[]>(
    () => [
      { value: ALL, label: 'All institutions' },
      ...institutions.map((institution) => ({
        value: institution.id,
        label: institution.name,
      })),
    ],
    [institutions]
  );

  // No "Not set" sentinel here, unlike every other picker in this file:
  // institution_id and category_id are uuid NOT NULL on `staff`, so "not set"
  // can never match a row. Offering it would be a control that always empties
  // the table. (department_id and biometric_institution_id ARE nullable,
  // which is why Department and Biometric Machine below keep withSentinels.)
  const categoryOptions = useMemo<StaffFilterOption[]>(
    () => [{ value: ALL, label: 'All categories' }, ...categories],
    [categories]
  );

  // Also no "Not set" here, for a different reason than Category: `designation`
  // is one of the 15 tracked completion fields, so Missing Field -> Designation
  // already asks this exact question through a correctly-wired path. A second
  // route to the same answer would be redundant, not more useful.
  const designationOptions = useMemo<StaffFilterOption[]>(
    () => [{ value: ALL, label: 'All designations' }, ...(options?.designations ?? [])],
    [options?.designations]
  );

  // Only fields inside the active scope can be missing, so offering the others
  // would be offering a guaranteed-empty result.
  const missingFieldOptions = useMemo(
    () => fieldsForScope(value.fieldScope).map((field) => ({
      value: field,
      label: STAFF_FIELD_LABELS[field] ?? field,
    })),
    [value.fieldScope]
  );

  const activeFilterCount = countActiveFilters(value);

  return (
    <div className='rounded-lg border bg-muted/30 p-4'>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          <SlidersHorizontal className='h-4 w-4 text-muted-foreground' />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant='secondary' className='text-xs'>
              {activeFilterCount} active
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant='ghost'
            size='sm'
            className='h-8'
            onClick={() => onChange(DEFAULT_INCOMPLETE_STAFF_FILTERS)}
          >
            <RotateCcw className='mr-2 h-3.5 w-3.5' />
            Clear Filters
          </Button>
        )}
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {/* 1. Field Scope */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Field Scope</Label>
          <Select
            value={value.fieldScope}
            onValueChange={(next) => {
              const fieldScope = next as IncompleteStaffFilterState['fieldScope'];
              // A field outside the new scope can never be missing within it,
              // so carrying the selection over would guarantee an empty table.
              const stillInScope =
                value.missingField === ALL ||
                fieldsForScope(fieldScope).includes(value.missingField);
              set({ fieldScope, missingField: stillInScope ? value.missingField : ALL });
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All tracked fields ({STAFF_REQUIRED_FIELDS.length + STAFF_OPTIONAL_FIELDS.length})</SelectItem>
              <SelectItem value='required'>Required only ({STAFF_REQUIRED_FIELDS.length})</SelectItem>
              <SelectItem value='optional'>Optional only ({STAFF_OPTIONAL_FIELDS.length})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 2. Missing Field */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Missing Field</Label>
          <SearchableSelect
            value={value.missingField}
            onValueChange={(next) => set({ missingField: next })}
            options={[{ value: ALL, label: 'Any missing field' }, ...missingFieldOptions]}
            placeholder='Any missing field'
            searchPlaceholder='Search fields…'
            className='w-full'
          />
        </div>

        {/* 3. Institution */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Institution</Label>
          <SearchableSelect
            value={value.institutionId}
            onValueChange={(next) => set({ institutionId: next })}
            options={institutionOptions}
            loading={loadingInstitutions}
            placeholder='All institutions'
            searchPlaceholder='Search institutions…'
            className='w-full'
          />
        </div>

        {/* 4. Department */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Department</Label>
          <SearchableSelect
            value={value.departmentId}
            onValueChange={(next) => set({ departmentId: next })}
            options={withSentinels(departments, 'All departments')}
            loading={loadingDepartments}
            placeholder='All departments'
            searchPlaceholder={
              isConcreteId(value.institutionId)
                ? 'Search departments…'
                : 'Pick an institution to list departments'
            }
            className='w-full'
          />
        </div>

        {/* 5. Employment Category */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Employment Category</Label>
          <SearchableSelect
            value={value.categoryId}
            onValueChange={(next) => set({ categoryId: next })}
            options={categoryOptions}
            loading={loadingCategories}
            placeholder='All categories'
            searchPlaceholder='Search categories…'
            className='w-full'
          />
        </div>

        {/* 6. Designation */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Designation</Label>
          <SearchableSelect
            value={value.designation}
            onValueChange={(next) => set({ designation: next })}
            options={designationOptions}
            loading={optionsLoading}
            placeholder='All designations'
            searchPlaceholder='Search designations…'
            className='w-full'
          />
        </div>

        {/* 7. Status */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Status</Label>
          <Select value={value.isActive} onValueChange={(next) => set({ isActive: next })}>
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value='active'>Active</SelectItem>
              <SelectItem value='inactive'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 8. Record Status — the publishing state, not employment */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Record Status</Label>
          <Select
            value={value.recordStatus}
            onValueChange={(next) => set({ recordStatus: next })}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All records</SelectItem>
              <SelectItem value='draft'>Draft</SelectItem>
              <SelectItem value='published'>Published</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 9. Gender */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Gender</Label>
          <SearchableSelect
            value={value.gender}
            onValueChange={(next) => set({ gender: next })}
            options={withSentinels(options?.genders, 'All genders')}
            loading={optionsLoading}
            placeholder='All genders'
            searchPlaceholder='Search…'
            className='w-full'
          />
        </div>

        {/* 10. Marital Status */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Marital Status</Label>
          <SearchableSelect
            value={value.maritalStatus}
            onValueChange={(next) => set({ maritalStatus: next })}
            options={withSentinels(options?.maritalStatuses, 'All marital statuses')}
            loading={optionsLoading}
            placeholder='All marital statuses'
            searchPlaceholder='Search…'
            className='w-full'
          />
        </div>

        {/* 11. Blood Group */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Blood Group</Label>
          <SearchableSelect
            value={value.bloodGroup}
            onValueChange={(next) => set({ bloodGroup: next })}
            options={withSentinels(options?.bloodGroups, 'All blood groups')}
            loading={optionsLoading}
            placeholder='All blood groups'
            searchPlaceholder='Search…'
            className='w-full'
          />
        </div>

        {/* 12. Joined between */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Joined Between</Label>
          <div className='flex items-center gap-2'>
            <Input
              type='date'
              value={value.joinedFrom}
              onChange={(event) => set({ joinedFrom: event.target.value })}
              className='w-full'
              aria-label='Joined from'
            />
            <span className='text-xs text-muted-foreground'>to</span>
            <Input
              type='date'
              value={value.joinedTo}
              onChange={(event) => set({ joinedTo: event.target.value })}
              className='w-full'
              aria-label='Joined to'
            />
          </div>
        </div>

        {/* 13. Staff ID */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Staff ID</Label>
          <div className='flex items-center gap-2'>
            <Input
              value={value.staffIdQuery === FIELD_MISSING ? '' : value.staffIdQuery}
              onChange={(event) => set({ staffIdQuery: event.target.value })}
              placeholder='Contains…'
              disabled={value.staffIdQuery === FIELD_MISSING}
              className='w-full'
            />
            <Button
              type='button'
              variant={value.staffIdQuery === FIELD_MISSING ? 'default' : 'outline'}
              size='sm'
              className='shrink-0'
              onClick={() =>
                set({
                  staffIdQuery: value.staffIdQuery === FIELD_MISSING ? '' : FIELD_MISSING,
                })
              }
            >
              Not set
            </Button>
          </div>
        </div>

        {/* 14. Biometric Code */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Biometric Code</Label>
          <div className='flex items-center gap-2'>
            <Input
              value={
                value.biometricCode === FIELD_MISSING || value.biometricCode === FIELD_ASSIGNED
                  ? ''
                  : value.biometricCode
              }
              onChange={(event) => set({ biometricCode: event.target.value })}
              placeholder='Contains…'
              disabled={
                value.biometricCode === FIELD_MISSING || value.biometricCode === FIELD_ASSIGNED
              }
              className='w-full'
            />
            <Select
              value={
                value.biometricCode === FIELD_MISSING || value.biometricCode === FIELD_ASSIGNED
                  ? value.biometricCode
                  : ALL
              }
              onValueChange={(next) => set({ biometricCode: next === ALL ? '' : next })}
            >
              <SelectTrigger className='w-[120px] shrink-0'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any</SelectItem>
                <SelectItem value={FIELD_ASSIGNED}>Enrolled</SelectItem>
                <SelectItem value={FIELD_MISSING}>Not set</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 15. Biometric Machine */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Biometric Machine</Label>
          <SearchableSelect
            value={value.biometricMachineId}
            onValueChange={(next) => set({ biometricMachineId: next })}
            options={withSentinels(options?.biometricMachines, 'All machines')}
            loading={optionsLoading}
            placeholder='All machines'
            searchPlaceholder='Search machines…'
            className='w-full'
          />
        </div>
      </div>
    </div>
  );
}
