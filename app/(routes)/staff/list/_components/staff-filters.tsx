'use client';
// app/(routes)/staff/_components/staff-filters.tsx


import { useEffect, useState, memo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { CategoryService } from '@/lib/services/staff/category-service';
import { StaffFilters as StaffFilterType } from '@/types/staff';
import { OrganizationService } from '@/lib/services/organization/organization-service';

import { DepartmentService } from '@/lib/services/organization/department-service';
import { RoleService } from '@/lib/services/roles/role-service';
import type { CustomRole } from '@/types/auth';

interface StaffFiltersProps {
  filters: StaffFilterType;
  onFilterChange: (filters: Partial<StaffFilterType>) => void;
}

const StaffFiltersComponent = ({ filters, onFilterChange }: StaffFiltersProps) => {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string; is_teaching?: boolean }>
  >([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);

  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [institutionsData, categoriesData, rolesData] = await Promise.all([
          OrganizationService.getInstitutionNames(true),
          // CategoryService.getCategories defaults to limit=10 — without passing
          // limit:100 here, the filter dropdown silently truncates once active
          // categories grow past 10 (same fix already applied in staff-form.tsx,
          // download-staff-template.tsx, bulk-upload-staff.tsx on 2026-04-16).
          CategoryService.getCategories({ isActive: true, limit: 100 }),
          RoleService.getStaffAssignableRoles()
        ]);
        setInstitutions(institutionsData);
        setCategories(categoriesData.data as any);
        setRoles(rolesData);

        if (filters.institution_id) {
          const depsData = await DepartmentService.getDepartmentsByInstitution(
            filters.institution_id
          );
          setDepartments(depsData);
        } else {
          setDepartments([]);
        }
      } catch (error) {
        console.error('Error loading filter data:', error);
      }
    }
    loadData();
  }, [filters.institution_id]);

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 md:grid-cols-3 lg:grid-cols-6'>

        <Select
          value={
            filters.isActive === true
              ? 'active'
              : filters.isActive === false
              ? 'inactive'
              : 'all'
          }
          onValueChange={(value) =>
            onFilterChange({
              isActive:
                value === 'active' ? true : value === 'inactive' ? false : undefined
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={
            filters.is_teaching === true
              ? 'teaching'
              : filters.is_teaching === false
              ? 'non_teaching'
              : 'all'
          }
          onValueChange={(value) =>
            onFilterChange({
              is_teaching:
                value === 'teaching'
                  ? true
                  : value === 'non_teaching'
                  ? false
                  : undefined
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Teaching type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All staff</SelectItem>
            <SelectItem value='teaching'>Teaching</SelectItem>
            <SelectItem value='non_teaching'>Non-Teaching</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.role_key || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              role_key: value === 'all' ? undefined : value
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Select role' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.role_key} value={r.role_key}>
                {r.role_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.category_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              category_id: value === 'all' ? undefined : value
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Select category' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.category_name}
                {typeof cat.is_teaching === 'boolean' &&
                  (cat.is_teaching ? ' (Teaching)' : ' (Non-Teaching)')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.institution_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              institution_id: value === 'all' ? undefined : value,
              department_id: undefined
            })
          }
        >
          <SelectTrigger>
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

        <Select
          value={filters.department_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              department_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.institution_id}
        >
          <SelectTrigger>
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
      </div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const StaffFilters = memo(StaffFiltersComponent);
