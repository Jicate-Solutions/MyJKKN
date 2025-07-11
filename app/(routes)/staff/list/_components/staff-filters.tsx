// app/(routes)/staff/_components/staff-filters.tsx

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { CategoryService } from '@/lib/services/staff/category-service';
import { StaffFilters as StaffFilterType } from '@/types/staff';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';

interface StaffFiltersProps {
  filters: StaffFilterType;
  onFilterChange: (filters: Partial<StaffFilterType>) => void;
}

export function StaffFilters({ filters, onFilterChange }: StaffFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_id: string; degree_name: string }>
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
          const degreesData = await DegreeService.getDegreesByInstitution(
            filters.institution_id
          );
          setDegrees(degreesData);
        } else {
          setDegrees([]);
        }

        if (filters.degree_id && filters.institution_id) {
          const depsData =
            await DepartmentService.getDepartmentsByInstitutionAndDegree(
              filters.institution_id,
              filters.degree_id
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
  }, [filters.institution_id, filters.degree_id]);

  const debouncedSearch = useDebounce((value: string) => {
    onFilterChange({ search: value });
  }, 300);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 md:grid-cols-5'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search staff...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-9'
          />
        </div>

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
              degree_id: undefined,
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
          value={filters.degree_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              degree_id: value === 'all' ? undefined : value,
              department_id: undefined
            })
          }
          disabled={!filters.degree_id}
        >
          <SelectTrigger>
            <SelectValue placeholder='Select degree' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Degrees</SelectItem>
            {degrees.map((degree) => (
              <SelectItem key={degree.id} value={degree.id}>
                {degree.degree_name} ({degree.degree_id})
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
}
