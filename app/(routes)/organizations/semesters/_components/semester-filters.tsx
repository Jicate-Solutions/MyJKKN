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
import { SemesterFilters as SemesterFilterType } from '@/types/organizations';

interface SemesterFiltersProps {
  filters: SemesterFilterType;
  onFilterChange: (filters: Partial<SemesterFilterType>) => void;
}

export function SemesterFilters({
  filters,
  onFilterChange
}: SemesterFiltersProps) {
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
  const [loading, setLoading] = useState(false);

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
          setLoading(true);
          const data = await DegreeService.getDegreesByInstitution(
            filters.institution_id!
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
        } finally {
          setLoading(false);
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
          setLoading(true);
          const data = await DepartmentService.getDepartmentsByDegree(
            filters.degree_id!
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        } finally {
          setLoading(false);
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
          setLoading(true);
          const { data } = await ProgramService.getPrograms({
            department_id: filters.department_id,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
        } finally {
          setLoading(false);
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
    }
  }, [filters.department_id]);

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
      <div className='grid gap-4 md:grid-cols-4'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search semesters...'
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
              program_id: undefined
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
              program_id: undefined
            })
          }
          disabled={!filters.institution_id || loading}
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

        <Select
          value={filters.department_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              department_id: value === 'all' ? undefined : value,
              program_id: undefined
            })
          }
          disabled={!filters.degree_id || loading}
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
              program_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.department_id || loading}
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
          value={filters.semester_type || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              semester_type:
                value === 'all' ? undefined : (value as 'even' | 'odd')
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Select type' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='even'>Even</SelectItem>
            <SelectItem value='odd'>Odd</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
