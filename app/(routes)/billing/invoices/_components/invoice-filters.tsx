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
import type { InvoiceFilters, InvoiceType } from '@/types/billing-schedule';

interface InvoiceFiltersProps {
  filters: InvoiceFilters;
  onFilterChange: (filters: Partial<InvoiceFilters>) => void;
}

export function InvoiceFilters({
  filters,
  onFilterChange
}: InvoiceFiltersProps) {
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
      search: undefined,
      institution_id: undefined,
      invoice_type: undefined,
      invoice_date_from: undefined,
      invoice_date_to: undefined,
      billing_period_from: undefined,
      billing_period_to: undefined
    });
  };

  return (
    <div className='space-y-4 mb-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <h3 className='text-lg font-medium'>Filter Invoices</h3>
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

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {/* Search */}
        <div className='space-y-2'>
          <Label htmlFor='search'>Search</Label>
          <Input
            id='search'
            placeholder='Invoice number, description...'
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
          />
        </div>

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
                    : 'Select institution'
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

        {/* Invoice Type */}
        <div className='space-y-2'>
          <Label htmlFor='invoice_type'>Invoice Type</Label>
          <Select
            value={filters.invoice_type || '_all_'}
            onValueChange={(value) =>
              onFilterChange({
                invoice_type:
                  value === '_all_' ? undefined : (value as InvoiceType)
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Select type' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_all_'>All Types</SelectItem>
              <SelectItem value='individual'>Individual</SelectItem>
              <SelectItem value='consolidated'>Consolidated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoice Date From */}
        <div className='space-y-2'>
          <Label htmlFor='invoice_date_from'>Invoice Date From</Label>
          <Input
            id='invoice_date_from'
            type='date'
            value={filters.invoice_date_from || ''}
            onChange={(e) =>
              onFilterChange({ invoice_date_from: e.target.value || undefined })
            }
          />
        </div>

        {/* Invoice Date To */}
        <div className='space-y-2'>
          <Label htmlFor='invoice_date_to'>Invoice Date To</Label>
          <Input
            id='invoice_date_to'
            type='date'
            value={filters.invoice_date_to || ''}
            onChange={(e) =>
              onFilterChange({ invoice_date_to: e.target.value || undefined })
            }
          />
        </div>

        {/* Billing Period From */}
        <div className='space-y-2'>
          <Label htmlFor='billing_period_from'>Billing Period From</Label>
          <Input
            id='billing_period_from'
            type='date'
            value={filters.billing_period_from || ''}
            onChange={(e) =>
              onFilterChange({
                billing_period_from: e.target.value || undefined
              })
            }
          />
        </div>

        {/* Billing Period To */}
        <div className='space-y-2'>
          <Label htmlFor='billing_period_to'>Billing Period To</Label>
          <Input
            id='billing_period_to'
            type='date'
            value={filters.billing_period_to || ''}
            onChange={(e) =>
              onFilterChange({ billing_period_to: e.target.value || undefined })
            }
          />
        </div>
      </div>
    </div>
  );
}
