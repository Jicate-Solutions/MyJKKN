'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemestersSearchParams } from './data-table-schema';
import DownloadSemesterTemplateButton from './download-semester-template';
import { ExportSemesters } from './export-semesters';
import BulkUploadSemesters from './bulk-upload-semesters';
import { usePermissions } from '@/hooks/use-permissions';

interface SemesterFiltersProps {
  searchParams: SemestersSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function SemesterFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: SemesterFiltersProps) {
  // Loading states
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  // Data states
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

  const { canAccess, isSuperAdmin } = usePermissions();

  const canEditSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'edit');
  const canExportSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'export');

  // Load institutions on mount
  useEffect(() => {
    async function loadInstitutions() {
      try {
        setLoadingInstitutions(true);
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      } finally {
        setLoadingInstitutions(false);
      }
    }
    loadInstitutions();
  }, []);

  // Load degrees when institution changes
  useEffect(() => {
    if (searchParams.institution_id) {
      const loadDegrees = async () => {
        try {
          setLoadingDegrees(true);
          setDegrees([]);
          const data = await DegreeService.getDegreesByInstitution(
            searchParams.institution_id!
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
        } finally {
          setLoadingDegrees(false);
        }
      };
      loadDegrees();
    } else {
      setDegrees([]);
      setDepartments([]);
      setPrograms([]);
    }
  }, [searchParams.institution_id]);

  // Load departments when degree changes
  useEffect(() => {
    if (searchParams.degree_id) {
      const loadDepartments = async () => {
        try {
          setLoadingDepartments(true);
          setDepartments([]);
          const data = await DepartmentService.getDepartmentsByDegree(
            searchParams.degree_id!
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        } finally {
          setLoadingDepartments(false);
        }
      };
      loadDepartments();
    } else {
      setDepartments([]);
      setPrograms([]);
    }
  }, [searchParams.degree_id]);

  // Load programs when department changes
  useEffect(() => {
    if (searchParams.department_id) {
      async function loadPrograms() {
        try {
          setLoadingPrograms(true);
          setPrograms([]);
          const { data } = await ProgramService.getPrograms({
            department_id: searchParams.department_id,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
        } finally {
          setLoadingPrograms(false);
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
    }
  }, [searchParams.department_id]);

  // Handle hierarchical filter changes with dependency reset
  const handleHierarchicalFilterChange = (
    key: string,
    value: string | undefined
  ) => {
    // Reset dependent fields when parent changes
    if (key === 'institution_id') {
      onFilterChange('degree_id', undefined);
      onFilterChange('department_id', undefined);
      onFilterChange('program_id', undefined);
    } else if (key === 'degree_id') {
      onFilterChange('department_id', undefined);
      onFilterChange('program_id', undefined);
    } else if (key === 'department_id') {
      onFilterChange('program_id', undefined);
    }

    // Set the current filter
    onFilterChange(key, value);
  };

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.degree_id ||
    searchParams.department_id ||
    searchParams.program_id ||
    searchParams.semester_type ||
    searchParams.status
  );

  return (
    <div className='space-y-4'>
      {/* Filters and Actions */}
      <div className='space-y-4'>
        {/* First Row - Hierarchical Filters */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Institution Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.institution_id || 'all'}
              onValueChange={(value) =>
                handleHierarchicalFilterChange(
                  'institution_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={loadingInstitutions}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={
                    loadingInstitutions ? 'Loading...' : 'All Institutions'
                  }
                />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Institutions</SelectItem>
                {institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Degree Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.degree_id || 'all'}
              onValueChange={(value) =>
                handleHierarchicalFilterChange(
                  'degree_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={!searchParams.institution_id || loadingDegrees}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={
                    !searchParams.institution_id
                      ? 'Select Institution First'
                      : loadingDegrees
                      ? 'Loading...'
                      : 'All Degrees'
                  }
                />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Degrees</SelectItem>
                {degrees.map((degree) => (
                  <SelectItem key={degree.id} value={degree.id}>
                    {degree.degree_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.department_id || 'all'}
              onValueChange={(value) =>
                handleHierarchicalFilterChange(
                  'department_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={!searchParams.degree_id || loadingDepartments}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={
                    !searchParams.degree_id
                      ? 'Select Degree First'
                      : loadingDepartments
                      ? 'Loading...'
                      : 'All Departments'
                  }
                />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Departments</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Program Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.program_id || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'program_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={!searchParams.department_id || loadingPrograms}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={
                    !searchParams.department_id
                      ? 'Select Department First'
                      : loadingPrograms
                      ? 'Loading...'
                      : 'All Programs'
                  }
                />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Programs</SelectItem>
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Second Row - Additional Filters */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {/* Semester Type Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.semester_type || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'semester_type',
                  value === 'all' ? undefined : value
                )
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Types</SelectItem>
                <SelectItem value='even'>Even</SelectItem>
                <SelectItem value='odd'>Odd</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.status || 'all'}
              onValueChange={(value) =>
                onFilterChange('status', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='active'>Active</SelectItem>
                <SelectItem value='inactive'>Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clear Filters Button */}
          <div className='w-full flex items-center'>
            {hasActiveFilters && (
              <Button
                variant='outline'
                size='sm'
                onClick={onClearFilters}
                className='w-full'
              >
                <RotateCcw className='mr-2 h-4 w-4' />
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Third Row - Action Buttons */}
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-2'>
          {canEditSemesters && (
            <div className='w-full sm:w-auto'>
              <DownloadSemesterTemplateButton />
            </div>
          )}
          {canExportSemesters && (
            <div className='w-full sm:w-auto'>
              <ExportSemesters />
            </div>
          )}
          {canEditSemesters && (
            <div className='w-full sm:w-auto'>
              <BulkUploadSemesters />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
