'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

import { CoursesFilters, type CoursesFiltersState } from './courses-filters';
import { CoursesDataTable } from './courses-data-table';

export function CoursesPageClient() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('academic.bos-courses', 'create');

  const [filters, setFilters] = useState<CoursesFiltersState>({
    search: '',
    regulation_code: '',
    is_active: 'true',
  });

  if (!profile?.institution_id) {
    return (
      <p className='text-sm text-muted-foreground'>
        Your account is not linked to an institution. Contact admin.
      </p>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-4 flex-wrap'>
        <CoursesFilters value={filters} onChange={setFilters} />
        <div className='flex gap-2'>
          {canCreate && (
            <Button size='sm' onClick={() => router.push('/bos/courses/new')}>
              <Plus className='mr-2 h-4 w-4' /> New Course
            </Button>
          )}
        </div>
      </div>

      <CoursesDataTable
        institutionId={profile.institution_id}
        filters={filters}
      />
    </div>
  );
}
