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
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemestersSearchParams } from './data-table-schema';
import DownloadSemesterTemplateButton from './download-semester-template';
import { ExportSemesters } from './export-semesters';
import BulkUploadSemesters from './bulk-upload-semesters';
import { usePermissions } from '@/hooks/use-permissions';

interface SemesterFiltersProps {
  searchParams: SemestersSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function SemesterFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: SemesterFiltersProps) {
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  
  const canEditSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'edit');
  const canExportSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'export');

  useEffect(() => {
    async function loadPrograms() {
      try {
        setLoading(true);
        const { data } = await ProgramService.getPrograms({
          isActive: true
        });
        setPrograms(data);
      } catch (error) {
        console.error('Error loading programs:', error);
      } finally {
        setLoading(false);
      }
    }
    loadPrograms();
  }, []);

  const hasActiveFilters = !!(
    searchParams.program_id ||
    searchParams.semester_type ||
    searchParams.status
  );

  return (
    <div className='space-y-4'>
      {/* Filters and Actions */}
      <div className='space-y-4'>
        {/* First Row - Filters */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {/* Program Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.program_id || 'all'}
              onValueChange={(value) =>
                onFilterChange('program_id', value === 'all' ? undefined : value)
              }
              disabled={loading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={loading ? 'Loading...' : 'All Programs'}
                />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto'>
                <SelectItem value='all'>All Programs</SelectItem>
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Semester Type Filter */}
          <div className='w-full'>
            <Select
              value={searchParams.semester_type || 'all'}
              onValueChange={(value) =>
                onFilterChange('semester_type', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='All Types' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Types</SelectItem>
                <SelectItem value='even'>Even</SelectItem>
                <SelectItem value='odd'>Odd</SelectItem>
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
            {canEditSemesters && (
              <div className='w-full sm:w-auto'>
                <DownloadSemesterTemplateButton />
              </div>
            )}
            {canExportSemesters && (
              <div className='w-full sm:w-auto'>
                <ExportSemesters />
              </div>
            )}
            {canEditSemesters && (
              <div className='w-full sm:w-auto'>
                <BulkUploadSemesters />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
