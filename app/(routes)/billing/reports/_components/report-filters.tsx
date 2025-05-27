'use client';

import { useState, useEffect } from 'react';
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
import { X } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import type { Institution } from '@/types/organizations';
import type { BillingReportFilters } from '@/types/billing-schedule';

type ReportType = NonNullable<BillingReportFilters['report_type']>;

interface ReportFiltersProps {
  filters: BillingReportFilters;
  onFilterChange: (filters: Partial<BillingReportFilters>) => void;
}

export function ReportFilters({ filters, onFilterChange }: ReportFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);

  useEffect(() => {
    loadInstitutions();
  }, []);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      const data = await OrganizationService.getInstitutionNames(true);
      setInstitutions(data as Institution[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const handleClearFilters = () => {
    onFilterChange({
      institution_id: undefined,
      department_id: undefined,
      student_id: undefined,
      date_from: undefined,
      date_to: undefined,
      report_type: undefined
    });
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <h3 className='text-lg font-medium'>Report Filters</h3>
        <Button
          variant='outline'
          size='sm'
          onClick={handleClearFilters}
          className='text-muted-foreground'
        >
          <X className='h-4 w-4 mr-1' />
          Clear Filters
        </Button>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* Institution */}
        <div className='space-y-2'>
          <Label htmlFor='institution'>Institution</Label>
          <Select
            value={filters.institution_id || '_all_'}
            onValueChange={(value) =>
              onFilterChange({
                institution_id: value === '_all_' ? undefined : value
              })
            }
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  isLoadingInstitutions
                    ? 'Loading institutions...'
                    : 'All institutions'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_all_'>All Institutions</SelectItem>
              {institutions.map((institution) => (
                <SelectItem key={institution.id} value={institution.id}>
                  {institution.name} ({institution.counselling_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date From */}
        <div className='space-y-2'>
          <Label htmlFor='date_from'>Date From</Label>
          <Input
            id='date_from'
            type='date'
            value={filters.date_from || ''}
            onChange={(e) =>
              onFilterChange({ date_from: e.target.value || undefined })
            }
          />
        </div>

        {/* Date To */}
        <div className='space-y-2'>
          <Label htmlFor='date_to'>Date To</Label>
          <Input
            id='date_to'
            type='date'
            value={filters.date_to || ''}
            onChange={(e) =>
              onFilterChange({ date_to: e.target.value || undefined })
            }
          />
        </div>

        {/* Report Type */}
        <div className='space-y-2'>
          <Label htmlFor='report_type'>Report Type</Label>
          <Select
            value={filters.report_type || '_all_'}
            onValueChange={(value) =>
              onFilterChange({
                report_type:
                  value === '_all_' ? undefined : (value as ReportType)
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='All report types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_all_'>All Types</SelectItem>
              <SelectItem value='summary'>Summary</SelectItem>
              <SelectItem value='detailed'>Detailed</SelectItem>
              <SelectItem value='outstanding'>Outstanding</SelectItem>
              <SelectItem value='collection'>Collection</SelectItem>
              <SelectItem value='invoice'>Invoice</SelectItem>
              <SelectItem value='discount'>Discount</SelectItem>
              <SelectItem value='refund'>Refund</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
