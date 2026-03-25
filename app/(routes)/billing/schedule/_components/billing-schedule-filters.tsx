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

  useEffect(() => {
    async function loadCategories() {
      try {
        const data = await BillingItemCategoryService.getBillingItemCategories();
        setCategories(data.data); // Note: service returns { data, metadata }
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    }
    loadCategories();
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
      if (searchParams.semester_id) {
        try {
          const data = await SectionService.getSectionsBySemester(
            searchParams.semester_id
          );
          setSections(data);
        } catch (error) {
          console.error('Error loading sections:', error);
        }
      } else {
        setSections([]);
      }
    }
    loadSections();
  }, [searchParams.semester_id]);

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
    <div className='space-y-4'>
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
                  onFilterChange('section_id', undefined);
                  onFilterChange('academic_year_id', undefined);
                  onFilterChange('item_category_id', undefined);
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
                onFilterChange('section_id', undefined);
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
                onFilterChange('section_id', undefined);
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
                onFilterChange('section_id', undefined);
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
            const newValue = value === 'all' ? undefined : value;
            onFilterChange('semester_id', newValue);
            // Clear dependent filters
            if (!newValue) {
              onFilterChange('section_id', undefined);
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
          value={searchParams.section_id || 'all'}
          onValueChange={(value) =>
            onFilterChange(
              'section_id',
              value === 'all' ? undefined : value
            )
          }
          disabled={!searchParams.semester_id}
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
            <SelectValue placeholder='Select section' />
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

        <Select
          value={searchParams.academic_year_id || 'all'}
          onValueChange={(value) => {
            onFilterChange('academic_year_id', value === 'all' ? undefined : value);
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
          value={searchParams.item_category_id || 'all'}
          onValueChange={(value) =>
            onFilterChange(
              'item_category_id',
              value === 'all' ? undefined : value
            )
          }
          disabled={loading}
        >
          <SelectTrigger className='w-full sm:w-[200px]'>
            <SelectValue placeholder='Select category' />
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

        <Select
          value={searchParams.status || 'all'}
          onValueChange={(value) =>
            onFilterChange('status', value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger className='w-full sm:w-[140px]'>
            <SelectValue placeholder='Filter by status' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='unpaid'>Unpaid</SelectItem>
            <SelectItem value='paid'>Paid</SelectItem>
            <SelectItem value='partially_paid'>Partially Paid</SelectItem>
            <SelectItem value='overdue'>Overdue</SelectItem>
            <SelectItem value='cancelled'>Cancelled</SelectItem>
            <SelectItem value='refunded'>Refunded</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={searchParams.is_recurring || 'all'}
          onValueChange={(value) =>
            onFilterChange(
              'is_recurring',
              value === 'all' ? undefined : value
            )
          }
        >
          <SelectTrigger className='w-full sm:w-[140px]'>
            <SelectValue placeholder='Filter by type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='false'>One-time</SelectItem>
            <SelectItem value='true'>Recurring</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
