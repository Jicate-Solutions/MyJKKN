'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { RotateCcw, Filter, X } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AdvancedBillingScheduleFiltersProps {
  searchParams: BillingScheduleSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

interface FilterOption {
  id: string;
  name: string;
  // Support multiple naming conventions from different services
  degree_name?: string;
  department_name?: string;
  program_name?: string;
  semester_name?: string;
  section_name?: string;
  item_category_name?: string;
  academic_year_name?: string;
}

interface FilterState {
  institutions: FilterOption[];
  categories: FilterOption[];
  academicYears: FilterOption[];
  degrees: FilterOption[];
  departments: FilterOption[];
  programs: FilterOption[];
  semesters: FilterOption[];
  sections: FilterOption[];
}

interface FilterValidation {
  isValid: boolean;
  invalidFilters: string[];
  suggestions: string[];
}

export function AdvancedBillingScheduleFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: AdvancedBillingScheduleFiltersProps) {
  const [filterState, setFilterState] = useState<FilterState>({
    institutions: [],
    categories: [],
    academicYears: [],
    degrees: [],
    departments: [],
    programs: [],
    semesters: [],
    sections: []
  });

  const [loading, setLoading] = useState({
    institutions: false,
    categories: false,
    academicYears: false,
    degrees: false,
    departments: false,
    programs: false,
    semesters: false,
    sections: false
  });

  const [isCollapsed, setIsCollapsed] = useState(false);
  const { canAccess, isSuperAdmin, userProfile } = usePermissions();

  // Smart filter validation that checks hierarchy consistency
  const validateFilters = useCallback((): FilterValidation => {
    const invalidFilters: string[] = [];
    const suggestions: string[] = [];

    // Check if degree exists in selected institution
    if (searchParams.institution_id && searchParams.degree_id) {
      const degreeExists = filterState.degrees.some(d => d.id === searchParams.degree_id);
      if (!degreeExists) {
        invalidFilters.push('degree_id');
        suggestions.push('Selected degree is not available in the chosen institution');
      }
    }

    // Check department-degree relationship
    if (searchParams.degree_id && searchParams.department_id) {
      const deptExists = filterState.departments.some(d => d.id === searchParams.department_id);
      if (!deptExists) {
        invalidFilters.push('department_id');
        suggestions.push('Selected department is not available in the chosen degree');
      }
    }

    // Continue for other hierarchy levels...
    if (searchParams.department_id && searchParams.program_id) {
      const programExists = filterState.programs.some(p => p.id === searchParams.program_id);
      if (!programExists) {
        invalidFilters.push('program_id');
        suggestions.push('Selected program is not available in the chosen department');
      }
    }

    if (searchParams.program_id && searchParams.semester_id) {
      const semesterExists = filterState.semesters.some(s => s.id === searchParams.semester_id);
      if (!semesterExists) {
        invalidFilters.push('semester_id');
        suggestions.push('Selected semester is not available in the chosen program');
      }
    }

    if (searchParams.semester_id && searchParams.section_id) {
      const sectionExists = filterState.sections.some(s => s.id === searchParams.section_id);
      if (!sectionExists) {
        invalidFilters.push('section_id');
        suggestions.push('Selected section is not available in the chosen semester');
      }
    }

    return {
      isValid: invalidFilters.length === 0,
      invalidFilters,
      suggestions
    };
  }, [searchParams, filterState]);

  // Optimized filter change handler that only clears invalid dependent filters
  const handleSmartFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      // Always apply the current filter change
      onFilterChange(key, value);

      // Smart cascade logic: only clear filters that become invalid
      if (!value) {
        // If clearing a filter, clear its dependents
        const clearMap: Record<string, string[]> = {
          institution_id: ['degree_id', 'department_id', 'program_id', 'semester_id', 'section_id', 'academic_year_id'],
          degree_id: ['department_id', 'program_id', 'semester_id', 'section_id'],
          department_id: ['program_id', 'semester_id', 'section_id'],
          program_id: ['semester_id', 'section_id'],
          semester_id: ['section_id']
        };

        const toClear = clearMap[key] || [];
        toClear.forEach(filterKey => {
          onFilterChange(filterKey, undefined);
        });
      }
    },
    [onFilterChange]
  );

  // Auto-fix invalid filters on page load
  useEffect(() => {
    const validation = validateFilters();
    if (!validation.isValid) {
      // Auto-clear invalid filters after a brief delay to allow data to load
      const timer = setTimeout(() => {
        validation.invalidFilters.forEach(filterKey => {
          onFilterChange(filterKey, undefined);
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [validateFilters, onFilterChange]);

  // Enhanced data loading with error handling and caching
  const loadFilterData = useCallback(async (
    type: keyof FilterState,
    loadFn: () => Promise<any[]>,
    dependencies: string[] = []
  ) => {
    const hasRequiredDependencies = dependencies.every(dep =>
      searchParams[dep as keyof BillingScheduleSearchParams]
    );

    if (dependencies.length > 0 && !hasRequiredDependencies) {
      setFilterState(prev => ({ ...prev, [type]: [] }));
      return;
    }

    setLoading(prev => ({ ...prev, [type]: true }));
    try {
      const rawData = await loadFn();
      // Normalize data to consistent format
      const normalizedData = rawData.map(item => ({
        id: item.id,
        name: item.name ||
              item.degree_name ||
              item.department_name ||
              item.program_name ||
              item.semester_name ||
              item.section_name ||
              item.item_category_name ||
              item.academic_year_name ||
              'Unknown',
        ...item
      }));
      setFilterState(prev => ({ ...prev, [type]: normalizedData }));
    } catch (error) {
      console.error(`Error loading ${type}:`, error);
      setFilterState(prev => ({ ...prev, [type]: [] }));
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  }, [searchParams]);

  // Load institutions and categories on mount
  useEffect(() => {
    loadFilterData('institutions', () => OrganizationService.getInstitutionNames(true));
    loadFilterData('categories', async () => {
      const result = await BillingItemCategoryService.getBillingItemCategories();
      return result.data;
    });
  }, [loadFilterData]);

  // Load academic years when institution changes
  useEffect(() => {
    if (searchParams.institution_id) {
      loadFilterData(
        'academicYears',
        () => AcademicYearService.getAcademicYearsByInstitution(searchParams.institution_id!),
        ['institution_id']
      );
    }
  }, [searchParams.institution_id, loadFilterData]);

  // Load degrees when institution changes
  useEffect(() => {
    if (searchParams.institution_id) {
      loadFilterData(
        'degrees',
        () => DegreeService.getDegreesByInstitution(searchParams.institution_id!),
        ['institution_id']
      );
    }
  }, [searchParams.institution_id, loadFilterData]);

  // Load departments when degree changes
  useEffect(() => {
    if (searchParams.degree_id) {
      loadFilterData(
        'departments',
        () => DepartmentService.getDepartmentsByDegree(searchParams.degree_id!),
        ['degree_id']
      );
    }
  }, [searchParams.degree_id, loadFilterData]);

  // Load programs when department changes
  useEffect(() => {
    if (searchParams.department_id) {
      loadFilterData(
        'programs',
        () => ProgramService.getProgramsByDepartment(searchParams.department_id!),
        ['department_id']
      );
    }
  }, [searchParams.department_id, loadFilterData]);

  // Load semesters when program changes
  useEffect(() => {
    if (searchParams.program_id) {
      loadFilterData(
        'semesters',
        () => SemesterService.getSemestersByProgram(searchParams.program_id!),
        ['program_id']
      );
    }
  }, [searchParams.program_id, loadFilterData]);

  // Load sections when semester changes
  useEffect(() => {
    if (searchParams.semester_id) {
      loadFilterData(
        'sections',
        () => SectionService.getSectionsBySemester(searchParams.semester_id!),
        ['semester_id']
      );
    }
  }, [searchParams.semester_id, loadFilterData]);

  // Auto-set institution for non-super admin users
  useEffect(() => {
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !searchParams.institution_id &&
      !loading.institutions
    ) {
      onFilterChange('institution_id', userProfile.institution_id);
    }
  }, [
    userProfile,
    isSuperAdmin,
    searchParams.institution_id,
    onFilterChange,
    loading.institutions
  ]);

  const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
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
  }, [onFilterChange]);

  // Active filters with smart labeling
  const activeFilters = useMemo(() => {
    const filters: Array<{ key: string; value: string; label: string }> = [];

    if (searchParams.institution_id) {
      const inst = filterState.institutions.find(i => i.id === searchParams.institution_id);
      filters.push({
        key: 'institution_id',
        value: searchParams.institution_id,
        label: `Institution: ${inst?.name || 'Unknown'}`
      });
    }

    if (searchParams.degree_id) {
      const degree = filterState.degrees.find(d => d.id === searchParams.degree_id);
      filters.push({
        key: 'degree_id',
        value: searchParams.degree_id,
        label: `Degree: ${degree?.name || 'Unknown'}`
      });
    }

    if (searchParams.department_id) {
      const dept = filterState.departments.find(d => d.id === searchParams.department_id);
      filters.push({
        key: 'department_id',
        value: searchParams.department_id,
        label: `Department: ${dept?.name || 'Unknown'}`
      });
    }

    if (searchParams.program_id) {
      const program = filterState.programs.find(p => p.id === searchParams.program_id);
      filters.push({
        key: 'program_id',
        value: searchParams.program_id,
        label: `Program: ${program?.name || 'Unknown'}`
      });
    }

    if (searchParams.semester_id) {
      const semester = filterState.semesters.find(s => s.id === searchParams.semester_id);
      filters.push({
        key: 'semester_id',
        value: searchParams.semester_id,
        label: `Semester: ${semester?.name || 'Unknown'}`
      });
    }

    if (searchParams.section_id) {
      const section = filterState.sections.find(s => s.id === searchParams.section_id);
      filters.push({
        key: 'section_id',
        value: searchParams.section_id,
        label: `Section: ${section?.name || 'Unknown'}`
      });
    }

    if (searchParams.status) {
      filters.push({
        key: 'status',
        value: searchParams.status,
        label: `Status: ${searchParams.status}`
      });
    }

    if (searchParams.is_recurring) {
      filters.push({
        key: 'is_recurring',
        value: searchParams.is_recurring,
        label: `Type: ${searchParams.is_recurring === 'true' ? 'Recurring' : 'One-time'}`
      });
    }

    return filters;
  }, [searchParams, filterState]);

  const hasActiveFilters = activeFilters.length > 0;
  const validation = validateFilters();

  return (
    <div className='space-y-4'>
      {/* Filter Header with Collapse/Expand */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Filter className='h-4 w-4' />
          <span className='font-medium'>Advanced Filters</span>
          {!validation.isValid && (
            <Badge variant="destructive" className='text-xs'>
              Invalid Filters Detected
            </Badge>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? 'Expand' : 'Collapse'}
          </Button>
          {hasActiveFilters && (
            <Button variant='ghost' size='sm' onClick={onClearFilters}>
              <RotateCcw className='mr-2 h-4 w-4' />
              Reset All
            </Button>
          )}
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className='flex flex-wrap gap-2'>
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant={validation.invalidFilters.includes(filter.key) ? "destructive" : "secondary"}
              className='flex items-center gap-1'
            >
              {filter.label}
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 text-current'
                onClick={() => handleSmartFilterChange(filter.key, undefined)}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {/* Validation Messages */}
      {!validation.isValid && (
        <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>
          <div className='font-medium'>Filter Validation Issues:</div>
          <ul className='mt-1 space-y-1'>
            {validation.suggestions.map((suggestion, index) => (
              <li key={index}>• {suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter Controls */}
      {!isCollapsed && (
        <>
          {/* Institution & Academic Hierarchy */}
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {isSuperAdmin && (
              <div className='space-y-2'>
                <Label>Institution</Label>
                <Select
                  value={searchParams.institution_id || 'all'}
                  onValueChange={(value) => {
                    handleSmartFilterChange('institution_id', value === 'all' ? undefined : value);
                  }}
                  disabled={loading.institutions}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select institution' />
                  </SelectTrigger>
                  <SelectContent className='max-h-60 overflow-y-auto'>
                    <SelectItem value='all'>All Institutions</SelectItem>
                    {filterState.institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className='space-y-2'>
              <Label>Academic Year</Label>
              <Select
                value={searchParams.academic_year_id || 'all'}
                onValueChange={(value) => {
                  handleSmartFilterChange('academic_year_id', value === 'all' ? undefined : value);
                }}
                disabled={!searchParams.institution_id || loading.academicYears}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select academic year' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Academic Years</SelectItem>
                  {filterState.academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>Degree</Label>
              <Select
                value={searchParams.degree_id || 'all'}
                onValueChange={(value) => {
                  handleSmartFilterChange('degree_id', value === 'all' ? undefined : value);
                }}
                disabled={!searchParams.institution_id || loading.degrees}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select degree' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Degrees</SelectItem>
                  {filterState.degrees.map((degree) => (
                    <SelectItem key={degree.id} value={degree.id}>
                      {degree.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>Department</Label>
              <Select
                value={searchParams.department_id || 'all'}
                onValueChange={(value) => {
                  handleSmartFilterChange('department_id', value === 'all' ? undefined : value);
                }}
                disabled={!searchParams.degree_id || loading.departments}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select department' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Departments</SelectItem>
                  {filterState.departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>Program</Label>
              <Select
                value={searchParams.program_id || 'all'}
                onValueChange={(value) => {
                  handleSmartFilterChange('program_id', value === 'all' ? undefined : value);
                }}
                disabled={!searchParams.department_id || loading.programs}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select program' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Programs</SelectItem>
                  {filterState.programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>Semester</Label>
              <Select
                value={searchParams.semester_id || 'all'}
                onValueChange={(value) => {
                  handleSmartFilterChange('semester_id', value === 'all' ? undefined : value);
                }}
                disabled={!searchParams.program_id || loading.semesters}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select semester' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Semesters</SelectItem>
                  {filterState.semesters.map((semester) => (
                    <SelectItem key={semester.id} value={semester.id}>
                      {semester.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>Section</Label>
              <Select
                value={searchParams.section_id || 'all'}
                onValueChange={(value) => {
                  handleSmartFilterChange('section_id', value === 'all' ? undefined : value);
                }}
                disabled={!searchParams.semester_id || loading.sections}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select section' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Sections</SelectItem>
                  {filterState.sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>Category</Label>
              <Select
                value={searchParams.item_category_id || 'all'}
                onValueChange={(value) =>
                  handleSmartFilterChange('item_category_id', value === 'all' ? undefined : value)
                }
                disabled={loading.categories}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select category' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Categories</SelectItem>
                  {filterState.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bill-specific Filters */}
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <div className='space-y-2'>
              <Label>Status</Label>
              <Select
                value={searchParams.status || 'all'}
                onValueChange={(value) =>
                  handleSmartFilterChange('status', value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Filter by status' />
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

            <div className='space-y-2'>
              <Label>Bill Type</Label>
              <Select
                value={searchParams.is_recurring || 'all'}
                onValueChange={(value) =>
                  handleSmartFilterChange('is_recurring', value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Filter by type' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Types</SelectItem>
                  <SelectItem value='false'>One-time</SelectItem>
                  <SelectItem value='true'>Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>Amount From</Label>
              <Input
                type="number"
                placeholder="Min amount"
                value={searchParams.amount_from || ''}
                onChange={(e) =>
                  handleSmartFilterChange('amount_from', e.target.value || undefined)
                }
              />
            </div>

            <div className='space-y-2'>
              <Label>Amount To</Label>
              <Input
                type="number"
                placeholder="Max amount"
                value={searchParams.amount_to || ''}
                onChange={(e) =>
                  handleSmartFilterChange('amount_to', e.target.value || undefined)
                }
              />
            </div>
          </div>

          {/* Date Range Filter */}
          <div className='space-y-2'>
            <Label>Due Date Range</Label>
            <DatePickerWithRange
              value={searchParams.dueDateRange}
              onChange={handleDateRangeChange}
              placeholder="Select date range"
            />
          </div>
        </>
      )}
    </div>
  );
}