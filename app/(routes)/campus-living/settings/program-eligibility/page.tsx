'use client';

import { useMemo, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import { useEligibility } from '@/hooks/campus-living/use-program-eligibility';
import { EligibilityDataTable } from './_components/data-table';
import { ProgramEligibilityFormDialog } from './_components/form-dialog';
import { createEligibilityColumns } from './_components/columns';
import { RoomRulesTable } from './_components/room-rules-table';
import { RoomEligibilityFormDialog } from './_components/room-eligibility-form-dialog';
import { SyncCategoriesButton } from './_components/sync-categories-button';

export default function ProgramEligibilityPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [addRoomRuleOpen, setAddRoomRuleOpen] = useState(false);

  // null => list across ALL institutions; each row carries its own institution,
  // picked inside the Add dialog (no page-level institution gate).
  const eligibility = useEligibility(null);
  const columns = useMemo(() => createEligibilityColumns(), []);

  return (
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
                are listed together — pick the institution when you add one.
              </p>
            </div>

            <Tabs defaultValue='category' className='w-full'>
              <TabsList>
                <TabsTrigger value='category'>Category Eligibility</TabsTrigger>
                <TabsTrigger value='rooms'>Physical Rooms</TabsTrigger>
              </TabsList>

              <TabsContent value='category' className='space-y-4 pt-4'>
                <div className='flex justify-end gap-2'>
                  <SyncCategoriesButton />
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className='h-4 w-4 mr-2' /> Add Rule
                  </Button>
                </div>
                <EligibilityDataTable
                  columns={columns}
                  data={eligibility.rows}
                  loading={eligibility.loading}
                  error={eligibility.error}
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
  );
}
