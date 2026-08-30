'use client';

import { useEffect, useState, memo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';

export interface HREmployeeFilterState {
  institution_id?: string;
  department_id?: string;
  is_active?: boolean;
}

interface Props {
  value: HREmployeeFilterState;
  onChange: (patch: Partial<HREmployeeFilterState>) => void;
}

const HREmployeesFiltersComponent = ({ value, onChange }: Props) => {
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; department_name: string }>>([]);

  useEffect(() => {
    OrganizationService.getInstitutionNames(true, undefined, 'all')
      .then(setInstitutions)
      .catch((e) => console.error('[hr-employees-filters] institutions load failed', e));
  }, []);

  useEffect(() => {
    if (value.institution_id) {
      DepartmentService.getDepartmentsByInstitution(value.institution_id)
        .then(setDepartments)
        .catch((e) => console.error('[hr-employees-filters] departments load failed', e));
    } else {
      setDepartments([]);
    }
  }, [value.institution_id]);

  // No search box here: the directory table ships its own in its toolbar, and
  // two inputs over one list — each unaware of the other — is a trap.
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <Select
        value={value.institution_id ?? 'all'}
        onValueChange={(v) =>
          onChange({ institution_id: v === 'all' ? undefined : v, department_id: undefined })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Institution" />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          <SelectItem value="all">All Institutions</SelectItem>
          {institutions.map((inst) => (
            <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.department_id ?? 'all'}
        onValueChange={(v) => onChange({ department_id: v === 'all' ? undefined : v })}
        disabled={!value.institution_id}
      >
        <SelectTrigger>
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          <SelectItem value="all">All Departments</SelectItem>
          {departments.map((dept) => (
            <SelectItem key={dept.id} value={dept.id}>{dept.department_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.is_active === true ? 'active' : value.is_active === false ? 'inactive' : 'all'}
        onValueChange={(v) =>
          onChange({ is_active: v === 'active' ? true : v === 'inactive' ? false : undefined })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export const HREmployeesFilters = memo(HREmployeesFiltersComponent);
