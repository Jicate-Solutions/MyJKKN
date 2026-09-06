'use client';

/**
 * Fees & Economics — unified super-admin configuration page.
 *
 * Stacks the scattered hostel money-config surfaces into ONE page by REUSING each
 * sibling settings sub-page's editor components inline — no editor is rewritten:
 *   1. Fee configuration  (category / upgrade / package fees, scoped by hostel year)
 *   2. Billable amenities (amenities that carry a monthly fee)
 *   3. Admission packages (flat-price room bundles)
 *   4. Block economics    (per-block running + one-time costs; super-admin only)
 *   5. Hostel years       (the calendar years fees are scoped to)
 *
 * Follows the live-verified PR #1683 (Allocations & Eligibility) pattern: 'use client',
 * PermissionGuard on the EXISTING `campus_living.settings.view` key (super-admins bypass),
 * ContentLayout + breadcrumb + page heading, a local SectionHeader helper, then one
 * <Card> per sub-domain reusing that domain's self-fetching data-table + form-dialog.
 */

import { useState } from 'react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Info } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useActiveHostelYears,
  useCurrentHostelYear,
} from '@/hooks/campus-living/use-hostel-years';

// Reuse — fee configuration sections (each self-manages its own Add dialog)
import { CategoryFeesSection } from '../fee-config/_components/category-fees-section';
import { UpgradeFeesSection } from '../fee-config/_components/upgrade-fees-section';
import { PackageFeesSection } from '../fee-config/_components/package-fees-section';

// Reuse — billable amenities editor (self-fetching table + form dialog)
import { BillableAmenitiesDataTable } from '../billable-amenities/_components/billable-amenities-data-table';
import { BillableAmenityFormDialog } from '../billable-amenities/_components/billable-amenity-form-dialog';

// Reuse — admission packages editor (self-fetching table + form dialog)
import { PackagesDataTable } from '../packages/_components/packages-data-table';
import { PackageFormDialog } from '../packages/_components/package-form-dialog';

// Reuse — block economics editor (self-fetching table; carries its own "Add cost" dialog)
import { BlockEconomicsDataTable } from '../block-economics/_components/block-economics-data-table';
import type { CostKind } from '@/lib/services/campus-living/block-economics-service';

// Reuse — hostel years editor (self-fetching table + form dialog)
import { HostelYearsDataTable } from '../hostel-years/_components/hostel-years-data-table';
import { HostelYearFormDialog } from '../hostel-years/_components/hostel-year-form-dialog';

// Mirror block-economics' own filter sentinel so the inlined table starts unfiltered.
const BE_ALL = '__all__';

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
      {action && <div className='flex shrink-0 justify-end gap-2'>{action}</div>}
    </div>
  );
}

