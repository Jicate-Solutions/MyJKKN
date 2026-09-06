'use client';
// ============================================
// PROFILE COMPLETION DRILL-DOWN — FILTER BAR
// ============================================
// Created: 2026-07-30
// Purpose: The nine drill-down filters, in flow order:
//          Profile Completion > Missing Field > Institution > Department >
//          Program > Semester > Section > Academic Year > Admission Year.
//          The five organisational levels cascade; the rest are independent.
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import {
  PROFILE_FIELD_MISSING,
  PROFILE_MISSING_FIELD_LABELS,
  PROFILE_REQUIRED_FIELD_LABELS,
  type IncompleteProfileFilterOptions,
  type ProfileCompletionScope,
  type ProfileFilterOption,
  type ProfileMissingFieldFilter,
} from '@/types/learner-dashboard';

/** Sentinel for "no filter applied" — Radix Select forbids an empty item value. */
export const ALL = 'all';

export interface ProfileCompletionFilterState {
  completion: ProfileCompletionScope;
  missingField: ProfileMissingFieldFilter | typeof ALL;
  // Organisational hierarchy — each level narrows the one below it.
  institutionId: string;
  departmentId: string;
  programId: string;
  semesterId: string;
  sectionId: string;
  academicYearId: string;
  admissionYearId: string;
}

export const DEFAULT_PROFILE_COMPLETION_FILTERS: ProfileCompletionFilterState = {
  // 'incomplete' preserves what this table has always shown; the dropdown is
  // what lets a user widen it to complete / all profiles.
  completion: 'incomplete',
  missingField: ALL,
  institutionId: ALL,
  departmentId: ALL,
  programId: ALL,
  semesterId: ALL,
  sectionId: ALL,
  academicYearId: ALL,
  admissionYearId: ALL,
};

/** Missing Field dropdown entries, in the same order as the completion funnel. */
const MISSING_FIELD_OPTIONS = Object.entries(PROFILE_MISSING_FIELD_LABELS) as [
  ProfileMissingFieldFilter,
  string
][];

/**
 * True when picking this field alongside "Complete profiles" could only ever
 * return zero rows. Applies to the four completeness-defining fields; admission
 * year stays selectable because a complete profile can legitimately lack one
 * (in fact most do).
 */
export function conflictsWithCompleteScope(field: ProfileMissingFieldFilter): boolean {
  return field in PROFILE_REQUIRED_FIELD_LABELS;
}

/** A real selection — i.e. neither "All" nor the "Not set" sentinel. */
function isConcreteId(value: string): boolean {
  return value !== ALL && value !== PROFILE_FIELD_MISSING;
}

/**
 * Prefix an option list with "All …" and "Not set".
 *
 * "Not set" maps to PROFILE_FIELD_MISSING, which the API turns into `IS NULL`.
 * It is offered at every level and never depends on the level above being
 * chosen — "learners with no semester" is a question you must be able to ask
 * without first naming a program, and those learners have no program to name.
 */
function withSentinels(
  options: ProfileFilterOption[] | undefined,
  allLabel: string
): ProfileFilterOption[] {
  return [
    { value: ALL, label: allLabel },
    { value: PROFILE_FIELD_MISSING, label: 'Not set (missing)' },
    ...(options ?? []),
  ];
}

// Module-scope loaders so their identity is stable across renders and the
// cascade hook below can safely depend on them.
const loadDepartments = (institutionId: string): Promise<ProfileFilterOption[]> =>
  DepartmentService.getDepartmentsByInstitution(institutionId).then((rows: any[]) =>
    (rows || []).map((row) => ({ value: row.id, label: row.department_name }))
  );

const loadPrograms = (departmentId: string): Promise<ProfileFilterOption[]> =>
  ProgramService.getProgramsByDepartment(departmentId).then((rows: any) =>
    ((rows as any[]) || []).map((row) => ({ value: row.id, label: row.program_name }))
  );

const loadSemesters = (programId: string): Promise<ProfileFilterOption[]> =>
  SemesterService.getSemestersByProgram(programId).then((rows: any) =>
    ((rows as any[]) || []).map((row) => ({ value: row.id, label: row.semester_name }))
  );

