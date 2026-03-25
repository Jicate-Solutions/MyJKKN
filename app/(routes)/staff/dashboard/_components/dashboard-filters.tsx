'use client';

import { useState, useEffect, useMemo } from 'react';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StaffDashboardFilters } from '@/types/staff';

interface DashboardFiltersProps {
  filters: StaffDashboardFilters;
  onFiltersChange: (filters: StaffDashboardFilters) => void;
  onReset: () => void;
  institutions?: Array<{ id: string; name: string }>;
  departments?: Array<{
    id: string;
    department_name: string;
    institution_id: string;
  }>;
  categories?: Array<{ id: string; category_name: string }>;
  isLoading?: boolean;
}

export function DashboardFilters({
  filters,
  onFiltersChange,
  onReset,
  institutions = [],
  departments = [],
  categories = [],
  isLoading = false
}: DashboardFiltersProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [filteredDepartments, setFilteredDepartments] = useState(departments);

  useEffect(() => {
    if (filters.institutionId) {
      setFilteredDepartments(
        departments.filter(
          (dept) => dept.institution_id === filters.institutionId
        )
      );
    } else {
      setFilteredDepartments(departments);
    }
  }, [filters.institutionId, departments]);

  const updateFilters = (newFilters: Partial<StaffDashboardFilters>) => {
    onFiltersChange({ ...filters, ...newFilters });
  };

  const clearDateRange = () => {
    const { dateRange, ...rest } = filters;
    onFiltersChange(rest);
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.dateRange) count++;
    if (filters.institutionId) count++;
    if (filters.departmentId) count++;
    if (filters.categoryId) count++;
    if (filters.status && filters.status.length > 0) count++;
    return count;
  };

  const activeFiltersCount = useMemo(getActiveFiltersCount, [filters]);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-lg flex items-center gap-2'>
            <Filter className='h-5 w-5' />
            Dashboard Filters
            {activeFiltersCount > 0 && (
              <Badge variant='secondary' className='ml-2'>
                {activeFiltersCount} active
              </Badge>
            )}
          </CardTitle>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? 'Hide' : 'Show'} Filters
            </Button>
            {activeFiltersCount > 0 && (
              <Button variant='outline' size='sm' onClick={onReset}>
                <X className='h-4 w-4 mr-1' />
                Clear All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4'>
            {/* Date Range Filter */}
            <div className='space-y-2'>
              <Label>Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !filters.dateRange && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {filters.dateRange?.from ? (
                      filters.dateRange.to ? (
                        <>
                          {format(filters.dateRange.from, 'LLL dd, y')} -{' '}
                          {format(filters.dateRange.to, 'LLL dd, y')}
                        </>
                      ) : (
                        format(filters.dateRange.from, 'LLL dd, y')
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    initialFocus
                    mode='range'
                    defaultMonth={filters.dateRange?.from}
                    selected={filters.dateRange}
                    onSelect={(range) =>
                      updateFilters({
                        dateRange: range as
                          | { from: Date | undefined; to: Date | undefined }
                          | undefined
                      })
                    }
                    numberOfMonths={2}
                  />
                  {filters.dateRange && (
                    <div className='p-3 border-t'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={clearDateRange}
                        className='w-full'
                      >
                        Clear Date Range
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Institution Filter */}
            <div className='space-y-2'>
              <Label>Institution</Label>
              <Select
                value={filters.institutionId || 'all'}
                onValueChange={(value) =>
                  updateFilters({
                    institutionId: value === 'all' ? undefined : value,
                    // Clear department when institution changes
                    departmentId: undefined
                  })
                }
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select institution' />
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

            {/* Department Filter */}
            <div className='space-y-2'>
              <Label>Department</Label>
              <Select
                value={filters.departmentId || 'all'}
                onValueChange={(value) =>
                  updateFilters({
                    departmentId: value === 'all' ? undefined : value
                  })
                }
                disabled={isLoading || filteredDepartments.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select department' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Departments</SelectItem>
                  {filteredDepartments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className='space-y-2'>
              <Label>Employment Category</Label>
              <Select
                value={filters.categoryId || 'all'}
                onValueChange={(value) =>
                  updateFilters({
                    categoryId: value === 'all' ? undefined : value
                  })
                }
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select category' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.category_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className='space-y-2'>
              <Label>Status</Label>
              <Select
                value={filters.status?.[0] || 'all'}
                onValueChange={(value) => {
                  if (value === 'all') {
                    updateFilters({ status: undefined });
                  } else {
                    updateFilters({ status: [value] });
                  }
                }}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Status</SelectItem>
                  <SelectItem value='active'>Active</SelectItem>
                  <SelectItem value='inactive'>Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Display */}
          {activeFiltersCount > 0 && (
            <div className='pt-4 border-t'>
              <div className='flex items-center gap-2 flex-wrap'>
                <span className='text-sm font-medium text-muted-foreground'>
                  Active filters:
                </span>

                {filters.dateRange && (
                  <Badge variant='secondary' className='gap-1'>
                    Date: {format(filters.dateRange.from!, 'MMM dd')} -{' '}
                    {format(filters.dateRange.to!, 'MMM dd')}
                    <X
                      className='h-3 w-3 cursor-pointer'
                      onClick={clearDateRange}
                    />
                  </Badge>
                )}

                {filters.institutionId && (
                  <Badge variant='secondary' className='gap-1'>
                    Institution:{' '}
                    {
                      institutions.find((i) => i.id === filters.institutionId)
                        ?.name
                    }
                    <X
                      className='h-3 w-3 cursor-pointer'
                      onClick={() =>
                        updateFilters({
                          institutionId: undefined,
                          departmentId: undefined
                        })
                      }
                    />
                  </Badge>
                )}

                {filters.departmentId && (
                  <Badge variant='secondary' className='gap-1'>
                    Department:{' '}
                    {
                      departments.find((d) => d.id === filters.departmentId)
                        ?.department_name
                    }
                    <X
                      className='h-3 w-3 cursor-pointer'
                      onClick={() => updateFilters({ departmentId: undefined })}
                    />
                  </Badge>
                )}

                {filters.categoryId && (
                  <Badge variant='secondary' className='gap-1'>
                    Category:{' '}
                    {
                      categories.find((c) => c.id === filters.categoryId)
                        ?.category_name
                    }
                    <X
                      className='h-3 w-3 cursor-pointer'
                      onClick={() => updateFilters({ categoryId: undefined })}
                    />
                  </Badge>
                )}

                {filters.status && filters.status.length > 0 && (
                  <Badge variant='secondary' className='gap-1'>
                    Status: {filters.status[0]}
                    <X
                      className='h-3 w-3 cursor-pointer'
                      onClick={() => updateFilters({ status: undefined })}
                    />
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
