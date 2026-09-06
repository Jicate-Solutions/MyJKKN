'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { BillingScheduleSearchParams } from './data-table-schema';
import {
  ACCOMMODATION_TYPE_OPTIONS,
  LIFECYCLE_STATUS_FILTER_OPTIONS
} from '@/types/billing-schedule';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';

interface BillingScheduleFiltersProps {
  searchParams: BillingScheduleSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onBatchFilterChange: (changes: Record<string, string | undefined>) => void;
  onClearFilters: () => void;
}

export function BillingScheduleFilters({
  searchParams,
  onFilterChange,
  onBatchFilterChange,
  onClearFilters
}: BillingScheduleFiltersProps) {
  const {
    institutions: accessibleInstitutions,
    loading: loadingInstitutions,
  } = useInstitutionsWithAccess({ isActive: true });

  // Billing schedule is a COLLEGE module, so the institution dropdown lists
  // entity_type='institution' only (no admin_office / company / school).
  // Filtered on the RESULT rather than via the hook's `entityType` option
  // because useInstitutionsWithAccess forces 'all' for super admins and
  // discards an explicit request — a super admin would otherwise still see
  // Main Office, Jicate Solutions and the schools in this list.
  // Mirrors students/_components/student-search-filters.tsx.
  const institutions = useMemo(
    () => accessibleInstitutions.filter((i) => i.entity_type === 'institution'),
    [accessibleInstitutions]
  );
  const hasMultiInstitutionAccess = institutions.length > 1;

  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string }>
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
  // Names only, de-duplicated: admission_years carries one row per year PER
  // INSTITUTION (79 rows / 9 names), so listing ids would repeat '2026-2027'
  // eleven times and each option would scope the result to one college.
  const [admissionYearNames, setAdmissionYearNames] = useState<string[]>([]);
  const { canAccess } = usePermissions();

  // Auto-pin institution for single-institution users.
  useEffect(() => {
    if (
      !loadingInstitutions &&
      institutions.length === 1 &&
      !searchParams.institution_id
    ) {
      onFilterChange('institution_id', institutions[0].id);
    }
  }, [institutions, searchParams.institution_id, onFilterChange, loadingInstitutions]);

  useEffect(() => {
    async function loadCategories() {
      try {
        // Explicit high limit — getBillingCategories() defaults to limit 10 and
        // would silently truncate this dropdown to the first 10 of ~22.
        const data = await BillingCategoryService.getBillingCategories({ limit: 200 });
        setCategories(data.data); // Note: service returns { data, metadata }
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    }
    loadCategories();
  }, []);

  useEffect(() => {
    async function loadAdmissionYears() {
      try {
        const rows = await AdmissionYearService.listAllActiveYearNames();
        // Already ordered year-descending by the service; Set preserves that.
        setAdmissionYearNames([
          ...new Set(rows.map((r) => r.admission_year_name).filter(Boolean))
        ]);
      } catch (error) {
        console.error('Error loading admission years:', error);
      }
    }
    loadAdmissionYears();
  }, []);

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
    searchParams.lifecycle_status ||
    searchParams.item_category_id ||
    searchParams.collection_type ||
    searchParams.is_recurring ||
    searchParams.amount_from ||
    searchParams.amount_to ||
    searchParams.dueDateRange ||
    searchParams.academic_year_id ||
    searchParams.degree_id ||
    searchParams.department_id ||
    searchParams.program_id ||
    searchParams.semester_id ||
    searchParams.section_id ||
    searchParams.accommodation_type
  );

  return (
    <div className='space-y-4'>
      {/* Reset sits in its own right-aligned row so the filter grid below can
          wrap freely at every breakpoint instead of being pinned into a single
          fixed-width flex row — the cause of the desktop horizontal overflow. */}
      {hasActiveFilters && (
        <div className='flex justify-end'>
          <Button
            variant='ghost'
            onClick={onClearFilters}
            className='h-8 px-2 lg:px-3'
          >
            Reset
            <RotateCcw className='ml-2 h-4 w-4' />
          </Button>
        </div>
      )}

      {/* All filters live in one responsive grid: 1 column on mobile, scaling
          to 4 on xl. Cells wrap onto new rows, so nothing overflows sideways. */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {hasMultiInstitutionAccess && (
            <Select
              value={searchParams.institution_id || 'all'}
              onValueChange={(value) => {
                const newValue = value === 'all' ? undefined : value;
                onBatchFilterChange({
                  institution_id: newValue,
                  degree_id: undefined,
                  department_id: undefined,
                  program_id: undefined,
                  semester_id: undefined,
                  section_id: undefined,
                  academic_year_id: undefined,
                });
              }}
            >
              <SelectTrigger className='w-full'>
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
              onBatchFilterChange({
                degree_id: newValue,
                department_id: undefined,
                program_id: undefined,
                semester_id: undefined,
                section_id: undefined,
              });
            }}
            disabled={!searchParams.institution_id}
          >
            <SelectTrigger className='w-full'>
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
              onBatchFilterChange({
                department_id: newValue,
                program_id: undefined,
                semester_id: undefined,
                section_id: undefined,
              });
            }}
            disabled={!searchParams.degree_id}
          >
            <SelectTrigger className='w-full'>
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
              onBatchFilterChange({
                program_id: newValue,
                semester_id: undefined,
                section_id: undefined,
              });
            }}
            disabled={!searchParams.department_id}
          >
            <SelectTrigger className='w-full'>
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
        {/* Attribute filters continue in the same responsive grid. */}
        <Select
          value={searchParams.semester_id || 'all'}
          onValueChange={(value) => {
            const newValue = value === 'all' ? undefined : value;
            onBatchFilterChange({
              semester_id: newValue,
              section_id: undefined,
            });
          }}
          disabled={!searchParams.program_id}
        >
          <SelectTrigger className='w-full'>
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
          <SelectTrigger className='w-full'>
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
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Select academic year' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Academic Years</SelectItem>
            <SelectItem value='unspecified'>Unspecified</SelectItem>
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
          disabled={loadingInstitutions}
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Select category' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.category_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Ownership of the fee — lets Accounts pull a government-only ledger. */}
        <Select
          value={searchParams.collection_type || 'all'}
          onValueChange={(value) =>
            onFilterChange('collection_type', value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Collection' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Collections</SelectItem>
            <SelectItem value='management'>Management</SelectItem>
            <SelectItem value='government'>Government</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={searchParams.status || 'all'}
          onValueChange={(value) =>
            onFilterChange('status', value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger className='w-full'>
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
          value={searchParams.lifecycle_status || 'all'}
          onValueChange={(value) =>
            onFilterChange(
              'lifecycle_status',
              value === 'all' ? undefined : value
            )
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Learner status' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Learner Status</SelectItem>
            {LIFECYCLE_STATUS_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
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
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Filter by type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='false'>One-time</SelectItem>
            <SelectItem value='true'>Recurring</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={searchParams.accommodation_type || 'all'}
          onValueChange={(value) =>
            onFilterChange(
              'accommodation_type',
              value === 'all' ? undefined : value
            )
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Accommodation type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Accommodation</SelectItem>
            {ACCOMMODATION_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Admission year — the cohort the learner joined in, which is not the
            same as the Academic Year filter above (that one is the year the
            BILL belongs to). Keyed by name, not id: see admissionYearNames. */}
        <Select
          value={searchParams.admission_year || 'all'}
          onValueChange={(value) =>
            onFilterChange('admission_year', value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Admission year' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Admission Years</SelectItem>
            {admissionYearNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
