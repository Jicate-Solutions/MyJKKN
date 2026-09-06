'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import {
  BILLING_ACTION_TYPES,
  BILLING_ACTION_LABELS,
  BILLING_RESOURCE_TYPES,
  BILLING_RESOURCE_LABELS
} from '@/types/billing-activity';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';

export interface BillingActivityFilterValues {
  search: string;
  action_type: string;
  resource_type: string;
  institution_id: string;
  date_from: string;
  date_to: string;
}

export const DEFAULT_FILTERS: BillingActivityFilterValues = {
  search: '',
  action_type: '',
  resource_type: '',
  institution_id: '',
  date_from: '',
  date_to: ''
};

interface BillingActivityFiltersProps {
  value: BillingActivityFilterValues;
  onChange: (filters: BillingActivityFilterValues) => void;
}

export function BillingActivityFilters({
  value,
  onChange
}: BillingActivityFiltersProps) {
  const { isSuperAdmin } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();

  const showInstitutionFilter =
    isSuperAdmin || (institutions && institutions.length > 1);

  const hasActiveFilters =
    value.search !== '' ||
    value.action_type !== '' ||
    value.resource_type !== '' ||
    value.institution_id !== '' ||
    value.date_from !== '' ||
    value.date_to !== '';

  const update = (partial: Partial<BillingActivityFilterValues>) => {
    onChange({ ...value, ...partial });
  };

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search description...'
            value={value.search}
            onChange={(e) => update({ search: e.target.value })}
            className='pl-9 h-9'
          />
        </div>

        {/* Action Type */}
        <Select
          value={value.action_type || '__all__'}
          onValueChange={(v) =>
            update({ action_type: v === '__all__' ? '' : v })
          }
        >
          <SelectTrigger className='h-9'>
            <SelectValue placeholder='All Actions' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='__all__'>All Actions</SelectItem>
            {BILLING_ACTION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {BILLING_ACTION_LABELS[type] || type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Resource Type */}
        <Select
          value={value.resource_type || '__all__'}
          onValueChange={(v) =>
            update({ resource_type: v === '__all__' ? '' : v })
          }
        >
          <SelectTrigger className='h-9'>
            <SelectValue placeholder='All Resources' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='__all__'>All Resources</SelectItem>
            {BILLING_RESOURCE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {BILLING_RESOURCE_LABELS[type] || type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Institution */}
        {showInstitutionFilter && (
          <Select
            value={value.institution_id || '__all__'}
            onValueChange={(v) =>
              update({ institution_id: v === '__all__' ? '' : v })
            }
          >
            <SelectTrigger className='h-9'>
              <SelectValue placeholder='All Institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='__all__'>All Institutions</SelectItem>
              {(institutions || []).map((inst: any) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Date range row */}
      <div className='flex flex-wrap items-center gap-3'>
        <div className='flex items-center gap-2'>
          <span className='text-sm text-muted-foreground whitespace-nowrap'>From</span>
          <Input
            type='date'
            value={value.date_from}
            onChange={(e) => update({ date_from: e.target.value })}
            className='h-9 w-[160px]'
          />
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-sm text-muted-foreground whitespace-nowrap'>To</span>
          <Input
            type='date'
            value={value.date_to}
            onChange={(e) => update({ date_to: e.target.value })}
            className='h-9 w-[160px]'
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => onChange(DEFAULT_FILTERS)}
            className='h-9 text-muted-foreground'
          >
            <X className='mr-1 h-4 w-4' />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
