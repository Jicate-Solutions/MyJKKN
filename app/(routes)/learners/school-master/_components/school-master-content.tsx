'use client';

// School Master — board/district/status filters + the shared advanced
// DataTable (server-side pagination, sorting, search, export, bulk delete).
// Search, export and pagination live INSIDE SchoolMasterDataTable; this
// component owns the filters, the add/edit/import dialogs, and the
// refetchKey that tells the table to reload after a mutation.

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
import { useSchoolDistricts } from '@/hooks/use-school-master';
import { BOARD_OF_STUDY_OPTIONS } from '@/lib/constants/learner-dropdown-values';
import type { SchoolMaster } from '@/types/school-master';
import { SchoolMasterDataTable } from './school-master-data-table';
import { SchoolFormDialog } from './school-form-dialog';
import { SchoolImportDialog } from './school-import-dialog';

export function SchoolMasterContent() {
  const { canAccess, isSuperAdmin, userProfile, isLoading: permissionsLoading } = usePermissions();
  const canCreate = isSuperAdmin || canAccess('learners.school_master', 'create');
  const canEdit = isSuperAdmin || canAccess('learners.school_master', 'edit');
  const canDelete = isSuperAdmin || canAccess('learners.school_master', 'delete');

  const [board, setBoard] = useState('state_board');
  const [district, setDistrict] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');

  const { data: districts } = useSchoolDistricts(board);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolMaster | null>(null);
  // Bumped after add/edit/import so the DataTable (which fetches internally,
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
        <h1 className='text-2xl font-bold py-1'>School Master</h1>
        <p className='text-sm text-muted-foreground'>
          Board and district-wise school directory used across learner profiles, enquiries and the public student form.
        </p>
      </div>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <Select
          value={board}
          onValueChange={(v) => {
            setBoard(v);
            setDistrict('all');
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder='Board' />
          </SelectTrigger>
          <SelectContent>
            {BOARD_OF_STUDY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={district} onValueChange={setDistrict}>
          <SelectTrigger>
            <SelectValue placeholder='District' />
          </SelectTrigger>
          <SelectContent className='max-h-72 overflow-y-auto'>
            <SelectItem value='all'>All districts</SelectItem>
            {(districts ?? []).map((d) => (
              <SelectItem key={d.district} value={d.district}>
                {d.district} ({d.school_count})
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

      <SchoolMasterDataTable
        board={board}
        district={district === 'all' ? undefined : district}
        isActive={activeFilter === 'all' ? undefined : activeFilter === 'active'}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onAdd={() => setShowAddDialog(true)}
        onImport={() => setShowImportDialog(true)}
        onEdit={setEditingSchool}
        refetchKey={refetchKey}
      />

      <SchoolFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        mode='create'
        defaultBoard={board}
        onSuccess={bumpRefetch}
      />

      <SchoolFormDialog
        open={!!editingSchool}
        onOpenChange={(open) => !open && setEditingSchool(null)}
        mode='edit'
        school={editingSchool ?? undefined}
        defaultBoard={board}
        onSuccess={bumpRefetch}
      />

      <SchoolImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={bumpRefetch}
      />
    </div>
  );
}
