'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';

import { InstitutionPicker } from '../../_components/institution-picker';
import { CoursesFilters, type CoursesFiltersState } from './courses-filters';
import { CoursesDataTable } from './courses-data-table';

export function CoursesPageClient() {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('academic.bos-courses', 'create');

  // Start unset; hidden-but-mounted InstitutionPicker auto-selects the first
  // institution for non-admins so onSelect always fires to populate institutionCode.
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const [institutionCode, setInstitutionCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [myjkknInstitutionIds, setMyjkknInstitutionIds] = useState<string[]>([]);

  const [filters, setFilters] = useState<CoursesFiltersState>({
    search: '',
    regulation_code: '',
    is_active: 'true',
  });

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-4 flex-wrap'>
        <div className='flex gap-3 flex-wrap items-end'>
          {/* Super-admins: visible picker with "All Institutions" default.
              Non-admins: hidden but mounted so onSelect fires for auto-selection. */}
          <div className={isSuperAdmin ? '' : 'hidden'}>
            <InstitutionPicker
              value={institutionId}
              onChange={(id) => {
                setInstitutionId(id);
                if (!id) {
                  setInstitutionCode('');
                  setInstitutionName('');
                  setMyjkknInstitutionIds([]);
                }
              }}
              onSelect={(opt) => {
                setInstitutionCode(opt.institution_code);
                setInstitutionName(opt.name);
                setMyjkknInstitutionIds(opt.myjkkn_institution_ids);
              }}
              showAllOption={isSuperAdmin}
            />
          </div>
          <CoursesFilters
            value={filters}
            onChange={setFilters}
            institutionId={institutionId}
            myjkknInstitutionIds={myjkknInstitutionIds}
          />
        </div>
        <div className='flex gap-2'>
          {/* Disable New Course when "All Institutions" is active — no institution context to create into. */}
          {canCreate && institutionId && (
            <Button
              size='sm'
              onClick={() => {
                const params = new URLSearchParams();
                if (institutionCode) params.set('institution_code', institutionCode);
                if (filters.regulation_code) params.set('regulation_code', filters.regulation_code);
                router.push(`/bos/courses/new?${params}`);
              }}
            >
              <Plus className='mr-2 h-4 w-4' /> New Course
            </Button>
          )}
        </div>
      </div>

      {/* Super-admin: show table even with no specific institution (all-institutions mode).
          Non-admin: institutionId is always set by auto-select, so table always renders. */}
      {(isSuperAdmin || institutionId) ? (
        <CoursesDataTable
          institutionId={institutionId}
          filters={filters}
          institutionName={institutionName}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>Loading institution…</p>
      )}
    </div>
  );
}
