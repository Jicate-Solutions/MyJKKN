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
import { usePermissions } from '@/hooks/use-permissions';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { SectionFilters as SectionFilterType } from '@/types/organizations';

interface SectionFiltersProps {
  filters: SectionFilterType;
  onFilterChange: (filters: Partial<SectionFilterType>) => void;
}

export function SectionFilters({
  filters,
  onFilterChange
}: SectionFiltersProps) {
  const [institutions, setInstitutions] = useState<
    { id: string; name: string; counselling_code: string }[]
  >([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);

  const { isSuperAdmin, userProfile } = usePermissions();

  const debouncedSearch = useDebounce((value: string) => {
    onFilterChange({ search: value });
  }, 300);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  // Fetch institutions for dropdown (only for super admin)
  useEffect(() => {
    const fetchInstitutions = async () => {
      if (!isSuperAdmin) {
        setLoadingInstitutions(false);
        return;
      }

      try {
        setLoadingInstitutions(true);
        const institutionNames = await OrganizationService.getInstitutionNames(
          true
        );
        setInstitutions(institutionNames);
      } catch (error) {
        console.error('Error fetching institutions:', error);
      } finally {
        setLoadingInstitutions(false);
      }
    };

    fetchInstitutions();
  }, [isSuperAdmin]);

  // Auto-set institution filter for faculty users
  useEffect(() => {
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !filters.institution_id
    ) {
      onFilterChange({ institution_id: userProfile.institution_id });
    }
  }, [userProfile, isSuperAdmin, filters.institution_id, onFilterChange]);

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 md:grid-cols-3'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search sections...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-9'
          />
        </div>

        {/* Institution Filter - Only show for super admin */}
        {isSuperAdmin && (
          <Select
            value={filters.institution_id || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                institution_id: value === 'all' ? undefined : value
              })
            }
            disabled={loadingInstitutions}
          >
            <SelectTrigger>
              <SelectValue placeholder='Filter by institution' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((institution) => (
                <SelectItem key={institution.id} value={institution.id}>
                  {institution.name} ({institution.counselling_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={
            filters.isActive !== undefined ? filters.isActive.toString() : 'all'
          }
          onValueChange={(value) =>
            onFilterChange({
              isActive: value === 'all' ? undefined : value === 'true'
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Statuses</SelectItem>
            <SelectItem value='true'>Active</SelectItem>
            <SelectItem value='false'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