const loadSections = (semesterId: string): Promise<ProfileFilterOption[]> =>
  SectionService.getSectionsBySemester(semesterId).then((rows: any[]) =>
    (rows || []).map((row) => ({ value: row.id, label: row.section_name }))
  );

/**
 * One level of the cascade: load this level's options for the given parent.
 *
 * The loaded list is cached WITH the parent it belongs to, and the returned
 * `options` are gated on that parent still matching. Two reasons:
 *
 *  1. No setState in the effect body to "clear" the list when the parent is
 *     unset — clearing is derived, not stored (the lint rule this trips is
 *     right: it causes a cascading second render).
 *  2. Switching from one parent straight to another no longer flashes the
 *     previous parent's children while the new request is in flight.
 */
function useCascadeOptions(
  parentId: string,
  load: (parentId: string) => Promise<ProfileFilterOption[]>,
  label: string
): { options: ProfileFilterOption[]; loading: boolean } {
  const [cache, setCache] = useState<{ parent: string; options: ProfileFilterOption[] }>({
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
        console.error(`[learners/analytics] Error fetching ${label}:`, error);
        // Stamp the parent even on failure, so `loading` below resolves rather
        // than spinning forever on a level whose fetch errored.
        setCache({ parent: parentId, options: [] });
      });
    return () => {
      ignore = true;
    };
  }, [parentId, load, label, cache.parent]);

  const settled = cache.parent === parentId;
  return {
    options: settled ? cache.options : [],
    // Derived, not stored: a concrete parent whose results have not landed yet
    // is by definition still loading. Keeping this out of state avoids a
    // setState in the effect body (and the extra render it costs).
    loading: isConcreteId(parentId) && !settled,
  };
}

interface IncompleteProfilesFiltersProps {
  value: ProfileCompletionFilterState;
  onChange: (next: ProfileCompletionFilterState) => void;
  /** Year lists from the API (org levels are loaded here, in the cascade). */
  yearOptions: IncompleteProfileFilterOptions | undefined;
  yearOptionsLoading: boolean;
}

