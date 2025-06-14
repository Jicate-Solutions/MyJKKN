// app/(routes)/organizations/institutions/_components/institution-filters.tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { InstitutionFilters } from '@/types/organizations';
import DownloadTemplateButton from './download-template-button';
import ExportInstitutions from './export-institutions';
import BulkUploadInstitutions from './bulk-upload-institutions';
import { usePermissions } from '@/hooks/use-permissions';

interface InstitutionFiltersProps {
  filters: InstitutionFilters;
  onFilterChange: (filters: Partial<InstitutionFilters>) => void;
}

export function InstitutionFilter({
  filters,
  onFilterChange
}: InstitutionFiltersProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditInstitutions =
    isSuperAdmin || canAccess('organizations.institutions', 'edit');

  const handleStatusChange = (value: string) => {
    onFilterChange({
      isActive: value === 'all' ? undefined : value === 'active' ? true : false
    });
  };

  return (
    <div className='space-y-4 mb-6 w-full'>
      <div className='grid gap-4 md:grid-cols-2 w-full items-center justify-between'>
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
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Status</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>
        <div className='flex items-center justify-end gap-2 w-full'>
          {canEditInstitutions && <DownloadTemplateButton />}
          {isSuperAdmin && <ExportInstitutions />}
          {canEditInstitutions && <BulkUploadInstitutions />}
        </div>
      </div>
    </div>
  );
}
