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
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import type { StaffPlanFilters } from '@/types/staff-planning';

interface StaffPlanFiltersProps {
  filters: StaffPlanFilters;
  onFilterChange: (filters: Partial<StaffPlanFilters>) => void;
}

export function StaffPlanFilters({
  filters,
  onFilterChange
}: StaffPlanFiltersProps) {
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
  const [academicYears, setAcademicYears] = useState<
    Array<{ id: string; academic_year_name: string }>
  >([]);

  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      }
    }
    loadInstitutions();
  }, []);

  useEffect(() => {
    async function loadDegrees() {
      if (filters.institution_id) {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            filters.institution_id
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
        }
      } else {
        setDegrees([]);
      }
    }
    loadDegrees();
  }, [filters.institution_id]);

  useEffect(() => {
    async function loadDepartments() {
      if (filters.degree_id) {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            filters.degree_id
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        }
      } else {
        setDepartments([]);
      }
    }
    loadDepartments();
  }, [filters.degree_id]);

  useEffect(() => {
    async function loadPrograms() {
      if (filters.department_id) {
        try {
          const data = await ProgramService.getProgramsByDepartment(
            filters.department_id
          );
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
        }
      } else {
        setPrograms([]);
      }
    }
    loadPrograms();
  }, [filters.department_id]);

  useEffect(() => {
    async function loadSemesters() {
      if (filters.program_id) {
        try {
          const data = await SemesterService.getSemestersByProgram(
            filters.program_id
          );
          setSemesters(data);
        } catch (error) {
          console.error('Error loading semesters:', error);
        }
      } else {
        setSemesters([]);
      }
    }
    loadSemesters();
  }, [filters.program_id]);

  useEffect(() => {
    async function loadAcademicYears() {
      try {
        const result = await AcademicYearService.getAcademicYears({
          isActive: true
        });
        setAcademicYears(result.data);
      } catch (error) {
        console.error('Error loading academic years:', error);
      }
    }
    loadAcademicYears();
  }, []);

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
    <div className='space-y-4'>
      <div className='flex flex-col sm:flex-row gap-4'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search staff plans...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-9'
          />
        </div>

        <Select
          value={filters.institution_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              institution_id: value === 'all' ? undefined : value,
              degree_id: undefined,
              department_id: undefined,
              program_id: undefined,
              semester_id: undefined
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
              department_id: undefined,
              program_id: undefined,
              semester_id: undefined
            })
          }
          disabled={!filters.institution_id}
        >
          <SelectTrigger>
            <SelectValue placeholder='Select degree' />
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

      <div className='flex flex-col sm:flex-row gap-4'>
        <Select
          value={filters.department_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              department_id: value === 'all' ? undefined : value,
              program_id: undefined,
              semester_id: undefined
            })
          }
          disabled={!filters.degree_id}
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

        <Select
          value={filters.program_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              program_id: value === 'all' ? undefined : value,
              semester_id: undefined
            })
          }
          disabled={!filters.department_id}
        >
          <SelectTrigger>
            <SelectValue placeholder='Select program' />
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

        <Select
          value={filters.semester_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              semester_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.program_id}
        >
          <SelectTrigger>
            <SelectValue placeholder='Select semester' />
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

      <div className='flex flex-col sm:flex-row gap-4'>
        <Select
          value={filters.academic_year_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              academic_year_id: value === 'all' ? undefined : value
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Select academic year' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Academic Years</SelectItem>
            {academicYears.map((year) => (
              <SelectItem key={year.id} value={year.id}>
                {year.academic_year_name}
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
    </div>
  );
}
