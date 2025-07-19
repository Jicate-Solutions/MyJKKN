'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import { OrganizationService } from '@/lib/services/organization/organization-service';
import { CourseFilters as CourseFilterType } from '@/types/organizations';
import { useDebounce } from '@/hooks/use-debounce';

interface CourseFiltersProps {
  filters: CourseFilterType;
  onFilterChange: (filters: Partial<CourseFilterType>) => void;
}

export function CourseFilters({ filters, onFilterChange }: CourseFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      }
    }
    loadInstitutions();
  }, []);

  const debouncedSearch = useDebounce((value: string) => {
    onFilterChange({ search: value });
  }, 300);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 w-full md:grid-cols-2'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search courses by code or name...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-9'
          />
        </div>

        <div className='flex items-center justify-between gap-2 w-full'>
          <Select
            value={filters.institution_id || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                institution_id: value === 'all' ? undefined : value
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Select institution' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
