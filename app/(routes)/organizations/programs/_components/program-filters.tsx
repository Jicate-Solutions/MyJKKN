'use client';

import { useEffect, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramFilters as ProgramFilterType } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import DownloadProgramTemplateButton from './download-program-template';
import { ExportPrograms } from './export-programs';
import BulkUploadPrograms from './bulk-upload-programs';
import { usePermissions } from '@/hooks/use-permissions';

interface Institution {
  id: string;
  name: string;
}

interface Degree {
  id: string;
  degree_name: string;
}

interface Department {
  id: string;
  department_name: string;
}

interface ProgramFiltersProps {
  filters: ProgramFilterType;
  onFilterChange: (filters: Partial<ProgramFilterType>) => void;
}

export function ProgramFilters({
  filters,
  onFilterChange
}: ProgramFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditPrograms =
    isSuperAdmin || canAccess('organizations.programs', 'edit');
  useEffect(() => {
    async function loadData() {
      try {
        const institutionsData = await OrganizationService.getInstitutionNames(
          true
        );
        setInstitutions(institutionsData);

        if (filters.institution_id) {
          const degreesData = await DegreeService.getDegreesByInstitution(
            filters.institution_id
          );
          setDegrees(degreesData);
        } else {
          setDegrees([]);
        }
      } catch (error) {
        console.error('Error loading filter data:', error);
      }
    }
    loadData();
  }, [filters.institution_id]);

  useEffect(() => {
    async function loadDepartments() {
      if (filters.degree_id) {
        try {
          const departmentsData =
            await DepartmentService.getDepartmentsByDegree(filters.degree_id);
          setDepartments(departmentsData);
        } catch (error) {
          console.error('Error loading departments:', error);
          setDepartments([]);
        }
      } else {
        setDepartments([]);
      }
    }
    loadDepartments();
  }, [filters.degree_id]);

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 w-full'>
        <div className='flex items-center justify-between gap-2 w-full'>
          <Select
            value={filters.institution_id || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                ...filters,
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
              {institutions.map((inst: Institution) => (
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
                ...filters,
                degree_id: value === 'all' ? undefined : value,
                department_id: undefined
              })
            }
            disabled={!filters.institution_id}
          >
            <SelectTrigger>
              <SelectValue placeholder='Select degree' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Degrees</SelectItem>
              {degrees.map((degree: Degree) => (
                <SelectItem key={degree.id} value={degree.id}>
                  {degree.degree_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.department_id || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                ...filters,
                department_id: value === 'all' ? undefined : value
              })
            }
            disabled={!filters.degree_id}
          >
            <SelectTrigger>
              <SelectValue placeholder='Select department' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Departments</SelectItem>
              {departments.map((dept: Department) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.department_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={
              filters.isActive === undefined
                ? 'all'
                : filters.isActive
                ? 'active'
                : 'inactive'
            }
            onValueChange={(value) =>
              onFilterChange({
                ...filters,
                isActive: value === 'all' ? undefined : value === 'active'
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Filter by status' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Status</SelectItem>
              <SelectItem value='active'>Active</SelectItem>
              <SelectItem value='inactive'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='grid  md:grid-cols-3 items-center justify-center gap-2 w-full'>
          {canEditPrograms && <DownloadProgramTemplateButton />}
          {isSuperAdmin && <ExportPrograms />}
          {canEditPrograms && <BulkUploadPrograms />}
        </div>
      </div>
    </div>
  );
}
