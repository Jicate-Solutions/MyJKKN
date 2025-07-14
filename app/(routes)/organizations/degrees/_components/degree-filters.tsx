// app/(routes)/organizations/degrees/_components/degree-filters.tsx

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DegreeFilters as DegreeFilterType } from '@/types/organizations';
import ExportDegrees from './export-degrees';
import BulkUploadDegrees from './bulk-upload-degrees';
import DownloadDegreeTemplateButton from './download-degree-template';
import { usePermissions } from '@/hooks/use-permissions';

interface DegreeFiltersProps {
  filters: DegreeFilterType;
  onFilterChange: (filters: Partial<DegreeFilterType>) => void;
}

export function DegreeFilters({ filters, onFilterChange }: DegreeFiltersProps) {
  const { institutions } = useInstitutionsWithAccess();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'edit');

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 md:grid-cols-2'>
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

          <Select
            value={filters.degree_type || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                degree_type:
                  value === 'all' ? undefined : (value as 'ug' | 'pg')
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Filter by type' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Types</SelectItem>
              <SelectItem value='ug'>UG</SelectItem>
              <SelectItem value='pg'>PG</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='flex items-center justify-end gap-2 w-full'>
          {canEditDegrees && <DownloadDegreeTemplateButton />}
          {isSuperAdmin && <ExportDegrees />}
          {canEditDegrees && <BulkUploadDegrees />}
        </div>
      </div>
    </div>
  );
}
