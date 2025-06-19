'use client';

import { useCallback, useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { UserFilters } from '@/types/users';
import { useDebounce } from '@/hooks/use-debounce';
import { CustomRole } from '@/types/auth';
import { RoleService } from '@/lib/services/roles/role-service';
import { toast } from 'react-hot-toast';

interface UserFiltersProps {
  filters: UserFilters;
  onFilterChange: (filters: Partial<UserFilters>) => void;
}

export function UserFiltersComponent({
  filters,
  onFilterChange
}: UserFiltersProps) {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  // Fetch all available roles on component mount
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setRolesLoading(true);
        const rolesData = await RoleService.getAllRoles();
        setRoles(rolesData);
      } catch (error) {
        console.error('Error fetching roles:', error);
        toast.error('Failed to load roles for filtering');
      } finally {
        setRolesLoading(false);
      }
    };

    fetchRoles();
  }, []);

  // Debounce search to avoid too many API calls
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
      <div className='grid gap-4 md:grid-cols-4'>
        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search users...'
            onChange={handleSearchChange}
            defaultValue={filters.search}
            className='pl-9'
          />
        </div>

        {/* Role Filter */}
        <Select
          value={filters.role || 'all'}
          onValueChange={(value) =>
            onFilterChange({ role: value === 'all' ? undefined : value })
          }
          disabled={rolesLoading}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={rolesLoading ? 'Loading roles...' : 'Filter by role'}
            />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Roles</SelectItem>
            {rolesLoading ? (
              <SelectItem value='loading' disabled>
                Loading roles...
              </SelectItem>
            ) : roles.length === 0 ? (
              <SelectItem value='no-roles' disabled>
                No roles available
              </SelectItem>
            ) : (
              roles.map((role) => (
                <SelectItem key={role.id} value={role.role_key}>
                  {role.role_name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* Status Filter - if you implement user status */}
        <Select
          value={
            filters.isActive === undefined
              ? 'all'
              : filters.isActive
              ? 'active'
              : 'inactive'
          }
          onValueChange={(value) =>
            onFilterChange({
              isActive:
                value === 'all' ? undefined : value === 'active' ? true : false
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by status' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
