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
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Plus } from 'lucide-react';
import {
  useEligibilityInstitutions,
  useRoomEligibility,
  useMessEligibility,
} from '@/hooks/campus-living/use-program-eligibility';
import { EligibilityDataTable } from './_components/data-table';
import { ProgramEligibilityFormDialog } from './_components/form-dialog';
import { createRoomColumns, createMessColumns } from './_components/columns';
import { RoomRulesTable } from './_components/room-rules-table';
import { RoomEligibilityFormDialog } from './_components/room-eligibility-form-dialog';

export default function ProgramEligibilityPage() {
  const { institutions, loading: instLoading } = useEligibilityInstitutions();
  const [institutionId, setInstitutionId] = useState<string>('');
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [addMessOpen, setAddMessOpen] = useState(false);
  const [addRoomRuleOpen, setAddRoomRuleOpen] = useState(false);

  const room = useRoomEligibility(institutionId || null);
  const mess = useMessEligibility(institutionId || null);

  const roomColumns = useMemo(() => createRoomColumns(), []);
  const messColumns = useMemo(() => createMessColumns(), []);

  const institutionOptions = institutions.map((i) => ({
    value: i.id,
    label: i.name,
  }));

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
              <BreadcrumbLink href='/campus-living/settings'>
                Settings
              </BreadcrumbLink>
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
                Set which room and mess categories each program may use (with an
                institution-wide default + per-program overrides), and reserve
                specific blocks / floors / rooms for cohorts under Physical Rooms.
              </p>
            </div>

            <div className='max-w-md space-y-2'>
              <Label>Institution</Label>
              <SearchableSelect
                value={institutionId}
                onValueChange={setInstitutionId}
                options={institutionOptions}
                placeholder='Select an institution'
                loading={instLoading}
              />
            </div>

            {institutionId ? (
              <Tabs defaultValue='room' className='w-full'>
                <TabsList>
                  <TabsTrigger value='room'>Room Eligibility</TabsTrigger>
                  <TabsTrigger value='mess'>Mess Eligibility</TabsTrigger>
                  <TabsTrigger value='rooms'>Physical Rooms</TabsTrigger>
                </TabsList>

                <TabsContent value='room' className='space-y-4 pt-4'>
                  <div className='flex justify-end'>
                    <Button onClick={() => setAddRoomOpen(true)}>
                      <Plus className='h-4 w-4 mr-2' /> Add Override
                    </Button>
                  </div>
                  <EligibilityDataTable
                    columns={roomColumns}
                    data={room.rows}
                    loading={room.loading}
                    error={room.error}
                  />
                </TabsContent>

                <TabsContent value='mess' className='space-y-4 pt-4'>
                  <div className='flex justify-end'>
                    <Button onClick={() => setAddMessOpen(true)}>
                      <Plus className='h-4 w-4 mr-2' /> Add Override
                    </Button>
                  </div>
                  <EligibilityDataTable
                    columns={messColumns}
                    data={mess.rows}
                    loading={mess.loading}
                    error={mess.error}
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
                  <RoomRulesTable institutionId={institutionId} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className='rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground'>
                Select an institution to view and configure its program
                eligibility.
              </div>
            )}
          </CardContent>
        </Card>

        {institutionId && (
          <>
            <ProgramEligibilityFormDialog
              open={addRoomOpen}
              onOpenChange={setAddRoomOpen}
              kind='room'
              institutionId={institutionId}
            />
            <ProgramEligibilityFormDialog
              open={addMessOpen}
              onOpenChange={setAddMessOpen}
              kind='mess'
              institutionId={institutionId}
            />
            <RoomEligibilityFormDialog
              open={addRoomRuleOpen}
              onOpenChange={setAddRoomRuleOpen}
              mode='create'
              institutionId={institutionId}
            />
          </>
        )}
      </div>
    </ContentLayout>
  );
}
