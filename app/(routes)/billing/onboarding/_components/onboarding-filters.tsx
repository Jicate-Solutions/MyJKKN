'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  ONBOARDING_LIFECYCLE_STATUSES,
  type OnboardingFilters as OnboardingFilterShape,
  type OnboardingLifecycleStatus,
} from '@/lib/services/billing/onboarding/onboarding-service';

// Subset of OnboardingFilters that this component manages. The data table owns
// search/payment_status/page/limit and merges these in.
export type OnboardingHierarchyFilters = Pick<
  OnboardingFilterShape,
  | 'institution_id'
  | 'degree_id'
  | 'department_id'
  | 'program_id'
  | 'bill_status'
  | 'lifecycle_status'
>;

const LIFECYCLE_LABELS: Record<OnboardingLifecycleStatus, string> = {
  account: 'Account',
  admitted: 'Admitted',
  reserved: 'Reserved',
};

export type OnboardingFilterKey = keyof OnboardingHierarchyFilters;

/**
 * A batch of filter changes applied in ONE URL update. Selecting a hierarchy
 * level must set that level AND clear its dependent children atomically —
 * splitting it across several onFilterChange calls would clobber the selection,
 * because each call reads the same stale useSearchParams() snapshot and the
 * last router.replace() (a child-clear) wins.
 */
export type OnboardingFilterUpdates = Partial<
  Record<OnboardingFilterKey, string | undefined>
>;

interface OnboardingFiltersProps {
  filters: OnboardingHierarchyFilters;
  onFilterChange: (updates: OnboardingFilterUpdates) => void;
  onClearFilters: () => void;
}

const HIERARCHY_ORDER: OnboardingFilterKey[] = [
  'institution_id',
  'degree_id',
  'department_id',
  'program_id',
];

export function OnboardingFilters({
  filters,
  onFilterChange,
  onClearFilters,
}: OnboardingFiltersProps) {
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);
  const {
    institutions,
    loading: loadingInstitutions,
  } = useInstitutionsWithAccess({ isActive: true });

  const hasMultiInstitutionAccess = institutions.length > 1;

  // Keep a stable ref so the auto-pin effect can always call the latest
  // onFilterChange without including it in deps. Including it would cause
  // the effect to re-run on every URL update (onFilterChange is recreated
  // whenever searchParams changes), which is unnecessary and can cause
  // timing issues with concurrent URL writes.
  const onFilterChangeRef = useRef(onFilterChange);
  onFilterChangeRef.current = onFilterChange;

  // Auto-pin institution for single-institution users.
  useEffect(() => {
    if (
      !loadingInstitutions &&
      institutions.length === 1 &&
      !filters.institution_id
    ) {
      onFilterChangeRef.current({ institution_id: institutions[0].id });
    }
  }, [institutions, filters.institution_id, loadingInstitutions]);
  // onFilterChange intentionally excluded — ref above keeps it current

  // Cascade loaders — each dropdown's options depend on its parent.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!filters.institution_id) {
        setDegrees([]);
        return;
      }
      try {
        const data = await DegreeService.getDegreesByInstitution(
          filters.institution_id
        );
        if (!cancelled) setDegrees(data);
      } catch (error) {
        console.error('[onboarding-filters] load degrees failed:', error);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.institution_id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!filters.degree_id) {
        setDepartments([]);
        return;
      }
      try {
        const data = await DepartmentService.getDepartmentsByDegree(
          filters.degree_id
        );
        if (!cancelled) setDepartments(data);
      } catch (error) {
        console.error('[onboarding-filters] load departments failed:', error);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.degree_id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!filters.department_id) {
        setPrograms([]);
        return;
      }
      try {
        const data = await ProgramService.getProgramsByDepartment(
          filters.department_id
        );
        if (!cancelled) setPrograms(data);
      } catch (error) {
        console.error('[onboarding-filters] load programs failed:', error);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.department_id]);

  // Set one hierarchy level and clear every dependent child in a SINGLE update.
  const setHierarchyLevel = (
    level: OnboardingFilterKey,
    value: string | undefined
  ) => {
    const updates: OnboardingFilterUpdates = {};
    updates[level] = value;
    const idx = HIERARCHY_ORDER.indexOf(level);
    for (let i = idx + 1; i < HIERARCHY_ORDER.length; i++) {
      updates[HIERARCHY_ORDER[i]] = undefined;
    }
    onFilterChange(updates);
  };

  const hasActiveFilters = !!(
    filters.institution_id ||
    filters.degree_id ||
    filters.department_id ||
    filters.program_id ||
    filters.bill_status ||
    filters.lifecycle_status
  );

  return (
    <div className='space-y-3'>
      {/* Row 1: Institution → Degree → Department → Programme + Reset */}
      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
          {hasMultiInstitutionAccess && (
            <Select
              value={filters.institution_id || 'all'}
              onValueChange={(value) =>
                setHierarchyLevel('institution_id', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className='w-full sm:w-[200px]'>
                <SelectValue placeholder='Select institution' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Institutions</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={filters.degree_id || 'all'}
            onValueChange={(value) =>
              setHierarchyLevel('degree_id', value === 'all' ? undefined : value)
            }
            disabled={!filters.institution_id}
          >
            <SelectTrigger className='w-full sm:w-[180px]'>
              <SelectValue placeholder='Select degree' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Degrees</SelectItem>
              {degrees.map((deg) => (
                <SelectItem key={deg.id} value={deg.id}>
                  {deg.degree_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.department_id || 'all'}
            onValueChange={(value) =>
              setHierarchyLevel('department_id', value === 'all' ? undefined : value)
            }
            disabled={!filters.degree_id}
          >
            <SelectTrigger className='w-full sm:w-[180px]'>
              <SelectValue placeholder='Select department' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.department_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.program_id || 'all'}
            onValueChange={(value) =>
              setHierarchyLevel('program_id', value === 'all' ? undefined : value)
            }
            disabled={!filters.department_id}
          >
            <SelectTrigger className='w-full sm:w-[180px]'>
              <SelectValue placeholder='Select programme' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Programmes</SelectItem>
              {programs.map((prog) => (
                <SelectItem key={prog.id} value={prog.id}>
                  {prog.program_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button
            variant='ghost'
            onClick={onClearFilters}
            className='h-8 px-2 lg:px-3'
          >
            Reset
            <RotateCcw className='ml-2 h-4 w-4' />
          </Button>
        )}
      </div>

      {/* Row 2: Lifecycle Status + Bill Status — orthogonal to the academic hierarchy. */}
      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        <Select
          value={filters.lifecycle_status || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              lifecycle_status:
                value === 'all'
                  ? undefined
                  : (value as OnboardingLifecycleStatus),
            })
          }
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
            <SelectValue placeholder='Learner status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Statuses</SelectItem>
            {ONBOARDING_LIFECYCLE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {LIFECYCLE_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.bill_status || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              bill_status:
                value === 'all'
                  ? undefined
                  : (value as 'generated' | 'not_generated'),
            })
          }
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
            <SelectValue placeholder='Bill status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Bill Status</SelectItem>
            <SelectItem value='generated'>Generated</SelectItem>
            <SelectItem value='not_generated'>Not Generated</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
