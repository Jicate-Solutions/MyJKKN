'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  Calendar,
  Filter,
  X,
  RefreshCw,
  Building2,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import type { AttendanceHierarchyFilter } from '@/lib/services/academic/attendance-dashboard-service';

interface AcademicYear {
  id: string;
  academic_year_name: string;
  institution_id: string;
  is_active: boolean;
}

interface HierarchyFilterFieldsProps {
  filters: DashboardFilterState;
  /** Always a single institution — the parent renders this only once scoped. */
  institutionId: string;
  expanded: boolean;
  onChange: (key: keyof DashboardFilterState, value: string | undefined) => void;
}

/**
 * The five cascading hierarchy selects, in their own component so the five
 * lookup queries below are never issued by consumers that pass
 * showHierarchy={false} — hooks can't be called conditionally, components can
 * be mounted conditionally.
 *
 * Each list is scoped to the institution AND to every level selected above it,
 * so a dropdown can only ever offer rows that exist in the current scope.
 * Options are deliberately NOT de-duplicated by name: two same-named
 * departments are two different ids, and collapsing them would quietly filter
 * to just one of them and under-report.
 */
function HierarchyFilterFields({
  filters,
  institutionId,
  expanded,
  onChange
}: HierarchyFilterFieldsProps) {
  const label = useAdaptiveLabels();

  const { data: degreesData } = useDegrees({
    institution_id: institutionId,
    limit: HIERARCHY_DROPDOWN_LIMIT
  });
  const { data: departmentsData } = useDepartments({
    institution_id: institutionId,
    degree_id: filters.degreeId,
    limit: HIERARCHY_DROPDOWN_LIMIT
  });
  const { data: programsData } = usePrograms({
    institution_id: institutionId,
    degree_id: filters.degreeId,
    department_id: filters.departmentId,
    limit: HIERARCHY_DROPDOWN_LIMIT
  });
  const { data: semestersData } = useSemesters({
    institution_id: institutionId,
    degree_id: filters.degreeId,
    department_id: filters.departmentId,
    program_id: filters.programId,
    limit: HIERARCHY_DROPDOWN_LIMIT
  });
  const { data: sectionsData } = useSections({
    institution_id: institutionId,
    degree_id: filters.degreeId,
    department_id: filters.departmentId,
    program_id: filters.programId,
    semester_id: filters.semesterId,
    limit: HIERARCHY_DROPDOWN_LIMIT
  });

  const levels = [
    {
      key: 'degreeId' as const,
      label: label('Degree'),
      options: (degreesData?.data ?? []).map((d: any) => ({
        id: d.id,
        name: d.degree_name
      })),
      // Degree is the first level below institution, which the parent has
      // already guaranteed.
      disabled: false
    },
    {
      key: 'departmentId' as const,
      label: label('Department'),
      options: (departmentsData?.data ?? []).map((d: any) => ({
        id: d.id,
        name: d.department_name
      })),
      disabled: !filters.degreeId
    },
    {
      key: 'programId' as const,
      label: label('Program'),
      options: (programsData?.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.program_name
      })),
      disabled: !filters.departmentId
    },
    {
      key: 'semesterId' as const,
      label: label('Semester'),
      options: (semestersData?.data ?? []).map((s: any) => ({
        id: s.id,
        name: s.semester_name
      })),
      disabled: !filters.programId
    },
    {
      key: 'sectionId' as const,
      label: label('Section'),
      options: (sectionsData?.data ?? []).map((s: any) => ({
        id: s.id,
        name: s.section_name
      })),
      disabled: !filters.semesterId
    }
  ];

  // Collapsed: summarise what's applied, so an active narrowing is never
  // hidden behind a closed panel (the numbers above would look wrong for no
  // visible reason). Expanded: the selects already show their own values.
  if (!expanded) {
    const applied = levels.filter((level) => filters[level.key]);
    if (applied.length === 0) return null;

    return (
      <div className='flex flex-wrap gap-2 px-3 pb-3'>
        {applied.map((level) => (
          <Badge key={level.key} variant='secondary' className='gap-1'>
            {level.options.find((o) => o.id === filters[level.key])?.name ??
              level.label}
            <Button
              variant='ghost'
              size='sm'
              className='ml-1 h-auto p-0'
              onClick={() => onChange(level.key, undefined)}
            >
              <X className='h-3 w-3' />
            </Button>
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div className='grid grid-cols-1 gap-4 px-3 pb-3 md:grid-cols-3 lg:grid-cols-5'>
      {levels.map((level) => (
        <div key={level.key} className='space-y-2'>
          <Label>{level.label}</Label>
          <Select
            // 'all' sentinel, never '': an empty string is not a valid Radix
            // Select value, and downstream an '' would be sent as a real uuid.
            value={(filters[level.key] as string | undefined) ?? 'all'}
            onValueChange={(value) =>
              onChange(level.key, value === 'all' ? undefined : value)
            }
            disabled={level.disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={`All ${level.label}s`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{`All ${level.label}s`}</SelectItem>
              {level.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

interface DashboardFiltersProps {
  canViewAllInstitutions: boolean;
  institutions: Array<{ id: string; name: string }>;
  userInstitutionId?: string;
  onFiltersChange: (filters: DashboardFilterState) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  /** Bar heading — override when the bar is reused outside the attendance
   *  dashboard (e.g. "Feedback Filters" on the all-college feedback page). */
  title?: string;
  /** Hide the academic-year select for consumers whose data isn't keyed by
   *  academic year (the SCF feedback RPCs take only a date window + college). */
  showAcademicYear?: boolean;
  /** Opt in to the collapsible Degree > Department > Programme > Semester >
   *  Section block. OFF by default: the five lookup queries live in a child
   *  component that only mounts when this is true, so consumers whose RPCs
   *  cannot use these filters (the all-college feedback page) neither render
   *  dead controls nor pay for the fetches. */
  showHierarchy?: boolean;
}

export interface DashboardFilterState {
  selectedDate: Date;
  institutionId?: string;
  academicYearId?: string;
  attendanceDate?: string;
  // Organizational hierarchy, in cascade order beneath institution. Each is
  // forwarded to fn_attendance_dashboard_section_stats as an optional param;
  // undefined means "no narrowing at this level".
  degreeId?: string;
  departmentId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  // Cross-cutting (NOT a hierarchy level): show only first-year learners — those
  // admitted in the institution's current intake. Independent of degree/dept/etc.,
  // so it is deliberately excluded from HIERARCHY_ORDER's cascade clearing.
  firstYearOnly?: boolean;
}

/**
 * Levels below institution, ordered. Used to clear everything *beneath* a
 * changed level so a stale child selection can never survive its parent — the
 * failure mode there is a silently empty dashboard rather than an error.
 */
const HIERARCHY_ORDER: (keyof DashboardFilterState)[] = [
  'degreeId',
  'departmentId',
  'programId',
  'semesterId',
  'sectionId'
];

/**
 * Lookup tables are small but their services page at 10 rows by default, which
 * silently truncates a dropdown into looking like the data is missing.
 */
const HIERARCHY_DROPDOWN_LIMIT = 1000;

/**
 * Project the bar's state onto the shape the data layer takes. Defined here,
 * next to the state type, so the field mapping lives in exactly one place — the
 * stats RPC and the feedback-confirmation rollup both consume it.
 */
export function toHierarchyFilter(
  filters?: DashboardFilterState
): AttendanceHierarchyFilter {
  return {
    degreeId: filters?.degreeId,
    departmentId: filters?.departmentId,
    programId: filters?.programId,
    semesterId: filters?.semesterId,
    sectionId: filters?.sectionId,
    firstYearOnly: filters?.firstYearOnly
  };
}

export function DashboardFilters({
  canViewAllInstitutions,
  institutions,
  userInstitutionId,
  onFiltersChange,
  onRefresh,
  isLoading = false,
  title = 'Attendance Filters',
  showAcademicYear = true,
  showHierarchy = false
}: DashboardFiltersProps) {
  // Filter state
  const [filters, setFilters] = useState<DashboardFilterState>({
    selectedDate: new Date()
  });

  // UI state
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isHierarchyOpen, setIsHierarchyOpen] = useState(false);

  // Academic year state
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);

  const supabase = createClientSupabaseClient();

  // Fetch academic years when institutions change
  useEffect(() => {
    const fetchAcademicYears = async () => {
      if (!showAcademicYear) {
        setAcademicYears([]);
        return;
      }
      setLoadingAcademicYears(true);
      try {
        let query = supabase
          .from('academic_years')
          .select('id, academic_year_name, institution_id, is_active')
          .eq('is_active', true)
          .order('start_date', { ascending: false });

        // Only fetch academic years if an institution is selected or user is not super admin
        const targetInstitutionId = filters.institutionId || userInstitutionId;

        if (!targetInstitutionId) {
          // No institution selected - don't fetch academic years
          setAcademicYears([]);
          setLoadingAcademicYears(false);
          return;
        }

        // Fetch academic years for the selected institution
        query = query.eq('institution_id', targetInstitutionId);

        const { data, error } = await query;

        if (error) {
          logger.error('academic/attendance-dashboard', 'Error fetching academic years', error);
          setAcademicYears([]);
        } else {
          setAcademicYears(data || []);
        }
      } catch (error) {
        logger.error('academic/attendance-dashboard', 'Unexpected error fetching academic years', error);
        setAcademicYears([]);
      } finally {
        setLoadingAcademicYears(false);
      }
    };

    fetchAcademicYears();
  }, [
    filters.institutionId,
    canViewAllInstitutions,
    userInstitutionId,
    institutions,
    supabase,
    showAcademicYear
  ]);

  // Update parent when filters change
  useEffect(() => {
    onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  const updateFilter = (key: keyof DashboardFilterState, value: any) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [key]: value };

      // Institution changed → nothing selected beneath it can still be valid.
      // Academic years, degrees, departments, programmes, semesters and sections
      // all belong to one institution, so carrying a selection across colleges
      // filters on an id the new college does not own: zero rows, no error, and
      // a dashboard that just reads empty. This previously cleared the academic
      // year only on the switch to "All Institutions", which left exactly that
      // stale-id case open when switching from one college to another.
      if (key === 'institutionId') {
        newFilters.academicYearId = undefined;
        HIERARCHY_ORDER.forEach((level) => {
          // cast: `level` widens to keyof DashboardFilterState, whose value
          // union is now heterogeneous (a boolean field exists), so a bare
          // computed-key write of `undefined` types the target as `never`.
          (newFilters as Record<string, unknown>)[level] = undefined;
        });
      }

      // A hierarchy level changed → clear only the levels beneath it, keeping
      // its ancestors (which are still valid) intact.
      const changedLevel = HIERARCHY_ORDER.indexOf(key);
      if (changedLevel !== -1) {
        HIERARCHY_ORDER.slice(changedLevel + 1).forEach((level) => {
          // cast: `level` widens to keyof DashboardFilterState, whose value
          // union is now heterogeneous (a boolean field exists), so a bare
          // computed-key write of `undefined` types the target as `never`.
          (newFilters as Record<string, unknown>)[level] = undefined;
        });
      }

      return newFilters;
    });
  };

  const clearAllFilters = () => {
    setFilters({
      selectedDate: new Date()
    });
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.institutionId) count++;
    if (filters.academicYearId) count++;
    if (showHierarchy) {
      count += HIERARCHY_ORDER.filter((level) => filters[level]).length;
    }
    return count;
  };

  const activeHierarchyCount = showHierarchy
    ? HIERARCHY_ORDER.filter((level) => filters[level]).length
    : 0;

  // Degrees and below are only meaningful once the scope is a single college.
  // A scoped (non-super-admin) user has no institution picker, so their own
  // institution stands in.
  const effectiveInstitutionId = filters.institutionId || userInstitutionId;

  const getFilterDisplayText = () => {
    const parts: string[] = [];

    if (filters.institutionId) {
      const institution = institutions.find(
        (i) => i.id === filters.institutionId
      );
      parts.push(institution?.name || 'Selected Institution');
    } else if (canViewAllInstitutions) {
      parts.push('All Institutions');
    } else {
      parts.push('Institution Data');
    }

    if (filters.academicYearId) {
      const academicYear = academicYears.find(
        (y) => y.id === filters.academicYearId
      );
      parts.push(academicYear?.academic_year_name || 'Selected Academic Year');
    }

    return parts.join(' • ');
  };

  return (
    <Card className='border-0 shadow-lg bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20'>
      <CardHeader className='pb-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <Filter className='h-5 w-5 text-blue-600 dark:text-blue-400' />
            {title}
          </CardTitle>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={onRefresh}
              disabled={isLoading}
              className='gap-2'
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
              Refresh
            </Button>
            {getActiveFiltersCount() > 0 && (
              <Button
                variant='ghost'
                size='sm'
                onClick={clearAllFilters}
                className='text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20'
              >
                <X className='h-4 w-4 mr-1' />
                Clear All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Quick Info Bar */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-blue-200 dark:border-blue-800'>
          <div className='flex flex-wrap items-center gap-2 sm:gap-4 min-w-0'>
            <div className='flex items-center gap-2'>
              <Calendar className='h-4 w-4 text-blue-600 dark:text-blue-400' />
              <span className='text-sm font-medium'>
                {format(filters.selectedDate, 'EEEE, MMM dd, yyyy')}
              </span>
            </div>
            <div className='hidden sm:block h-4 w-px bg-blue-300 dark:bg-blue-700'></div>
            <div className='text-sm text-muted-foreground min-w-0'>
              {getFilterDisplayText()}
            </div>
          </div>

          <Badge
            variant='secondary'
            className='shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
          >
            {getActiveFiltersCount()} filter
            {getActiveFiltersCount() !== 1 ? 's' : ''} active
          </Badge>
        </div>

        {/* Filter Controls */}
        <div
          className={`grid grid-cols-1 gap-4 ${
            filters.institutionId ||
            (!canViewAllInstitutions && userInstitutionId)
              ? 'md:grid-cols-3'
              : canViewAllInstitutions
              ? 'md:grid-cols-2'
              : 'md:grid-cols-2'
          }`}
        >
          {/* Date Picker */}
          <div className='space-y-2'>
            <Label>Date</Label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !filters.selectedDate && 'text-muted-foreground'
                  )}
                >
                  <Calendar className='mr-2 h-4 w-4' />
                  {filters.selectedDate ? (
                    format(filters.selectedDate, 'PPP')
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-auto p-0' align='start'>
                <CalendarComponent
                  mode='single'
                  selected={filters.selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      updateFilter('selectedDate', date);
                      setIsCalendarOpen(false);
                    }
                  }}
                  disabled={(date) =>
                    date > new Date() || date < new Date('2020-01-01')
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Institution Filter (only for super admin) */}
          {canViewAllInstitutions && (
            <div className='space-y-2'>
              <Label className='flex items-center gap-1'>
                <Building2 className='h-3 w-3' />
                Institution
              </Label>
              <Select
                value={filters.institutionId || 'all'}
                onValueChange={(value) =>
                  updateFilter(
                    'institutionId',
                    value === 'all' ? undefined : value
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='All Institutions' />
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
            </div>
          )}

          {/* Academic Year Filter - Only show when institution is selected */}
          {showAcademicYear &&
            (filters.institutionId ||
            (!canViewAllInstitutions && userInstitutionId)) && (
            <div className='space-y-2'>
              <Label className='flex items-center gap-1'>
                <GraduationCap className='h-3 w-3' />
                Academic Year
              </Label>
              <Select
                value={filters.academicYearId || 'all'}
                onValueChange={(value) =>
                  updateFilter(
                    'academicYearId',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={loadingAcademicYears}
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
                  {academicYears.map((academicYear) => (
                    <SelectItem key={academicYear.id} value={academicYear.id}>
                      {academicYear.academic_year_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Advanced Filters — organizational hierarchy beneath institution */}
        {showHierarchy && (
          <div className='rounded-lg border border-blue-200 dark:border-blue-800 bg-white/60 dark:bg-gray-800/60'>
            <Button
              variant='ghost'
              onClick={() => setIsHierarchyOpen(!isHierarchyOpen)}
              className='h-auto w-full justify-between px-3 py-2 hover:bg-transparent'
            >
              <span className='flex items-center gap-2 text-sm font-medium'>
                <Layers className='h-4 w-4 text-blue-600 dark:text-blue-400' />
                Advanced Filters
                {activeHierarchyCount > 0 && (
                  <Badge
                    variant='secondary'
                    className='bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                  >
                    {activeHierarchyCount} active
                  </Badge>
                )}
              </span>
              {isHierarchyOpen ? (
                <ChevronUp className='h-4 w-4 text-muted-foreground' />
              ) : (
                <ChevronDown className='h-4 w-4 text-muted-foreground' />
              )}
            </Button>

            {effectiveInstitutionId ? (
              <>
                <HierarchyFilterFields
                  filters={filters}
                  institutionId={effectiveInstitutionId}
                  expanded={isHierarchyOpen}
                  onChange={updateFilter}
                />
                {isHierarchyOpen && (
                  <div className='flex items-center gap-2 px-3 pb-3'>
                    <Switch
                      id='first-year-only'
                      checked={!!filters.firstYearOnly}
                      onCheckedChange={(checked) =>
                        updateFilter('firstYearOnly', checked)
                      }
                    />
                    <Label
                      htmlFor='first-year-only'
                      className='cursor-pointer text-sm font-normal'
                    >
                      First-year learners only
                      <span className='ml-1 text-xs text-muted-foreground'>
                        (admitted in the current intake — works per institution)
                      </span>
                    </Label>
                  </div>
                )}
              </>
            ) : (
              isHierarchyOpen && (
                <p className='px-3 pb-3 text-sm text-muted-foreground'>
                  Select an institution first — degrees, departments,
                  programmes, semesters and sections all belong to a single
                  institution.
                </p>
              )
            )}
          </div>
        )}

        {/* Active Filters Display */}
        {getActiveFiltersCount() > 0 && (
          <div className='flex flex-wrap gap-2 pt-2 border-t border-blue-200 dark:border-blue-800'>
            <span className='text-xs text-muted-foreground self-center'>
              Active filters:
            </span>

            {filters.institutionId && (
              <Badge variant='secondary' className='gap-1'>
                {institutions.find((i) => i.id === filters.institutionId)?.name}
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-auto p-0 ml-1'
                  onClick={() => updateFilter('institutionId', undefined)}
                >
                  <X className='h-3 w-3' />
                </Button>
              </Badge>
            )}

            {filters.academicYearId && (
              <Badge variant='secondary' className='gap-1'>
                {
                  academicYears.find((y) => y.id === filters.academicYearId)
                    ?.academic_year_name
                }
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-auto p-0 ml-1'
                  onClick={() => updateFilter('academicYearId', undefined)}
                >
                  <X className='h-3 w-3' />
                </Button>
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
