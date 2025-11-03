'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { AdmissionAnalyticsFilters } from '@/types/admission';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface AnalyticsFiltersProps {
  filters: AdmissionAnalyticsFilters;
  onFiltersChange: (filters: AdmissionAnalyticsFilters) => void;
}

export function AnalyticsFilters({
  filters,
  onFiltersChange
}: AnalyticsFiltersProps) {
  const supabase = createClientSupabaseClient();

  // All data state
  const [allInstitutions, setAllInstitutions] = useState<Array<{ id: string; name: string }>>([]);
  const [allDegrees, setAllDegrees] = useState<Array<{ id: string; degree_name: string; institution_id: string }>>([]);
  const [allDepartments, setAllDepartments] = useState<Array<{ id: string; department_name: string; degree_id: string; institution_id: string }>>([]);
  const [allPrograms, setAllPrograms] = useState<Array<{ id: string; program_name: string; department_id: string; degree_id: string; institution_id: string }>>([]);
  const [allStates, setAllStates] = useState<string[]>([]);
  const [allDistricts, setAllDistricts] = useState<Array<{ district: string; state: string }>>([]);

  // Filtered data state
  const [filteredDegrees, setFilteredDegrees] = useState<Array<{ id: string; degree_name: string }>>([]);
  const [filteredDepartments, setFilteredDepartments] = useState<Array<{ id: string; department_name: string }>>([]);
  const [filteredPrograms, setFilteredPrograms] = useState<Array<{ id: string; program_name: string }>>([]);
  const [filteredDistricts, setFilteredDistricts] = useState<string[]>([]);

  // Date range state
  const [dateFrom, setDateFrom] = useState<Date | undefined>(filters.dateRange?.from);
  const [dateTo, setDateTo] = useState<Date | undefined>(filters.dateRange?.to);

  // Load all filter options once on mount
  useEffect(() => {
    loadAllFilterOptions();
  }, []);

  // Apply hierarchical filtering when parent selections change
  useEffect(() => {
    applyHierarchicalFiltering();
  }, [filters.institution_id, filters.degree_id, filters.department_id, filters.state, allDegrees, allDepartments, allPrograms, allDistricts]);

  const loadAllFilterOptions = async () => {
    try {
      // Load all institutions
      const { data: institutionsData } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');

      if (institutionsData) {
        setAllInstitutions(institutionsData);
      }

      // Load all degrees with institution_id
      const { data: degreesData } = await supabase
        .from('degrees')
        .select('id, degree_name, institution_id')
        .order('degree_name');

      if (degreesData) {
        setAllDegrees(degreesData);
      }

      // Load all departments with degree_id and institution_id
      const { data: departmentsData } = await supabase
        .from('departments')
        .select('id, department_name, degree_id, institution_id')
        .order('department_name');

      if (departmentsData) {
        setAllDepartments(departmentsData);
      }

      // Load all programs with department_id, degree_id, and institution_id
      const { data: programsData } = await supabase
        .from('programs')
        .select('id, program_name, department_id, degree_id, institution_id')
        .order('program_name');

      if (programsData) {
        setAllPrograms(programsData);
      }

      // Load all unique states from admissions
      const { data: statesData } = await supabase
        .from('admissions')
        .select('permanent_address_state')
        .not('permanent_address_state', 'is', null)
        .order('permanent_address_state');

      if (statesData) {
        const uniqueStates = [...new Set(statesData.map(item => item.permanent_address_state).filter(Boolean))];
        setAllStates(uniqueStates);
      }

      // Load all unique districts with their states from admissions
      const { data: districtsData } = await supabase
        .from('admissions')
        .select('permanent_address_district, permanent_address_state')
        .not('permanent_address_district', 'is', null)
        .not('permanent_address_state', 'is', null);

      if (districtsData) {
        // Create unique district-state pairs
        const districtMap = new Map<string, string>();
        districtsData.forEach(item => {
          if (item.permanent_address_district && item.permanent_address_state) {
            districtMap.set(item.permanent_address_district, item.permanent_address_state);
          }
        });

        const uniqueDistricts = Array.from(districtMap.entries())
          .map(([district, state]) => ({ district, state }))
          .sort((a, b) => a.district.localeCompare(b.district));

        setAllDistricts(uniqueDistricts);
      }
    } catch (error) {
      console.error('[analytics-filters] Error loading filter options:', error);
    }
  };

  const applyHierarchicalFiltering = () => {
    // Filter degrees based on selected institution
    if (filters.institution_id) {
      const filtered = allDegrees.filter((d) => d.institution_id === filters.institution_id);
      setFilteredDegrees(filtered);
    } else {
      setFilteredDegrees(allDegrees);
    }

    // Filter departments based on selected institution and degree
    if (filters.degree_id) {
      const filtered = allDepartments.filter((d) => d.degree_id === filters.degree_id);
      setFilteredDepartments(filtered);
    } else if (filters.institution_id) {
      const filtered = allDepartments.filter((d) => d.institution_id === filters.institution_id);
      setFilteredDepartments(filtered);
    } else {
      setFilteredDepartments(allDepartments);
    }

    // Filter programs based on selected department, degree, or institution
    if (filters.department_id) {
      const filtered = allPrograms.filter((p) => p.department_id === filters.department_id);
      setFilteredPrograms(filtered);
    } else if (filters.degree_id) {
      const filtered = allPrograms.filter((p) => p.degree_id === filters.degree_id);
      setFilteredPrograms(filtered);
    } else if (filters.institution_id) {
      const filtered = allPrograms.filter((p) => p.institution_id === filters.institution_id);
      setFilteredPrograms(filtered);
    } else {
      setFilteredPrograms(allPrograms);
    }

    // Filter districts based on selected state
    if (filters.state) {
      const filtered = allDistricts.filter((d) => d.state === filters.state);
      setFilteredDistricts(filtered.map(d => d.district));
    } else {
      setFilteredDistricts(allDistricts.map(d => d.district));
    }
  };

  const handleFilterChange = (key: keyof AdmissionAnalyticsFilters, value: any) => {
    // When institution changes, reset dependent filters
    if (key === 'institution_id') {
      onFiltersChange({
        ...filters,
        institution_id: value,
        degree_id: undefined,
        department_id: undefined,
        program_id: undefined
      });
    }
    // When degree changes, reset dependent filters
    else if (key === 'degree_id') {
      onFiltersChange({
        ...filters,
        degree_id: value,
        department_id: undefined,
        program_id: undefined
      });
    }
    // When department changes, reset dependent filters
    else if (key === 'department_id') {
      onFiltersChange({
        ...filters,
        department_id: value,
        program_id: undefined
      });
    }
    // When state changes, reset district filter
    else if (key === 'state') {
      onFiltersChange({
        ...filters,
        state: value,
        district: undefined
      });
    }
    // For other filters, just update normally
    else {
      onFiltersChange({
        ...filters,
        [key]: value
      });
    }
  };

  const handleDateRangeChange = () => {
    if (dateFrom && dateTo) {
      onFiltersChange({
        ...filters,
        dateRange: { from: dateFrom, to: dateTo }
      });
    }
  };

  const handleClearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    onFiltersChange({});
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Institution Filter */}
        <div className="space-y-2">
          <Label>Institution</Label>
          <Select
            value={filters.institution_id || 'all'}
            onValueChange={(value) =>
              handleFilterChange('institution_id', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All Institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Institutions</SelectItem>
              {allInstitutions.map((institution) => (
                <SelectItem key={institution.id} value={institution.id}>
                  {institution.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Degree Filter */}
        <div className="space-y-2">
          <Label>Degree</Label>
          <Select
            value={filters.degree_id || 'all'}
            onValueChange={(value) =>
              handleFilterChange('degree_id', value === 'all' ? undefined : value)
            }
            disabled={filteredDegrees.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={filteredDegrees.length === 0 ? 'No degrees available' : 'All Degrees'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Degrees</SelectItem>
              {filteredDegrees.map((degree) => (
                <SelectItem key={degree.id} value={degree.id}>
                  {degree.degree_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Department Filter */}
        <div className="space-y-2">
          <Label>Department</Label>
          <Select
            value={filters.department_id || 'all'}
            onValueChange={(value) =>
              handleFilterChange('department_id', value === 'all' ? undefined : value)
            }
            disabled={filteredDepartments.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={filteredDepartments.length === 0 ? 'No departments available' : 'All Departments'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {filteredDepartments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.department_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Program Filter */}
        <div className="space-y-2">
          <Label>Program</Label>
          <Select
            value={filters.program_id || 'all'}
            onValueChange={(value) =>
              handleFilterChange('program_id', value === 'all' ? undefined : value)
            }
            disabled={filteredPrograms.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={filteredPrograms.length === 0 ? 'No programs available' : 'All Programs'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              {filteredPrograms.map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.program_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              handleFilterChange('status', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="waitlisted">Waitlisted</SelectItem>
              <SelectItem value="enrolled">Enrolled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced Geography Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* State Filter */}
        <div className="space-y-2">
          <Label>State</Label>
          <Select
            value={filters.state || 'all'}
            onValueChange={(value) =>
              handleFilterChange('state', value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {allStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* District Filter */}
        <div className="space-y-2">
          <Label>District</Label>
          <Select
            value={filters.district || 'all'}
            onValueChange={(value) =>
              handleFilterChange('district', value === 'all' ? undefined : value)
            }
            disabled={filteredDistricts.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                filteredDistricts.length === 0
                  ? 'No districts available'
                  : filters.state
                  ? `Districts in ${filters.state}`
                  : 'All Districts'
              } />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Districts</SelectItem>
              {filteredDistricts.map((district) => (
                <SelectItem key={district} value={district}>
                  {district}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>From Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[240px] justify-start text-left font-normal',
                  !dateFrom && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>To Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[240px] justify-start text-left font-normal',
                  !dateTo && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <Button
          onClick={handleDateRangeChange}
          disabled={!dateFrom || !dateTo}
        >
          Apply Date Range
        </Button>

        {hasActiveFilters && (
          <Button
            variant="outline"
            onClick={handleClearFilters}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Clear All Filters
          </Button>
        )}
      </div>
    </div>
  );
}
