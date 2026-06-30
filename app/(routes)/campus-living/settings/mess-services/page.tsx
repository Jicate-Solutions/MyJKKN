'use client';

/**
 * Mess & Daily Services — unified super-admin configuration page.
 *
 * Same "one page, many sections, reuse the live editors" pattern as the
 * Allocations & Eligibility pilot (PR #1683). Stacks the four scattered
 * mess/daily-services config surfaces into one page by REUSING each sibling
 * settings sub-page's existing editor components inline — no editor is
 * rewritten:
 *   • Choose Your Menu   → <ChooseYourMenuPolicyForm/>  (self-contained policy form)
 *   • Housekeeping       → <HousekeepingPolicyForm/>    (self-contained policy form)
 *   • Amenities          → <AmenitiesDataTable/> + <AmenityFormDialog/>  (table + dialog)
 *   • Maintenance SLA    → linked (the existing page renders its own full ContentLayout
 *                          shell with no extracted inner component, so it is not cleanly
 *                          inline-reusable; a labelled card links to it as a last resort)
 *
 * Guard: same `campus_living.settings.view` key the sibling settings pages use
 * (super-admins bypass) — no new permission key. Fail-closed via PermissionGuard.
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
import { Plus } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';

// Reuse — Choose Your Menu policy form (self-fetching, self-saving; brings its own cards)
import { ChooseYourMenuPolicyForm } from '../choose-your-menu/_components/choose-your-menu-policy-form';

// Reuse — Housekeeping slot-booking policy form (self-fetching, self-saving; brings its own cards)
import { HousekeepingPolicyForm } from '../housekeeping/_components/housekeeping-policy-form';

// Reuse — Amenities catalog editor (self-fetching table + create/edit dialog)
import { AmenitiesDataTable } from '../amenities/_components/amenities-data-table';
import { AmenityFormDialog } from '../amenities/_components/amenity-form-dialog';

// Inline — the extracted chrome-less Maintenance SLA editor (renders its own heading + grid)
import { MaintenanceSlaSection } from '../maintenance-sla/_components/-maintenance-sla-section';

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

export default function MessServicesConfigPage() {
  const [amenityCreate, setAmenityCreate] = useState(false);

  return (
    // Super-admin / hostel-admin gate (fail-closed; super-admins bypass). Matches the
    // sibling settings pages and the #1683 pilot — same campus_living.settings.view key,
    // no new permission. Explicit denial card, never a silent redirect (rule #27).
    <PermissionGuard
      module='campus_living.settings'
      action='view'
      fallback={
        <ContentLayout title='Mess & Daily Services'>
          <PermissionError
            message='Campus Living configuration is restricted to hostel administrators.'
            requiredPermission='campus_living.settings.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Mess & Daily Services'>
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
                <BreadcrumbPage>Mess &amp; Daily Services</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='text-xl font-semibold tracking-tight'>Mess &amp; Daily Services</h1>
            <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
              One place to configure the daily-living services residents use — menu
              personalization, room-cleaning slots, the amenities catalog, and maintenance
              response targets. Each section reads and writes the same live config as its
              standalone page; changes apply on the next page load, no deploy needed.
            </p>
          </div>

          {/* Section 1 — Choose Your Menu (self-contained policy form; brings its own cards,
              so it is rendered directly under a header rather than wrapped in another Card). */}
          <section className='space-y-4'>
            <SectionHeader
              title='Choose Your Menu'
              description='The optional engagement layer over the default mess menu — meal personalization, dish voting, and special-day proposals — switchable per resident tier, with a master on/off. The feature ships off; turn it on here.'
            />
            <ChooseYourMenuPolicyForm />
          </section>

          {/* Section 2 — Housekeeping slot booking (self-contained policy form; own cards). */}
          <section className='space-y-4'>
            <SectionHeader
              title='Housekeeping Slot Booking'
              description='Every knob of the resident room-cleaning feature — slot length, daily window, capacity, advance-booking lead time, cancellation cutoff, per-tier weekly quotas, and the master switch.'
            />
            <HousekeepingPolicyForm />
          </section>

          {/* Section 3 — Amenities catalog (self-fetching table + create dialog). */}
          <Card>
            <CardContent className='p-6 space-y-6'>
              <SectionHeader
                title='Amenities'
                description='The catalog of informational amenities (Wi-Fi, Balcony, Attached Bath) that can be assigned to hostel rooms and blocks.'
                action={
                  <Button onClick={() => setAmenityCreate(true)}>
                    <Plus className='h-4 w-4 mr-2' /> Add amenity
                  </Button>
                }
              />
              <AmenitiesDataTable />
            </CardContent>
          </Card>

          {/* Section 4 — Maintenance SLA (inline; the extracted section brings its own
              heading + Save + the resolution-time grid). */}
          <div className='border-t pt-6'>
            <MaintenanceSlaSection />
          </div>

          {/* Dialog for the Amenities "Add amenity" action */}
          <AmenityFormDialog
            open={amenityCreate}
            onOpenChange={setAmenityCreate}
            mode='create'
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
