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
import { CoursesSearchParams } from './data-table-schema';
import DownloadCourseTemplateButton from './download-course-template';
import { ExportCourses } from './export-courses';
import BulkUploadCourses from './bulk-upload-courses';
import { usePermissions } from '@/hooks/use-permissions';

interface CourseFiltersProps {
  searchParams: CoursesSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function CourseFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: CourseFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  
  const canEditCourses =
    isSuperAdmin || canAccess('organizations.courses', 'edit');

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

  const hasActiveFilters = !!(
    searchParams.institution_id ||
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
              onValueChange={(value) =>
                onFilterChange('institution_id', value === 'all' ? undefined : value)
              }
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

          {/* Empty div for grid alignment on larger screens */}
          <div className='hidden lg:block'></div>
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
            {canEditCourses && (
              <div className='w-full sm:w-auto'>
                <DownloadCourseTemplateButton />
              </div>
            )}
            {canEditCourses && (
              <div className='w-full sm:w-auto'>
                <ExportCourses />
              </div>
            )}
            {canEditCourses && (
              <div className='w-full sm:w-auto'>
                <BulkUploadCourses />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
