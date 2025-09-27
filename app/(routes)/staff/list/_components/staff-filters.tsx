// app/(routes)/staff/_components/staff-filters.tsx

'use client';

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

interface StaffFiltersProps {
  filters: StaffFilterType;
  onFilterChange: (filters: Partial<StaffFilterType>) => void;
}

const StaffFiltersComponent = ({ filters, onFilterChange }: StaffFiltersProps) => {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string }>
  >([]);

  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [institutionsData, categoriesData] = await Promise.all([
          OrganizationService.getInstitutionNames(true),
          CategoryService.getCategories({ isActive: true })
        ]);
        setInstitutions(institutionsData);
        setCategories(categoriesData.data);

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
      <div className='grid gap-4 md:grid-cols-4'>

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
