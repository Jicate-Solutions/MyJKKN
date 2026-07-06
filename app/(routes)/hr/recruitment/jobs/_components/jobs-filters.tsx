'use client';

import { memo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EnumOption } from '@/lib/admin/policy-shell';
import {
  JOB_STATUS_LABELS,
  type JobStatus,
  type RoleCategory,
} from '@/types/hr-recruitment';

import { ROLE_CATEGORY_LABELS } from './labels';

export interface JobsFilterState {
  status?: JobStatus;
  role_category?: RoleCategory;
  institution_id?: string;
  department_id?: string;
  is_public?: boolean;
}

interface JobsFiltersProps {
  filters: JobsFilterState;
  onFilterChange: (patch: Partial<JobsFilterState>) => void;
  institutions: ReadonlyArray<{ id: string; name: string }>;
  departmentsByInstitution: ReadonlyMap<string, EnumOption[]>;
}

const ALL = 'all';

function JobsFiltersComponent({
  filters,
  onFilterChange,
  institutions,
  departmentsByInstitution,
}: JobsFiltersProps) {
  const departmentOptions = filters.institution_id
    ? departmentsByInstitution.get(filters.institution_id) ?? []
    : [];

  return (
    <div className='mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
      {/* Status */}
      <Select
        value={filters.status ?? ALL}
        onValueChange={(value) =>
          onFilterChange({
            status: value === ALL ? undefined : (value as JobStatus),
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder='Status' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {JOB_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Role category */}
      <Select
        value={filters.role_category ?? ALL}
        onValueChange={(value) =>
          onFilterChange({
            role_category: value === ALL ? undefined : (value as RoleCategory),
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder='Role category' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All role categories</SelectItem>
          {(Object.keys(ROLE_CATEGORY_LABELS) as RoleCategory[]).map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_CATEGORY_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Institution — clears department when changed */}
      <Select
        value={filters.institution_id ?? ALL}
        onValueChange={(value) =>
          onFilterChange({
            institution_id: value === ALL ? undefined : value,
            department_id: undefined,
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder='Institution' />
        </SelectTrigger>
        <SelectContent className='max-h-60 overflow-y-auto'>
          <SelectItem value={ALL}>All institutions</SelectItem>
          {institutions.map((inst) => (
            <SelectItem key={inst.id} value={inst.id}>
              {inst.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Department — cascades off institution */}
      <Select
        value={filters.department_id ?? ALL}
        onValueChange={(value) =>
          onFilterChange({
            department_id: value === ALL ? undefined : value,
          })
        }
        disabled={!filters.institution_id}
      >
        <SelectTrigger>
          <SelectValue placeholder='Department' />
        </SelectTrigger>
        <SelectContent className='max-h-60 overflow-y-auto'>
          <SelectItem value={ALL}>All departments</SelectItem>
          {departmentOptions.map((dept) => (
            <SelectItem key={dept.value} value={dept.value}>
              {dept.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Public visibility */}
      <Select
        value={
          filters.is_public === true
            ? 'public'
            : filters.is_public === false
            ? 'hidden'
            : ALL
        }
        onValueChange={(value) =>
          onFilterChange({
            is_public:
              value === 'public' ? true : value === 'hidden' ? false : undefined,
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder='Public on /careers' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Public &amp; hidden</SelectItem>
          <SelectItem value='public'>On /careers</SelectItem>
          <SelectItem value='hidden'>Hidden</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export const JobsFilters = memo(JobsFiltersComponent);
