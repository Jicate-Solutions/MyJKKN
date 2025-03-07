'use client';

import { useEffect, useState } from 'react';
import {
  ResourceFilters,
  ResourceType,
  ResourceCondition,
  OwnerType
} from '@/types/resources';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useResourceCategories } from '@/hooks/resource/use-resource-categories';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';

interface ResourceFiltersComponentProps {
  filters: ResourceFilters;
  onFilterChange: (filters: Partial<ResourceFilters>) => void;
}

export function ResourceFiltersComponent({
  filters,
  onFilterChange
}: ResourceFiltersComponentProps) {
  const [institutions, setInstitutions] = useState<
    { id: string; name: string }[]
  >([]);
  const [departments, setDepartments] = useState<
    { id: string; department_name: string }[]
  >([]);
  const { categories, fetchCategories } = useResourceCategories();

  useEffect(() => {
    const loadInstitutions = async () => {
      try {
        const result = await OrganizationService.getInstitutions({
          isActive: true
        });
        setInstitutions(
          result.data.map((inst) => ({ id: inst.id, name: inst.name }))
        );
      } catch (error) {
        console.error('Error loading institutions:', error);
      }
    };

    const loadDepartments = async () => {
      try {
        const result = await DepartmentService.getDepartments({
          isActive: true,
          institution_id: filters.institution_id
        });
        setDepartments(
          result.data.map((dept) => ({
            id: dept.id,
            department_name: dept.department_name
          }))
        );
      } catch (error) {
        console.error('Error loading departments:', error);
      }
    };

    loadInstitutions();
    if (filters.institution_id) {
      loadDepartments();
    }
    fetchCategories();
  }, [fetchCategories, filters.institution_id]);

  const handleInstitutionChange = (value: string) => {
    const institutionId = value === 'all_institutions' ? undefined : value;
    onFilterChange({ institution_id: institutionId, department_id: undefined });
  };

  const handleDepartmentChange = (value: string) => {
    const departmentId = value === 'all_departments' ? undefined : value;
    onFilterChange({ department_id: departmentId });
  };

  const handleResourceTypeChange = (value: string) => {
    const resourceType =
      value === 'all_types' ? undefined : (value as ResourceType);
    onFilterChange({ resource_type: resourceType });
  };

  const handleCategoryChange = (value: string) => {
    const categoryId = value === 'all_categories' ? undefined : value;
    onFilterChange({ category_id: categoryId });
  };

  const handleConditionChange = (value: string) => {
    const condition =
      value === 'any_condition' ? undefined : (value as ResourceCondition);
    onFilterChange({ condition: condition });
  };

  const handleOwnerTypeChange = (value: string) => {
    const ownerType =
      value === 'any_owner_type' ? undefined : (value as OwnerType);
    onFilterChange({ owner_type: ownerType });
  };

  const handleReset = () => {
    onFilterChange({
      search: '',
      institution_id: undefined,
      department_id: undefined,
      resource_type: undefined,
      category_id: undefined,
      condition: undefined,
      is_shareable: undefined,
      owner_type: undefined,
      owner_id: undefined,
      isActive: true,
      page: 1
    });
  };

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-3 gap-4'>
        <div className='space-y-2'>
          <Label htmlFor='institution'>Institution</Label>
          <Select
            value={filters.institution_id || 'all_institutions'}
            onValueChange={handleInstitutionChange}
          >
            <SelectTrigger id='institution'>
              <SelectValue placeholder='All Institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all_institutions'>All Institutions</SelectItem>
              {institutions.map((institution) => (
                <SelectItem key={institution.id} value={institution.id}>
                  {institution.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='department'>Department</Label>
          <Select
            value={filters.department_id || 'all_departments'}
            onValueChange={handleDepartmentChange}
            disabled={!filters.institution_id}
          >
            <SelectTrigger id='department'>
              <SelectValue placeholder='All Departments' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all_departments'>All Departments</SelectItem>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.department_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='resource-type'>Resource Type</Label>
          <Select
            value={filters.resource_type || 'all_types'}
            onValueChange={handleResourceTypeChange}
          >
            <SelectTrigger id='resource-type'>
              <SelectValue placeholder='All Types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all_types'>All Types</SelectItem>
              <SelectItem value='equipment'>Equipment</SelectItem>
              <SelectItem value='facility'>Facility</SelectItem>
              <SelectItem value='vehicle'>Vehicle</SelectItem>
              <SelectItem value='other'>Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='category'>Category</Label>
          <Select
            value={filters.category_id || 'all_categories'}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger id='category'>
              <SelectValue placeholder='All Categories' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all_categories'>All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='condition'>Condition</Label>
          <Select
            value={filters.condition || 'any_condition'}
            onValueChange={handleConditionChange}
          >
            <SelectTrigger id='condition'>
              <SelectValue placeholder='Any Condition' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='any_condition'>Any Condition</SelectItem>
              <SelectItem value='excellent'>Excellent</SelectItem>
              <SelectItem value='good'>Good</SelectItem>
              <SelectItem value='fair'>Fair</SelectItem>
              <SelectItem value='poor'>Poor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='owner-type'>Owner Type</Label>
          <Select
            value={filters.owner_type || 'any_owner_type'}
            onValueChange={handleOwnerTypeChange}
          >
            <SelectTrigger id='owner-type'>
              <SelectValue placeholder='Any Owner Type' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='any_owner_type'>Any Owner Type</SelectItem>
              <SelectItem value='institution'>Institution</SelectItem>
              <SelectItem value='department'>Department</SelectItem>
              <SelectItem value='program'>Program</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='flex items-center space-x-2'>
        <Checkbox
          id='is-shareable'
          checked={filters.is_shareable === true}
          onCheckedChange={(checked) =>
            onFilterChange({
              is_shareable: checked === true ? true : undefined
            })
          }
        />
        <Label htmlFor='is-shareable'>Shareable Only</Label>
      </div>

      <div className='flex items-center space-x-2'>
        <Checkbox
          id='is-active'
          checked={filters.isActive !== false}
          onCheckedChange={(checked) =>
            onFilterChange({ isActive: checked === true ? true : false })
          }
        />
        <Label htmlFor='is-active'>Active Resources Only</Label>
      </div>

      <div className='flex justify-end space-x-2'>
        <Button variant='outline' onClick={handleReset}>
          Reset Filters
        </Button>
        <Button onClick={() => onFilterChange(filters)}>Apply Filters</Button>
      </div>
    </div>
  );
}
