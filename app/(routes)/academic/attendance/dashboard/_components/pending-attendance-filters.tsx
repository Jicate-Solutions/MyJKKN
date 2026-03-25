'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  X,
  Calendar,
  Building2,
  GraduationCap,
  Building,
  BookOpen,
  CalendarDays,
  Users,
  User
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { DashboardFilters } from '@/types/attendance-dashboard';

interface PendingAttendanceFiltersProps {
  filters: Partial<DashboardFilters>;
  onFiltersChange: (filters: Partial<DashboardFilters>) => void;
  onReset: () => void;
  canViewAllInstitutions?: boolean;
  userInstitutionId?: string;
  dashboardInstitutionId?: string; // From top-level dashboard filter
  dashboardAcademicYearId?: string; // From top-level dashboard filter
}

export function PendingAttendanceFilters({
  filters,
  onFiltersChange,
  onReset,
  canViewAllInstitutions = false,
  userInstitutionId,
  dashboardInstitutionId,
  dashboardAcademicYearId
}: PendingAttendanceFiltersProps) {
  const supabase = createClientSupabaseClient();
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Dropdown data states
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [degrees, setDegrees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  // Loading states
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Calculate active filters count (exclude dashboard-controlled filters)
  const activeFiltersCount = Object.entries(filters).filter(([key, value]) => {
    if (
      key === 'page' ||
      key === 'limit' ||
      key === 'sortBy' ||
      key === 'sortDirection' ||
      (key === 'institutionId' && dashboardInstitutionId) ||
      (key === 'academicYearId' && dashboardAcademicYearId)
    )
      return false;
    return Boolean(value);
  }).length;

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onFiltersChange({ ...filters, search: value || undefined });
  };

  const handleFilterChange = (key: keyof DashboardFilters, value: string) => {
    const newFilters = { ...filters };
    if (value === 'all' || !value) {
      delete newFilters[key];
    } else {
      (newFilters as any)[key] = value;
    }

    // Reset dependent filters when parent changes
    if (key === 'institutionId') {
      delete newFilters.academicYearId;
      delete newFilters.degreeId;
      delete newFilters.departmentId;
      delete newFilters.programId;
      delete newFilters.semesterId;
      delete newFilters.sectionId;
    } else if (key === 'degreeId') {
      delete newFilters.departmentId;
      delete newFilters.programId;
      delete newFilters.semesterId;
      delete newFilters.sectionId;
    } else if (key === 'departmentId') {
      delete newFilters.programId;
      delete newFilters.semesterId;
      delete newFilters.sectionId;
    } else if (key === 'programId') {
      delete newFilters.semesterId;
      delete newFilters.sectionId;
    } else if (key === 'semesterId') {
      delete newFilters.sectionId;
    }

    onFiltersChange(newFilters);
  };

  const handleDateChange = (key: 'startDate' | 'endDate', value: string) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  const handleReset = () => {
    setSearchTerm('');
    onReset();
  };

  const getActiveFiltersDisplay = () => {
    const activeFilters: string[] = [];
    if (filters.search) activeFilters.push('Search');
    if (filters.startDate || filters.endDate) activeFilters.push('Date Range');
    if (filters.institutionId && !dashboardInstitutionId) activeFilters.push('Institution');
    if (filters.academicYearId && !dashboardAcademicYearId) activeFilters.push('Academic Year');
    if (filters.degreeId) activeFilters.push('Degree');
    if (filters.departmentId) activeFilters.push('Department');
    if (filters.programId) activeFilters.push('Program');
    if (filters.semesterId) activeFilters.push('Semester');
    if (filters.sectionId) activeFilters.push('Section');
    if (filters.staffId) activeFilters.push('Staff');
    return activeFilters;
  };

  // Load institutions for super admin
  useEffect(() => {
    if (canViewAllInstitutions) {
      const loadInstitutions = async () => {
        setLoadingInstitutions(true);
        try {
          const { data, error } = await supabase
            .from('institutions')
            .select('id, name')
            .eq('is_active', true)
            .order('name');

          if (error) throw error;
          setInstitutions(data || []);
        } catch (error) {
          logger.error('academic/attendance-dashboard', 'Error loading institutions', error);
        } finally {
          setLoadingInstitutions(false);
        }
      };
      loadInstitutions();
    }
  }, [canViewAllInstitutions, supabase]);

  // Load academic years based on selected institution
  useEffect(() => {
    const institutionId = filters.institutionId || userInstitutionId;
    if (institutionId) {
      const loadAcademicYears = async () => {
        setLoadingAcademicYears(true);
        try {
          const { data, error } = await supabase
            .from('academic_years')
            .select('id, academic_year_name')
            .eq('institution_id', institutionId)
            .eq('is_active', true)
            .order('academic_year_name', { ascending: false });

          if (error) throw error;
          setAcademicYears(data || []);
        } catch (error) {
          logger.error('academic/attendance-dashboard', 'Error loading academic years', error);
        } finally {
          setLoadingAcademicYears(false);
        }
      };
      loadAcademicYears();
    } else {
      setAcademicYears([]);
    }
  }, [filters.institutionId, userInstitutionId, supabase]);

  // Load degrees based on selected institution
  useEffect(() => {
    const institutionId = filters.institutionId || userInstitutionId;
    if (institutionId) {
      const loadDegrees = async () => {
        setLoadingDegrees(true);
        try {
          const { data, error } = await supabase
            .from('degrees')
            .select('id, degree_name')
            .eq('institution_id', institutionId)
            .eq('is_active', true)
            .order('degree_name');

          if (error) throw error;
          setDegrees(data || []);
        } catch (error) {
          logger.error('academic/attendance-dashboard', 'Error loading degrees', error);
        } finally {
          setLoadingDegrees(false);
        }
      };
      loadDegrees();
    } else {
      setDegrees([]);
    }
  }, [filters.institutionId, userInstitutionId, supabase]);

  // Load departments based on selected degree
  useEffect(() => {
    if (filters.degreeId) {
      const degreeId = filters.degreeId; // Capture for TypeScript narrowing
      const loadDepartments = async () => {
        setLoadingDepartments(true);
        try {
          const { data, error } = await supabase
            .from('departments')
            .select('id, department_name')
            .eq('degree_id', degreeId)
            .eq('is_active', true)
            .order('department_name');

          if (error) throw error;
          setDepartments(data || []);
        } catch (error) {
          logger.error('academic/attendance-dashboard', 'Error loading departments', error);
        } finally {
          setLoadingDepartments(false);
        }
      };
      loadDepartments();
    } else {
      setDepartments([]);
    }
  }, [filters.degreeId, supabase]);

  // Load programs based on selected department
  useEffect(() => {
    if (filters.departmentId) {
      const departmentId = filters.departmentId; // Capture for TypeScript narrowing
      const loadPrograms = async () => {
        setLoadingPrograms(true);
        try {
          const { data, error } = await supabase
            .from('programs')
            .select('id, program_name')
            .eq('department_id', departmentId)
            .eq('is_active', true)
            .order('program_name');

          if (error) throw error;
          setPrograms(data || []);
        } catch (error) {
          logger.error('academic/attendance-dashboard', 'Error loading programs', error);
        } finally {
          setLoadingPrograms(false);
        }
      };
      loadPrograms();
    } else {
      setPrograms([]);
    }
  }, [filters.departmentId, supabase]);

  // Load semesters based on selected program
  useEffect(() => {
    if (filters.programId) {
      const programId = filters.programId; // Capture for TypeScript narrowing
      const loadSemesters = async () => {
        setLoadingSemesters(true);
        try {
          const { data, error } = await supabase
            .from('semesters')
            .select('id, semester_name')
            .eq('program_id', programId)
            .eq('is_active', true)
            .order('semester_name');

          if (error) throw error;
          setSemesters(data || []);
        } catch (error) {
          logger.error('academic/attendance-dashboard', 'Error loading semesters', error);
        } finally {
          setLoadingSemesters(false);
        }
      };
      loadSemesters();
    } else {
      setSemesters([]);
    }
  }, [filters.programId, supabase]);

  // Load sections based on selected semester
  useEffect(() => {
    if (filters.semesterId) {
      const semesterId = filters.semesterId; // Capture for TypeScript narrowing
      const loadSections = async () => {
        setLoadingSections(true);
        try {
          const { data, error } = await supabase
            .from('sections')
            .select('id, section_name')
            .eq('semester_id', semesterId)
            .eq('is_active', true)
            .order('section_name');

          if (error) throw error;
          setSections(data || []);
        } catch (error) {
          logger.error('academic/attendance-dashboard', 'Error loading sections', error);
        } finally {
          setLoadingSections(false);
        }
      };
      loadSections();
    } else {
      setSections([]);
    }
  }, [filters.semesterId, supabase]);

  // Load staff based on selected institution
  useEffect(() => {
    const institutionId = filters.institutionId || userInstitutionId;
    if (institutionId) {
      const loadStaff = async () => {
        setLoadingStaff(true);
        try {
          const { data, error } = await supabase
            .from('staff')
            .select('id, first_name, last_name')
            .eq('institution_id', institutionId)
            .eq('is_active', true)
            .order('first_name');

          if (error) throw error;
          setStaff(data || []);
        } catch (error) {
          logger.error('academic/attendance-dashboard', 'Error loading staff', error);
        } finally {
          setLoadingStaff(false);
        }
      };
      loadStaff();
    } else {
      setStaff([]);
    }
  }, [filters.institutionId, userInstitutionId, supabase]);

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-4'>
        {/* Search Input */}
        <div className='relative flex-1 max-w-sm'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search by institution, course, faculty, or period...'
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className='pl-10'
          />
        </div>

        {/* Date Range Inputs */}
        <div className='flex items-center gap-2'>
          <div className='flex items-center gap-1'>
            <Calendar className='h-4 w-4 text-muted-foreground' />
            <Input
              type='date'
              value={filters.startDate || ''}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className='w-36'
            />
          </div>
          <span className='text-muted-foreground'>to</span>
          <Input
            type='date'
            value={filters.endDate || ''}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            className='w-36'
          />
        </div>

        {/* Enhanced Filter Popover */}
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant='outline' className='gap-2'>
              <Filter className='h-4 w-4' />
              Advanced Filters
              {activeFiltersCount > 0 && (
                <Badge
                  variant='secondary'
                  className='ml-1 px-1.5 py-0.5 text-xs'
                >
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-96' align='end'>
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <h4 className='font-medium'>Hierarchical Filters</h4>
                {activeFiltersCount > 0 && (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={handleReset}
                    className='h-auto p-1'
                  >
                    <X className='h-4 w-4' />
                  </Button>
                )}
              </div>

              <div className='grid gap-3 max-h-96 overflow-y-auto'>
                {/* Institution Filter - Hide as it's controlled by dashboard filters */}
                {canViewAllInstitutions && dashboardInstitutionId === undefined && (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1'>
                      <Building2 className='h-3 w-3' />
                      Institution
                      <span className='text-xs text-muted-foreground ml-1'>(Use top filter)</span>
                    </Label>
                    <div className='text-sm text-muted-foreground p-2 bg-muted/50 rounded border'>
                      Institution filter is controlled by the main dashboard filter above.
                    </div>
                  </div>
                )}

                {/* Academic Year Filter - Show info message when controlled by dashboard */}
                {(filters.institutionId || userInstitutionId || dashboardInstitutionId) && (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1'>
                      <CalendarDays className='h-3 w-3' />
                      Academic Year
                      {dashboardAcademicYearId && (
                        <span className='text-xs text-muted-foreground ml-1'>(From dashboard)</span>
                      )}
                    </Label>
                    {dashboardAcademicYearId ? (
                      <div className='text-sm text-muted-foreground p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800'>
                        Academic Year is controlled by the main dashboard filter above.
                      </div>
                    ) : (
                      <Select
                        value={filters.academicYearId || 'all'}
                        onValueChange={(value) =>
                          handleFilterChange('academicYearId', value)
                        }
                        disabled={loadingAcademicYears}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              loadingAcademicYears
                                ? 'Loading...'
                                : 'All Academic Years'
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
                    )}
                  </div>
                )}

                {/* Degree Filter */}
                {(filters.institutionId || userInstitutionId) && (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1'>
                      <GraduationCap className='h-3 w-3' />
                      Degree
                    </Label>
                    <Select
                      value={filters.degreeId || 'all'}
                      onValueChange={(value) =>
                        handleFilterChange('degreeId', value)
                      }
                      disabled={loadingDegrees}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingDegrees ? 'Loading...' : 'All Degrees'
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
                  </div>
                )}

                {/* Department Filter */}
                {filters.degreeId && (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1'>
                      <Building className='h-3 w-3' />
                      Department
                    </Label>
                    <Select
                      value={filters.departmentId || 'all'}
                      onValueChange={(value) =>
                        handleFilterChange('departmentId', value)
                      }
                      disabled={loadingDepartments}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingDepartments
                              ? 'Loading...'
                              : 'All Departments'
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
                  </div>
                )}

                {/* Program Filter */}
                {filters.departmentId && (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1'>
                      <BookOpen className='h-3 w-3' />
                      Program
                    </Label>
                    <Select
                      value={filters.programId || 'all'}
                      onValueChange={(value) =>
                        handleFilterChange('programId', value)
                      }
                      disabled={loadingPrograms}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingPrograms ? 'Loading...' : 'All Programs'
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
                  </div>
                )}

                {/* Semester Filter */}
                {filters.programId && (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1'>
                      <Calendar className='h-3 w-3' />
                      Semester
                    </Label>
                    <Select
                      value={filters.semesterId || 'all'}
                      onValueChange={(value) =>
                        handleFilterChange('semesterId', value)
                      }
                      disabled={loadingSemesters}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingSemesters ? 'Loading...' : 'All Semesters'
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
                  </div>
                )}

                {/* Section Filter */}
                {filters.semesterId && (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1'>
                      <Users className='h-3 w-3' />
                      Section
                    </Label>
                    <Select
                      value={filters.sectionId || 'all'}
                      onValueChange={(value) =>
                        handleFilterChange('sectionId', value)
                      }
                      disabled={loadingSections}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingSections ? 'Loading...' : 'All Sections'
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
                  </div>
                )}

                {/* Staff Filter */}
                {(filters.institutionId || userInstitutionId) && (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1'>
                      <User className='h-3 w-3' />
                      Staff
                    </Label>
                    <Select
                      value={filters.staffId || 'all'}
                      onValueChange={(value) =>
                        handleFilterChange('staffId', value)
                      }
                      disabled={loadingStaff}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingStaff ? 'Loading...' : 'All Staff'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>All Staff</SelectItem>
                        {staff.map((staffMember) => (
                          <SelectItem
                            key={staffMember.id}
                            value={staffMember.id}
                          >
                            {staffMember.first_name} {staffMember.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {activeFiltersCount > 0 && (
                <div className='pt-3 border-t'>
                  <div className='flex items-center justify-between'>
                    <div className='text-sm text-muted-foreground'>
                      Active filters: {getActiveFiltersDisplay().join(', ')}
                    </div>
                    <Button variant='outline' size='sm' onClick={handleReset}>
                      Clear All
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Quick Reset Button */}
        {activeFiltersCount > 0 && (
          <Button variant='ghost' size='sm' onClick={handleReset}>
            <X className='h-4 w-4 mr-1' />
            Clear ({activeFiltersCount})
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm text-muted-foreground'>Active filters:</span>

          {filters.search && (
            <Badge variant='secondary' className='gap-1'>
              Search: &ldquo;{filters.search}&rdquo;
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('search', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {(filters.startDate || filters.endDate) && (
            <Badge variant='secondary' className='gap-1'>
              Date: {filters.startDate || 'Start'} → {filters.endDate || 'End'}
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => {
                  handleDateChange('startDate', '');
                  handleDateChange('endDate', '');
                }}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {filters.institutionId && !dashboardInstitutionId && (
            <Badge variant='secondary' className='gap-1'>
              Institution
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('institutionId', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {filters.academicYearId && !dashboardAcademicYearId && (
            <Badge variant='secondary' className='gap-1'>
              Academic Year
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('academicYearId', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {filters.degreeId && (
            <Badge variant='secondary' className='gap-1'>
              Degree
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('degreeId', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {filters.departmentId && (
            <Badge variant='secondary' className='gap-1'>
              Department
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('departmentId', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {filters.programId && (
            <Badge variant='secondary' className='gap-1'>
              Program
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('programId', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {filters.semesterId && (
            <Badge variant='secondary' className='gap-1'>
              Semester
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('semesterId', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {filters.sectionId && (
            <Badge variant='secondary' className='gap-1'>
              Section
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('sectionId', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}

          {filters.staffId && (
            <Badge variant='secondary' className='gap-1'>
              Staff
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 ml-1'
                onClick={() => handleFilterChange('staffId', '')}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
