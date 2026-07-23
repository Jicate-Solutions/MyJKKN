'use client';

// Postal Codes — district/status filters + the shared advanced DataTable
// (server-side pagination, sorting, search, export, bulk delete). Search,
// export and pagination live INSIDE PostalCodesDataTable; this component
// owns the filters, the add/edit dialogs, and the refetchKey that tells the
// table to reload after a mutation.

import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { usePermissions } from '@/hooks/use-permissions';
import { getDistrictsByState } from '@/lib/data/locations';
import type { PostalCode } from '@/types/postal-code';
import { PostalCodesDataTable } from './postal-codes-data-table';
import { PostalCodeFormDialog } from './postal-code-form-dialog';

const TN_DISTRICTS = getDistrictsByState('tamil_nadu');

export function PostalCodesContent() {
  const { canAccess, isSuperAdmin, userProfile, isLoading: permissionsLoading } = usePermissions();
  const canCreate = isSuperAdmin || canAccess('learners.postal_codes', 'create');
  const canEdit = isSuperAdmin || canAccess('learners.postal_codes', 'edit');
  const canDelete = isSuperAdmin || canAccess('learners.postal_codes', 'delete');

  const [district, setDistrict] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPostalCode, setEditingPostalCode] = useState<PostalCode | null>(null);
  // Bumped after add/edit so the DataTable (which fetches internally,
  // outside React Query) reloads the current page.
  const [refetchKey, setRefetchKey] = useState(0);
  const bumpRefetch = () => setRefetchKey((k) => k + 1);

  if (permissionsLoading || !userProfile) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold py-1'>Postal Codes</h1>
        <p className='text-sm text-muted-foreground'>
          Pincode directory (post offices with district + map coordinates) powering the address auto-fill and View-on-Map links.
        </p>
      </div>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <Select value={district} onValueChange={setDistrict}>
          <SelectTrigger>
            <SelectValue placeholder='District' />
          </SelectTrigger>
          <SelectContent className='max-h-72 overflow-y-auto'>
            <SelectItem value='all'>All districts</SelectItem>
            {TN_DISTRICTS.map((d) => (
              <SelectItem key={d.id} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger>
            <SelectValue placeholder='Status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All</SelectItem>
            <SelectItem value='active'>Active</SelectItem>
            <SelectItem value='inactive'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <PostalCodesDataTable
        district={district === 'all' ? undefined : district}
        isActive={activeFilter === 'all' ? undefined : activeFilter === 'active'}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onAdd={() => setShowAddDialog(true)}
        onEdit={setEditingPostalCode}
        refetchKey={refetchKey}
      />

      <PostalCodeFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        mode='create'
        onSuccess={bumpRefetch}
      />

      <PostalCodeFormDialog
        open={!!editingPostalCode}
        onOpenChange={(open) => !open && setEditingPostalCode(null)}
        mode='edit'
        postalCode={editingPostalCode ?? undefined}
        onSuccess={bumpRefetch}
      />
    </div>
  );
}
