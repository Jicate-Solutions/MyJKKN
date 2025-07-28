// app/(routes)/organizations/institutions/_components/institution-filters.tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { InstitutionsSearchParams } from './data-table-schema';
import ExportInstitutions from './export-institutions';
import BulkUploadInstitutions from './bulk-upload-institutions';
import DownloadTemplateButton from './download-template-button';
import { usePermissions } from '@/hooks/use-permissions';

interface InstitutionFiltersProps {
  searchParams: InstitutionsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function InstitutionFilter({
  searchParams,
  onFilterChange,
  onClearFilters
}: InstitutionFiltersProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit =
    isSuperAdmin || canAccess('organizations.institutions', 'edit');
  const canExport =
    isSuperAdmin || canAccess('organizations.institutions', 'export');

  const hasActiveFilters = !!searchParams.status;

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
          <div className='min-w-[150px]'>
            <Select
              value={searchParams.status || 'all'}
              onValueChange={(value) =>
                onFilterChange('status', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='active'>Active</SelectItem>
                <SelectItem value='inactive'>Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button
              variant='outline'
              size='sm'
              onClick={onClearFilters}
              className='shrink-0'
            >
              <RotateCcw className='mr-2 h-4 w-4' />
              Clear Filters
            </Button>
          )}
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          {canEdit && <DownloadTemplateButton />}
          {canExport && <ExportInstitutions />}
          {canEdit && <BulkUploadInstitutions />}
        </div>
      </div>
    </div>
  );
}
