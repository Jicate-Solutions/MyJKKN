'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { TimetablesSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';

interface TimetableFiltersProps {
  searchParams: TimetablesSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function TimetableFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: TimetableFiltersProps) {
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
  const [sections, setSections] = useState<
    Array<{ id: string; section_name: string }>
  >([]);
  const [academicYears, setAcademicYears] = useState<
    Array<{ id: string; academic_year_name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.search || '');
  const [isSearching, setIsSearching] = useState(false);
  const { isSuperAdmin, userProfile } = usePermissions();

  // Handle search input changes
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (value !== searchParams.search) {
      setIsSearching(true);
    }
  };

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onFilterChange('search', searchValue || undefined);
      setIsSearching(false);
    }, 500); // 500ms delay

    return () => clearTimeout(timeoutId);
  }, [searchValue, onFilterChange]);

  // Sync search value when searchParams changes externally (e.g., from URL or reset)
  useEffect(() => {
    setSearchValue(searchParams.search || '');
    setIsSearching(false);
  }, [searchParams.search]);

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

  // Auto-set institution filter for non-super admin users
  useEffect(() => {
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !searchParams.institution_id &&
      !loading
    ) {
      onFilterChange('institution_id', userProfile.institution_id);
    }
  }, [
    userProfile,
    isSuperAdmin,
    searchParams.institution_id,
    onFilterChange,
    loading
  ]);

  useEffect(() => {
    async function loadDegrees() {
      if (searchParams.institution_id) {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            searchParams.institution_id
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
  }, [searchParams.institution_id]);

  useEffect(() => {
    async function loadDepartments() {
      if (searchParams.degree_id) {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            searchParams.degree_id
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
  }, [searchParams.degree_id]);

  useEffect(() => {
    async function loadPrograms() {
      if (searchParams.department_id) {
        try {
          const data = await ProgramService.getProgramsByDepartment(
            searchParams.department_id
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
  }, [searchParams.department_id]);

  useEffect(() => {
    async function loadSemesters() {
      if (searchParams.program_id) {
        try {
          const data = await SemesterService.getSemestersByProgram(
            searchParams.program_id
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
  }, [searchParams.program_id]);

  useEffect(() => {
    async function loadSections() {
      if (searchParams.semester && searchParams.program_id) {
        try {
          const filters = {
            institution_id: searchParams.institution_id,
            degree_id: searchParams.degree_id,
            department_id: searchParams.department_id,
            program_id: searchParams.program_id,
            semester_id: searchParams.semester, // semester param now holds the ID
            isActive: true
          };

          const response = await SectionService.getSections(filters);
          setSections(response.data);
        } catch (error) {
          console.error('Error loading sections:', error);
        }
      } else {
        setSections([]);
      }
    }
    loadSections();
  }, [
    searchParams.semester,
    searchParams.program_id,
    searchParams.institution_id,
    searchParams.degree_id,
    searchParams.department_id
  ]);

  useEffect(() => {
    async function loadAcademicYears() {
      if (searchParams.institution_id) {
        try {
          const data = await AcademicYearService.getAcademicYearsByInstitution(
            searchParams.institution_id
          );
          setAcademicYears(data);
        } catch (error) {
          console.error('Error loading academic years:', error);
        }
      } else {
        setAcademicYears([]);
      }
    }
    loadAcademicYears();
  }, [searchParams.institution_id]);

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.degree_id ||
    searchParams.department_id ||
    searchParams.program_id ||
    searchParams.semester ||
    searchParams.academic_year_id ||
    searchParams.is_active ||
    searchParams.is_template ||
    searchParams.timetable_type ||
    searchParams.section ||
    searchParams.search
  );

  return (
    <div className='space-y-4'>
      {/* Search Bar */}
      <div className='relative'>
        {isSearching ? (
          <Loader2 className='absolute left-3 top-3 h-4 w-4 text-muted-foreground animate-spin' />
        ) : (
          <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
        )}
        <Input
          placeholder='Search timetables...'
          className='pl-9'
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
          {isSuperAdmin && (
            <Select
              value={searchParams.institution_id || 'all'}
              onValueChange={(value) => {
                const newValue = value === 'all' ? undefined : value;
                onFilterChange('institution_id', newValue);
                // Clear dependent filters
                if (!newValue) {
                  onFilterChange('degree_id', undefined);
                  onFilterChange('department_id', undefined);
                  onFilterChange('program_id', undefined);
                  onFilterChange('semester', undefined);
                  onFilterChange('section', undefined);
                  onFilterChange('academic_year_id', undefined);
                }
              }}
            >
              <SelectTrigger className='w-full sm:w-[200px]'>
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
          )}

          <Select
            value={searchParams.degree_id || 'all'}
            onValueChange={(value) => {
              const newValue = value === 'all' ? undefined : value;
              onFilterChange('degree_id', newValue);
              // Clear dependent filters
              if (!newValue) {
                onFilterChange('department_id', undefined);
                onFilterChange('program_id', undefined);
                onFilterChange('semester', undefined);
                onFilterChange('section', undefined);
              }
            }}
            disabled={!searchParams.institution_id}
          >
            <SelectTrigger className='w-full sm:w-[180px]'>
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
            value={searchParams.department_id || 'all'}
            onValueChange={(value) => {
              const newValue = value === 'all' ? undefined : value;
              onFilterChange('department_id', newValue);
              // Clear dependent filters
              if (!newValue) {
                onFilterChange('program_id', undefined);
                onFilterChange('semester', undefined);
                onFilterChange('section', undefined);
              }
            }}
            disabled={!searchParams.degree_id}
          >
            <SelectTrigger className='w-full sm:w-[180px]'>
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
            value={searchParams.program_id || 'all'}
            onValueChange={(value) => {
              const newValue = value === 'all' ? undefined : value;
              onFilterChange('program_id', newValue);
              // Clear dependent filters
              if (!newValue) {
                onFilterChange('semester', undefined);
                onFilterChange('section', undefined);
              }
            }}
            disabled={!searchParams.department_id}
          >
            <SelectTrigger className='w-full sm:w-[180px]'>
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
        </div>
        {hasActiveFilters && (
          <Button
            variant='ghost'
            onClick={onClearFilters}
            className='h-8 px-2 lg:px-3'
          >
            Reset
            <RotateCcw className='ml-2 h-4 w-4' />
          </Button>
        )}
      </div>

      <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
        <Select
          value={searchParams.semester || 'all'}
          onValueChange={(value) => {
            const newValue = value === 'all' ? undefined : value;
            onFilterChange('semester', newValue);
            // Clear section filter when semester changes
            if (!newValue) {
              onFilterChange('section', undefined);
            }
          }}
          disabled={!searchParams.program_id}
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
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

        <Select
          value={searchParams.academic_year_id || 'all'}
          onValueChange={(value) => {
            onFilterChange(
              'academic_year_id',
              value === 'all' ? undefined : value
            );
          }}
          disabled={!searchParams.institution_id}
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
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
          value={searchParams.section || 'all'}
          onValueChange={(value) => {
            onFilterChange('section', value === 'all' ? undefined : value);
          }}
          disabled={!searchParams.semester}
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
            <SelectValue placeholder='Select section' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Sections</SelectItem>
            {/* Deduplicate sections by name for display */}
            {sections
              .filter(
                (section, index, self) =>
                  index ===
                  self.findIndex((s) => s.section_name === section.section_name)
              )
              .map((section) => (
                <SelectItem key={section.id} value={section.section_name}>
                  {section.section_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.is_active || 'all'}
          onValueChange={(value) => {
            onFilterChange('is_active', value === 'all' ? undefined : value);
          }}
        >
          <SelectTrigger className='w-full sm:w-[140px]'>
            <SelectValue placeholder='Filter by status' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='true'>Active</SelectItem>
            <SelectItem value='false'>Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={searchParams.is_template || 'all'}
          onValueChange={(value) => {
            onFilterChange('is_template', value === 'all' ? undefined : value);
          }}
        >
          <SelectTrigger className='w-full sm:w-[140px]'>
            <SelectValue placeholder='Filter by type' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='false'>Regular</SelectItem>
            <SelectItem value='true'>Template</SelectItem>
          </SelectContent>
        </Select>

        {/* Timetable Type Filter - Updated: 2025-10-13 */}
        <Select
          value={searchParams.timetable_type || 'all'}
          onValueChange={(value) => {
            onFilterChange('timetable_type', value === 'all' ? undefined : value);
          }}
        >
          <SelectTrigger className='w-full sm:w-[160px]'>
            <SelectValue placeholder='Timetable type' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Timetable Types</SelectItem>
            <SelectItem value='section'>Section</SelectItem>
            <SelectItem value='semester'>Semester</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
