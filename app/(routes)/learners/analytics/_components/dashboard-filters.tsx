// ============================================
// DASHBOARD FILTERS - COMPREHENSIVE
// ============================================
// Created: 2025-01-23
// Purpose: Advanced filtering with cascading dropdowns
// Features: Institution, Academic Hierarchy, Status, Demographics, Date Range
// ============================================

'use client';

import { useState, useEffect } from 'react';
import { subDays } from 'date-fns';
import { Filter, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { LearnerDashboardFilters, LifecycleStatus } from '@/types/learner-dashboard';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface DashboardFiltersProps {
  filters: LearnerDashboardFilters;
  onFiltersChange: (filters: LearnerDashboardFilters) => void;
  onReset: () => void;
  canAccessAllInstitutions: boolean;
  accessibleInstitutionIds: string[];
}

export function DashboardFilters({
  filters,
  onFiltersChange,
  onReset,
  canAccessAllInstitutions,
  accessibleInstitutionIds
}: DashboardFiltersProps) {
  const supabase = createClientSupabaseClient();

  // Local state for cascading filters
  const [selectedInstitutionIds, setSelectedInstitutionIds] = useState<string[]>(
    filters.institutionIds || []
  );
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>(
    filters.academicYearId
  );
  const [selectedDegreeId, setSelectedDegreeId] = useState<string | undefined>(
    filters.degreeId
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | undefined>(
    filters.departmentId
  );
  const [selectedProgramId, setSelectedProgramId] = useState<string | undefined>(
    filters.programId
  );
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | undefined>(
    filters.semesterId
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>(
    filters.sectionId
  );
  const [selectedStatuses, setSelectedStatuses] = useState<LifecycleStatus[]>(
    filters.lifecycleStatuses || []
  );
  const [selectedProfileComplete, setSelectedProfileComplete] = useState<string>(
    filters.isProfileComplete === undefined ? 'all' : filters.isProfileComplete ? 'complete' : 'incomplete'
  );
  const [selectedGender, setSelectedGender] = useState<string>(
    filters.gender || 'all'
  );
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(
    filters.dateRange || {}
  );

  // Sync filters prop changes to local state (fixes reset button and external filter updates)
  useEffect(() => {
    setSelectedInstitutionIds(filters.institutionIds || []);
    setSelectedAcademicYearId(filters.academicYearId);
    setSelectedDegreeId(filters.degreeId);
    setSelectedDepartmentId(filters.departmentId);
    setSelectedProgramId(filters.programId);
    setSelectedSemesterId(filters.semesterId);
    setSelectedSectionId(filters.sectionId);
    setSelectedStatuses(filters.lifecycleStatuses || []);
    setSelectedProfileComplete(
      filters.isProfileComplete === undefined ? 'all' :
      filters.isProfileComplete ? 'complete' : 'incomplete'
    );
    setSelectedGender(filters.gender || 'all');
    setDateRange(filters.dateRange || {});
  }, [filters]);

  // Fetch institutions
  const { data: institutions = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['institutions', accessibleInstitutionIds],
    queryFn: async () => {
      let query = supabase
        .from('institutions')
        .select('id, name')
        .order('name');

      if (!canAccessAllInstitutions) {
        query = query.in('id', accessibleInstitutionIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: canAccessAllInstitutions || accessibleInstitutionIds.length > 0
  });

  // Fetch academic years
  const { data: academicYears = [] } = useQuery<{ id: string; academic_year_name: string; is_active: boolean }[]>({
    queryKey: ['academic_years'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, academic_year_name, is_active')
        .order('academic_year_name', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch degrees (STRICT CASCADE: Only load when specific institution is selected)
  const { data: degrees = [] } = useQuery<{ id: string; degree_name: string; institution_id: string }[]>({
    queryKey: ['degrees', selectedInstitutionIds],
    queryFn: async () => {
      let query = supabase
        .from('degrees')
        .select('id, degree_name, institution_id')
        .order('degree_name');

      // STRICT HIERARCHY: Only show degrees for selected institutions
      if (selectedInstitutionIds.length > 0) {
        query = query.in('institution_id', selectedInstitutionIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    // STRICT: Degrees only load when a specific institution is selected
    // Even super admins must select institution first to see degrees
    enabled: selectedInstitutionIds.length > 0
  });

  // Fetch departments (filtered by degree if selected)
  const { data: departments = [] } = useQuery<{ id: string; department_name: string; degree_id: string }[]>({
    queryKey: ['departments', selectedDegreeId],
    queryFn: async () => {
      let query = supabase
        .from('departments')
        .select('id, department_name, degree_id')
        .order('department_name');

      if (selectedDegreeId) {
        query = query.eq('degree_id', selectedDegreeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedDegreeId
  });

  // Fetch programs (filtered by department if selected)
  const { data: programs = [] } = useQuery<{ id: string; program_name: string; department_id: string }[]>({
    queryKey: ['programs', selectedDepartmentId],
    queryFn: async () => {
      let query = supabase
        .from('programs')
        .select('id, program_name, department_id')
        .order('program_name');

      if (selectedDepartmentId) {
        query = query.eq('department_id', selectedDepartmentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedDepartmentId
  });

  // Fetch semesters
  const { data: semesters = [] } = useQuery<{ id: string; semester_name: string; semester_code: string }[]>({
    queryKey: ['semesters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('semesters')
        .select('id, semester_name, semester_code')
        .order('semester_code');
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch sections (filtered by semester if selected)
  const { data: sections = [] } = useQuery<{ id: string; section_name: string; semester_id: string }[]>({
    queryKey: ['sections', selectedSemesterId],
    queryFn: async () => {
      let query = supabase
        .from('sections')
        .select('id, section_name, semester_id')
        .order('section_name');

      if (selectedSemesterId) {
        query = query.eq('semester_id', selectedSemesterId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedSemesterId
  });

  // Lifecycle statuses
  const lifecycleStatuses: { value: LifecycleStatus; label: string }[] = [
    { value: 'enquiry', label: 'Enquiries' },
    { value: 'pending', label: 'Pending Approval' },
    { value: 'approved', label: 'Approved' },
    { value: 'active', label: 'Active Students' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'graduated', label: 'Graduated' },
    { value: 'exited', label: 'Exited' }
  ];

  // Apply filters
  const applyFilters = () => {
    const newFilters: LearnerDashboardFilters = {
      institutionIds: selectedInstitutionIds.length > 0 ? selectedInstitutionIds : undefined,
      academicYearId: selectedAcademicYearId,
      degreeId: selectedDegreeId,
      departmentId: selectedDepartmentId,
      programId: selectedProgramId,
      semesterId: selectedSemesterId,
      sectionId: selectedSectionId,
      lifecycleStatuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      isProfileComplete: selectedProfileComplete === 'all' ? undefined : selectedProfileComplete === 'complete',
      gender: selectedGender === 'all' ? undefined : (selectedGender as 'male' | 'female' | 'other'),
      dateRange: dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined
    };

    onFiltersChange(newFilters);
  };

  // Quick date range presets
  const setQuickDateRange = (preset: string) => {
    const today = new Date();
    let from: Date, to: Date;

    switch (preset) {
      case 'last_7_days':
        from = subDays(today, 7);
        to = today;
        break;
      case 'last_30_days':
        from = subDays(today, 30);
        to = today;
        break;
      case 'last_90_days':
        from = subDays(today, 90);
        to = today;
        break;
      case 'this_year':
        from = new Date(today.getFullYear(), 0, 1);
        to = today;
        break;
      default:
        return;
    }

    setDateRange({ from, to });
  };

  // Cascade reset logic
  useEffect(() => {
    // When institutions change, reset downstream filters
    if (selectedInstitutionIds.length === 0) {
      setSelectedDegreeId(undefined);
      setSelectedDepartmentId(undefined);
      setSelectedProgramId(undefined);
    }
  }, [selectedInstitutionIds]);

  useEffect(() => {
    // When degree changes, reset downstream filters
    if (!selectedDegreeId) {
      setSelectedDepartmentId(undefined);
      setSelectedProgramId(undefined);
    }
  }, [selectedDegreeId]);

  useEffect(() => {
    // When department changes, reset downstream filters
    if (!selectedDepartmentId) {
      setSelectedProgramId(undefined);
    }
  }, [selectedDepartmentId]);

  useEffect(() => {
    // When semester changes, reset downstream filters
    if (!selectedSemesterId) {
      setSelectedSectionId(undefined);
    }
  }, [selectedSemesterId]);

  // Count active filters
  const activeFilterCount = [
    selectedInstitutionIds.length > 0,
    selectedAcademicYearId,
    selectedDegreeId,
    selectedDepartmentId,
    selectedProgramId,
    selectedSemesterId,
    selectedSectionId,
    selectedStatuses.length > 0,
    selectedProfileComplete !== 'all',
    selectedGender !== 'all',
    dateRange.from && dateRange.to
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Advanced Filters</h3>
          {activeFilterCount > 0 && (
            <span className="text-sm text-muted-foreground">
              ({activeFilterCount} active)
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <X className="h-4 w-4 mr-2" />
          Reset All
        </Button>
      </div>

      {/* Filter Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Date Range */}
        <div className="space-y-2">
          <Label>Date Range</Label>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dateRange.from && 'text-muted-foreground'
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateRange.from && dateRange.to
                    ? `${format(dateRange.from, 'MMM dd')} - ${format(dateRange.to, 'MMM dd, yyyy')}`
                    : 'Pick a date range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 space-y-2 border-b">
                  <p className="text-sm font-medium">Quick Select</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('last_7_days')}
                    >
                      Last 7 days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('last_30_days')}
                    >
                      Last 30 days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('last_90_days')}
                    >
                      Last 90 days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('this_year')}
                    >
                      This year
                    </Button>
                  </div>
                </div>
                <CalendarComponent
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range: any) => setDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Institution Filter - Show for all users */}
        <div className="space-y-2">
          <Label>Institution</Label>
          <Select
            value={selectedInstitutionIds[0] || 'all'}
            onValueChange={(value) =>
              setSelectedInstitutionIds(value === 'all' ? [] : [value])
            }
            disabled={institutions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                canAccessAllInstitutions ? "All Institutions" : "Select Institution"
              } />
            </SelectTrigger>
            <SelectContent>
              {canAccessAllInstitutions && <SelectItem value="all">All Institutions</SelectItem>}
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Academic Year */}
        <div className="space-y-2">
          <Label>Academic Year</Label>
          <Select
            value={selectedAcademicYearId || 'all'}
            onValueChange={(value) =>
              setSelectedAcademicYearId(value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {academicYears.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.academic_year_name}
                  {year.is_active && ' (Active)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Degree */}
        <div className="space-y-2">
          <Label>Degree</Label>
          <Select
            value={selectedDegreeId || 'all'}
            onValueChange={(value) =>
              setSelectedDegreeId(value === 'all' ? undefined : value)
            }
            disabled={degrees.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Degrees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Degrees</SelectItem>
              {degrees.map((degree) => (
                <SelectItem key={degree.id} value={degree.id}>
                  {degree.degree_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Department */}
        <div className="space-y-2">
          <Label>Department</Label>
          <Select
            value={selectedDepartmentId || 'all'}
            onValueChange={(value) =>
              setSelectedDepartmentId(value === 'all' ? undefined : value)
            }
            disabled={departments.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.department_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Program */}
        <div className="space-y-2">
          <Label>Program</Label>
          <Select
            value={selectedProgramId || 'all'}
            onValueChange={(value) =>
              setSelectedProgramId(value === 'all' ? undefined : value)
            }
            disabled={programs.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Programs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              {programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.program_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Semester */}
        <div className="space-y-2">
          <Label>Semester</Label>
          <Select
            value={selectedSemesterId || 'all'}
            onValueChange={(value) =>
              setSelectedSemesterId(value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All Semesters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Semesters</SelectItem>
              {semesters.map((sem) => (
                <SelectItem key={sem.id} value={sem.id}>
                  {sem.semester_name} ({sem.semester_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Section */}
        <div className="space-y-2">
          <Label>Section</Label>
          <Select
            value={selectedSectionId || 'all'}
            onValueChange={(value) =>
              setSelectedSectionId(value === 'all' ? undefined : value)
            }
            disabled={sections.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sections.map((sec) => (
                <SelectItem key={sec.id} value={sec.id}>
                  {sec.section_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Profile Completion */}
        <div className="space-y-2">
          <Label>Profile Completion</Label>
          <RadioGroup
            value={selectedProfileComplete}
            onValueChange={setSelectedProfileComplete}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="pc-all" />
              <Label htmlFor="pc-all" className="font-normal">All</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="complete" id="pc-complete" />
              <Label htmlFor="pc-complete" className="font-normal">Complete</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="incomplete" id="pc-incomplete" />
              <Label htmlFor="pc-incomplete" className="font-normal">Incomplete</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label>Gender</Label>
          <RadioGroup
            value={selectedGender}
            onValueChange={setSelectedGender}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="gender-all" />
              <Label htmlFor="gender-all" className="font-normal">All</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="male" id="gender-male" />
              <Label htmlFor="gender-male" className="font-normal">Male</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="female" id="gender-female" />
              <Label htmlFor="gender-female" className="font-normal">Female</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      {/* Lifecycle Status Checkboxes */}
      <div className="space-y-2">
        <Label>Lifecycle Status</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {lifecycleStatuses.map((status) => (
            <div key={status.value} className="flex items-center space-x-2">
              <Checkbox
                id={`status-${status.value}`}
                checked={selectedStatuses.includes(status.value)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedStatuses([...selectedStatuses, status.value]);
                  } else {
                    setSelectedStatuses(selectedStatuses.filter((s) => s !== status.value));
                  }
                }}
              />
              <Label
                htmlFor={`status-${status.value}`}
                className="text-sm font-normal cursor-pointer"
              >
                {status.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Apply Button */}
      <div className="flex justify-end">
        <Button onClick={applyFilters}>
          <Filter className="h-4 w-4 mr-2" />
          Apply Filters
        </Button>
      </div>
    </div>
  );
}
