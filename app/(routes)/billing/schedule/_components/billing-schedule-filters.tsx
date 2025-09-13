'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { BillingScheduleSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';

interface BillingScheduleFiltersProps {
  searchParams: BillingScheduleSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function BillingScheduleFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: BillingScheduleFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; item_category_name: string }>
  >([]);
  const [academicYears, setAcademicYears] = useState<
    Array<{ id: string; academic_year_name: string }>
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
  const [loading, setLoading] = useState(false);
  const { canAccess, isSuperAdmin, userProfile } = usePermissions();

  useEffect(() => {
    async function loadFilters() {
      try {
        setLoading(true);
        const [institutionsData, categoriesData, academicYearsData] =
          await Promise.all([
            OrganizationService.getInstitutionNames(true),
            BillingItemCategoryService.getBillingItemCategories({
              institution_id: userProfile?.institution_id || undefined,
              limit: 1000,
              isActive: true
            }),
            AcademicYearService.getAcademicYears({
              institution_id: userProfile?.institution_id || undefined,
              limit: 1000,
              isActive: true
            })
          ]);

        setInstitutions(institutionsData);
        setCategories(categoriesData.data);
        setAcademicYears(academicYearsData.data);
      } catch (error) {
        console.error('Error loading filter data:', error);
      } finally {
        setLoading(false);
      }
    }

    if (userProfile) {
      loadFilters();
    }
  }, [userProfile]);

  // Load hierarchical data based on selections
  useEffect(() => {
    if (searchParams.institution_id) {
      loadDegrees(searchParams.institution_id);
    } else {
      // Clear dependent data when no institution is selected
      setDegrees([]);
      setDepartments([]);
      setPrograms([]);
      setSemesters([]);
      setSections([]);
    }
  }, [searchParams.institution_id]);

  useEffect(() => {
    if (searchParams.degree_id && searchParams.institution_id) {
      loadDepartments(searchParams.institution_id, searchParams.degree_id);
    } else {
      // Clear dependent data when no degree is selected
      setDepartments([]);
      setPrograms([]);
      setSemesters([]);
      setSections([]);
    }
  }, [searchParams.degree_id, searchParams.institution_id]);

  useEffect(() => {
    if (
      searchParams.department_id &&
      searchParams.degree_id &&
      searchParams.institution_id
    ) {
      loadPrograms(
        searchParams.institution_id,
        searchParams.degree_id,
        searchParams.department_id
      );
    } else {
      // Clear dependent data when no department is selected
      setPrograms([]);
      setSemesters([]);
      setSections([]);
    }
  }, [
    searchParams.department_id,
    searchParams.degree_id,
    searchParams.institution_id
  ]);

  useEffect(() => {
    if (
      searchParams.program_id &&
      searchParams.department_id &&
      searchParams.degree_id &&
      searchParams.institution_id
    ) {
      loadSemesters(
        searchParams.institution_id,
        searchParams.degree_id,
        searchParams.department_id,
        searchParams.program_id
      );
    } else {
      // Clear dependent data when no program is selected
      setSemesters([]);
      setSections([]);
    }
  }, [
    searchParams.program_id,
    searchParams.department_id,
    searchParams.degree_id,
    searchParams.institution_id
  ]);

  useEffect(() => {
    if (
      searchParams.semester_id &&
      searchParams.program_id &&
      searchParams.department_id &&
      searchParams.degree_id &&
      searchParams.institution_id
    ) {
      loadSections(
        searchParams.institution_id,
        searchParams.degree_id,
        searchParams.department_id,
        searchParams.program_id,
        searchParams.semester_id
      );
    } else {
      // Clear dependent data when no semester is selected
      setSections([]);
    }
  }, [
    searchParams.semester_id,
    searchParams.program_id,
    searchParams.department_id,
    searchParams.degree_id,
    searchParams.institution_id
  ]);

  const loadDegrees = async (institutionId: string) => {
    try {
      const data = await DegreeService.getDegrees({
        institution_id: institutionId,
        limit: 1000,
        isActive: true
      });
      setDegrees(data.data);
    } catch (error) {
      console.error('Error loading degrees:', error);
    }
  };

  const loadDepartments = async (institutionId: string, degreeId: string) => {
    try {
      const data = await DepartmentService.getDepartments({
        institution_id: institutionId,
        degree_id: degreeId,
        limit: 1000,
        isActive: true
      });
      setDepartments(data.data);
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  const loadPrograms = async (
    institutionId: string,
    degreeId: string,
    departmentId: string
  ) => {
    try {
      const data = await ProgramService.getPrograms({
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        limit: 1000,
        isActive: true
      });
      setPrograms(data.data);
    } catch (error) {
      console.error('Error loading programs:', error);
    }
  };

  const loadSemesters = async (
    institutionId: string,
    degreeId: string,
    departmentId: string,
    programId: string
  ) => {
    try {
      const data = await SemesterService.getSemesters({
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        program_id: programId,
        limit: 1000,
        isActive: true
      });
      setSemesters(data.data);
    } catch (error) {
      console.error('Error loading semesters:', error);
    }
  };

  const loadSections = async (
    institutionId: string,
    degreeId: string,
    departmentId: string,
    programId: string,
    semesterId: string
  ) => {
    try {
      const data = await SectionService.getSections({
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        program_id: programId,
        semester_id: semesterId,
        limit: 1000,
        isActive: true
      });
      setSections(data.data);
    } catch (error) {
      console.error('Error loading sections:', error);
    }
  };

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

  const handleDateRangeChange = (range: DateRange | undefined) => {
    if (range?.from || range?.to) {
      onFilterChange(
        'dueDateRange',
        JSON.stringify({
          from: range.from?.toISOString(),
          to: range.to?.toISOString()
        })
      );
    } else {
      onFilterChange('dueDateRange', undefined);
    }
  };

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.status ||
    searchParams.item_category_id ||
    searchParams.is_recurring ||
    searchParams.amount_from ||
    searchParams.amount_to ||
    searchParams.dueDateRange ||
    searchParams.academic_year_id ||
    searchParams.degree_id ||
    searchParams.department_id ||
    searchParams.program_id ||
    searchParams.semester_id ||
    searchParams.section_id
  );

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold'>Advanced Search & Filters</h3>
        {hasActiveFilters && (
          <Button
            variant='outline'
            size='sm'
            onClick={onClearFilters}
            className='h-8 px-3'
          >
            <RotateCcw className='mr-2 h-3 w-3' />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Filter Grid */}
      <div className='space-y-4'>
        {/* First Row - Basic Filters */}
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
          {/* Institution Filter - Only show for super admins */}
          {isSuperAdmin && (
            <div>
              <Label className='text-xs font-medium text-muted-foreground mb-1'>
                Institution
              </Label>
              <Select
                value={searchParams.institution_id || 'all'}
                onValueChange={(value) =>
                  onFilterChange(
                    'institution_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loading ? 'Loading...' : 'All Institutions'}
                  />
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
            </div>
          )}

          {/* Degree Filter */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Degree
            </Label>
            <Select
              value={searchParams.degree_id || 'all'}
              onValueChange={(value) => {
                const degreeId = value === 'all' ? undefined : value;
                onFilterChange('degree_id', degreeId);
                // Reset dependent filters
                onFilterChange('department_id', undefined);
                onFilterChange('program_id', undefined);
                onFilterChange('semester_id', undefined);
                onFilterChange('section_id', undefined);
              }}
              disabled={loading || !searchParams.institution_id}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Degrees' />
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
          </div>

          {/* Department Filter */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Department
            </Label>
            <Select
              value={searchParams.department_id || 'all'}
              onValueChange={(value) => {
                const departmentId = value === 'all' ? undefined : value;
                onFilterChange('department_id', departmentId);
                // Reset dependent filters
                onFilterChange('program_id', undefined);
                onFilterChange('semester_id', undefined);
                onFilterChange('section_id', undefined);
              }}
              disabled={loading || !searchParams.degree_id}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Departments' />
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
          </div>

          {/* Program Filter */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Program
            </Label>
            <Select
              value={searchParams.program_id || 'all'}
              onValueChange={(value) => {
                const programId = value === 'all' ? undefined : value;
                onFilterChange('program_id', programId);
                // Reset dependent filters
                onFilterChange('semester_id', undefined);
                onFilterChange('section_id', undefined);
              }}
              disabled={loading || !searchParams.department_id}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Programs' />
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

          {/* Semester Filter */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Semester
            </Label>
            <Select
              value={searchParams.semester_id || 'all'}
              onValueChange={(value) => {
                const semesterId = value === 'all' ? undefined : value;
                onFilterChange('semester_id', semesterId);
                // Reset dependent filters
                onFilterChange('section_id', undefined);
              }}
              disabled={loading || !searchParams.program_id}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Semesters' />
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
          </div>

          {/* Section Filter */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Section
            </Label>
            <Select
              value={searchParams.section_id || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'section_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={loading || !searchParams.semester_id}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Sections' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
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
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Academic Year
            </Label>
            <Select
              value={searchParams.academic_year_id || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'academic_year_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Academic Years' />
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
          </div>

          {/* Category Filter */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Category
            </Label>
            <Select
              value={searchParams.item_category_id || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'item_category_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Categories' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.item_category_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recurring Filter */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Type
            </Label>
            <Select
              value={searchParams.is_recurring || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'is_recurring',
                  value === 'all' ? undefined : value
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Types</SelectItem>
                <SelectItem value='false'>One-time</SelectItem>
                <SelectItem value='true'>Recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Status
            </Label>
            <Select
              value={searchParams.status || 'all'}
              onValueChange={(value) =>
                onFilterChange('status', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='unpaid'>Unpaid</SelectItem>
                <SelectItem value='paid'>Paid</SelectItem>
                <SelectItem value='partially_paid'>Partially Paid</SelectItem>
                <SelectItem value='overdue'>Overdue</SelectItem>
                <SelectItem value='cancelled'>Cancelled</SelectItem>
                <SelectItem value='refunded'>Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Amount Range */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Amount From
            </Label>
            <Input
              type='number'
              placeholder='0'
              value={searchParams.amount_from || ''}
              onChange={(e) =>
                onFilterChange('amount_from', e.target.value || undefined)
              }
            />
          </div>
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Amount To
            </Label>
            <Input
              type='number'
              placeholder='0'
              value={searchParams.amount_to || ''}
              onChange={(e) =>
                onFilterChange('amount_to', e.target.value || undefined)
              }
            />
          </div>

          {/* Due Date Range */}
          <div>
            <Label className='text-xs font-medium text-muted-foreground mb-1'>
              Due Date Range
            </Label>
            <DatePickerWithRange
              value={searchParams.dueDateRange ? {
                from: searchParams.dueDateRange.from,
                to: searchParams.dueDateRange.to
              } : undefined}
              onChange={handleDateRangeChange}
              placeholder='Select due date range'
            />
          </div>
        </div>
      </div>
    </div>
  );
}
