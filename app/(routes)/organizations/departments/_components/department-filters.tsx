// app/(routes)/organizations/departments/_components/department-filters.tsx

'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentsSearchParams } from './data-table-schema';
import DownloadDepartmentTemplateButton from './download-department-template';
import { ExportDepartments } from './export-departments';
import BulkUploadDepartments from './bulk-upload-departments';
import { usePermissions } from '@/hooks/use-permissions';

interface DepartmentFiltersProps {
  searchParams: DepartmentsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function DepartmentFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: DepartmentFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  useEffect(() => {
    async function loadInstitutions() {
      try {
        setLoading(true);
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      } finally {
        setLoading(false);
      }
    }
    loadInstitutions();
  }, []);

  useEffect(() => {
    async function loadDegrees() {
      if (searchParams.institution_id) {
        try {
          setLoading(true);
          const data = await DegreeService.getDegreesByInstitution(
            searchParams.institution_id
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setDegrees([]);
      }
    }
    loadDegrees();
  }, [searchParams.institution_id]);

  const handleInstitutionChange = (value: string) => {
    onFilterChange('institution_id', value === 'all' ? undefined : value);
    // Reset degree when institution changes
    if (searchParams.degree_id) {
      onFilterChange('degree_id', undefined);
    }
  };

  const hasActiveFilters = !!(
    searchParams.institution_id ||
    searchParams.degree_id ||
    searchParams.status
  );

  return (
    <div className='space-y-4'>
      {/* Filters and Actions */}
      <div className='space-y-4'>
        {/* First Row - Filters */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {/* Institution Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.institution_id || 'all'}
              onValueChange={handleInstitutionChange}
              disabled={loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={loading ? 'Loading...' : 'All Institutions'}
                />
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

          {/* Degree Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.degree_id || 'all'}
              onValueChange={(value) =>
                onFilterChange('degree_id', value === 'all' ? undefined : value)
              }
              disabled={!searchParams.institution_id || loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Degrees' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Degrees</SelectItem>
                {degrees.map((degree) => (
                  <SelectItem key={degree.id} value={degree.id}>
                    {degree.degree_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.status || 'all'}
              onValueChange={(value) =>
                onFilterChange('status', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='active'>Active</SelectItem>
                <SelectItem value='inactive'>Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Second Row - Clear Filters and Action Buttons */}
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div className='flex items-center gap-2'>
            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant='outline'
                size='sm'
                onClick={onClearFilters}
                className='w-full sm:w-auto'
              >
                <RotateCcw className='mr-2 h-4 w-4' />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Action Buttons */}
          <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
            {isSuperAdmin && canAccess('organizations.departments', 'create') && (
              <div className='w-full sm:w-auto'>
                <DownloadDepartmentTemplateButton />
              </div>
            )}
            {isSuperAdmin && (
              <div className='w-full sm:w-auto'>
                <ExportDepartments />
              </div>
            )}
            {isSuperAdmin && canAccess('organizations.departments', 'create') && (
              <div className='w-full sm:w-auto'>
                <BulkUploadDepartments />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
