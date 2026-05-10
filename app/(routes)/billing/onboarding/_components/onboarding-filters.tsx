'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { OnboardingFilters as OnboardingFilterShape } from '@/lib/services/billing/onboarding/onboarding-service';

// Subset of OnboardingFilters that this component manages. The data table owns
// search/payment_status/page/limit and merges these in.
export type OnboardingHierarchyFilters = Pick<
  OnboardingFilterShape,
  | 'institution_id'
  | 'degree_id'
  | 'department_id'
  | 'program_id'
  | 'bill_status'
>;

export type OnboardingFilterKey = keyof OnboardingHierarchyFilters;

interface OnboardingFiltersProps {
  filters: OnboardingHierarchyFilters;
  onFilterChange: (key: OnboardingFilterKey, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function OnboardingFilters({
  filters,
  onFilterChange,
  onClearFilters,
}: OnboardingFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const { isSuperAdmin, userProfile } = usePermissions();

  // Load institutions once on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoadingInstitutions(true);
        const data = await OrganizationService.getInstitutionNames(true);
        if (!cancelled) setInstitutions(data);
      } catch (error) {
        console.error('[onboarding-filters] load institutions failed:', error);
      } finally {
        if (!cancelled) setLoadingInstitutions(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-pin institution for non-super-admin users (their access is scoped).
  useEffect(() => {
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !filters.institution_id &&
      !loadingInstitutions
    ) {
      onFilterChange('institution_id', userProfile.institution_id);
    }
  }, [
    userProfile,
    isSuperAdmin,
    filters.institution_id,
    onFilterChange,
    loadingInstitutions,
  ]);

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

  // Cascading reset — clearing a parent must clear every dependent child so
  // the table doesn't keep filtering by stale orphan IDs.
  const clearChildren = (level: OnboardingFilterKey) => {
    const order: OnboardingFilterKey[] = [
      'institution_id',
      'degree_id',
      'department_id',
      'program_id',
    ];
    const idx = order.indexOf(level);
    if (idx === -1) return;
    for (let i = idx + 1; i < order.length; i++) {
      onFilterChange(order[i], undefined);
    }
  };

  const hasActiveFilters = !!(
    filters.institution_id ||
    filters.degree_id ||
    filters.department_id ||
    filters.program_id ||
    filters.bill_status
  );

  return (
    <div className='space-y-3'>
      {/* Row 1: Institution → Degree → Department → Programme + Reset */}
      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
          {isSuperAdmin && (
            <Select
              value={filters.institution_id || 'all'}
              onValueChange={(value) => {
                const next = value === 'all' ? undefined : value;
                onFilterChange('institution_id', next);
                clearChildren('institution_id');
              }}
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
            onValueChange={(value) => {
              const next = value === 'all' ? undefined : value;
              onFilterChange('degree_id', next);
              clearChildren('degree_id');
            }}
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
            onValueChange={(value) => {
              const next = value === 'all' ? undefined : value;
              onFilterChange('department_id', next);
              clearChildren('department_id');
            }}
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
            onValueChange={(value) => {
              const next = value === 'all' ? undefined : value;
              onFilterChange('program_id', next);
              clearChildren('program_id');
            }}
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

      {/* Row 2: Bill Status — orthogonal to the academic hierarchy.
          Generated = at least one billing_student_bills row exists.
          Not Generated = zero bill rows (learner sent to accounts but bills not yet created). */}
      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        <Select
          value={filters.bill_status || 'all'}
          onValueChange={(value) =>
            onFilterChange(
              'bill_status',
              value === 'all' ? undefined : (value as 'generated' | 'not_generated')
            )
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
