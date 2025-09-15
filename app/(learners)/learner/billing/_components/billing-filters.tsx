'use client';

import { useState, useEffect } from 'react';
import { Calendar, Filter, X, Search, Download, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Slider } from '@/components/ui/slider';
import type { LearnerBillingFilters } from '@/types/learner-billing';
import { formatCurrency } from '@/lib/utils';

interface BillingFiltersProps {
  filters: LearnerBillingFilters;
  onFilterChange: (filters: Partial<LearnerBillingFilters>) => void;
  onExport?: () => void;
  loading?: boolean;
}

export function BillingFilters({
  filters,
  onFilterChange,
  onExport,
  loading = false
}: BillingFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [amountRange, setAmountRange] = useState([0, 100000]);

  useEffect(() => {
    if (filters.amount_range) {
      setAmountRange([filters.amount_range.min, filters.amount_range.max]);
    }
  }, [filters.amount_range]);

  const handleAmountRangeChange = (values: number[]) => {
    setAmountRange(values);
    onFilterChange({
      amount_range: {
        min: values[0],
        max: values[1]
      }
    });
  };

  const handleDateRangeChange = (range: any) => {
    if (range?.from && range?.to) {
      onFilterChange({
        date_range: {
          from: range.from.toISOString().split('T')[0],
          to: range.to.toISOString().split('T')[0]
        }
      });
    } else {
      onFilterChange({
        date_range: undefined
      });
    }
  };

  const clearFilters = () => {
    setAmountRange([0, 100000]);
    onFilterChange({
      status: 'all',
      category_id: undefined,
      date_range: undefined,
      amount_range: undefined,
      payment_mode: undefined,
      view_mode: 'current_semester'
    });
    setIsOpen(false);
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.status && filters.status !== 'all') count++;
    if (filters.category_id) count++;
    if (filters.date_range) count++;
    if (
      filters.amount_range &&
      (filters.amount_range.min > 0 || filters.amount_range.max < 100000)
    )
      count++;
    if (filters.payment_mode) count++;
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <div className='bg-gradient-to-r from-green-50 via-gray-50 to-yellow-50 rounded-2xl border border-green-200 shadow-lg backdrop-blur-sm'>
      <div className='flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between p-4 sm:p-6'>
        <div className='flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center flex-1 w-full lg:w-auto'>
          {/* Quick View Mode Selector */}
          <div className='flex items-center gap-2 min-w-0 flex-shrink-0'>
            <Label className='text-xs sm:text-sm font-medium whitespace-nowrap text-[#0b6d41]'>
              View:
            </Label>
            <Select
              value={filters.view_mode}
              onValueChange={(value: any) =>
                onFilterChange({ view_mode: value })
              }
            >
              <SelectTrigger className='w-32 sm:w-40 bg-white/80 backdrop-blur-sm border-green-200 shadow-sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='current_semester'>
                  Current Semester
                </SelectItem>
                <SelectItem value='academic_year'>Academic Year</SelectItem>
                <SelectItem value='all'>All Time</SelectItem>
                <SelectItem value='custom'>Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quick Status Filter */}
          <div className='flex items-center gap-2 min-w-0 flex-shrink-0'>
            <Label className='text-xs sm:text-sm font-medium whitespace-nowrap text-[#0b6d41]'>
              Status:
            </Label>
            <Select
              value={filters.status || 'all'}
              onValueChange={(value: any) => onFilterChange({ status: value })}
            >
              <SelectTrigger className='w-28 sm:w-36 bg-white/80 backdrop-blur-sm border-green-200 shadow-sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Bills</SelectItem>
                <SelectItem value='paid'>Paid</SelectItem>
                <SelectItem value='unpaid'>Unpaid</SelectItem>
                <SelectItem value='overdue'>Overdue</SelectItem>
                <SelectItem value='partially_paid'>Partially Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Advanced Filters Popover */}
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                className='relative bg-white/80 backdrop-blur-sm border-green-200 text-[#0b6d41] hover:bg-green-50 shadow-sm text-xs sm:text-sm'
              >
                <Filter className='h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2' />
                <span className='hidden sm:inline'>Advanced </span>Filters
                {activeFiltersCount > 0 && (
                  <Badge
                    variant='destructive'
                    className='absolute -top-2 -right-2 h-4 w-4 sm:h-5 sm:w-5 rounded-full p-0 flex items-center justify-center text-xs bg-red-500 text-white border-2 border-white'
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-96 p-6' align='start'>
              <div className='space-y-6'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>Advanced Filters</h3>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setIsOpen(false)}
                  >
                    <X className='h-4 w-4' />
                  </Button>
                </div>

                {/* Date Range */}
                {filters.view_mode === 'custom' && (
                  <div className='space-y-2'>
                    <Label>Date Range</Label>
                    <DatePickerWithRange
                      onChange={handleDateRangeChange}
                      className='w-full'
                    />
                  </div>
                )}

                {/* Amount Range */}
                <div className='space-y-3'>
                  <Label>Amount Range</Label>
                  <div className='px-3'>
                    <Slider
                      value={amountRange}
                      onValueChange={handleAmountRangeChange}
                      max={100000}
                      min={0}
                      step={1000}
                      className='w-full'
                    />
                  </div>
                  <div className='flex justify-between text-sm text-gray-600'>
                    <span>{formatCurrency(amountRange[0])}</span>
                    <span>{formatCurrency(amountRange[1])}</span>
                  </div>
                </div>

                {/* Payment Mode */}
                <div className='space-y-2'>
                  <Label>Payment Mode</Label>
                  <Select
                    value={filters.payment_mode || 'all'}
                    onValueChange={(value) =>
                      onFilterChange({
                        payment_mode: value === 'all' ? undefined : value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='All payment methods' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All payment methods</SelectItem>
                      <SelectItem value='cash'>Cash</SelectItem>
                      <SelectItem value='online'>Online</SelectItem>
                      <SelectItem value='bank_transfer'>
                        Bank Transfer
                      </SelectItem>
                      <SelectItem value='dd'>Demand Draft</SelectItem>
                      <SelectItem value='cheque'>Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Category Filter */}
                <div className='space-y-2'>
                  <Label>Category</Label>
                  <Select
                    value={filters.category_id || 'all'}
                    onValueChange={(value) =>
                      onFilterChange({
                        category_id: value === 'all' ? undefined : value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='All categories' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All categories</SelectItem>
                      <SelectItem value='tuition'>Tuition Fees</SelectItem>
                      <SelectItem value='hostel'>Hostel Fees</SelectItem>
                      <SelectItem value='transport'>Transport</SelectItem>
                      <SelectItem value='library'>Library</SelectItem>
                      <SelectItem value='exam'>Examination</SelectItem>
                      <SelectItem value='other'>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Buttons */}
                <div className='flex gap-2 pt-4'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={clearFilters}
                    className='flex-1'
                  >
                    <X className='h-4 w-4 mr-2' />
                    Clear All
                  </Button>
                  <Button
                    size='sm'
                    onClick={() => setIsOpen(false)}
                    className='flex-1'
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Action Buttons */}
        <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto'>
          {/* Export Button */}
          {onExport && (
            <Button
              variant='outline'
              size='sm'
              onClick={onExport}
              disabled={loading}
              className='whitespace-nowrap bg-white/80 backdrop-blur-sm border-green-200 text-[#0b6d41] hover:bg-green-50 shadow-sm text-xs sm:text-sm flex-1 sm:flex-initial'
            >
              <Download className='h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2' />
              Export
            </Button>
          )}

          {/* Notification Settings */}
          <Button
            variant='outline'
            size='sm'
            className='whitespace-nowrap bg-white/80 backdrop-blur-sm border-green-200 text-[#0b6d41] hover:bg-green-50 shadow-sm text-xs sm:text-sm flex-1 sm:flex-initial'
          >
            <Bell className='h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2' />
            Alerts
          </Button>
        </div>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className='border-t border-green-200 pt-4 px-4 sm:px-6 pb-2'>
          <div className='flex flex-wrap gap-2'>
            {filters.status && filters.status !== 'all' && (
              <Badge
                variant='secondary'
                className='capitalize bg-green-100 text-[#0b6d41] border-green-200 hover:bg-green-200 transition-colors'
              >
                {filters.status}
                <X
                  className='h-3 w-3 ml-1 cursor-pointer hover:text-green-900'
                  onClick={() => onFilterChange({ status: 'all' })}
                />
              </Badge>
            )}
            {filters.payment_mode && (
              <Badge
                variant='secondary'
                className='bg-[#ffde59]/30 text-black border-yellow-200 hover:bg-[#ffde59]/50 transition-colors'
              >
                {filters.payment_mode}
                <X
                  className='h-3 w-3 ml-1 cursor-pointer hover:text-gray-900'
                  onClick={() => onFilterChange({ payment_mode: undefined })}
                />
              </Badge>
            )}
            {filters.date_range && (
              <Badge
                variant='secondary'
                className='bg-green-100 text-[#0b6d41] border-green-200 hover:bg-green-200 transition-colors'
              >
                Custom Date Range
                <X
                  className='h-3 w-3 ml-1 cursor-pointer hover:text-green-900'
                  onClick={() => onFilterChange({ date_range: undefined })}
                />
              </Badge>
            )}
            {filters.amount_range &&
              (filters.amount_range.min > 0 ||
                filters.amount_range.max < 100000) && (
                <Badge
                  variant='secondary'
                  className='bg-[#ffde59]/30 text-black border-yellow-200 hover:bg-[#ffde59]/50 transition-colors text-xs sm:text-sm'
                >
                  {formatCurrency(filters.amount_range.min)} -{' '}
                  {formatCurrency(filters.amount_range.max)}
                  <X
                    className='h-3 w-3 ml-1 cursor-pointer hover:text-gray-900'
                    onClick={() => onFilterChange({ amount_range: undefined })}
                  />
                </Badge>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
