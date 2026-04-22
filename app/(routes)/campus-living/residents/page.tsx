'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, UserPlus } from 'lucide-react';
import { HostelResidentsDataTable } from './_components/residents-data-table';
import { ResidentFormDialog } from './_components/resident-form-dialog';
import { HOSTEL_RESIDENT_TYPES, type HostelResidentType } from '@/types/hostel-residents';
import type { ResidentFilters } from '@/types/hostel-residents';

export default function HostelResidentsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | HostelResidentType>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>(
    'active'
  );

  const filters: ResidentFilters = {};
  if (typeFilter !== 'all') filters.resident_type = typeFilter;
  if (activeFilter === 'active') filters.is_active = true;
  else if (activeFilter === 'inactive') filters.is_active = false;

  return (
    <ContentLayout title='Hostel Residents'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Residents' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Hostel Residents</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Classify MyJKKN users as hostel residents (staff, international, married,
              visitor, other). Learners are auto-created via the allocation flow.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className='mr-2 h-4 w-4' />
            Add Resident
          </Button>
        </div>

        {/* Filters */}
        <div className='flex flex-col sm:flex-row gap-3'>
          <div className='space-y-1'>
            <label className='text-xs text-muted-foreground'>Type</label>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
            >
              <SelectTrigger className='w-[180px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All types</SelectItem>
                {HOSTEL_RESIDENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className='capitalize'>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1'>
            <label className='text-xs text-muted-foreground'>Status</label>
            <Select
              value={activeFilter}
              onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}
            >
              <SelectTrigger className='w-[180px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All</SelectItem>
                <SelectItem value='active'>Active only</SelectItem>
                <SelectItem value='inactive'>Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <HostelResidentsDataTable filters={filters} />
      </div>

      <ResidentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode='create'
      />
    </ContentLayout>
  );
}
