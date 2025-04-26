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
import { CourseMappingFilters as CourseMappingFiltersType } from '@/types/organizations';

interface CourseMappingFiltersProps {
  filters: CourseMappingFiltersType;
  onFilterChange: (filters: Partial<CourseMappingFiltersType>) => void;
}

export function CourseMappingFilters({
  filters,
  onFilterChange
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
    if (filters.institution_id) {
      async function loadDegrees() {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            filters.institution_id!
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
        }
      }
      loadDegrees();
    } else {
      setDegrees([]);
    }
  }, [filters.institution_id]);

  useEffect(() => {
    if (filters.degree_id) {
      async function loadDepartments() {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            filters.degree_id!
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
    }
  }, [filters.degree_id]);

  useEffect(() => {
    if (filters.department_id) {
      async function loadPrograms() {
        try {
          const { data } = await ProgramService.getPrograms({
            department_id: filters.department_id,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
    }
  }, [filters.department_id]);

  useEffect(() => {
    if (filters.program_id) {
      async function loadSemesters() {
        try {
          const { data } = await SemesterService.getSemesters({
            program_id: filters.program_id,
            isActive: true
          });
          setSemesters(data);
        } catch (error) {
          console.error('Error loading semesters:', error);
        }
      }
      loadSemesters();
    } else {
      setSemesters([]);
    }
  }, [filters.program_id]);

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
      <div className='grid gap-4 md:grid-cols-2'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search course mappings...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-9'
          />
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-5'>
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
          <SelectContent>
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
          <SelectContent>
            <SelectItem value='all'>All Degrees</SelectItem>
            {degrees.map((degree) => (
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
          <SelectContent>
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
          <SelectContent>
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
          <SelectContent>
            <SelectItem value='all'>All Semesters</SelectItem>
            {semesters.map((semester) => (
              <SelectItem key={semester.id} value={semester.id}>
                {semester.semester_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
