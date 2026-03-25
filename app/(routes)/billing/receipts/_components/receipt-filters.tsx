'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import type { Institution } from '@/types/organizations';
import type { ReceiptFilters } from '@/types/billing-schedule';

interface ReceiptFiltersProps {
  filters: ReceiptFilters;
  onFilterChange: (filters: Partial<ReceiptFilters>) => void;
}

export function ReceiptFilters({
  filters,
  onFilterChange
}: ReceiptFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);

  useEffect(() => {
    loadInstitutions();
  }, []);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      const institutionNames = await OrganizationService.getInstitutionNames(
        true
      );
      setInstitutions(institutionNames as Institution[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: '',
      institution_id: undefined,
      payment_mode: undefined,
      receipt_date_from: undefined,
      receipt_date_to: undefined,
      amount_from: undefined,
      amount_to: undefined,
      payer_name: undefined
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.institution_id ||
    filters.payment_mode ||
    filters.receipt_date_from ||
    filters.receipt_date_to ||
    filters.amount_from ||
    filters.amount_to ||
    filters.payer_name;

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
          <Input
            placeholder='Search receipts...'
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className='pl-10'
          />
        </div>

        {/* Institution Filter */}
        <Select
          value={filters.institution_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              institution_id: value === 'all' ? undefined : value
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
            <SelectItem value='all'>All institutions</SelectItem>
            {institutions.map((institution) => (
              <SelectItem key={institution.id} value={institution.id}>
                {institution.name} ({institution.counselling_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Payment Mode Filter */}
        <Select
          value={filters.payment_mode || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              payment_mode: value === 'all' ? undefined : (value as any)
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All payment modes' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All payment modes</SelectItem>
            <SelectItem value='cash'>Cash</SelectItem>
            <SelectItem value='online'>Online</SelectItem>
            <SelectItem value='bank_transfer'>Bank Transfer</SelectItem>
            <SelectItem value='dd'>DD</SelectItem>
            <SelectItem value='cheque'>Cheque</SelectItem>
          </SelectContent>
        </Select>

        {/* Payer Name */}
        <Input
          placeholder='Payer name...'
          value={filters.payer_name || ''}
          onChange={(e) => onFilterChange({ payer_name: e.target.value })}
        />

        {/* Receipt Date From */}
        <Input
          type='date'
          placeholder='Receipt date from'
          value={filters.receipt_date_from || ''}
          onChange={(e) =>
            onFilterChange({ receipt_date_from: e.target.value })
          }
        />

        {/* Receipt Date To */}
        <Input
          type='date'
          placeholder='Receipt date to'
          value={filters.receipt_date_to || ''}
          onChange={(e) => onFilterChange({ receipt_date_to: e.target.value })}
        />

        {/* Amount From */}
        <Input
          type='number'
          placeholder='Amount from'
          value={filters.amount_from || ''}
          onChange={(e) =>
            onFilterChange({
              amount_from: parseFloat(e.target.value) || undefined
            })
          }
        />

        {/* Amount To */}
        <Input
          type='number'
          placeholder='Amount to'
          value={filters.amount_to || ''}
          onChange={(e) =>
            onFilterChange({
              amount_to: parseFloat(e.target.value) || undefined
            })
          }
        />
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className='flex justify-end'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleClearFilters}
            className='h-8'
          >
            <X className='mr-2 h-4 w-4' />
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}
