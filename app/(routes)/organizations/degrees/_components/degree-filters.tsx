// app/(routes)/organizations/degrees/_components/degree-filters.tsx

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeFilters as DegreeFilterType } from '@/types/organizations';

interface DegreeFiltersProps {
  filters: DegreeFilterType;
  onFilterChange: (filters: Partial<DegreeFilterType>) => void;
}

export function DegreeFilters({ filters, onFilterChange }: DegreeFiltersProps) {
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
      <div className='grid gap-4 md:grid-cols-3'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search degrees...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-9'
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
          <SelectTrigger>
            <SelectValue placeholder='Select institution' />
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
          value={filters.degree_type || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              degree_type: value === 'all' ? undefined : (value as 'ug' | 'pg')
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Types</SelectItem>
            <SelectItem value='ug'>UG</SelectItem>
            <SelectItem value='pg'>PG</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