export function IncompleteProfilesFilters({
  value,
  onChange,
  yearOptions,
  yearOptionsLoading,
}: IncompleteProfilesFiltersProps) {
  const { institutions, loading: loadingInstitutions } = useInstitutionsWithAccess();

  const { options: departments, loading: loadingDepartments } = useCascadeOptions(
    value.institutionId,
    loadDepartments,
    'departments'
  );
  const { options: programs, loading: loadingPrograms } = useCascadeOptions(
    value.departmentId,
    loadPrograms,
    'programs'
  );
  const { options: semesters, loading: loadingSemesters } = useCascadeOptions(
    value.programId,
    loadSemesters,
    'semesters'
  );
  const { options: sections, loading: loadingSections } = useCascadeOptions(
    value.semesterId,
    loadSections,
    'sections'
  );

  const set = (patch: Partial<ProfileCompletionFilterState>) =>
    onChange({ ...value, ...patch });

  const institutionOptions = useMemo<ProfileFilterOption[]>(
    () => [
      { value: ALL, label: 'All institutions' },
      ...institutions.map((institution) => ({
        value: institution.id,
        label: institution.name,
      })),
    ],
    [institutions]
  );

  const activeFilterCount = (
    Object.keys(DEFAULT_PROFILE_COMPLETION_FILTERS) as (keyof ProfileCompletionFilterState)[]
  ).filter((key) => value[key] !== DEFAULT_PROFILE_COMPLETION_FILTERS[key]).length;

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
            onClick={() => onChange(DEFAULT_PROFILE_COMPLETION_FILTERS)}
          >
            <RotateCcw className='mr-2 h-3.5 w-3.5' />
            Clear Filters
          </Button>
        )}
      </div>

      {/* One continuous flow, in order. Institution -> Section cascade in the
          middle: each of those five resets the ones below it on change. */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {/* 1. Profile Completion */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Profile Completion</Label>
          <Select
            value={value.completion}
            onValueChange={(next) => {
              const completion = next as ProfileCompletionScope;
              // A complete profile is missing none of the four required fields,
              // so leaving one of those selected would guarantee an empty
              // table. Admission year survives the switch.
              set({
                completion,
                missingField:
                  completion === 'complete' &&
                  value.missingField !== ALL &&
                  conflictsWithCompleteScope(value.missingField)
                    ? ALL
                    : value.missingField,
              });
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='incomplete'>Incomplete profiles</SelectItem>
              <SelectItem value='complete'>Complete profiles</SelectItem>
              <SelectItem value='all'>All profiles</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 2. Missing Field */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Missing Field</Label>
          <Select
            value={value.missingField}
            onValueChange={(next) =>
              set({ missingField: next as ProfileCompletionFilterState['missingField'] })
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any missing field</SelectItem>
              {MISSING_FIELD_OPTIONS.map(([field, fieldLabel]) => (
                <SelectItem
                  key={field}
                  value={field}
                  disabled={
                    value.completion === 'complete' && conflictsWithCompleteScope(field)
                  }
                >
                  Missing {fieldLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. Institution */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Institution</Label>
          <SearchableSelect
            value={value.institutionId}
            // Every level below is scoped by this one, so changing it
            // invalidates the whole chain — keeping a stale department here
            // would filter to a department of a different institution and
            // return nothing.
            onValueChange={(next) =>
              set({
                institutionId: next,
                departmentId: ALL,
                programId: ALL,
                semesterId: ALL,
                sectionId: ALL,
              })
            }
            options={institutionOptions}
            loading={loadingInstitutions}
            placeholder='All institutions'
            searchPlaceholder='Search institutions…'
            className='w-full'
          />
        </div>

        {/* 4. Department */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Department</Label>
          <SearchableSelect
            value={value.departmentId}
            onValueChange={(next) =>
              set({ departmentId: next, programId: ALL, semesterId: ALL, sectionId: ALL })
            }
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

        {/* 5. Program */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Program</Label>
          <SearchableSelect
            value={value.programId}
            onValueChange={(next) =>
              set({ programId: next, semesterId: ALL, sectionId: ALL })
            }
            options={withSentinels(programs, 'All programs')}
            loading={loadingPrograms}
            placeholder='All programs'
            searchPlaceholder={
              isConcreteId(value.departmentId)
                ? 'Search programs…'
                : 'Pick a department to list programs'
            }
            className='w-full'
          />
        </div>

        {/* 6. Semester */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Semester</Label>
          <SearchableSelect
            value={value.semesterId}
            onValueChange={(next) => set({ semesterId: next, sectionId: ALL })}
            options={withSentinels(semesters, 'All semesters')}
            loading={loadingSemesters}
            placeholder='All semesters'
            searchPlaceholder={
              isConcreteId(value.programId)
                ? 'Search semesters…'
                : 'Pick a program to list semesters'
            }
            className='w-full'
          />
        </div>

        {/* 7. Section */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Section</Label>
          <SearchableSelect
            value={value.sectionId}
            onValueChange={(next) => set({ sectionId: next })}
            options={withSentinels(sections, 'All sections')}
            loading={loadingSections}
            placeholder='All sections'
            searchPlaceholder={
              isConcreteId(value.semesterId)
                ? 'Search sections…'
                : 'Pick a semester to list sections'
            }
            className='w-full'
          />
        </div>

        {/* 8. Academic Year — deliberately NOT cascaded off the institution
            picker, so it stays usable at "All institutions". */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Academic Year</Label>
          <SearchableSelect
            value={value.academicYearId}
            onValueChange={(next) => set({ academicYearId: next })}
            options={withSentinels(yearOptions?.academicYears, 'All academic years')}
            loading={yearOptionsLoading}
            placeholder='All academic years'
            searchPlaceholder='Search academic years…'
            className='w-full'
          />
        </div>

        {/* 9. Admission Year */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Admission Year</Label>
          <SearchableSelect
            value={value.admissionYearId}
            onValueChange={(next) => set({ admissionYearId: next })}
            options={withSentinels(yearOptions?.admissionYears, 'All admission years')}
            loading={yearOptionsLoading}
            placeholder='All admission years'
            searchPlaceholder='Search admission years…'
            className='w-full'
          />
        </div>
      </div>
    </div>
  );
}
