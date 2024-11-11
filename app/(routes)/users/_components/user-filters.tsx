'use client';

import { useCallback } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { INSTITUTIONS, ROLE_LABELS } from '@/lib/constants/profile';
import { useDebounce } from '@/hooks/use-debounce';
import type { UserFilters } from '@/types/users';

interface UserFiltersProps {
  filters: UserFilters;
  onFilterChange: (filters: Partial<UserFilters>) => void;
}

export function UserFilters({ filters, onFilterChange }: UserFiltersProps) {
  const debouncedSearch = useDebounce((value: string) => {
    onFilterChange({ search: value });
  }, 300);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  const handleRoleChange = (value: string) => {
    onFilterChange({ role: value === 'all' ? undefined : (value as any) });
  };

  const handleInstitutionChange = (value: string) => {
    onFilterChange({
      institution: value === 'all' ? undefined : (value as any)
    });
  };

  const handleStatusChange = (value: string) => {
    onFilterChange({
      isActive: value === 'all' ? undefined : value === 'active'
    });
  };

  return (
    <div className='mb-6 space-y-4'>
      <div className='grid gap-4 md:grid-cols-4'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search users...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-10'
          />
        </div>

        <Select value={filters.role || 'all'} onValueChange={handleRoleChange}>
          <SelectTrigger>
            <SelectValue placeholder='Filter by role' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.institution || 'all'}
          onValueChange={handleInstitutionChange}
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by institution' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Institutions</SelectItem>
            {INSTITUTIONS.map((inst) => (
              <SelectItem key={inst.value} value={inst.value}>
                {inst.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={
            filters.isActive === undefined
              ? 'all'
              : filters.isActive
              ? 'active'
              : 'inactive'
          }
          onValueChange={handleStatusChange}
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
