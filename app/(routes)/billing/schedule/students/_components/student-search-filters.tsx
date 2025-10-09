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
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import type { Department, Semester, Degree, Program, Section } from '@/types/organizations';
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
  // Use the hook that respects user institution access
  const {
    institutions,
    loading: isLoadingInstitutions
  } = useInstitutionsWithAccess({ isActive: true });

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoadingAcademicYears, setIsLoadingAcademicYears] = useState(false);
  const [isLoadingDegrees, setIsLoadingDegrees] = useState(false);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  const [isLoadingSemesters, setIsLoadingSemesters] = useState(false);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  // Local form state - no longer debounced, will be applied on search button click
  const [searchInput, setSearchInput] = useState(filters.first_name || '');
  const [rollNumberInput, setRollNumberInput] = useState(
    filters.roll_number || ''
  );
  const [mobileInput, setMobileInput] = useState(filters.mobile_number || '');

  // Local filter state for dropdowns - will be applied on search button click
  const [localFilters, setLocalFilters] = useState({
    institution_id: filters.institution_id,
    academic_year_id: filters.academic_year_id,
    degree_id: filters.degree_id,
    department_id: filters.department_id,
    program_id: filters.program_id,
    semester_id: filters.semester_id,
    section_id: filters.section_id
  });

  // Load hierarchical data based on local filter selections
  useEffect(() => {
    if (localFilters.institution_id) {
      loadAcademicYears(localFilters.institution_id);
      loadDegrees(localFilters.institution_id);
    } else {
      setAcademicYears([]);
      setDegrees([]);
    }
  }, [localFilters.institution_id]);

  useEffect(() => {
    if (localFilters.degree_id && localFilters.institution_id) {
      loadDepartments(localFilters.institution_id, localFilters.degree_id);
    } else {
      setDepartments([]);
    }
  }, [localFilters.degree_id, localFilters.institution_id]);

  useEffect(() => {
    if (localFilters.department_id && localFilters.degree_id && localFilters.institution_id) {
      loadPrograms(localFilters.institution_id, localFilters.degree_id, localFilters.department_id);
    } else {
      setPrograms([]);
    }
  }, [localFilters.department_id, localFilters.degree_id, localFilters.institution_id]);

  useEffect(() => {
    if (localFilters.program_id && localFilters.department_id && localFilters.degree_id && localFilters.institution_id) {
      loadSemesters(localFilters.institution_id, localFilters.degree_id, localFilters.department_id, localFilters.program_id);
    } else {
      setSemesters([]);
    }
  }, [localFilters.program_id, localFilters.department_id, localFilters.degree_id, localFilters.institution_id]);

  useEffect(() => {
    if (localFilters.semester_id && localFilters.program_id && localFilters.department_id && localFilters.degree_id && localFilters.institution_id) {
      loadSections(localFilters.institution_id, localFilters.degree_id, localFilters.department_id, localFilters.program_id, localFilters.semester_id);
    } else {
      setSections([]);
    }
  }, [localFilters.semester_id, localFilters.program_id, localFilters.department_id, localFilters.degree_id, localFilters.institution_id]);

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

  // Search button handler - applies all local filters at once
  const handleSearch = () => {
    onFilterChange({
      ...localFilters,
      first_name: searchInput || undefined,
      roll_number: rollNumberInput || undefined,
      mobile_number: mobileInput || undefined,
      page: 1 // Reset to first page when searching
    });
  };

  // Handle local filter changes (dropdowns)
  const handleLocalFilterChange = (key: keyof typeof localFilters, value: string | undefined) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value,
      // Reset dependent filters when parent changes
      ...(key === 'institution_id' && {
        academic_year_id: undefined,
        degree_id: undefined,
        department_id: undefined,
        program_id: undefined,
        semester_id: undefined,
        section_id: undefined
      }),
      ...(key === 'degree_id' && {
        department_id: undefined,
        program_id: undefined,
        semester_id: undefined,
        section_id: undefined
      }),
      ...(key === 'department_id' && {
        program_id: undefined,
        semester_id: undefined,
        section_id: undefined
      }),
      ...(key === 'program_id' && {
        semester_id: undefined,
        section_id: undefined
      }),
      ...(key === 'semester_id' && {
        section_id: undefined
      })
    }));
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
    setLocalFilters({
      institution_id: undefined,
      academic_year_id: undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    });
    // Also clear the actual filters
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

  const hasLocalChanges =
    searchInput !== (filters.first_name || '') ||
    rollNumberInput !== (filters.roll_number || '') ||
    mobileInput !== (filters.mobile_number || '') ||
    localFilters.institution_id !== filters.institution_id ||
    localFilters.academic_year_id !== filters.academic_year_id ||
    localFilters.degree_id !== filters.degree_id ||
    localFilters.department_id !== filters.department_id ||
    localFilters.program_id !== filters.program_id ||
    localFilters.semester_id !== filters.semester_id ||
    localFilters.section_id !== filters.section_id;

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
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className='pl-10'
          />
        </div>

        {/* Roll Number Search */}
        <div className='relative'>
          <Input
            placeholder='Search by roll number...'
            value={rollNumberInput}
            onChange={(e) => setRollNumberInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>

        {/* Mobile Number Search */}
        <div className='relative'>
          <Input
            placeholder='Search by mobile number...'
            value={mobileInput}
            onChange={(e) => setMobileInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
      </div>

      {/* First Filter Row - Institution and Academic Year */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* Institution Filter */}
        <Select
          value={localFilters.institution_id || 'all'}
          onValueChange={(value) =>
            handleLocalFilterChange('institution_id', value === 'all' ? undefined : value)
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
          value={localFilters.academic_year_id || 'all'}
          onValueChange={(value) =>
            handleLocalFilterChange('academic_year_id', value === 'all' ? undefined : value)
          }
          disabled={!localFilters.institution_id || isLoadingAcademicYears}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !localFilters.institution_id
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
          value={localFilters.degree_id || 'all'}
          onValueChange={(value) =>
            handleLocalFilterChange('degree_id', value === 'all' ? undefined : value)
          }
          disabled={!localFilters.institution_id || isLoadingDegrees}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !localFilters.institution_id
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
          value={localFilters.department_id || 'all'}
          onValueChange={(value) =>
            handleLocalFilterChange('department_id', value === 'all' ? undefined : value)
          }
          disabled={!localFilters.degree_id || isLoadingDepartments}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !localFilters.degree_id
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
          value={localFilters.program_id || 'all'}
          onValueChange={(value) =>
            handleLocalFilterChange('program_id', value === 'all' ? undefined : value)
          }
          disabled={!localFilters.department_id || isLoadingPrograms}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !localFilters.department_id
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
          value={localFilters.semester_id || 'all'}
          onValueChange={(value) =>
            handleLocalFilterChange('semester_id', value === 'all' ? undefined : value)
          }
          disabled={!localFilters.program_id || isLoadingSemesters}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !localFilters.program_id
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
          value={localFilters.section_id || 'all'}
          onValueChange={(value) =>
            handleLocalFilterChange('section_id', value === 'all' ? undefined : value)
          }
          disabled={!localFilters.semester_id || isLoadingSections}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !localFilters.semester_id
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

      {/* Search and Clear Buttons */}
      <div className='flex justify-between items-center gap-4'>
        <div className='flex gap-2'>
          <Button
            onClick={handleSearch}
            size='sm'
            className={`h-9 px-6 ${hasLocalChanges ? 'animate-pulse bg-primary' : ''}`}
            disabled={!searchInput && !rollNumberInput && !mobileInput && !Object.values(localFilters).some(Boolean)}
          >
            <Search className='mr-2 h-4 w-4' />
            Search Students {hasLocalChanges && '(Updated)'}
          </Button>

          {hasActiveFilters && (
            <Button
              variant='outline'
              size='sm'
              onClick={handleClearFilters}
              className='h-9'
            >
              <X className='mr-2 h-4 w-4' />
              Clear Filters
            </Button>
          )}
        </div>

        <div className='text-xs text-muted-foreground'>
          {hasLocalChanges
            ? '⚡ You have unsaved changes. Click "Search Students" to apply them.'
            : hasActiveFilters
            ? 'Search applied. Make changes and click "Search Students" to update results.'
            : 'Use the search button to find students. Press Enter in search fields for quick search.'}
        </div>
      </div>
    </div>
  );
}
