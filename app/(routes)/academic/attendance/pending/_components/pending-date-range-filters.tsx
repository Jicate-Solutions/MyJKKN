'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  Filter,
  X
} from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { cn } from '@/lib/utils';
import type { DashboardFilters } from '@/types/attendance-dashboard';

interface ActiveFilterBadge {
  key: keyof DashboardFilters;
  label: string;
}

interface PendingDateRangeFiltersProps {
  filters: DashboardFilters;
  onFiltersChange: (partial: Partial<DashboardFilters>) => void;
  onReset: () => void;
  // Role flags
  isSuperAdmin: boolean;
  isHOD: boolean;
  isFaculty: boolean;
  // User's own institution (for locking department for HOD)
  userInstitutionId?: string;
  userDepartmentId?: string; // HOD's own department — pre-filled and locked
  userDepartmentName?: string; // HOD's department display name — avoids depending on query state
  // Timetable options (populated by Task 8b hook, empty array for now)
  timetables?: Array<{ id: string; name: string; academicYearId?: string }>;
}

// Helper to build a local YYYY-MM-DD string without timezone shift
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function PendingDateRangeFilters({
  filters,
  onFiltersChange,
  onReset,
  isSuperAdmin,
  isHOD,
  isFaculty,
  userInstitutionId,
  userDepartmentId,
  userDepartmentName,
  timetables = []
}: PendingDateRangeFiltersProps) {
  const [expanded, setExpanded] = useState(true);
  const [startCalendarOpen, setStartCalendarOpen] = useState(false);
  const [endCalendarOpen, setEndCalendarOpen] = useState(false);

  // Effective institution for hierarchy queries
  const effectiveInstitutionId = isSuperAdmin
    ? filters.institutionId
    : userInstitutionId;

  // ── Hierarchy hooks ──────────────────────────────────────────────────────
  // Gate institutions fetch to Super Admin only — non-super-admin roles don't need the list
  const { institutions } = useInstitutionsWithAccess({ autoFetch: isSuperAdmin });

  const { academicYears } = useAcademicYearsByInstitution(
    effectiveInstitutionId || undefined
  );

  const { data: degreesData } = useDegrees({
    institution_id: effectiveInstitutionId || undefined
  });
  const degrees = degreesData?.data ?? [];

  const { data: departmentsData } = useDepartments({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filters.degreeId || undefined
  });
  const departments = departmentsData?.data ?? [];

  const { data: programsData } = usePrograms({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filters.degreeId || undefined,
    department_id: filters.departmentId || undefined
  });
  const programs = programsData?.data ?? [];

  // Gate semesters — only fire when a program is selected
  const { data: semestersData } = useSemesters(
    { program_id: filters.programId || undefined },
    { enabled: !!filters.programId }
  );
  const semesters = semestersData?.data ?? [];

  // Gate sections — only fire when a semester is selected
  const { data: sectionsData } = useSections(
    { semester_id: filters.semesterId || undefined },
    { enabled: !!filters.semesterId }
  );
  const sections = sectionsData?.data ?? [];

  // ── Quick date helpers ───────────────────────────────────────────────────
  const today = toLocalDateString(new Date());
  const sevenDaysAgo = toLocalDateString(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
  );

  // ── Date picker handlers ─────────────────────────────────────────────────
  const handleStartDateSelect = (date: Date | undefined) => {
    if (date) {
      onFiltersChange({ startDate: toLocalDateString(date) });
      setStartCalendarOpen(false);
    }
  };

  const handleEndDateSelect = (date: Date | undefined) => {
    if (date) {
      onFiltersChange({ endDate: toLocalDateString(date) });
      setEndCalendarOpen(false);
    }
  };

  // ── Active filter badges ─────────────────────────────────────────────────
  const activeFilters: ActiveFilterBadge[] = [];

  if (filters.startDate) {
    activeFilters.push({
      key: 'startDate',
      label: `From: ${format(new Date(filters.startDate + 'T00:00:00'), 'dd MMM yyyy')}`
    });
  }
  if (filters.endDate) {
    activeFilters.push({
      key: 'endDate',
      label: `To: ${format(new Date(filters.endDate + 'T00:00:00'), 'dd MMM yyyy')}`
    });
  }
  if (filters.institutionId && isSuperAdmin) {
    const instName =
      institutions.find((i: any) => i.id === filters.institutionId)?.name ??
      'Institution';
    activeFilters.push({ key: 'institutionId', label: instName });
  }
  if (filters.academicYearId) {
    const yearName =
      academicYears.find((y) => y.id === filters.academicYearId)
        ?.academic_year_name ?? 'Academic Year';
    activeFilters.push({ key: 'academicYearId', label: yearName });
  }
  if (filters.degreeId && !isFaculty) {
    const degreeName =
      degrees.find((d: any) => d.id === filters.degreeId)?.degree_name ??
      'Degree';
    activeFilters.push({ key: 'degreeId', label: degreeName });
  }
  if (filters.departmentId && !isFaculty && !isHOD) {
    const deptName =
      departments.find((d: any) => d.id === filters.departmentId)
        ?.department_name ?? 'Department';
    activeFilters.push({ key: 'departmentId', label: deptName });
  }
  if (filters.programId && !isFaculty) {
    const progName =
      programs.find((p: any) => p.id === filters.programId)?.program_name ??
      'Program';
    activeFilters.push({ key: 'programId', label: progName });
  }
  if (filters.semesterId && !isFaculty) {
    const semName =
      semesters.find((s: any) => s.id === filters.semesterId)?.semester_name ??
      'Semester';
    activeFilters.push({ key: 'semesterId', label: semName });
  }
  if (filters.sectionId && !isFaculty) {
    const secName =
      sections.find((s: any) => s.id === filters.sectionId)?.section_name ??
      'Section';
    activeFilters.push({ key: 'sectionId', label: secName });
  }
  if (filters.timetableId) {
    const timetableName =
      timetables.find((t) => t.id === filters.timetableId)?.name ??
      'Timetable';
    activeFilters.push({ key: 'timetableId', label: timetableName });
  }

  // ── Cascade-clear map for badge dismissal ───────────────────────────────
  // Clearing a parent filter must also clear all downstream filters that depend on it.
  const cascadeClearMap: Record<string, Partial<DashboardFilters>> = {
    institutionId: {
      institutionId: undefined,
      academicYearId: undefined,
      degreeId: undefined,
      departmentId: undefined,
      programId: undefined,
      semesterId: undefined,
      sectionId: undefined,
      timetableId: undefined
    },
    degreeId: {
      degreeId: undefined,
      departmentId: undefined,
      programId: undefined,
      semesterId: undefined,
      sectionId: undefined,
      timetableId: undefined
    },
    departmentId: {
      departmentId: undefined,
      programId: undefined,
      semesterId: undefined,
      sectionId: undefined,
      timetableId: undefined
    },
    programId: {
      programId: undefined,
      semesterId: undefined,
      sectionId: undefined,
      timetableId: undefined
    },
    semesterId: {
      semesterId: undefined,
      sectionId: undefined,
      timetableId: undefined
    },
    sectionId: { sectionId: undefined, timetableId: undefined },
    timetableId: { timetableId: undefined },
    academicYearId: { academicYearId: undefined },
    startDate: { startDate: undefined },
    endDate: { endDate: undefined }
  };

  // ── Render helpers ───────────────────────────────────────────────────────
  const disableFutureDates = (date: Date) => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return date > endOfToday;
  };

  return (
    <div className="space-y-3">
      {/* ── Collapsible filter card ──────────────────────────────────────── */}
      <Card>
        <CardHeader
          className="cursor-pointer flex flex-row items-center justify-between py-3 px-4"
          onClick={() => setExpanded(!expanded)}
        >
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0 pb-4 px-4">
            <div className="space-y-4">
              {/* ── Row 1: Date range + quick buttons + (Institution / Academic Year) ── */}
              <div className="flex flex-wrap gap-3 items-end">
                {/* Date From */}
                <div className="space-y-1 min-w-[160px]">
                  <Label className="text-xs">Date From</Label>
                  <Popover
                    open={startCalendarOpen}
                    onOpenChange={setStartCalendarOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !filters.startDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {filters.startDate
                          ? format(
                              new Date(filters.startDate + 'T00:00:00'),
                              'dd MMM yyyy'
                            )
                          : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          filters.startDate
                            ? new Date(filters.startDate + 'T00:00:00')
                            : undefined
                        }
                        onSelect={handleStartDateSelect}
                        initialFocus
                        disabled={disableFutureDates}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Date To */}
                <div className="space-y-1 min-w-[160px]">
                  <Label className="text-xs">Date To</Label>
                  <Popover
                    open={endCalendarOpen}
                    onOpenChange={setEndCalendarOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !filters.endDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {filters.endDate
                          ? format(
                              new Date(filters.endDate + 'T00:00:00'),
                              'dd MMM yyyy'
                            )
                          : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          filters.endDate
                            ? new Date(filters.endDate + 'T00:00:00')
                            : undefined
                        }
                        onSelect={handleEndDateSelect}
                        initialFocus
                        disabled={disableFutureDates}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Quick buttons */}
                <div className="flex gap-2 pb-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onFiltersChange({ startDate: today, endDate: today })
                    }
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onFiltersChange({
                        startDate: sevenDaysAgo,
                        endDate: today
                      })
                    }
                  >
                    Last 7 Days
                  </Button>
                </div>

                {/* Institution — Super Admin only */}
                {isSuperAdmin && (
                  <div className="space-y-1 min-w-[180px]">
                    <Label className="text-xs">Institution</Label>
                    <Select
                      value={filters.institutionId || undefined}
                      onValueChange={(value) =>
                        onFiltersChange({
                          institutionId: value,
                          academicYearId: undefined,
                          degreeId: undefined,
                          departmentId: undefined,
                          programId: undefined,
                          semesterId: undefined,
                          sectionId: undefined,
                          timetableId: undefined
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select institution" />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map((inst: any) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Academic Year */}
                <div className="space-y-1 min-w-[160px]">
                  <Label className="text-xs">Academic Year</Label>
                  <Select
                    value={filters.academicYearId || undefined}
                    onValueChange={(value) =>
                      onFiltersChange({ academicYearId: value })
                    }
                    disabled={!effectiveInstitutionId}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((year) => (
                        <SelectItem key={year.id} value={year.id}>
                          {year.academic_year_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Row 2: Hierarchy (hidden for faculty) ────────────────────────── */}
              {!isFaculty && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {/* Degree */}
                  <div className="space-y-1">
                    <Label className="text-xs">Degree</Label>
                    <Select
                      value={filters.degreeId || undefined}
                      onValueChange={(value) =>
                        onFiltersChange({
                          degreeId: value,
                          departmentId: undefined,
                          programId: undefined,
                          semesterId: undefined,
                          sectionId: undefined,
                          timetableId: undefined
                        })
                      }
                      disabled={!effectiveInstitutionId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All degrees" />
                      </SelectTrigger>
                      <SelectContent>
                        {degrees.map((degree: any) => (
                          <SelectItem key={degree.id} value={degree.id}>
                            {degree.degree_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Department */}
                  <div className="space-y-1">
                    <Label className="text-xs">Department</Label>
                    {isHOD ? (
                      // HOD: department pre-filled and locked.
                      // Prefer the directly-passed userDepartmentName so the label is always
                      // correct regardless of whether the departments query has loaded or is
                      // scoped by a degree filter.
                      <div className="flex items-center h-9 px-3 py-2 text-sm border border-input bg-muted text-muted-foreground rounded-md">
                        {userDepartmentName ??
                          departments.find(
                            (d: any) => d.id === userDepartmentId
                          )?.department_name ??
                          'Your Department'}
                      </div>
                    ) : (
                      <Select
                        value={filters.departmentId || undefined}
                        onValueChange={(value) =>
                          onFiltersChange({
                            departmentId: value,
                            programId: undefined,
                            semesterId: undefined,
                            sectionId: undefined,
                            timetableId: undefined
                          })
                        }
                        disabled={!filters.degreeId}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="All departments" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            new Map(
                              departments.map((d: any) => [d.department_name, d])
                            ).values()
                          ).map((dept: any) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.department_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Program */}
                  <div className="space-y-1">
                    <Label className="text-xs">Program</Label>
                    <Select
                      value={filters.programId || undefined}
                      onValueChange={(value) =>
                        onFiltersChange({
                          programId: value,
                          semesterId: undefined,
                          sectionId: undefined,
                          timetableId: undefined
                        })
                      }
                      disabled={!filters.departmentId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All programs" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          new Map(
                            programs.map((p: any) => [p.program_name, p])
                          ).values()
                        ).map((prog: any) => (
                          <SelectItem key={prog.id} value={prog.id}>
                            {prog.program_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Semester */}
                  <div className="space-y-1">
                    <Label className="text-xs">Semester</Label>
                    <Select
                      value={filters.semesterId || undefined}
                      onValueChange={(value) =>
                        onFiltersChange({
                          semesterId: value,
                          sectionId: undefined,
                          timetableId: undefined
                        })
                      }
                      disabled={!filters.programId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All semesters" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          new Map(
                            semesters.map((s: any) => [s.semester_name, s])
                          ).values()
                        ).map((sem: any) => (
                          <SelectItem key={sem.id} value={sem.id}>
                            {sem.semester_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Section */}
                  <div className="space-y-1">
                    <Label className="text-xs">Section</Label>
                    <Select
                      value={filters.sectionId || undefined}
                      onValueChange={(value) =>
                        onFiltersChange({
                          sectionId:
                            value === 'all_sections' ? undefined : value,
                          timetableId: undefined
                        })
                      }
                      disabled={!filters.semesterId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All sections" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_sections">
                          All Sections
                        </SelectItem>
                        {Array.from(
                          new Map(
                            sections.map((s: any) => [s.section_name, s])
                          ).values()
                        ).map((sec: any) => (
                          <SelectItem key={sec.id} value={sec.id}>
                            {sec.section_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* ── Row 3: Timetable ─────────────────────────────────────────────── */}
              <div className="flex gap-3">
                <div className="space-y-1 min-w-[200px]">
                  <Label className="text-xs">Timetable</Label>
                  <Select
                    value={filters.timetableId || undefined}
                    onValueChange={(value) =>
                      onFiltersChange({ timetableId: value })
                    }
                    disabled={timetables.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          timetables.length === 0
                            ? 'No timetables'
                            : 'All timetables'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {timetables.map((tt) => (
                        <SelectItem key={tt.id} value={tt.id}>
                          {tt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Active filter badges — always visible below card ──────────────── */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {filter.label}
              <button
                onClick={() =>
                  onFiltersChange(
                    cascadeClearMap[filter.key] ?? { [filter.key]: undefined }
                  )
                }
                className="ml-0.5 rounded hover:bg-secondary-foreground/10"
                aria-label={`Remove ${filter.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset All
          </Button>
        </div>
      )}
    </div>
  );
}
