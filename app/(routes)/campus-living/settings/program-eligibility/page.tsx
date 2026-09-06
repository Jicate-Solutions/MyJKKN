'use client';

import { Suspense, useMemo, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search } from 'lucide-react';
import { useEligibility } from '@/hooks/campus-living/use-program-eligibility';
import { EligibilityDataTable } from './_components/data-table';
import { ProgramEligibilityFormDialog } from './_components/form-dialog';
import { createEligibilityColumns } from './_components/columns';
import { RoomRulesTable } from './_components/room-rules-table';
import { RoomEligibilityFormDialog } from './_components/room-eligibility-form-dialog';
import { SyncCategoriesButton } from './_components/sync-categories-button';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';
import {
  EligibilityFiltersPanel,
  EMPTY_ELIGIBILITY_FILTERS,
  countActiveEligibilityFilters,
  eligibilityMatchesFilters,
} from './_components/eligibility-filters';

const PROGRAM_ELIGIBILITY_TABS = ['category', 'rooms'] as const;

function ProgramEligibilityPageInner() {
  const [activeTab, setActiveTab] = useTabParam('category', PROGRAM_ELIGIBILITY_TABS);
  const [addOpen, setAddOpen] = useState(false);
  const [addRoomRuleOpen, setAddRoomRuleOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_ELIGIBILITY_FILTERS);
  const [search, setSearch] = useState('');

  // null => list across ALL institutions; each row carries its own institution,
  // picked inside the Add dialog (no page-level institution gate).
  const eligibility = useEligibility(null);
  const columns = useMemo(() => createEligibilityColumns(), []);

  const filtering =
    countActiveEligibilityFilters(filters) > 0 || search.trim().length > 0;
  const filteredRows = useMemo(
    () =>
      eligibility.rows.filter((r) =>
        eligibilityMatchesFilters(r, filters, search)
      ),
    [eligibility.rows, filters, search]
  );

  return (
    // Authorization gate (added 2026-06-16): this settings sub-page previously
    // had NO in-page permission guard and relied on Supabase RLS only, so a
    // direct-URL visitor without a campus-living settings role wasn't
    // access-controlled in the page itself. Gate on `campus_living.settings.view`
    // (defined in lib/constants/permissions.ts; the same section key
    // /campus-living/settings maps to in MENU_PERMISSIONS). The bulk eligibility
    // RPC already self-gates on campus_living.settings.edit at the DB layer; this
    // adds the matching view gate at the page layer. Fail-closed: PermissionGuard
    // renders the fallback on deny and nothing while loading; super-admins bypass.
    // Explicit denial, never a silent redirect (CLAUDE.md rule #27).
    <PermissionGuard
      module='campus_living.settings'
      action='view'
      fallback={
        <ContentLayout title='Program Eligibility'>
          <PermissionError
            message='Campus Living settings are restricted to hostel administrators.'
            requiredPermission='campus_living.settings.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Program Eligibility'>
      <div className='space-y-6'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href='/campus-living'>Campus Living</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href='/campus-living/settings'>Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Program Eligibility</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardContent className='p-6 space-y-6'>
            <div>
              <h2 className='text-lg font-semibold'>Program Eligibility</h2>
              <p className='text-sm text-muted-foreground'>
                Map each program + quota + academic-fee band to the room and mess
                categories those students may use (with an institution-wide default
                + per-program overrides), and reserve specific blocks / floors /
                rooms for cohorts under Physical Rooms. Rules from every institution
                are listed together — pick the institution when you add one. The fee
                a student is matched on is the one billed for their <strong>admission
                year</strong>, so a band decision holds for their whole course.
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
              <TabsList className='flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
                <TabsTrigger value='category'>Category Eligibility</TabsTrigger>
                <TabsTrigger value='rooms'>Physical Rooms</TabsTrigger>
              </TabsList>

              <TabsContent value='category' className='space-y-4 pt-4'>
                <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                  <div className='flex items-center gap-2'>
                    <div className='relative'>
                      <Search className='absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder='Search rules…'
                        className='h-9 w-full pl-8 sm:w-64'
                      />
                    </div>
                    <EligibilityFiltersPanel
                      rows={eligibility.rows}
                      value={filters}
                      onChange={setFilters}
                    />
                  </div>
                  <div className='flex flex-wrap justify-end gap-2'>
                    <SyncCategoriesButton />
                    <Button onClick={() => setAddOpen(true)}>
                      <Plus className='h-4 w-4 mr-2' /> Add Rule
                    </Button>
                  </div>
                </div>
                {filtering && !eligibility.loading && (
                  <p className='text-xs text-muted-foreground'>
                    Showing {filteredRows.length} of {eligibility.rows.length}{' '}
                    rules
                  </p>
                )}
                <EligibilityDataTable
                  columns={columns}
                  data={filteredRows}
                  loading={eligibility.loading}
                  error={eligibility.error}
                  emptyMessage={
                    filtering
                      ? 'No rules match the current search / filters.'
                      : undefined
                  }
                />
              </TabsContent>

              <TabsContent value='rooms' className='space-y-4 pt-4'>
                <div className='flex items-center justify-between gap-3'>
                  <p className='text-sm text-muted-foreground'>
                    Reserve physical rooms for a cohort (Institution → Degree →
                    Department → Program → Semester). Covered rooms admit only
                    matching learners; uncovered rooms stay open.
                  </p>
                  <Button onClick={() => setAddRoomRuleOpen(true)} className='shrink-0'>
                    <Plus className='h-4 w-4 mr-2' /> Add Rule
                  </Button>
                </div>
                <RoomRulesTable />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <ProgramEligibilityFormDialog open={addOpen} onOpenChange={setAddOpen} />
        <RoomEligibilityFormDialog
          open={addRoomRuleOpen}
          onOpenChange={setAddRoomRuleOpen}
          mode='create'
        />
      </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function ProgramEligibilityPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ProgramEligibilityPageInner />
    </Suspense>
  );
}
