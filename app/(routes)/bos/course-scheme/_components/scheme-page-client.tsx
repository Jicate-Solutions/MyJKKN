'use client';

import { useMemo, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useBosCourseScheme, type SchemeFilters } from '@/hooks/bos/use-bos-course-scheme';
import { InstitutionPicker } from '../../_components/institution-picker';
import { SchemeFiltersBar } from './scheme-filters';
import { SemesterTable } from './semester-table';
import type { BosCourseMappingDetailed } from '@/types/bos-courses';

export function SchemePageClient() {
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('academic.bos-scheme', 'edit');

  // Default to user's own institution; super-admins start unset and pick.
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    profile?.institution_id ?? undefined,
  );
  const [filters, setFilters] = useState<SchemeFilters | null>(null);
  const [editMode, setEditMode] = useState(false);

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

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-3 flex-wrap'>
        <div className='flex gap-3 flex-wrap items-end'>
          <InstitutionPicker
            value={institutionId}
            onChange={(id) => {
              setInstitutionId(id);
              // Clear filters when switching institutions to avoid stale program/regulation
              setFilters(null);
            }}
          />
          {institutionId && (
            <SchemeFiltersBar
              institutionId={institutionId}
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
          Enter program code, regulation, and (optionally) batch to load the scheme.
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
          onAddToSemester={() => toast.info('Add Course dialog wiring is part of Task 19')}
        />
      ))}
    </div>
  );
}
