'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { GraduatedSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';

interface GraduatedFiltersProps {
  searchParams: GraduatedSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

const STATUS_OPTIONS = [
  { value: 'graduated,exited', label: 'All (Graduated & Exited)' },
  { value: 'graduated', label: 'Graduated Only' },
  { value: 'exited', label: 'Exited Only' }
];

export function GraduatedFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: GraduatedFiltersProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  // Local state for managing filter values
  const [localFilters, setLocalFilters] = useState<{
    institution_id?: string;
    degree_id?: string;
    department_id?: string;
    program_id?: string;
    semester_id?: string;
    section_id?: string;
    academic_year_id?: string;
    status?: string;
  }>({
    institution_id: searchParams.institution_id || undefined,
    degree_id: searchParams.degree_id || undefined,
    department_id: searchParams.department_id || undefined,
    program_id: searchParams.program_id || undefined,
    semester_id: searchParams.semester_id || undefined,
    section_id: searchParams.section_id || undefined,
    academic_year_id: searchParams.academic_year_id || undefined,
    status: searchParams.status || 'graduated,exited'
  });

  // State for dropdown options
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [degrees, setDegrees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);

  // Loading states
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);

  // Handle search button click
  const handleSearch = async () => {
    setIsSearching(true);

    try {
      // Build new params from localFilters
      const params = new URLSearchParams();

      // Add all local filters to params
      Object.entries(localFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, value.toString());
        }
      });

      // Preserve page size if it exists
      const currentPageSize = currentSearchParams.get('pageSize');
      if (currentPageSize) {
        params.set('pageSize', currentPageSize);
      }

      // Reset to page 1
      params.set('page', '1');

      // Navigate with new params
      router.push(`/students/graduated?${params.toString()}`);
    } finally {
      setTimeout(() => setIsSearching(false), 1000);
    }
  };

  // Handle clear filters
  const handleClear = () => {
    setLocalFilters({
      institution_id: undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      academic_year_id: undefined,
      status: 'graduated,exited'
    });

    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('status', 'graduated,exited');

    const currentPageSize = currentSearchParams.get('pageSize');
    if (currentPageSize) {
      params.set('pageSize', currentPageSize);
    }

    router.push(`/students/graduated?${params.toString()}`);
    setIsSearching(false);
  };

  // Sync localFilters with searchParams when URL changes
  useEffect(() => {
    setLocalFilters({
      institution_id: searchParams.institution_id || undefined,
      degree_id: searchParams.degree_id || undefined,
      department_id: searchParams.department_id || undefined,
      program_id: searchParams.program_id || undefined,
      semester_id: searchParams.semester_id || undefined,
      section_id: searchParams.section_id || undefined,
      academic_year_id: searchParams.academic_year_id || undefined,
      status: searchParams.status || 'graduated,exited'
    });
  }, [searchParams]);

  // Fetch institutions on component mount
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const response = await OrganizationService.getInstitutions({
          page: 1,
          limit: 1000,
          isActive: true
        });
        setInstitutions(response.data || []);
      } catch (error) {
        console.error('Error fetching institutions:', error);
        setInstitutions([]);
      }
    };

    fetchInstitutions();
  }, []);

  // Fetch degrees when institution changes
  useEffect(() => {
    const fetchDegrees = async () => {
      if (!localFilters.institution_id) {
        setDegrees([]);
        return;
      }

      try {
        setLoadingDegrees(true);
        const response = await DegreeService.getDegrees({
          institution_id: localFilters.institution_id,
          page: 1,
          limit: 1000,
          isActive: true
        });
        setDegrees(response.data || []);
      } catch (error) {
        console.error('Error fetching degrees:', error);
        setDegrees([]);
      } finally {
        setLoadingDegrees(false);
      }
    };

    fetchDegrees();
  }, [localFilters.institution_id]);

  // Fetch departments when degree changes
  useEffect(() => {
    const fetchDepartments = async () => {
      if (!localFilters.degree_id || !localFilters.institution_id) {
        setDepartments([]);
        return;
      }

      try {
        setLoadingDepartments(true);
        const response = await DepartmentService.getDepartments({
          institution_id: localFilters.institution_id,
          page: 1,
          limit: 1000,
          isActive: true
        });
        setDepartments(response.data || []);
      } catch (error) {
        console.error('Error fetching departments:', error);
        setDepartments([]);
      } finally {
        setLoadingDepartments(false);
      }
    };

    fetchDepartments();
  }, [localFilters.degree_id, localFilters.institution_id]);

  // Fetch programs when degree AND department are selected
  useEffect(() => {
    const fetchPrograms = async () => {
      if (!localFilters.degree_id || !localFilters.department_id) {
        setPrograms([]);
        return;
      }

      try {
        setLoadingPrograms(true);
        const response = await ProgramService.getPrograms({
          degree_id: localFilters.degree_id,
          department_id: localFilters.department_id,
          page: 1,
          limit: 1000,
          isActive: true
        });
        setPrograms(response.data || []);
      } catch (error) {
        console.error('Error fetching programs:', error);
        setPrograms([]);
      } finally {
        setLoadingPrograms(false);
      }
    };

    fetchPrograms();
  }, [localFilters.degree_id, localFilters.department_id]);

  // Fetch semesters when program changes
  useEffect(() => {
    const fetchSemesters = async () => {
      if (!localFilters.program_id) {
        setSemesters([]);
        return;
      }

      try {
        setLoadingSemesters(true);
        const semesterData = await SemesterService.getSemestersByProgram(
          localFilters.program_id
        );
        setSemesters(semesterData || []);
      } catch (error) {
        console.error('Error fetching semesters:', error);
        setSemesters([]);
      } finally {
        setLoadingSemesters(false);
      }
    };

    fetchSemesters();
  }, [localFilters.program_id]);

  // Fetch sections when semester changes
  useEffect(() => {
    const fetchSections = async () => {
      if (!localFilters.semester_id) {
        setSections([]);
        return;
      }

      try {
        setLoadingSections(true);
        const response = await SectionService.getSections({
          semester_id: localFilters.semester_id,
          page: 1,
          limit: 1000,
          isActive: true
        });
        setSections(response.data || []);
      } catch (error) {
        console.error('Error fetching sections:', error);
        setSections([]);
      } finally {
        setLoadingSections(false);
      }
    };

    fetchSections();
  }, [localFilters.semester_id]);

  // Fetch academic years when institution changes
  useEffect(() => {
    const fetchAcademicYears = async () => {
      if (!localFilters.institution_id) {
        setAcademicYears([]);
        return;
      }

      try {
        setLoadingAcademicYears(true);
        const response = await AcademicYearService.getAcademicYearsByInstitution(
          localFilters.institution_id
        );
        setAcademicYears(response || []);
      } catch (error) {
        console.error('Error fetching academic years:', error);
        setAcademicYears([]);
      } finally {
        setLoadingAcademicYears(false);
      }
    };

    fetchAcademicYears();
  }, [localFilters.institution_id]);

  // Auto-select institution for non-super-admin users
  useEffect(() => {
    if (profile?.institution_id && !isSuperAdmin) {
      if (!localFilters.institution_id) {
        setLocalFilters((prev) => ({
          ...prev,
          institution_id: profile.institution_id ?? undefined
        }));
      }
    }
  }, [profile?.institution_id, localFilters.institution_id, isSuperAdmin]);

  // Auto-select department for HOD users
  useEffect(() => {
    if (profile?.role === 'hod' && profile?.department_id && !isSuperAdmin) {
      if (!localFilters.department_id) {
        setLocalFilters((prev) => ({
          ...prev,
          department_id: profile.department_id ?? undefined
        }));
      }
    }
  }, [
    profile?.role,
    profile?.department_id,
    localFilters.department_id,
    isSuperAdmin
  ]);

  // Hierarchical filter change handlers that reset child filters
  const handleInstitutionChange = (value: string) => {
    const institutionId = value === 'all' ? undefined : value;

    setLocalFilters((prev) => ({
      ...prev,
      institution_id: institutionId,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      academic_year_id: undefined
    }));
  };

  const handleDegreeChange = (value: string) => {
    const degreeId = value === 'all' ? undefined : value;

    setLocalFilters((prev) => ({
      ...prev,
      degree_id: degreeId,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    }));
  };

  const handleDepartmentChange = (value: string) => {
    const departmentId = value === 'all' ? undefined : value;

    setLocalFilters((prev) => ({
      ...prev,
      department_id: departmentId,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    }));
  };

  const handleProgramChange = (value: string) => {
    const programId = value === 'all' ? undefined : value;

    setLocalFilters((prev) => ({
      ...prev,
      program_id: programId,
      semester_id: undefined,
      section_id: undefined
    }));
  };

  const handleSemesterChange = (value: string) => {
    const semesterId = value === 'all' ? undefined : value;

    setLocalFilters((prev) => ({
      ...prev,
      semester_id: semesterId,
      section_id: undefined
    }));
  };

  const handleSectionChange = (value: string) => {
    const sectionId = value === 'all' ? undefined : value;
    setLocalFilters((prev) => ({ ...prev, section_id: sectionId }));
  };

  const handleAcademicYearChange = (value: string) => {
    const academicYearId = value === 'all' ? undefined : value;
    setLocalFilters((prev) => ({ ...prev, academic_year_id: academicYearId }));
  };

  return (
    <div className='space-y-4'>
      {/* Main Filters Row */}
      <div className='flex flex-wrap gap-3 items-end'>
        {/* Status Filter */}
        <div className='w-full sm:w-auto min-w-[200px]'>
          <label className='text-sm font-medium mb-1 block'>Status</label>
          <Select
            value={localFilters.status || 'graduated,exited'}
            onValueChange={(value) =>
              setLocalFilters((prev) => ({ ...prev, status: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Select Status' />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Institution Filter */}
        <div className='w-full sm:w-auto min-w-[200px]'>
          <label className='text-sm font-medium mb-1 block'>Institution</label>
          <Select
            value={localFilters.institution_id || 'all'}
            onValueChange={handleInstitutionChange}
            disabled={!isSuperAdmin && !!profile?.institution_id}
          >
            <SelectTrigger>
              <SelectValue placeholder='All Institutions' />
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
        </div>

        {/* Search and Clear Buttons */}
        <div className='flex gap-2'>
          <Button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? (
              <>
                <div className='h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-2' />
                Searching...
              </>
            ) : (
              <>
                <Search className='h-4 w-4 mr-2' />
                Search
              </>
            )}
          </Button>
          <Button variant='outline' onClick={handleClear}>
            <RotateCcw className='h-4 w-4 mr-2' />
            Clear
          </Button>
        </div>
      </div>

      {/* Advanced Filters (Collapsible) */}
      <Collapsible open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
        <CollapsibleTrigger asChild>
          <Button variant='ghost' size='sm' className='gap-1'>
            Advanced Filters
            {showAdvancedFilters ? (
              <ChevronUp className='h-4 w-4' />
            ) : (
              <ChevronDown className='h-4 w-4' />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-4'>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
            {/* Degree Filter */}
            <div>
              <label className='text-sm font-medium mb-1 block'>Degree</label>
              <Select
                value={localFilters.degree_id || 'all'}
                onValueChange={handleDegreeChange}
                disabled={!localFilters.institution_id || loadingDegrees}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingDegrees ? 'Loading...' : 'All Degrees'}
                  />
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
            </div>

            {/* Department Filter */}
            <div>
              <label className='text-sm font-medium mb-1 block'>Department</label>
              <Select
                value={localFilters.department_id || 'all'}
                onValueChange={handleDepartmentChange}
                disabled={
                  !localFilters.degree_id ||
                  loadingDepartments ||
                  (profile?.role === 'hod' && !isSuperAdmin)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingDepartments
                        ? 'Loading...'
                        : profile?.role === 'hod' && !isSuperAdmin
                        ? 'Auto-selected'
                        : 'All Departments'
                    }
                  />
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
            </div>

            {/* Program Filter */}
            <div>
              <label className='text-sm font-medium mb-1 block'>Program</label>
              <Select
                value={localFilters.program_id || 'all'}
                onValueChange={handleProgramChange}
                disabled={
                  !localFilters.degree_id ||
                  !localFilters.department_id ||
                  loadingPrograms
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingPrograms ? 'Loading...' : 'All Programs'}
                  />
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
            </div>

            {/* Semester Filter */}
            <div>
              <label className='text-sm font-medium mb-1 block'>Last Semester</label>
              <Select
                value={localFilters.semester_id || 'all'}
                onValueChange={handleSemesterChange}
                disabled={!localFilters.program_id || loadingSemesters}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingSemesters ? 'Loading...' : 'All Semesters'}
                  />
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

            {/* Section Filter */}
            <div>
              <label className='text-sm font-medium mb-1 block'>Last Section</label>
              <Select
                value={localFilters.section_id || 'all'}
                onValueChange={handleSectionChange}
                disabled={!localFilters.semester_id || loadingSections}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingSections ? 'Loading...' : 'All Sections'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Sections</SelectItem>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.section_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Academic Year Filter */}
            <div>
              <label className='text-sm font-medium mb-1 block'>Academic Year</label>
              <Select
                value={localFilters.academic_year_id || 'all'}
                onValueChange={handleAcademicYearChange}
                disabled={!localFilters.institution_id || loadingAcademicYears}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingAcademicYears ? 'Loading...' : 'All Academic Years'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Academic Years</SelectItem>
                  {academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.academic_year_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
