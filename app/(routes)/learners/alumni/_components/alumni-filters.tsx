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
import { AlumniSearchParams } from './data-table-schema';
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

interface AlumniFiltersProps {
  searchParams: AlumniSearchParams;
  statusFilter?: 'graduated' | 'alumni';
}

export function AlumniFilters({ searchParams, statusFilter }: AlumniFiltersProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { isSuperAdmin } = usePermissions();
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
    gender?: string;
    is_profile_complete?: string;
  }>({
    institution_id: searchParams.institution_id || undefined,
    degree_id: searchParams.degree_id || undefined,
    department_id: searchParams.department_id || undefined,
    program_id: searchParams.program_id || undefined,
    semester_id: searchParams.semester_id || undefined,
    section_id: searchParams.section_id || undefined,
    academic_year_id: searchParams.academic_year_id || undefined,
    gender: searchParams.gender || undefined,
    is_profile_complete: searchParams.is_profile_complete || undefined
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

      // Preserve current tab/status filter
      const currentTab = currentSearchParams.get('lifecycle_status') || statusFilter;
      if (currentTab) {
        params.set('lifecycle_status', currentTab);
      }

      // Reset to page 1
      params.set('page', '1');

      // Navigate with new params
      router.push(`/learners/alumni?${params.toString()}`);
    } finally {
      // Reset searching state after a delay
      setTimeout(() => setIsSearching(false), 1000);
    }
  };

  // Handle clear filters
  const handleClear = () => {
    // Clear all local state filters
    setLocalFilters({
      institution_id: undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      academic_year_id: undefined,
      gender: undefined,
      is_profile_complete: undefined
    });

    // Navigate to clean URL preserving tab
    const params = new URLSearchParams();
    params.set('page', '1');

    // Preserve current tab/status filter
    const currentTab = currentSearchParams.get('lifecycle_status') || statusFilter;
    if (currentTab) {
      params.set('lifecycle_status', currentTab);
    }

    // Preserve page size if it exists
    const currentPageSize = currentSearchParams.get('pageSize');
    if (currentPageSize) {
      params.set('pageSize', currentPageSize);
    }

    router.push(`/learners/alumni?${params.toString()}`);
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
      gender: searchParams.gender || undefined,
      is_profile_complete: searchParams.is_profile_complete || undefined
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
        console.error('[learners/alumni] Error fetching institutions:', error);
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
        console.error('[learners/alumni] Error fetching degrees:', error);
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
          degree_id: localFilters.degree_id,
          page: 1,
          limit: 1000,
          isActive: true
        });
        setDepartments(response.data || []);
      } catch (error) {
        console.error('[learners/alumni] Error fetching departments:', error);
        setDepartments([]);
      } finally {
        setLoadingDepartments(false);
      }
    };

    fetchDepartments();
  }, [localFilters.degree_id, localFilters.institution_id]);

  // Fetch programs when degree or department changes
  useEffect(() => {
    const fetchPrograms = async () => {
      if (!localFilters.degree_id || !localFilters.department_id) {
        setPrograms([]);
        return;
      }

      try {
        setLoadingPrograms(true);
        const filters: any = {
          page: 1,
          limit: 1000
        };

        if (localFilters.degree_id) {
          filters.degree_id = localFilters.degree_id;
        }
        if (localFilters.department_id) {
          filters.department_id = localFilters.department_id;
        }

        const response = await ProgramService.getPrograms({
          ...filters,
          isActive: true
        });
        setPrograms(response.data || []);
      } catch (error) {
        console.error('[learners/alumni] Error fetching programs:', error);
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
        console.error('[learners/alumni] Error fetching semesters:', error);
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
        console.error('[learners/alumni] Error fetching sections:', error);
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
        const response =
          await AcademicYearService.getAcademicYearsByInstitution(
            localFilters.institution_id
          );
        setAcademicYears(response || []);
      } catch (error) {
        console.error('[learners/alumni] Error fetching academic years:', error);
        setAcademicYears([]);
      } finally {
        setLoadingAcademicYears(false);
      }
    };

    fetchAcademicYears();
  }, [localFilters.institution_id]);

  // Auto-select institution for HOD/Faculty users
  useEffect(() => {
    if (profile?.institution_id && !isSuperAdmin) {
      if (!localFilters.institution_id) {
        setLocalFilters((prev) => ({
          ...prev,
          institution_id: profile.institution_id || undefined
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
          department_id: profile.department_id || undefined
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
      {/* Advanced Filters Toggle */}
      <div className='flex flex-col sm:flex-row gap-4 justify-between items-start'>
        <Collapsible
          open={showAdvancedFilters}
          onOpenChange={setShowAdvancedFilters}
          className='flex-1 w-full'
        >
          <CollapsibleTrigger asChild>
            <Button variant='outline' className='w-full justify-between'>
              Advanced Filters
              {showAdvancedFilters ? (
                <ChevronUp className='h-4 w-4' />
              ) : (
                <ChevronDown className='h-4 w-4' />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className='space-y-4 pt-4'>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
              {/* Institution Filter */}
              <Select
                value={localFilters.institution_id || ''}
                onValueChange={handleInstitutionChange}
                disabled={!isSuperAdmin}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !isSuperAdmin && profile?.institution_id
                        ? 'Your institution is auto-selected'
                        : 'Select Institution'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Institutions</SelectItem>
                  {institutions.map((institution) => (
                    <SelectItem key={institution.id} value={institution.id}>
                      {institution.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Degree Filter */}
              <Select
                value={localFilters.degree_id || ''}
                onValueChange={handleDegreeChange}
                disabled={!localFilters.institution_id || loadingDegrees}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingDegrees ? 'Loading...' : 'Select Degree'
                    }
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

              {/* Department Filter */}
              <Select
                value={localFilters.department_id || ''}
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
                        ? 'Your department is auto-selected'
                        : 'Select Department'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Departments</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Program Filter */}
              <Select
                value={localFilters.program_id || ''}
                onValueChange={handleProgramChange}
                disabled={
                  !localFilters.degree_id ||
                  !localFilters.department_id ||
                  loadingPrograms
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingPrograms ? 'Loading...' : 'Select Program'
                    }
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

              {/* Semester Filter */}
              <Select
                value={localFilters.semester_id || ''}
                onValueChange={handleSemesterChange}
                disabled={!localFilters.program_id || loadingSemesters}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingSemesters ? 'Loading...' : 'Select Semester'
                    }
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

              {/* Section Filter */}
              <Select
                value={localFilters.section_id || ''}
                onValueChange={handleSectionChange}
                disabled={!localFilters.semester_id || loadingSections}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingSections ? 'Loading...' : 'Select Section'
                    }
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

              {/* Academic Year Filter */}
              <Select
                value={localFilters.academic_year_id || ''}
                onValueChange={handleAcademicYearChange}
                disabled={!localFilters.institution_id || loadingAcademicYears}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingAcademicYears
                        ? 'Loading...'
                        : 'Select Academic Year'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Academic Years</SelectItem>
                  {academicYears.map((academicYear) => (
                    <SelectItem key={academicYear.id} value={academicYear.id}>
                      {academicYear.academic_year_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Gender Filter */}
              <Select
                value={localFilters.gender || ''}
                onValueChange={(value) =>
                  setLocalFilters((prev) => ({
                    ...prev,
                    gender: value === 'all' ? undefined : value
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select Gender' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Genders</SelectItem>
                  <SelectItem value='Male'>Male</SelectItem>
                  <SelectItem value='Female'>Female</SelectItem>
                  <SelectItem value='Other'>Other</SelectItem>
                </SelectContent>
              </Select>

              {/* Profile Status Filter */}
              <Select
                value={localFilters.is_profile_complete || ''}
                onValueChange={(value) =>
                  setLocalFilters((prev) => ({
                    ...prev,
                    is_profile_complete: value === 'all' ? undefined : value
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Profile Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Profiles</SelectItem>
                  <SelectItem value='true'>Complete</SelectItem>
                  <SelectItem value='false'>Incomplete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search and Clear Filters Buttons */}
            <div className='flex justify-between pt-2'>
              <Button variant='outline' onClick={handleClear}>
                <RotateCcw className='mr-2 h-4 w-4' />
                Clear All Filters
              </Button>
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                className='ml-auto'
              >
                {isSearching ? (
                  <>
                    <div className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className='mr-2 h-4 w-4' />
                    Search Alumni
                  </>
                )}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
