'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
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
import type { BillingCategoryFilters } from '@/types/billing';

interface BillingCategoryFiltersProps {
  filters: BillingCategoryFilters;
  onFilterChange: (filters: Partial<BillingCategoryFilters>) => void;
}

export function BillingCategoryFiltersBar({
  filters,
  onFilterChange
}: BillingCategoryFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);

  useEffect(() => {
    OrganizationService.getInstitutionNames(true)
      .then((list) => setInstitutions(list as Institution[]))
      .catch((err) =>
        console.error('[billing/categories/filters] institutions:', err)
      );
  }, []);

  return (
    <div className='flex flex-col md:flex-row gap-3 mb-4'>
      <div className='relative flex-1'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Search categories...'
          className='pl-9'
          value={filters.search || ''}
          onChange={(e) => onFilterChange({ search: e.target.value })}
        />
      </div>

      <Select
        value={filters.institution_id || 'all'}
        onValueChange={(value) =>
          onFilterChange({
            institution_id: value === 'all' ? undefined : value
          })
        }
      >
        <SelectTrigger className='w-full md:w-[220px]'>
          <SelectValue placeholder='All Institutions' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All Institutions</SelectItem>
          {institutions.map((inst) => (
            <SelectItem key={inst.id} value={inst.id}>
              {inst.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.frequency || 'all'}
        onValueChange={(value) =>
          onFilterChange({
            frequency: value === 'all' ? undefined : (value as any)
          })
        }
      >
        <SelectTrigger className='w-full md:w-[160px]'>
          <SelectValue placeholder='Frequency' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All Frequencies</SelectItem>
          <SelectItem value='one-time'>One-time</SelectItem>
          <SelectItem value='monthly'>Monthly</SelectItem>
          <SelectItem value='quarterly'>Quarterly</SelectItem>
          <SelectItem value='yearly'>Yearly</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={
          filters.isActive === undefined
            ? 'all'
            : filters.isActive
            ? 'true'
            : 'false'
        }
        onValueChange={(value) =>
          onFilterChange({
            isActive: value === 'all' ? undefined : value === 'true'
          })
        }
      >
        <SelectTrigger className='w-full md:w-[140px]'>
          <SelectValue placeholder='Status' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All Status</SelectItem>
          <SelectItem value='true'>Active</SelectItem>
          <SelectItem value='false'>Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
