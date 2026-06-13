'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { Search, ShieldCheck } from 'lucide-react';
import { WardensTable } from './_components/wardens-table';
import { WardenFormDialog } from './_components/warden-form-dialog';
import {
  WARDEN_DESIGNATIONS,
  type WardenDesignation,
  type WardenFilters,
} from '@/types/campus-living';

const designationLabel: Record<WardenDesignation, string> = {
  chief_warden: 'Chief Warden',
  warden: 'Warden',
  deputy_warden: 'Deputy Warden',
  floor_supervisor: 'Floor Supervisor',
  night_watcher: 'Night Watcher',
};

export default function HostelWardensPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const { data: blocksResult } = useHostelBlocks(institutionId);
  const blocks =
    ((blocksResult as { data?: { id: string; name: string; code?: string | null }[] })?.data) ??
    [];

  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [designationFilter, setDesignationFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const filters: WardenFilters = {};
  if (blockFilter !== 'all') filters.block_id = blockFilter;
  if (designationFilter !== 'all') filters.designation = designationFilter as WardenDesignation;
  if (activeFilter === 'active') filters.is_active = true;
  else if (activeFilter === 'inactive') filters.is_active = false;
  if (search.trim()) filters.search = search.trim();

  return (
    <ContentLayout title='Hostel Wardens'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Wardens' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Hostel Wardens</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage the staff assigned to oversee each block. Wardens approve leave, vacate, and
              gate-pass requests for the residents in their block.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <ShieldCheck className='mr-2 h-4 w-4' />
            Assign Warden
          </Button>
        </div>

        {/* Filters */}
        <div className='flex flex-col sm:flex-row gap-3 flex-wrap'>
          <div className='relative flex-1 min-w-[200px] max-w-sm'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search by name, email, or phone…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='pl-9'
            />
          </div>

          <div className='space-y-1'>
            <Select value={blockFilter} onValueChange={setBlockFilter}>
              <SelectTrigger className='w-[180px]'>
                <SelectValue placeholder='Block' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All blocks</SelectItem>
                {blocks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                    {b.code ? ` (${b.code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1'>
            <Select value={designationFilter} onValueChange={setDesignationFilter}>
              <SelectTrigger className='w-[180px]'>
                <SelectValue placeholder='Designation' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All designations</SelectItem>
                {WARDEN_DESIGNATIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {designationLabel[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1'>
            <Select
              value={activeFilter}
              onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}
            >
              <SelectTrigger className='w-[160px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All</SelectItem>
                <SelectItem value='active'>Active only</SelectItem>
                <SelectItem value='inactive'>Relieved only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <WardensTable filters={filters} />
      </div>

      <WardenFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode='create'
      />
    </ContentLayout>
  );
}
