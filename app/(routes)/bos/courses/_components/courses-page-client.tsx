'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';

import { InstitutionPicker } from '../../_components/institution-picker';
import { CoursesFilters, type CoursesFiltersState } from './courses-filters';
import { CoursesDataTable } from './courses-data-table';

export function CoursesPageClient() {
  const router = useRouter();
  const { canAccess, isSuperAdmin, userProfile } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();

  const canCreate = isSuperAdmin || canAccess('academic.bos-courses', 'create');

  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const [institutionCode, setInstitutionCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [myjkknInstitutionIds, setMyjkknInstitutionIds] = useState<string[]>([]);

  const [filters, setFilters] = useState<CoursesFiltersState>({
    search: '',
    regulation_code: '',
    is_active: 'true',
  });

  // Layer 2 (immediate): set institutionId from userProfile.institution_id so
  // the page renders right away without waiting for /api/institutions/resolve.
  // Matches /bos/syllabus → syllabus-data-table.tsx line 52.
  useEffect(() => {
    if (isSuperAdmin) return;
    if (institutionId) return;
    if (!userProfile?.institution_id) return;
    setInstitutionId(userProfile.institution_id);
    setMyjkknInstitutionIds([userProfile.institution_id]);
  }, [isSuperAdmin, userProfile?.institution_id, institutionId]);

  // Layer 1 (enrichment): once useInstitutionContext resolves, fill in code,
  // display name, and CAS siblings. Replaces the placeholder values from
  // Layer 2. No-op if COE is unreachable and the resolver fallback returns
  // a context with only counselling_code = institution_code populated.
  useEffect(() => {
    if (isSuperAdmin || !institutionCtx) return;
    setInstitutionCode(institutionCtx.institution_code);
    setInstitutionName(institutionCtx.display_name || institutionCtx.name);
    setMyjkknInstitutionIds(institutionCtx.myjkkn_institution_ids);
    if (institutionCtx.myjkkn_id && institutionCtx.myjkkn_id !== institutionId) {
      setInstitutionId(institutionCtx.myjkkn_id);
    }
  }, [isSuperAdmin, institutionCtx, institutionId]);

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-4 flex-wrap'>
        <div className='flex gap-3 flex-wrap items-end'>
          {isSuperAdmin && (
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
          )}
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
