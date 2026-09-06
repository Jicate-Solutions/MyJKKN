'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, SlidersHorizontal, ScanLine, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { BarcodeScanDialog } from '@/components/scanner/barcode-scan-dialog';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import type { Department, Semester, Degree, Program, Section } from '@/types/organizations';
import type { AcademicYear } from '@/types/academics';
import {
  ACCOMMODATION_TYPE_OPTIONS,
  type StudentSearchFilters
} from '@/types/billing-schedule';

interface StudentSearchFiltersProps {
  filters: StudentSearchFilters;
  // `scan` is a UI-transport flag (see handleScan below), not a learner
  // attribute, so it rides alongside the domain filters.
  onFilterChange: (
    filters: Partial<StudentSearchFilters> & { scan?: string }
  ) => void;
}

export function StudentSearchFilters({
  filters,
  onFilterChange
}: StudentSearchFiltersProps) {
  // Use the hook that respects user institution access
  const {
    institutions: accessibleInstitutions,
    loading: isLoadingInstitutions
  } = useInstitutionsWithAccess({ isActive: true });

  // Billing schedule is a COLLEGE module, so the institution dropdown lists
  // entity_type='institution' only (no admin_office / company / school).
  // Filtered on the RESULT rather than via the hook's `entityType` option
  // because useInstitutionsWithAccess forces 'all' for super admins and
  // discards an explicit request — a super admin would otherwise still see
  // Main Office, Jicate Solutions and the schools in this list.
  const institutions = useMemo(
    () => accessibleInstitutions.filter((i) => i.entity_type === 'institution'),
    [accessibleInstitutions]
  );

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

  // ONE search box replaces the old name / roll number / mobile trio. The
  // service matches it against first_name, last_name, roll_number,
  // register_number and student_mobile in a single PostgREST or(...), so the
  // clerk never has to decide which box a scanned code belongs in.
  const [queryInput, setQueryInput] = useState(filters.query || '');
  const [scannerOpen, setScannerOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Local filter state for dropdowns - will be applied on search button click
  const [localFilters, setLocalFilters] = useState({
    institution_id: filters.institution_id,
    academic_year_id: filters.academic_year_id,
    degree_id: filters.degree_id,
    department_id: filters.department_id,
    program_id: filters.program_id,
    semester_id: filters.semester_id,
    section_id: filters.section_id,
    accommodation_type: filters.accommodation_type
  });

  const activeDropdownCount = Object.values(localFilters).filter(Boolean)
    .length;

  // Advanced filters start collapsed so the search box and the results are the
  // only thing on screen. They auto-open when a bookmarked URL already carries
  // one, otherwise the applied filter would be invisible.
  const [advancedOpen, setAdvancedOpen] = useState(activeDropdownCount > 0);

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

  // Sync the box with the URL (back/forward, or a scan that navigated).
  useEffect(() => {
    setQueryInput(filters.query || '');
  }, [filters.query]);

  // Search handler. `override` lets the scanner search its decoded value in the
  // same tick — setQueryInput() would not have flushed into `queryInput` yet.
  const handleSearch = (override?: string, fromScan = false) => {
    const term = (override ?? queryInput).trim();
    onFilterChange({
      ...localFilters,
      query: term || undefined,
      // The old three-box URL keys are cleared on every search so a bookmarked
      // ?first_name=… cannot silently AND itself onto the new unified term.
      first_name: undefined,
      roll_number: undefined,
      register_number: undefined,
      mobile_number: undefined,
      // Only a scan sets this, and it must be cleared on every keyboard search
      // — otherwise a stale ?scan=1 would keep auto-opening the bill popup.
      scan: fromScan ? '1' : undefined,
      page: 1
    });
  };

  // A camera scan is a complete billing intent, not just a search: fill the
  // box, close the scanner, run the query, and flag it so the results table
  // opens the bill popup for the single matching learner. Scan → type amount
  // → save, with nothing clicked in between.
  const handleScan = (value: string) => {
    setScannerOpen(false);
    setQueryInput(value);
    handleSearch(value, true);
    // Return focus so the next hardware-gun scan (which types + Enter) lands
    // in the box without the clerk touching the mouse.
    requestAnimationFrame(() => searchInputRef.current?.focus());
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
    setQueryInput('');
    setLocalFilters({
      institution_id: undefined,
      academic_year_id: undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      accommodation_type: undefined
    });
    // Also clear the actual filters
    onFilterChange({
      query: undefined,
      scan: undefined,
      first_name: undefined,
      roll_number: undefined,
      register_number: undefined,
      mobile_number: undefined,
      institution_id: undefined,
      academic_year_id: undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      accommodation_type: undefined
    });
    searchInputRef.current?.focus();
  };

  const hasActiveFilters =
    filters.query ||
    filters.first_name ||
    filters.roll_number ||
    filters.register_number ||
    filters.mobile_number ||
    filters.institution_id ||
    filters.academic_year_id ||
    filters.degree_id ||
    filters.department_id ||
    filters.program_id ||
    filters.semester_id ||
    filters.section_id ||
    filters.accommodation_type;

  const hasLocalChanges =
    queryInput.trim() !== (filters.query || '') ||
    localFilters.institution_id !== filters.institution_id ||
    localFilters.academic_year_id !== filters.academic_year_id ||
    localFilters.degree_id !== filters.degree_id ||
    localFilters.department_id !== filters.department_id ||
    localFilters.program_id !== filters.program_id ||
    localFilters.semester_id !== filters.semester_id ||
    localFilters.section_id !== filters.section_id ||
    localFilters.accommodation_type !== filters.accommodation_type;

  return (
    <div className='space-y-3'>
      {/* Primary search row — the only thing on screen for the common flow */}
      <div className='flex flex-col gap-2 sm:flex-row'>
        <div className='relative flex-1'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            ref={searchInputRef}
            autoFocus
            inputMode='search'
            placeholder='Scan or type — name, roll no, register no, or mobile'
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            className='h-11 pl-10 pr-24 text-base'
          />
          <div className='absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1'>
            {queryInput && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-8 w-8'
                onClick={() => {
                  setQueryInput('');
                  searchInputRef.current?.focus();
                }}
                aria-label='Clear search text'
              >
                <X className='h-4 w-4' />
              </Button>
            )}
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={() => setScannerOpen(true)}
              aria-label='Scan barcode with camera'
              title='Scan barcode / QR with camera'
            >
              <ScanLine className='h-4 w-4' />
            </Button>
          </div>
        </div>

        <div className='flex gap-2'>
          <Button onClick={() => handleSearch()} className='h-11 px-6'>
            <Search className='mr-2 h-4 w-4' />
            Search
          </Button>

          {/* Plain toggle rather than a CollapsibleTrigger: the trigger sits in
              this flex row while the panel it controls renders below the row,
              and a Radix Collapsible root cannot span both without wrapping
              the layout. */}
          <Button
            variant='outline'
            className='h-11'
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            <SlidersHorizontal className='mr-2 h-4 w-4' />
            Filters
            {activeDropdownCount > 0 && (
              <Badge
                variant='secondary'
                className='ml-2 h-5 min-w-5 px-1.5 text-xs'
              >
                {activeDropdownCount}
              </Badge>
            )}
            <ChevronDown
              className={`ml-2 h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
            />
          </Button>

          {hasActiveFilters && (
            <Button
              variant='ghost'
              onClick={handleClearFilters}
              className='h-11'
            >
              <X className='mr-2 h-4 w-4' />
              Clear
            </Button>
          )}
        </div>
      </div>

      <p className='text-xs text-muted-foreground'>
        Press <kbd className='rounded border px-1'>Enter</kbd> to search. A
        USB/Bluetooth barcode gun types straight into the box — no camera
        needed.
        {hasLocalChanges && hasActiveFilters
          ? ' Unapplied changes — press Search.'
          : ''}
      </p>

      {/* Advanced filters — collapsed by default so they stop eating the fold */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleContent className='space-y-3 rounded-lg border bg-muted/30 p-3'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            {/* Institution Filter */}
            <Select
              value={localFilters.institution_id || 'all'}
              onValueChange={(value) =>
                handleLocalFilterChange('institution_id', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className='h-9'>
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
              <SelectTrigger className='h-9'>
                <SelectValue
                  placeholder={
                    !localFilters.institution_id
                      ? 'Academic year'
                      : isLoadingAcademicYears
                      ? 'Loading...'
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

            {/* Degree Filter */}
            <Select
              value={localFilters.degree_id || 'all'}
              onValueChange={(value) =>
                handleLocalFilterChange('degree_id', value === 'all' ? undefined : value)
              }
              disabled={!localFilters.institution_id || isLoadingDegrees}
            >
              <SelectTrigger className='h-9'>
                <SelectValue
                  placeholder={
                    !localFilters.institution_id
                      ? 'Degree'
                      : isLoadingDegrees
                      ? 'Loading...'
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
              <SelectTrigger className='h-9'>
                <SelectValue
                  placeholder={
                    !localFilters.degree_id
                      ? 'Department'
                      : isLoadingDepartments
                      ? 'Loading...'
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
              <SelectTrigger className='h-9'>
                <SelectValue
                  placeholder={
                    !localFilters.department_id
                      ? 'Program'
                      : isLoadingPrograms
                      ? 'Loading...'
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

            {/* Semester Filter */}
            <Select
              value={localFilters.semester_id || 'all'}
              onValueChange={(value) =>
                handleLocalFilterChange('semester_id', value === 'all' ? undefined : value)
              }
              disabled={!localFilters.program_id || isLoadingSemesters}
            >
              <SelectTrigger className='h-9'>
                <SelectValue
                  placeholder={
                    !localFilters.program_id
                      ? 'Semester'
                      : isLoadingSemesters
                      ? 'Loading...'
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
              <SelectTrigger className='h-9'>
                <SelectValue
                  placeholder={
                    !localFilters.semester_id
                      ? 'Section'
                      : isLoadingSections
                      ? 'Loading...'
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

            {/* Accommodation Type Filter (independent of academic hierarchy) */}
            <Select
              value={localFilters.accommodation_type || 'all'}
              onValueChange={(value) =>
                handleLocalFilterChange(
                  'accommodation_type',
                  value === 'all' ? undefined : value
                )
              }
            >
              <SelectTrigger className='h-9'>
                <SelectValue placeholder='All accommodation types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All accommodation types</SelectItem>
                {ACCOMMODATION_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex justify-end'>
            <Button size='sm' onClick={() => handleSearch()}>
              Apply filters
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <BarcodeScanDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleScan}
        title='Scan student ID'
        description='Point the camera at the barcode or QR code on the ID card. The search runs automatically.'
      />
    </div>
  );
}
