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
import { SectionsSearchParams } from './data-table-schema';

interface SectionFiltersProps {
  searchParams: SectionsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function SectionFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: SectionFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string; counselling_code: string }>
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
    Array<{ id: string; semester_name: string; program_id: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  // Store ALL data (unfiltered) from database
  const [allDegrees, setAllDegrees] = useState<
    Array<{ id: string; degree_name: string; institution_id: string }>
  >([]);
  const [allDepartments, setAllDepartments] = useState<
    Array<{ id: string; department_name: string; degree_id: string }>
  >([]);
  const [allPrograms, setAllPrograms] = useState<
    Array<{ id: string; program_name: string; department_id: string }>
  >([]);
  const [allSemesters, setAllSemesters] = useState<
    Array<{ id: string; semester_name: string; program_id: string }>
  >([]);

  // Load ALL data on component mount
  useEffect(() => {
    async function loadAllData() {
      try {
        setLoading(true);

        // Load institutions
        const institutionsData = await OrganizationService.getInstitutionNames(true);
        setInstitutions(institutionsData);

        // Load ALL degrees (no filter)
        const { data: degreesData } = await DegreeService.getDegrees({
          isActive: true,
          limit: 10000 // Large limit to get all
        });
        setAllDegrees(degreesData);

        // Load ALL departments (no filter)
        const { data: departmentsData } = await DepartmentService.getDepartments({
          isActive: true,
          limit: 10000
        });
        setAllDepartments(departmentsData);

        // Load ALL programs (no filter)
        const { data: programsData } = await ProgramService.getPrograms({
          isActive: true,
          limit: 10000
        });
        setAllPrograms(programsData);

        // Load ALL semesters (no filter)
        const { data: semestersData } = await SemesterService.getSemesters({
          isActive: true,
          limit: 10000
        });
        setAllSemesters(semestersData);

      } catch (error) {
        console.error('Error loading filter data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadAllData();
  }, []);

  // Filter degrees based on selected institution (client-side filtering)
  useEffect(() => {
    if (searchParams.institution_id) {
      const filtered = allDegrees.filter(
        (d) => d.institution_id === searchParams.institution_id
      );
      setDegrees(filtered);
    } else {
      setDegrees(allDegrees);
    }
  }, [searchParams.institution_id, allDegrees]);

  // Filter departments based on selected degree (client-side filtering)
  useEffect(() => {
    if (searchParams.degree_id) {
      const filtered = allDepartments.filter(
        (d) => d.degree_id === searchParams.degree_id
      );
      setDepartments(filtered);
    } else if (searchParams.institution_id) {
      // If institution is selected but not degree, show departments for all degrees in that institution
      const institutionDegreeIds = allDegrees
        .filter((d) => d.institution_id === searchParams.institution_id)
        .map((d) => d.id);
      const filtered = allDepartments.filter((dept) =>
        institutionDegreeIds.includes(dept.degree_id)
      );
      setDepartments(filtered);
    } else {
      setDepartments(allDepartments);
    }
  }, [searchParams.degree_id, searchParams.institution_id, allDepartments, allDegrees]);

  // Filter programs based on selected department (client-side filtering)
  useEffect(() => {
    if (searchParams.department_id) {
      const filtered = allPrograms.filter(
        (p) => p.department_id === searchParams.department_id
      );
      setPrograms(filtered);
    } else if (searchParams.degree_id) {
      // If degree is selected but not department, show programs for all departments in that degree
      const degreeDepartmentIds = allDepartments
        .filter((d) => d.degree_id === searchParams.degree_id)
        .map((d) => d.id);
      const filtered = allPrograms.filter((prog) =>
        degreeDepartmentIds.includes(prog.department_id)
      );
      setPrograms(filtered);
    } else if (searchParams.institution_id) {
      // If only institution is selected, show programs for all departments in that institution
      const institutionDegreeIds = allDegrees
        .filter((d) => d.institution_id === searchParams.institution_id)
        .map((d) => d.id);
      const institutionDepartmentIds = allDepartments
        .filter((dept) => institutionDegreeIds.includes(dept.degree_id))
        .map((dept) => dept.id);
      const filtered = allPrograms.filter((prog) =>
        institutionDepartmentIds.includes(prog.department_id)
      );
      setPrograms(filtered);
    } else {
      setPrograms(allPrograms);
    }
  }, [
    searchParams.department_id,
    searchParams.degree_id,
    searchParams.institution_id,
    allPrograms,
    allDepartments,
    allDegrees
  ]);

  // Filter semesters based on selected program (client-side filtering)
  useEffect(() => {
    if (searchParams.program_id) {
      const filtered = allSemesters.filter(
        (s) => s.program_id === searchParams.program_id
      );
      setSemesters(filtered);
    } else if (searchParams.department_id) {
      // If department is selected but not program, show semesters for all programs in that department
      const departmentProgramIds = allPrograms
        .filter((p) => p.department_id === searchParams.department_id)
        .map((p) => p.id);
      const filtered = allSemesters.filter((sem) =>
        departmentProgramIds.includes(sem.program_id)
      );
      setSemesters(filtered);
    } else if (searchParams.degree_id) {
      // If only degree is selected, show semesters for all programs in that degree's departments
      const degreeDepartmentIds = allDepartments
        .filter((d) => d.degree_id === searchParams.degree_id)
        .map((d) => d.id);
      const degreeProgramIds = allPrograms
        .filter((prog) => degreeDepartmentIds.includes(prog.department_id))
        .map((prog) => prog.id);
      const filtered = allSemesters.filter((sem) =>
        degreeProgramIds.includes(sem.program_id)
      );
      setSemesters(filtered);
    } else if (searchParams.institution_id) {
      // If only institution is selected, show semesters for all programs in that institution
      const institutionDegreeIds = allDegrees
        .filter((d) => d.institution_id === searchParams.institution_id)
        .map((d) => d.id);
      const institutionDepartmentIds = allDepartments
        .filter((dept) => institutionDegreeIds.includes(dept.degree_id))
        .map((dept) => dept.id);
      const institutionProgramIds = allPrograms
        .filter((prog) => institutionDepartmentIds.includes(prog.department_id))
        .map((prog) => prog.id);
      const filtered = allSemesters.filter((sem) =>
        institutionProgramIds.includes(sem.program_id)
      );
      setSemesters(filtered);
    } else {
      setSemesters(allSemesters);
    }
  }, [
    searchParams.program_id,
    searchParams.department_id,
    searchParams.degree_id,
    searchParams.institution_id,
    allSemesters,
    allPrograms,
    allDepartments,
    allDegrees
  ]);

  const handleInstitutionChange = (value: string) => {
    onFilterChange('institution_id', value === 'all' ? undefined : value);
    // Reset all dependent filters when institution changes
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
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4'>
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
                    {inst.name} ({inst.counselling_code})
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

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={onClearFilters}
              className='w-full sm:w-auto'
            >
              <RotateCcw className='mr-2 h-4 w-4' />
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
