'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RotateCcw, CalendarCheck } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { StaffPlanningSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';
import type { AcademicYear } from '@/types/academics';

interface StaffPlanFiltersProps {
  searchParams: StaffPlanningSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function StaffPlanFilters({
  searchParams,
  onFilterChange,
  onClearFilters
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
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [courses, setCourses] = useState<
    Array<{ id: string; course_code: string; course_name: string }>
  >([]);
  const [currentAcademicYear, setCurrentAcademicYear] = useState<AcademicYear | null>(null);
  const [loading, setLoading] = useState(false);
  const { isSuperAdmin, userProfile } = usePermissions();

  // Memoize onFilterChange to prevent stale closures in effects
  const stableOnFilterChange = useCallback(onFilterChange, [onFilterChange]);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function loadInstitutions() {
      try {
        setLoading(true);
        const data = await OrganizationService.getInstitutionNames(true);
        if (isMounted) {
          setInstitutions(data);
        }
      } catch (error) {
        if (isMounted && !abortController.signal.aborted) {
          logger.error('academic/staff-planning', 'Error loading institutions', error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadInstitutions();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  // Auto-set institution filter for non-super admin users
  useEffect(() => {
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !searchParams.institution_id &&
      !loading
    ) {
      stableOnFilterChange('institution_id', userProfile.institution_id);
    }
  }, [
    userProfile,
    isSuperAdmin,
    searchParams.institution_id,
    stableOnFilterChange,
    loading
  ]);

  // Fetch academic years and determine current year when institution is selected
  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function loadAcademicYears() {
      if (searchParams.institution_id) {
        try {
          const allYears = await AcademicYearService.getAcademicYearsByInstitution(
            searchParams.institution_id
          );

          if (!isMounted || abortController.signal.aborted) return;

          setAcademicYears(allYears);

          // Find current academic year based on today's date
          const today = new Date();
          const current = allYears.find((year) => {
            const startDate = new Date(year.start_date);
            const endDate = new Date(year.end_date);
            return today >= startDate && today <= endDate && year.is_active;
          });

          setCurrentAcademicYear(current || null);

          // Auto-set current academic year filter if not already set
          if (current && !searchParams.academic_year_id && userProfile?.institution_id) {
            stableOnFilterChange('academic_year_id', current.id);
          }
        } catch (error) {
          if (isMounted && !abortController.signal.aborted) {
            logger.error('academic/staff-planning', 'Error loading academic years', error);
          }
        }
      } else {
        if (isMounted) {
          setAcademicYears([]);
          setCurrentAcademicYear(null);
        }
      }
    }
    loadAcademicYears();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [searchParams.institution_id, userProfile, searchParams.academic_year_id, stableOnFilterChange]);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function loadDegrees() {
      if (searchParams.institution_id) {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            searchParams.institution_id
          );
          if (isMounted && !abortController.signal.aborted) {
            setDegrees(data);
          }
        } catch (error) {
          if (isMounted && !abortController.signal.aborted) {
            logger.error('academic/staff-planning', 'Error loading degrees', error);
          }
        }
      } else {
        if (isMounted) {
          setDegrees([]);
        }
      }
    }
    loadDegrees();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [searchParams.institution_id]);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function loadDepartments() {
      if (searchParams.degree_id) {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            searchParams.degree_id
          );
          if (isMounted && !abortController.signal.aborted) {
            setDepartments(data);
          }
        } catch (error) {
          if (isMounted && !abortController.signal.aborted) {
            logger.error('academic/staff-planning', 'Error loading departments', error);
          }
        }
      } else {
        if (isMounted) {
          setDepartments([]);
        }
      }
    }
    loadDepartments();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [searchParams.degree_id]);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function loadPrograms() {
      if (searchParams.department_id) {
        try {
          const data = await ProgramService.getProgramsByDepartment(
            searchParams.department_id
          );
          if (isMounted && !abortController.signal.aborted) {
            setPrograms(data);
          }
        } catch (error) {
          if (isMounted && !abortController.signal.aborted) {
            logger.error('academic/staff-planning', 'Error loading programs', error);
          }
        }
      } else {
        if (isMounted) {
          setPrograms([]);
        }
      }
    }
    loadPrograms();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [searchParams.department_id]);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function loadSemesters() {
      if (searchParams.program_id) {
        try {
          const data = await SemesterService.getSemestersByProgram(
            searchParams.program_id
          );
          if (isMounted && !abortController.signal.aborted) {
            setSemesters(data);
          }
        } catch (error) {
          if (isMounted && !abortController.signal.aborted) {
            logger.error('academic/staff-planning', 'Error loading semesters', error);
          }
        }
      } else {
        if (isMounted) {
          setSemesters([]);
        }
      }
    }
    loadSemesters();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [searchParams.program_id]);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function loadCourses() {
      if (searchParams.institution_id) {
        try {
          const data = await StaffPlanService.getCoursesByInstitution(
            searchParams.institution_id
          );
          if (isMounted && !abortController.signal.aborted) {
            setCourses(data);
          }
        } catch (error) {
          if (isMounted && !abortController.signal.aborted) {
            logger.error('academic/staff-planning', 'Error loading courses', error);
          }
        }
      } else {
        if (isMounted) {
          setCourses([]);
        }
      }
    }
    loadCourses();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [searchParams.institution_id]);

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.degree_id ||
    searchParams.department_id ||
    searchParams.program_id ||
    searchParams.semester_id ||
    searchParams.academic_year_id ||
    searchParams.course_id ||
    searchParams.isActive
  );

  // Determine if we're showing all years or a specific year
  const showingAllYears = !searchParams.academic_year_id;
  const selectedYear = academicYears.find((year) => year.id === searchParams.academic_year_id);

  return (
    <div className='space-y-4'>
      {/* Academic Year Quick Switcher - Prominent Section */}
      {searchParams.institution_id && academicYears.length > 0 && (
        <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-center gap-2'>
              <CalendarCheck className='h-5 w-5 text-blue-600' />
              <Label className='text-sm font-medium text-blue-900'>Academic Year Filter:</Label>
              {currentAcademicYear && searchParams.academic_year_id === currentAcademicYear.id && (
                <Badge variant='default' className='bg-green-600'>
                  Current Year
                </Badge>
              )}
              {showingAllYears && (
                <Badge variant='secondary'>All Years</Badge>
              )}
              {selectedYear && searchParams.academic_year_id !== currentAcademicYear?.id && (
                <Badge variant='outline'>{selectedYear.academic_year_name}</Badge>
              )}
            </div>

            <div className='flex items-center gap-2'>
              <Select
                value={searchParams.academic_year_id || 'all'}
                onValueChange={(value) => {
                  onFilterChange('academic_year_id', value === 'all' ? undefined : value);
                }}
              >
                <SelectTrigger className='w-full bg-white sm:w-[220px]'>
                  <SelectValue placeholder='Select academic year' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Academic Years</SelectItem>
                  {academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      <div className='flex items-center gap-2'>
                        {year.academic_year_name}
                        {currentAcademicYear?.id === year.id && (
                          <span className='text-xs text-green-600'>(Current)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!showingAllYears && (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => onFilterChange('academic_year_id', undefined)}
                  className='text-blue-600 hover:text-blue-700'
                >
                  Show All Years
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

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
                  onFilterChange('semester_id', undefined);
                  onFilterChange('academic_year_id', undefined);
                  onFilterChange('course_id', undefined);
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
                onFilterChange('semester_id', undefined);
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
                onFilterChange('semester_id', undefined);
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
                onFilterChange('semester_id', undefined);
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
          <Button variant='ghost' onClick={onClearFilters} className='h-8 px-2 lg:px-3'>
            Reset
            <RotateCcw className='ml-2 h-4 w-4' />
          </Button>
        )}
      </div>

      <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
        <Select
          value={searchParams.semester_id || 'all'}
          onValueChange={(value) => {
            onFilterChange('semester_id', value === 'all' ? undefined : value);
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
          value={searchParams.course_id || 'all'}
          onValueChange={(value) => {
            onFilterChange('course_id', value === 'all' ? undefined : value);
          }}
          disabled={!searchParams.institution_id}
        >
          <SelectTrigger className='w-full sm:w-[200px]'>
            <SelectValue placeholder='Select course' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Courses</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.course_code} - {course.course_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.isActive || 'all'}
          onValueChange={(value) => {
            onFilterChange('isActive', value === 'all' ? undefined : value);
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
      </div>
    </div>
  );
}
