'use client';

import { useMemo, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useBosCourseScheme, type SchemeFilters } from '@/hooks/bos/use-bos-course-scheme';
import { InstitutionPicker, type InstitutionOption } from '../../_components/institution-picker';
import { SchemeFiltersBar } from './scheme-filters';
import { SemesterTable } from './semester-table';
import { AddCourseDialog } from './add-course-dialog';
import type { BosCourseMappingDetailed } from '@/types/bos-courses';

export function SchemePageClient() {
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('academic.bos-scheme', 'edit');

  // Default to user's own institution; super-admins start with "All" selected (undefined).
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    isSuperAdmin ? undefined : (profile?.institution_id ?? undefined),
  );
  const [institutionCode, setInstitutionCode] = useState('');
  const [myjkknInstitutionIds, setMyjkknInstitutionIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<SchemeFilters | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addDialogSemester, setAddDialogSemester] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data, isLoading } = useBosCourseScheme(filters);

  const grouped = useMemo(() => {
    const map = new Map<string, BosCourseMappingDetailed[]>();
    (data?.data ?? []).forEach((m) => {
      const key = m.semester_code ?? 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [data]);

  const handleInstitutionSelect = (opt: InstitutionOption) => {
    setInstitutionCode(opt.institution_code);
    setMyjkknInstitutionIds(opt.myjkkn_institution_ids);
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-3 flex-wrap'>
        <div className='flex gap-3 flex-wrap items-end'>
          <InstitutionPicker
            value={institutionId}
            showAllOption={isSuperAdmin}
            onChange={(id) => {
              setInstitutionId(id);
              setFilters(null);
              if (!id) { setInstitutionCode(''); setMyjkknInstitutionIds([]); }
            }}
            onSelect={handleInstitutionSelect}
          />
          {institutionId && (
            <SchemeFiltersBar
              institutionId={institutionId}
              myjkknInstitutionIds={myjkknInstitutionIds}
              value={filters}
              onChange={setFilters}
            />
          )}
        </div>
        {canEdit && filters && (
          <Button
            variant={editMode ? 'default' : 'outline'}
            size='sm'
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? <Pencil className='mr-2 h-4 w-4' /> : <Eye className='mr-2 h-4 w-4' />}
            {editMode ? 'Edit Mode' : 'View Mode'}
          </Button>
        )}
      </div>

      {!institutionId && (
        <p className='text-sm text-muted-foreground'>Select an institution to begin.</p>
      )}

      {institutionId && !filters && (
        <p className='text-sm text-muted-foreground'>
          Select a program and regulation to load the scheme.
        </p>
      )}

      {filters && isLoading && <Skeleton className='h-96 w-full' />}

      {filters && !isLoading && grouped.length === 0 && (
        <p className='text-sm text-muted-foreground'>No courses mapped for this scheme.</p>
      )}

      {filters && grouped.map(([semester, mappings]) => (
        <SemesterTable
          key={semester}
          semester={semester}
          mappings={mappings}
          editMode={editMode}
          onAddToSemester={(sem) => { setAddDialogSemester(sem); setAddDialogOpen(true); }}
        />
      ))}

      {filters && (
        <AddCourseDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          semester={addDialogSemester}
          filters={filters}
          institutionCode={institutionCode}
        />
      )}
    </div>
  );
}
