'use client';

import { useEffect, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import { OrganizationService } from '@/lib/services/organization/organization-service';
import { CourseFilters as CourseFilterType } from '@/types/organizations';
import DownloadCourseTemplateButton from './download-course-template';
import { ExportCourses } from './export-courses';
import BulkUploadCourses from './bulk-upload-courses';
import { usePermissions } from '@/hooks/use-permissions';

interface CourseFiltersProps {
  filters: CourseFilterType;
  onFilterChange: (filters: Partial<CourseFilterType>) => void;
}

export function CourseFilters({ filters, onFilterChange }: CourseFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewCourses =
    isSuperAdmin || canAccess('organizations.courses', 'view');
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

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 w-full md:grid-cols-2'>
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
        <div className='flex items-center justify-between gap-2 w-full'>
          {canViewCourses && <DownloadCourseTemplateButton />}
          {isSuperAdmin && <ExportCourses />}
          {canViewCourses && <BulkUploadCourses />}
        </div>
      </div>
    </div>
  );
}
