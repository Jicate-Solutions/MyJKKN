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
import { SemesterService } from '@/lib/services/organization/semester-service';
import { CourseMappingsSearchParams } from './data-table-schema';
import BulkUploadCourseMappings from './bulk-upload-course-mappings';
import DownloadCourseMappingTemplateButton from './download-course-mapping-template';
import { usePermissions } from '@/hooks/use-permissions';

interface CourseMappingFiltersProps {
  searchParams: CourseMappingsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function CourseMappingFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: CourseMappingFiltersProps) {
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
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  
  const canEditCourses =
    isSuperAdmin || canAccess('organizations.courses', 'edit');

  useEffect(() => {
    async function loadInstitutions() {
      try {
        setLoading(true);
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      } finally {
        setLoading(false);
      }
    }
    loadInstitutions();
  }, []);

  useEffect(() => {
    async function loadDegrees() {
      if (searchParams.institution_id) {
        try {
          setLoading(true);
          const data = await DegreeService.getDegreesByInstitution(
            searchParams.institution_id as string
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setDegrees([]);
      }
    }
    loadDegrees();
  }, [searchParams.institution_id]);

  useEffect(() => {
    async function loadDepartments() {
      if (searchParams.degree_id) {
        try {
          setLoading(true);
          const data = await DepartmentService.getDepartmentsByDegree(
            searchParams.degree_id as string
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setDepartments([]);
      }
    }
    loadDepartments();
  }, [searchParams.degree_id]);

  useEffect(() => {
    async function loadPrograms() {
      if (searchParams.department_id) {
        try {
          setLoading(true);
          const { data } = await ProgramService.getPrograms({
            department_id: searchParams.department_id,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setPrograms([]);
      }
    }
    loadPrograms();
  }, [searchParams.department_id]);

  useEffect(() => {
    async function loadSemesters() {
      if (searchParams.program_id) {
        try {
          setLoading(true);
          const { data } = await SemesterService.getSemesters({
            program_id: searchParams.program_id,
            isActive: true
          });
          setSemesters(data);
        } catch (error) {
          console.error('Error loading semesters:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setSemesters([]);
      }
    }
    loadSemesters();
  }, [searchParams.program_id]);

  const handleInstitutionChange = (value: string) => {
    onFilterChange('institution_id', value === 'all' ? undefined : value);
    // Reset dependent filters when institution changes
    if (searchParams.degree_id) {
      onFilterChange('degree_id', undefined);
    }
    if (searchParams.department_id) {
      onFilterChange('department_id', undefined);
    }
    if (searchParams.program_id) {
      onFilterChange('program_id', undefined);
    }
    if (searchParams.semester_id) {
      onFilterChange('semester_id', undefined);
    }
  };

  const handleDegreeChange = (value: string) => {
    onFilterChange('degree_id', value === 'all' ? undefined : value);
    // Reset dependent filters when degree changes
    if (searchParams.department_id) {
      onFilterChange('department_id', undefined);
    }
    if (searchParams.program_id) {
      onFilterChange('program_id', undefined);
    }
    if (searchParams.semester_id) {
      onFilterChange('semester_id', undefined);
    }
  };

  const handleDepartmentChange = (value: string) => {
    onFilterChange('department_id', value === 'all' ? undefined : value);
    // Reset dependent filters when department changes
    if (searchParams.program_id) {
      onFilterChange('program_id', undefined);
    }
    if (searchParams.semester_id) {
      onFilterChange('semester_id', undefined);
    }
  };

  const handleProgramChange = (value: string) => {
    onFilterChange('program_id', value === 'all' ? undefined : value);
    // Reset semester when program changes
    if (searchParams.semester_id) {
      onFilterChange('semester_id', undefined);
    }
  };

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.degree_id ||
    searchParams.department_id ||
    searchParams.program_id ||
    searchParams.semester_id ||
    searchParams.status
  );

  return (
    <div className='space-y-4'>
      {/* Filters and Actions */}
      <div className='space-y-4'>
        {/* First Row - Filters */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4'>
          {/* Institution Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.institution_id || 'all'}
              onValueChange={handleInstitutionChange}
              disabled={loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={loading ? 'Loading...' : 'All Institutions'}
                />
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
          </div>

          {/* Degree Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.degree_id || 'all'}
              onValueChange={handleDegreeChange}
              disabled={!searchParams.institution_id || loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Degrees' />
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
              onValueChange={handleDepartmentChange}
              disabled={!searchParams.degree_id || loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Departments' />
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

          {/* Program Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.program_id || 'all'}
              onValueChange={handleProgramChange}
              disabled={!searchParams.department_id || loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Programs' />
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

          {/* Semester Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.semester_id || 'all'}
              onValueChange={(value) =>
                onFilterChange('semester_id', value === 'all' ? undefined : value)
              }
              disabled={!searchParams.program_id || loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Semesters' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Semesters</SelectItem>
                {semesters.map((semester) => (
                  <SelectItem key={semester.id} value={semester.id}>
                    {semester.semester_name}
                  </SelectItem>
                ))}
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
        </div>

        {/* Second Row - Clear Filters and Action Buttons */}
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div className='flex items-center gap-2'>
            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant='outline'
                size='sm'
                onClick={onClearFilters}
                className='w-full sm:w-auto'
              >
                <RotateCcw className='mr-2 h-4 w-4' />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Action Buttons */}
          <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
            {canEditCourses && (
              <div className='w-full sm:w-auto'>
                <DownloadCourseMappingTemplateButton />
              </div>
            )}
            {canEditCourses && (
              <div className='w-full sm:w-auto'>
                <BulkUploadCourseMappings />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
