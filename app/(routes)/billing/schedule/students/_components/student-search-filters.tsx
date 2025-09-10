'use client';

import { useState, useEffect } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import type { Institution, Department, Semester, Degree, Program, Section } from '@/types/organizations';
import type { AcademicYear } from '@/types/academics';
import type { StudentSearchFilters } from '@/types/billing-schedule';

interface StudentSearchFiltersProps {
  filters: StudentSearchFilters;
  onFilterChange: (filters: Partial<StudentSearchFilters>) => void;
}

export function StudentSearchFilters({
  filters,
  onFilterChange
}: StudentSearchFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingAcademicYears, setIsLoadingAcademicYears] = useState(false);
  const [isLoadingDegrees, setIsLoadingDegrees] = useState(false);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  const [isLoadingSemesters, setIsLoadingSemesters] = useState(false);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  // Debounced search state
  const [searchInput, setSearchInput] = useState(filters.first_name || '');
  const [rollNumberInput, setRollNumberInput] = useState(
    filters.roll_number || ''
  );
  const [mobileInput, setMobileInput] = useState(filters.mobile_number || '');

  useEffect(() => {
    loadInstitutions();
  }, []);

  // Load hierarchical data based on selections
  useEffect(() => {
    if (filters.institution_id) {
      loadAcademicYears(filters.institution_id);
      loadDegrees(filters.institution_id);
    } else {
      setAcademicYears([]);
      setDegrees([]);
    }
  }, [filters.institution_id]);

  useEffect(() => {
    if (filters.degree_id && filters.institution_id) {
      loadDepartments(filters.institution_id, filters.degree_id);
    } else {
      setDepartments([]);
    }
  }, [filters.degree_id, filters.institution_id]);

  useEffect(() => {
    if (filters.department_id && filters.degree_id && filters.institution_id) {
      loadPrograms(filters.institution_id, filters.degree_id, filters.department_id);
    } else {
      setPrograms([]);
    }
  }, [filters.department_id, filters.degree_id, filters.institution_id]);

  useEffect(() => {
    if (filters.program_id && filters.department_id && filters.degree_id && filters.institution_id) {
      loadSemesters(filters.institution_id, filters.degree_id, filters.department_id, filters.program_id);
    } else {
      setSemesters([]);
    }
  }, [filters.program_id, filters.department_id, filters.degree_id, filters.institution_id]);

  useEffect(() => {
    if (filters.semester_id && filters.program_id && filters.department_id && filters.degree_id && filters.institution_id) {
      loadSections(filters.institution_id, filters.degree_id, filters.department_id, filters.program_id, filters.semester_id);
    } else {
      setSections([]);
    }
  }, [filters.semester_id, filters.program_id, filters.department_id, filters.degree_id, filters.institution_id]);

  // Sync local input states with filter props when they change
  useEffect(() => {
    setSearchInput(filters.first_name || '');
  }, [filters.first_name]);

  useEffect(() => {
    setRollNumberInput(filters.roll_number || '');
  }, [filters.roll_number]);

  useEffect(() => {
    setMobileInput(filters.mobile_number || '');
  }, [filters.mobile_number]);

  // Remove this old useEffect as it's replaced by the hierarchical loading above

  // Debounce search inputs
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.first_name) {
        onFilterChange({ first_name: searchInput || undefined });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput, filters.first_name, onFilterChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (rollNumberInput !== filters.roll_number) {
        onFilterChange({ roll_number: rollNumberInput || undefined });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [rollNumberInput, filters.roll_number, onFilterChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mobileInput !== filters.mobile_number) {
        onFilterChange({ mobile_number: mobileInput || undefined });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [mobileInput, filters.mobile_number, onFilterChange]);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      const institutionNames = await OrganizationService.getInstitutionNames(
        true
      );
      setInstitutions(institutionNames as Institution[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const loadAcademicYears = async (institutionId: string) => {
    try {
      setIsLoadingAcademicYears(true);
      const academicYearData = await AcademicYearService.getAcademicYears({
        institution_id: institutionId,
        limit: 1000,
        isActive: true
      });
      setAcademicYears(academicYearData.data);
    } catch (error) {
      console.error('Error loading academic years:', error);
    } finally {
      setIsLoadingAcademicYears(false);
    }
  };

  const loadDegrees = async (institutionId: string) => {
    try {
      setIsLoadingDegrees(true);
      const degreeData = await DegreeService.getDegrees({
        institution_id: institutionId,
        limit: 1000,
        isActive: true
      });
      setDegrees(degreeData.data);
    } catch (error) {
      console.error('Error loading degrees:', error);
    } finally {
      setIsLoadingDegrees(false);
    }
  };

  const loadDepartments = async (institutionId: string, degreeId: string) => {
    try {
      setIsLoadingDepartments(true);
      const departmentData = await DepartmentService.getDepartments({
        institution_id: institutionId,
        degree_id: degreeId,
        limit: 1000,
        isActive: true
      });
      setDepartments(departmentData.data);
    } catch (error) {
      console.error('Error loading departments:', error);
    } finally {
      setIsLoadingDepartments(false);
    }
  };

  const loadPrograms = async (institutionId: string, degreeId: string, departmentId: string) => {
    try {
      setIsLoadingPrograms(true);
      const programData = await ProgramService.getPrograms({
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        limit: 1000,
        isActive: true
      });
      setPrograms(programData.data);
    } catch (error) {
      console.error('Error loading programs:', error);
    } finally {
      setIsLoadingPrograms(false);
    }
  };

  const loadSemesters = async (institutionId: string, degreeId: string, departmentId: string, programId: string) => {
    try {
      setIsLoadingSemesters(true);
      const semesterData = await SemesterService.getSemesters({
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        program_id: programId,
        limit: 1000,
        isActive: true
      });
      setSemesters(semesterData.data);
    } catch (error) {
      console.error('Error loading semesters:', error);
    } finally {
      setIsLoadingSemesters(false);
    }
  };

  const loadSections = async (institutionId: string, degreeId: string, departmentId: string, programId: string, semesterId: string) => {
    try {
      setIsLoadingSections(true);
      const sectionData = await SectionService.getSections({
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        program_id: programId,
        semester_id: semesterId,
        limit: 1000,
        isActive: true
      });
      setSections(sectionData.data);
    } catch (error) {
      console.error('Error loading sections:', error);
    } finally {
      setIsLoadingSections(false);
    }
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setRollNumberInput('');
    setMobileInput('');
    onFilterChange({
      first_name: undefined,
      roll_number: undefined,
      mobile_number: undefined,
      institution_id: undefined,
      academic_year_id: undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    });
  };

  const hasActiveFilters =
    filters.first_name ||
    filters.roll_number ||
    filters.mobile_number ||
    filters.institution_id ||
    filters.academic_year_id ||
    filters.degree_id ||
    filters.department_id ||
    filters.program_id ||
    filters.semester_id ||
    filters.section_id;

  return (
    <div className='space-y-4 mb-6'>
      <div className='flex items-center gap-2 mb-4'>
        <Filter className='h-4 w-4 text-muted-foreground' />
        <h3 className='text-sm font-medium'>Advanced Search & Filters</h3>
      </div>

      {/* Search Fields Row */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {/* Student Name Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
          <Input
            placeholder='Search by student name...'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className='pl-10'
          />
        </div>

        {/* Roll Number Search */}
        <div className='relative'>
          <Input
            placeholder='Search by roll number...'
            value={rollNumberInput}
            onChange={(e) => setRollNumberInput(e.target.value)}
          />
        </div>

        {/* Mobile Number Search */}
        <div className='relative'>
          <Input
            placeholder='Search by mobile number...'
            value={mobileInput}
            onChange={(e) => setMobileInput(e.target.value)}
          />
        </div>
      </div>

      {/* First Filter Row - Institution and Academic Year */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* Institution Filter */}
        <Select
          value={filters.institution_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              institution_id: value === 'all' ? undefined : value,
              academic_year_id: undefined,
              degree_id: undefined,
              department_id: undefined,
              program_id: undefined,
              semester_id: undefined,
              section_id: undefined
            })
          }
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLoadingInstitutions
                  ? 'Loading institutions...'
                  : 'All institutions'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All institutions</SelectItem>
            {institutions.map((institution) => (
              <SelectItem key={institution.id} value={institution.id}>
                {institution.name} ({institution.counselling_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Academic Year Filter */}
        <Select
          value={filters.academic_year_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              academic_year_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.institution_id || isLoadingAcademicYears}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.institution_id
                  ? 'Select institution first'
                  : isLoadingAcademicYears
                  ? 'Loading academic years...'
                  : 'All academic years'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All academic years</SelectItem>
            {academicYears.map((year) => (
              <SelectItem key={year.id} value={year.id}>
                {year.academic_year_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Second Filter Row - Academic Hierarchy */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {/* Degree Filter */}
        <Select
          value={filters.degree_id || 'all'}
          onValueChange={(value) => {
            const degreeId = value === 'all' ? undefined : value;
            onFilterChange({
              degree_id: degreeId,
              department_id: undefined,
              program_id: undefined,
              semester_id: undefined,
              section_id: undefined
            });
          }}
          disabled={!filters.institution_id || isLoadingDegrees}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.institution_id
                  ? 'Select institution first'
                  : isLoadingDegrees
                  ? 'Loading degrees...'
                  : 'All degrees'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All degrees</SelectItem>
            {degrees.map((degree) => (
              <SelectItem key={degree.id} value={degree.id}>
                {degree.degree_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Department Filter */}
        <Select
          value={filters.department_id || 'all'}
          onValueChange={(value) => {
            const departmentId = value === 'all' ? undefined : value;
            onFilterChange({
              department_id: departmentId,
              program_id: undefined,
              semester_id: undefined,
              section_id: undefined
            });
          }}
          disabled={!filters.degree_id || isLoadingDepartments}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.degree_id
                  ? 'Select degree first'
                  : isLoadingDepartments
                  ? 'Loading departments...'
                  : 'All departments'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All departments</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.department_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Program Filter */}
        <Select
          value={filters.program_id || 'all'}
          onValueChange={(value) => {
            const programId = value === 'all' ? undefined : value;
            onFilterChange({
              program_id: programId,
              semester_id: undefined,
              section_id: undefined
            });
          }}
          disabled={!filters.department_id || isLoadingPrograms}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.department_id
                  ? 'Select department first'
                  : isLoadingPrograms
                  ? 'Loading programs...'
                  : 'All programs'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All programs</SelectItem>
            {programs.map((program) => (
              <SelectItem key={program.id} value={program.id}>
                {program.program_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Third Filter Row - Semester and Section */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* Semester Filter */}
        <Select
          value={filters.semester_id || 'all'}
          onValueChange={(value) => {
            const semesterId = value === 'all' ? undefined : value;
            onFilterChange({
              semester_id: semesterId,
              section_id: undefined
            });
          }}
          disabled={!filters.program_id || isLoadingSemesters}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.program_id
                  ? 'Select program first'
                  : isLoadingSemesters
                  ? 'Loading semesters...'
                  : 'All semesters'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All semesters</SelectItem>
            {semesters.map((semester) => (
              <SelectItem key={semester.id} value={semester.id}>
                {semester.semester_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Section Filter */}
        <Select
          value={filters.section_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              section_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.semester_id || isLoadingSections}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.semester_id
                  ? 'Select semester first'
                  : isLoadingSections
                  ? 'Loading sections...'
                  : 'All sections'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All sections</SelectItem>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.section_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className='flex justify-end'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleClearFilters}
            className='h-8'
          >
            <X className='mr-2 h-4 w-4' />
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}
