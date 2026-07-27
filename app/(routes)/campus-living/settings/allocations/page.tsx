'use client';

/**
 * Allocations & Eligibility — unified super-admin configuration page.
 *
 * Pilot of the "one page, many sections, reads the engine live" pattern: stacks the
 * scattered allocation-config surfaces (categories, program eligibility, physical room
 * rules) into one page, topped by a live resolver preview that runs the SAME resolution
 * the allocation engine uses. Editing any rule changes what the next allocation run does
 * — no deploy. Reuses the existing section editors; adds only the page shell + preview.
 */

import { useEffect, useMemo, useState } from 'react';
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
import { Plus } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';

// Reuse — categories editor (self-fetching table + form dialog)
import { HostelCategoriesDataTable } from '../categories/_components/hostel-categories-data-table';
import { HostelCategoryFormDialog } from '../categories/_components/hostel-category-form-dialog';

// Reuse — program eligibility editor + sync/preview button
import { useEligibility } from '@/hooks/campus-living/use-program-eligibility';
import { EligibilityDataTable } from '../program-eligibility/_components/data-table';
import { ProgramEligibilityFormDialog } from '../program-eligibility/_components/form-dialog';
import { createEligibilityColumns } from '../program-eligibility/_components/columns';
import { RoomRulesTable } from '../program-eligibility/_components/room-rules-table';
import { RoomEligibilityFormDialog } from '../program-eligibility/_components/room-eligibility-form-dialog';
import { SyncCategoriesButton } from '../program-eligibility/_components/sync-categories-button';

// New — the live resolver proof
import { EligibilityResolverPreview } from './_components/eligibility-resolver-preview';
import {
  ProgramEligibilityService,
  type InstitutionOption,
} from '@/lib/services/campus-living/program-eligibility-service';

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
      <div>
        <h2 className='text-lg font-semibold'>{title}</h2>
        <p className='max-w-2xl text-sm text-muted-foreground'>{description}</p>
      </div>
      {action && <div className='flex flex-wrap shrink-0 justify-end gap-2'>{action}</div>}
    </div>
  );
}

export default function AllocationsConfigPage() {
  const [catCreate, setCatCreate] = useState(false);
  const [eligAdd, setEligAdd] = useState(false);
  const [roomRuleAdd, setRoomRuleAdd] = useState(false);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);

  const eligibility = useEligibility(null);
  const columns = useMemo(() => createEligibilityColumns(), []);

  useEffect(() => {
    ProgramEligibilityService.getInstitutions()
      .then(setInstitutions)
      .catch(() => setInstitutions([]));
  }, []);

  return (
    // Super-admin / hostel-admin gate (fail-closed; super-admins bypass). Matches the
    // sibling settings pages — same campus_living.settings.view key, no new permission.
    <PermissionGuard
      module='campus_living.settings'
      action='view'
      fallback={
        <ContentLayout title='Allocations & Eligibility'>
          <PermissionError
            message='Campus Living configuration is restricted to hostel administrators.'
            requiredPermission='campus_living.settings.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Allocations & Eligibility'>
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
                <BreadcrumbPage>Allocations &amp; Eligibility</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='text-xl font-semibold tracking-tight'>Allocations &amp; Eligibility</h1>
            <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
              One place to configure who is eligible for which room &amp; mess category. The
              allocation engine reads these values live — edit a rule and the resolver below
              reflects it on the next run. No deploy needed.
            </p>
          </div>

          {/* Live resolver — the proof the config drives the engine */}
          <div id='resolver' className='scroll-mt-24'>
            <EligibilityResolverPreview institutions={institutions} />
          </div>

          {/* Section 1 — categories */}
          <Card id='categories' className='scroll-mt-24'>
            <CardContent className='p-6 space-y-6'>
              <SectionHeader
                title='Room & mess categories'
                description='The room and mess categories the rules below assign — Boys / Girls / Mixed, with each category’s upgrade behaviour.'
                action={
                  <Button onClick={() => setCatCreate(true)}>
                    <Plus className='h-4 w-4 mr-2' /> Add category
                  </Button>
                }
              />
              <HostelCategoriesDataTable />
            </CardContent>
          </Card>

          {/* Section 2 — program eligibility (the heart of allocations) */}
          <Card id='program-eligibility' className='scroll-mt-24'>
            <CardContent className='p-6 space-y-4'>
              <SectionHeader
                title='Program eligibility'
                description='Map each program + quota + academic-fee band to the room and mess categories those students may use. This is what the resolver above reads.'
                action={
                  <>
                    <SyncCategoriesButton />
                    <Button onClick={() => setEligAdd(true)}>
                      <Plus className='h-4 w-4 mr-2' /> Add rule
                    </Button>
                  </>
                }
              />
              <EligibilityDataTable
                columns={columns}
                data={eligibility.rows}
                loading={eligibility.loading}
                error={eligibility.error}
              />
            </CardContent>
          </Card>

          {/* Section 3 — physical room rules */}
          <Card id='room-rules' className='scroll-mt-24'>
            <CardContent className='p-6 space-y-4'>
              <SectionHeader
                title='Physical room rules'
                description='Reserve specific blocks / floors / rooms for a cohort (Institution → Degree → Department → Program → Semester). Covered rooms admit only matching learners.'
                action={
                  <Button onClick={() => setRoomRuleAdd(true)}>
                    <Plus className='h-4 w-4 mr-2' /> Add rule
                  </Button>
                }
              />
              <RoomRulesTable />
            </CardContent>
          </Card>

          {/* Dialogs */}
          <HostelCategoryFormDialog open={catCreate} onOpenChange={setCatCreate} mode='create' />
          <ProgramEligibilityFormDialog open={eligAdd} onOpenChange={setEligAdd} />
          <RoomEligibilityFormDialog open={roomRuleAdd} onOpenChange={setRoomRuleAdd} mode='create' />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
