'use client';

import { useState, useEffect } from 'react';
import {
  Calendar,
  Filter,
  X,
  RefreshCw,
  Building2,
  GraduationCap
} from 'lucide-react';
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

interface AcademicYear {
  id: string;
  academic_year_name: string;
  institution_id: string;
  is_active: boolean;
}

interface DashboardFiltersProps {
  canViewAllInstitutions: boolean;
  institutions: Array<{ id: string; name: string }>;
  userInstitutionId?: string;
  onFiltersChange: (filters: DashboardFilterState) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export interface DashboardFilterState {
  selectedDate: Date;
  institutionId?: string;
  academicYearId?: string;
  attendanceDate?: string;
}

export function DashboardFilters({
  canViewAllInstitutions,
  institutions,
  userInstitutionId,
  onFiltersChange,
  onRefresh,
  isLoading = false
}: DashboardFiltersProps) {
  // Filter state
  const [filters, setFilters] = useState<DashboardFilterState>({
    selectedDate: new Date()
  });

  // UI state
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Academic year state
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);

  const supabase = createClientSupabaseClient();

  // Fetch academic years when institutions change
  useEffect(() => {
    const fetchAcademicYears = async () => {
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
          console.error('Error fetching academic years:', error);
          setAcademicYears([]);
        } else {
          setAcademicYears(data || []);
        }
      } catch (error) {
        console.error('Unexpected error fetching academic years:', error);
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
    supabase
  ]);

  // Update parent when filters change
  useEffect(() => {
    onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  const updateFilter = (key: keyof DashboardFilterState, value: any) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [key]: value };

      // Clear academic year when institution changes to undefined (All Institutions)
      if (key === 'institutionId' && value === undefined) {
        newFilters.academicYearId = undefined;
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
    return count;
  };

  const getFilterDisplayText = () => {
    const parts = [];

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
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <Filter className='h-5 w-5 text-blue-600 dark:text-blue-400' />
            Attendance Filters
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
                className='text-red-600 hover:text-red-700 hover:bg-red-50'
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
        <div className='flex items-center justify-between p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-blue-200 dark:border-blue-800'>
          <div className='flex items-center gap-4'>
            <div className='flex items-center gap-2'>
              <Calendar className='h-4 w-4 text-blue-600' />
              <span className='text-sm font-medium'>
                {format(filters.selectedDate, 'EEEE, MMM dd, yyyy')}
              </span>
            </div>
            <div className='h-4 w-px bg-blue-300 dark:bg-blue-700'></div>
            <div className='text-sm text-muted-foreground'>
              {getFilterDisplayText()}
            </div>
          </div>

          <Badge
            variant='secondary'
            className='bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
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
          {(filters.institutionId ||
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
