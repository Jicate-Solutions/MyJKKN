'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { HostelResidentsDataTable } from './_components/residents-data-table';
import { ResidentFormDialog } from './_components/resident-form-dialog';
import { LearnersTab } from './_components/learners-tab';
import { GenerateBillsTab } from './_components/generate-bills-tab';
import { UpgradesTab } from './_components/upgrades-tab';
import { UpgradeCategoriesTab } from './_components/upgrade-categories-tab';
import { usePermissions } from '@/hooks/use-permissions';
import { HOSTEL_RESIDENT_TYPES, type HostelResidentType } from '@/types/hostel-residents';
import type { ResidentFilters } from '@/types/hostel-residents';

const TAB_VALUES = ['learners', 'non-learners', 'generate', 'upgrade-categories', 'upgrades'] as const;
type TabValue = (typeof TAB_VALUES)[number];

export default function HostelResidentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin, permissions } = usePermissions();
  const canManageUpgrades =
    isSuperAdmin || !!permissions?.['campus_living.upgrades.manage'];

  // URL-driven tab (?tab=…). Only the active tab's content is rendered for the
  // heavy "generate" tab so its hostel-year hooks + dry-run state don't mount
  // eagerly (Radix TabsContent renders all children otherwise).
  const tabParam = searchParams.get('tab');
  const activeTab: TabValue = (TAB_VALUES as readonly string[]).includes(
    tabParam ?? '',
  )
    ? (tabParam as TabValue)
    : 'learners';

  const onTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

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
        <div>
          <h1 className='text-2xl font-bold py-1'>Hostel Residents</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage who lives in the hostel. Learners come from admission records
            (accommodation_type='HOSTEL'); non-learner residents (staff, international, married,
            visitor, other) are classified here.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={onTabChange} className='space-y-4'>
          <TabsList className='flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
            <TabsTrigger value='learners'>Learners</TabsTrigger>
            <TabsTrigger value='non-learners'>Non-learners</TabsTrigger>
            <TabsTrigger value='generate'>Generate Hostel-Year Bills</TabsTrigger>
            {canManageUpgrades && (
              <TabsTrigger value='upgrade-categories'>Upgrade Categories</TabsTrigger>
            )}
            <TabsTrigger value='upgrades'>Upgrades</TabsTrigger>
          </TabsList>

          <TabsContent value='learners' className='space-y-4'>
            <LearnersTab />
          </TabsContent>

          <TabsContent value='non-learners' className='space-y-4'>
            {/* Header for non-learners tab */}
            <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
              <div>
                <p className='text-sm text-muted-foreground'>
                  Classify MyJKKN users who are not learners (staff, international students on
                  exchange, married/family stay, short-term visitors, other).
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
                    {HOSTEL_RESIDENT_TYPES.filter((t) => t !== 'learner').map((t) => (
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

            <HostelResidentsDataTable filters={filters} />
          </TabsContent>

          <TabsContent value='generate' className='space-y-4'>
            {/* Render only when active — keeps the hostel-year hooks + dry-run
                state from mounting eagerly on the other tabs. */}
            {activeTab === 'generate' && (
              <>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Select a hostel year and hostellers, then preview the bills
                    that would be generated for each learner before committing.
                  </p>
                </div>
                <GenerateBillsTab />
              </>
            )}
          </TabsContent>

          {canManageUpgrades && (
            <TabsContent value='upgrade-categories' className='space-y-4'>
              {/* Lazy-mount — keeps its catalog/table hooks off the other tabs
                  and avoids URL-state collision with the Learners tab table. */}
              {activeTab === 'upgrade-categories' && (
                <>
                  <div>
                    <p className='text-sm text-muted-foreground'>
                      Upgrade a learner&apos;s room (auto-allocated categories) and/or mess category
                      on their behalf — single or in bulk. Eligible learners follow the same
                      pay-to-confirm flow as a self-service upgrade.
                    </p>
                  </div>
                  <UpgradeCategoriesTab />
                </>
              )}
            </TabsContent>
          )}

          <TabsContent value='upgrades' className='space-y-4'>
            <div>
              <p className='text-sm text-muted-foreground'>
                Learners who have a hostel/mess category upgrade in progress or completed,
                sourced from the upgrade-fee bills.
              </p>
            </div>
            <UpgradesTab />
          </TabsContent>
        </Tabs>
      </div>

      <ResidentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode='create'
      />
    </ContentLayout>
  );
}
