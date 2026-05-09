'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

import { InstitutionPicker } from '../../_components/institution-picker';
import { CoursesFilters, type CoursesFiltersState } from './courses-filters';
import { CoursesDataTable } from './courses-data-table';

export function CoursesPageClient() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('academic.bos-courses', 'create');

  // Default to the user's own institution; super-admins start unset and pick.
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    profile?.institution_id ?? undefined,
  );

  const [filters, setFilters] = useState<CoursesFiltersState>({
    search: '',
    regulation_code: '',
    is_active: 'true',
  });

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-4 flex-wrap'>
        <div className='flex gap-3 flex-wrap items-end'>
          <InstitutionPicker value={institutionId} onChange={setInstitutionId} />
          <CoursesFilters value={filters} onChange={setFilters} />
        </div>
        <div className='flex gap-2'>
          {canCreate && (
            <Button size='sm' onClick={() => router.push('/bos/courses/new')}>
              <Plus className='mr-2 h-4 w-4' /> New Course
            </Button>
          )}
        </div>
      </div>

      {institutionId ? (
        <CoursesDataTable institutionId={institutionId} filters={filters} />
      ) : (
        <p className='text-sm text-muted-foreground'>Select an institution to load courses.</p>
      )}
    </div>
  );
}