export default function FeesEconomicsConfigPage() {
  const { permissions, isSuperAdmin } = usePermissions();
  const canEdit =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  // Fee configuration is scoped by hostel year — same selection logic as the
  // standalone fee-config page, but with a NATIVE <select> (never Radix Select).
  const { hostelYears, loading: loadingYears } = useActiveHostelYears();
  const { currentYear } = useCurrentHostelYear();
  const [selectedYearId, setSelectedYearId] = useState<string | undefined>(undefined);
  const effectiveYearId =
    selectedYearId ?? currentYear?.id ?? hostelYears?.[0]?.id ?? undefined;

  // Add-dialog state for the clean table+dialog domains.
  const [amenityCreate, setAmenityCreate] = useState(false);
  const [packageCreate, setPackageCreate] = useState(false);
  const [yearCreate, setYearCreate] = useState(false);

  // Block-economics filter state (the inlined table renders its own filter selects
  // and its own "Add cost" dialog — we just own the filter values).
  const [beBlockId, setBeBlockId] = useState<string>(BE_ALL);
  const [beCostKind, setBeCostKind] = useState<CostKind>('opex');
  const [beYearValue, setBeYearValue] = useState<string>(BE_ALL);

  return (
    // Single page-level gate on the EXISTING settings key (fail-closed; super-admins
    // bypass). No new permission key — matches every sibling settings sub-page.
    <PermissionGuard
      module='campus_living.settings'
      action='view'
      fallback={
        <ContentLayout title='Fees & Economics'>
          <PermissionError
            message='Campus Living configuration is restricted to hostel administrators.'
            requiredPermission='campus_living.settings.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Fees & Economics'>
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
                <BreadcrumbPage>Fees &amp; Economics</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='text-xl font-semibold tracking-tight'>Fees &amp; Economics</h1>
            <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
              One place to configure everything that prices campus living — the fees a
              learner pays, the billable amenities and packages they can pick, the per-block
              cost figures behind the economics dashboards, and the hostel years all fees
              are scoped to.
            </p>
          </div>

          {/* Section 1 — Fee configuration (room / mess category, upgrade, package fees) */}
          <Card>
            <CardContent className='p-6 space-y-6'>
              <SectionHeader
                title='Fee configuration'
                description='The fees a learner is charged — per room / mess category, per upgrade, and per package — for the selected hostel year.'
                action={
                  <label className='flex flex-wrap items-center gap-2 text-sm'>
                    <span className='whitespace-nowrap text-muted-foreground'>Hostel year</span>
                    <select
                      className='h-9 w-full sm:w-48 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                      value={effectiveYearId ?? ''}
                      onChange={(e) => setSelectedYearId(e.target.value || undefined)}
                      disabled={loadingYears || !hostelYears?.length}
                    >
                      {!effectiveYearId && (
                        <option value='' disabled>
                          Select year
                        </option>
                      )}
                      {hostelYears?.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>
                  </label>
                }
              />

              {!canEdit ? (
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertTitle>Read-only</AlertTitle>
                  <AlertDescription>
                    You can view fee configurations but editing requires the{' '}
                    <code>campus_living.settings.edit</code> permission.
                  </AlertDescription>
                </Alert>
              ) : null}

              {!effectiveYearId && !loadingYears ? (
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertTitle>No hostel year</AlertTitle>
                  <AlertDescription>
                    No active hostel years found. Add one in the{' '}
                    <strong>Hostel years</strong> section below before configuring fees.
                  </AlertDescription>
                </Alert>
              ) : null}

              {effectiveYearId ? (
                <Tabs defaultValue='category' className='space-y-4'>
                  <TabsList className='flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
                    <TabsTrigger value='category'>Category Fees</TabsTrigger>
                    <TabsTrigger value='upgrade'>Upgrade Fees</TabsTrigger>
                    <TabsTrigger value='package'>Package Fees</TabsTrigger>
                  </TabsList>
                  <TabsContent value='category'>
                    <CategoryFeesSection hostelYearId={effectiveYearId} canEdit={canEdit} />
                  </TabsContent>
                  <TabsContent value='upgrade'>
                    <UpgradeFeesSection hostelYearId={effectiveYearId} canEdit={canEdit} />
                  </TabsContent>
                  <TabsContent value='package'>
                    <PackageFeesSection hostelYearId={effectiveYearId} canEdit={canEdit} />
                  </TabsContent>
                </Tabs>
              ) : null}
            </CardContent>
          </Card>

          {/* Section 2 — Billable amenities */}
          <Card>
            <CardContent className='p-6 space-y-6'>
              <SectionHeader
                title='Billable amenities'
                description='Amenities that carry a monthly fee (AC, premium services) — each with its fee model and commitment term.'
                action={
                  <Button onClick={() => setAmenityCreate(true)}>
                    <Plus className='h-4 w-4 mr-2' /> Add amenity
                  </Button>
                }
              />
              <BillableAmenitiesDataTable />
            </CardContent>
          </Card>

          {/* Section 3 — Admission packages */}
          <Card>
            <CardContent className='p-6 space-y-6'>
              <SectionHeader
                title='Admission packages'
                description='Flat-price room bundles a learner can pick at admission — mess is chosen separately, Premium upgrades are opt-in.'
                action={
                  <Button onClick={() => setPackageCreate(true)}>
                    <Plus className='h-4 w-4 mr-2' /> Add package
                  </Button>
                }
              />
              <PackagesDataTable />
            </CardContent>
          </Card>

          {/* Section 4 — Block economics (super-admin only, mirroring the standalone page) */}
          {isSuperAdmin ? (
            <Card>
              <CardContent className='p-6 space-y-6'>
                <SectionHeader
                  title='Block economics'
                  description='Each block’s yearly running costs and one-time investments — the figures that power ROI, margin & payback on the Bed Economics dashboard.'
                />
                <BlockEconomicsDataTable
                  blockId={beBlockId}
                  costKind={beCostKind}
                  yearValue={beYearValue}
                  onBlockChange={setBeBlockId}
                  onCostKindChange={(v) => {
                    setBeCostKind(v);
                    // capex has no year — reset the year filter to "all".
                    if (v === 'capex') setBeYearValue(BE_ALL);
                  }}
                  onYearChange={setBeYearValue}
                />
              </CardContent>
            </Card>
          ) : null}

          {/* Section 5 — Hostel years */}
          <Card>
            <CardContent className='p-6 space-y-6'>
              <SectionHeader
                title='Hostel years'
                description='The hostel calendar years (name, start & end dates) that every fee above is scoped to.'
                action={
                  <Button onClick={() => setYearCreate(true)}>
                    <Plus className='h-4 w-4 mr-2' /> Add year
                  </Button>
                }
              />
              <HostelYearsDataTable />
            </CardContent>
          </Card>

          {/* Dialogs for the clean table+dialog domains */}
          <BillableAmenityFormDialog
            open={amenityCreate}
            onOpenChange={setAmenityCreate}
            mode='create'
          />
          <PackageFormDialog open={packageCreate} onOpenChange={setPackageCreate} mode='create' />
          <HostelYearFormDialog open={yearCreate} onOpenChange={setYearCreate} mode='create' />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
