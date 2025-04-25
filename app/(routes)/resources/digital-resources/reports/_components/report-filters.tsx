'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2, X } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { addMonths, subMonths, format } from 'date-fns';

// Mock digital resources until we implement the actual service
const mockDigitalResources = [
  { id: '1', digital_resource_name: 'MATLAB License' },
  { id: '2', digital_resource_name: 'Science Direct Journal Access' },
  { id: '3', digital_resource_name: 'Adobe Creative Cloud' },
  { id: '4', digital_resource_name: 'Turnitin Subscription' },
  { id: '5', digital_resource_name: 'SPSS Statistics' }
];

interface ReportFiltersProps {
  filters: {
    digital_resource_id?: string;
    start_date?: string | Date;
    end_date?: string | Date;
  };
  onFilterChange: (filters: any) => void;
  onReset: () => void;
}

export function ReportFilters({
  filters,
  onFilterChange,
  onReset
}: ReportFiltersProps) {
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<
    { id: string; digital_resource_name: string }[]
  >([]);
  const [startDate, setStartDate] = useState<Date | null>(
    filters.start_date ? new Date(filters.start_date) : null
  );
  const [endDate, setEndDate] = useState<Date | null>(
    filters.end_date ? new Date(filters.end_date) : null
  );

  useEffect(() => {
    const fetchResources = async () => {
      try {
        setLoading(true);
        // Mock API delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        // In a real implementation, we'd call the service here
        // const result = await DigitalResourceService.getDigitalResources();
        // setResources(result.data);
        setResources(mockDigitalResources);
      } catch (error) {
        console.error('Error fetching digital resources:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, []);

  const handleResourceChange = (value: string) => {
    onFilterChange({
      digital_resource_id: value === 'all_resources' ? undefined : value
    });
  };

  const handleStartDateChange = (date: Date | null) => {
    setStartDate(date);
    onFilterChange({
      start_date: date ? date.toISOString() : undefined
    });
  };

  const handleEndDateChange = (date: Date | null) => {
    setEndDate(date);
    onFilterChange({
      end_date: date ? date.toISOString() : undefined
    });
  };

  // Date range presets for quick selection
  const applyDateRangePreset = (preset: string) => {
    const today = new Date();
    let start: Date | null = null;
    let end: Date | null = today;

    switch (preset) {
      case 'last_month':
        start = subMonths(today, 1);
        break;
      case 'last_3_months':
        start = subMonths(today, 3);
        break;
      case 'last_6_months':
        start = subMonths(today, 6);
        break;
      case 'year_to_date':
        start = new Date(today.getFullYear(), 0, 1); // Jan 1 of current year
        break;
      case 'clear':
        start = null;
        end = null;
        break;
    }

    setStartDate(start);
    setEndDate(end);

    onFilterChange({
      start_date: start ? start.toISOString() : undefined,
      end_date: end ? end.toISOString() : undefined
    });
  };

  return (
    <div className='bg-muted/40 rounded-lg p-4'>
      <div className='flex justify-between items-center mb-4'>
        <h3 className='text-sm font-semibold'>Filter Reports</h3>
        <Button
          variant='ghost'
          size='sm'
          onClick={onReset}
          className='h-8 px-2 text-xs'
        >
          <X className='mr-1 h-3 w-3' />
          Reset All
        </Button>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {/* Resource Filter */}
        <div className='space-y-2'>
          <Label htmlFor='resource'>Digital Resource</Label>
          {loading ? (
            <div className='flex items-center space-x-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span className='text-sm text-muted-foreground'>Loading...</span>
            </div>
          ) : (
            <Select
              value={filters.digital_resource_id || 'all_resources'}
              onValueChange={handleResourceChange}
            >
              <SelectTrigger id='resource'>
                <SelectValue placeholder='All Resources' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all_resources'>All Resources</SelectItem>
                {resources.map((resource) => (
                  <SelectItem key={resource.id} value={resource.id}>
                    {resource.digital_resource_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Date Range Filters */}
        <div className='space-y-2'>
          <Label htmlFor='start-date'>Start Date</Label>
          <DatePicker date={startDate} setDate={handleStartDateChange} />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='end-date'>End Date</Label>
          <DatePicker date={endDate} setDate={handleEndDateChange} />
        </div>
      </div>

      {/* Date Range Presets */}
      <div className='mt-4 flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='text-xs h-7'
          onClick={() => applyDateRangePreset('last_month')}
        >
          Last Month
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='text-xs h-7'
          onClick={() => applyDateRangePreset('last_3_months')}
        >
          Last 3 Months
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='text-xs h-7'
          onClick={() => applyDateRangePreset('last_6_months')}
        >
          Last 6 Months
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='text-xs h-7'
          onClick={() => applyDateRangePreset('year_to_date')}
        >
          Year to Date
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='text-xs h-7'
          onClick={() => applyDateRangePreset('clear')}
        >
          Clear Dates
        </Button>
      </div>
    </div>
  );
}
