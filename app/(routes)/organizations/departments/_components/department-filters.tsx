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
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentFilters as DepartmentFilterType } from '@/types/organizations';
import DownloadDepartmentTemplateButton from './download-department-template';
import { ExportDepartments } from './export-departments';
import BulkUploadDepartments from './bulk-upload-departments';
import { usePermissions } from '@/hooks/use-permissions';

interface DepartmentFiltersProps {
  filters: Partial<DepartmentFilterType>;
  onFilterChange: (filters: Partial<DepartmentFilterType>) => void;
}

export function DepartmentFilters({
  filters,
  onFilterChange
}: DepartmentFiltersProps) {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditDepartments =
    isSuperAdmin || canAccess('organizations.departments', 'edit');

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

  useEffect(() => {
    async function loadDegrees() {
      if (filters.institution_id) {
        try {
          setLoading(true);
          const data = await DegreeService.getDegreesByInstitution(
            filters.institution_id
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
  }, [filters.institution_id]);

  const handleInstitutionChange = (value: string) => {
    onFilterChange({
      ...filters,
      institution_id: value === 'all' ? undefined : value,
      degree_id: undefined // Reset degree when institution changes
    });
  };

  return (
    <div className='space-y-4 mb-6'>
      <div className='grid gap-4 md:grid-cols-2'>
        <div className='flex items-center justify-between gap-2 w-full'>
          <Select
            value={filters.institution_id || 'all'}
            onValueChange={handleInstitutionChange}
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
            value={filters.degree_id || 'all'}
            onValueChange={(value) =>
              onFilterChange({
                ...filters,
                degree_id: value === 'all' ? undefined : value
              })
            }
            disabled={!filters.institution_id || loading}
          >
            <SelectTrigger>
              <SelectValue placeholder='Select degree' />
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
        <div className='flex items-center justify-end gap-2 w-full'>
          {canEditDepartments && <DownloadDepartmentTemplateButton />}
          {isSuperAdmin && <ExportDepartments />}
          {canEditDepartments && <BulkUploadDepartments />}
        </div>
      </div>
    </div>
  );
}
