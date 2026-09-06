'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';

import { InstitutionPicker } from '../../_components/institution-picker';
import { CoursesFilters, type CoursesFiltersState } from './courses-filters';
import { CoursesDataTable } from './courses-data-table';
import { CoursesExportButton } from './courses-export-button';
import { CoursesImportDialog } from './courses-import-dialog';

export function CoursesPageClient() {
  const router = useRouter();
  const { isSuperAdmin, userProfile } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();
  const boardScope = useBosBoardScope();

  // Board membership IS the authorization for BoS write actions — mirrors
  // syllabus-actions.tsx. Role-permission grants drift out of sync with
  // composition membership (faculty members on a UPH board lacked
  // academic.bos-courses.create in custom_roles.permissions), so we gate
  // on memberOf instead. Server still enforces via guardInstitutionWrite.
  const isBoardMember = !boardScope.isLoading && boardScope.memberOf.size > 0;
  const canCreate = isSuperAdmin || isBoardMember;

  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const [institutionCode, setInstitutionCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [myjkknInstitutionIds, setMyjkknInstitutionIds] = useState<string[]>([]);

  const [filters, setFilters] = useState<CoursesFiltersState>({
    search: '',
    regulation_code: '',
    is_active: 'true',
  });
  const [importOpen, setImportOpen] = useState(false);

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
      {/* Action bar — kept on its own row so the filter grid below stays a
          rigid 4-column matrix at every zoom level (grid columns share the
          row width as 1fr, so they never overflow into wraps). */}
      <div className='flex flex-wrap justify-end gap-2'>
        <CoursesExportButton
          institutionId={institutionId}
          institutionCode={institutionCode}
          filters={filters}
        />
        {/* Import & New Course disabled when "All Institutions" is active — no institution context to create into. */}
        {canCreate && institutionId && (
          <>
            <Button variant='outline' size='sm' onClick={() => setImportOpen(true)}>
              <Upload className='mr-2 h-4 w-4' /> Import
            </Button>
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
          </>
        )}
      </div>

      <CoursesImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        institutionId={institutionId}
        institutionCode={institutionCode}
        myjkknInstitutionIds={myjkknInstitutionIds}
      />

      {/* Fixed-column filter grid: 1 col mobile → 2 cols tablet → 4 cols desktop.
          Each cell sizes equally via grid 1fr, so zoom in/out preserves the
          row-level column count (no flex-wrap surprises). Mirrors the
          /learners/profiles advanced-filters grid. */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
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
            hideLabel
            className='w-full'
          />
        )}
        <CoursesFilters
          value={filters}
          onChange={setFilters}
          institutionId={institutionId}
          myjkknInstitutionIds={myjkknInstitutionIds}
        />
      </div>

      {/* Super-admin: show table even with no specific institution (all-institutions mode).
          Non-admin: institutionId is always set by auto-select, so table always renders. */}
      {(isSuperAdmin || institutionId) ? (
        <CoursesDataTable
          institutionId={institutionId}
          filters={filters}
          institutionName={institutionName}
          institutionCode={institutionCode}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>Loading institution…</p>
      )}
    </div>
  );
}
