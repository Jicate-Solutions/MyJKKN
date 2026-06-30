'use client';

/**
 * Policies & Workflows — unified super-admin configuration page.
 *
 * Consolidates the scattered policy/workflow settings surfaces — curfew, leave
 * types, approval chains, notification rules and general settings — into ONE page
 * of stacked sections. Follows the live-verified PR #1683 pattern (Allocations &
 * Eligibility): same page shell, same `campus_living.settings.view` gate, no new
 * permission key, and it REUSES the existing section editors rather than rewriting
 * them.
 *
 * Reuse strategy (one section per sub-domain):
 *  - Leave Types — INLINED. Reuses the self-fetching <HostelLeaveTypesDataTable/>
 *    + <HostelLeaveTypeFormDialog/> exactly like the pilot reused the categories
 *    and eligibility editors.
 *  - Curfew, Approval Chains, Notification Rules, General — LINKED. Each of these is
 *    a bespoke full-page editor that wraps its OWN ContentLayout / chrome and exports
 *    only its page component (no reusable sub-component). Embedding it inline would
 *    double-wrap the page chrome, so each gets a labelled section that opens the
 *    existing editor in place. No editor is rewritten.
 */

import { useState } from 'react';
import Link from 'next/link';
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
import { Plus, ArrowRight } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';

// Reuse — leave types editor (self-fetching table + form dialog)
import { HostelLeaveTypesDataTable } from '../leave-types/_components/hostel-leave-types-data-table';
import { HostelLeaveTypeFormDialog } from '../leave-types/_components/hostel-leave-type-form-dialog';

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

/**
 * A linked section — for bespoke full-page editors that own their page chrome and
 * can't be embedded inline without double-wrapping. Renders the section header plus
 * an "Open" button that navigates to the existing editor.
 */
function LinkedSection({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Card>
      <CardContent className='p-6'>
        <SectionHeader
          title={title}
          description={description}
          action={
            <Button asChild variant='outline'>
              <Link href={href}>
                Open <ArrowRight className='ml-2 h-4 w-4' />
              </Link>
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

export default function PoliciesWorkflowsConfigPage() {
  const [leaveTypeCreate, setLeaveTypeCreate] = useState(false);

  return (
    // Super-admin / hostel-admin gate (fail-closed; super-admins bypass). Matches the
    // sibling settings pages — same campus_living.settings.view key, no new permission.
    <PermissionGuard
      module='campus_living.settings'
      action='view'
      fallback={
        <ContentLayout title='Policies & Workflows'>
          <PermissionError
            message='Campus Living configuration is restricted to hostel administrators.'
            requiredPermission='campus_living.settings.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Policies & Workflows'>
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
                <BreadcrumbPage>Policies &amp; Workflows</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='text-xl font-semibold tracking-tight'>Policies &amp; Workflows</h1>
            <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
              One place to configure the rules and approvals that govern hostel life —
              curfew, leave, approval chains, notifications and general defaults. Each
              section reuses its existing editor; changes apply live, no deploy needed.
            </p>
          </div>

          {/* Section 1 — Curfew (linked: bespoke full-page editor with a live resolver) */}
          <LinkedSection
            title='Curfew policies'
            description='Entry and exit curfew times by institution, gender and day of week — the strictest active rule wins per direction.'
            href='/campus-living/settings/curfew'
          />

          {/* Section 2 — Leave types (INLINED: self-fetching table + form dialog) */}
          <Card>
            <CardContent className='p-6 space-y-6'>
              <SectionHeader
                title='Leave types'
                description='Leave categories for hostelers — max duration, parent consent, warden approval flow and attachment requirements. System defaults are seeded per institution and cannot be deleted.'
                action={
                  <Button onClick={() => setLeaveTypeCreate(true)}>
                    <Plus className='h-4 w-4 mr-2' /> Add leave type
                  </Button>
                }
              />
              <HostelLeaveTypesDataTable />
            </CardContent>
          </Card>

          {/* Section 3 — Approval chains (linked: bespoke full-page editor) */}
          <LinkedSection
            title='Approval chains'
            description='Who approves what — the multi-step approval workflow for leave, curfew exemptions and visitor requests.'
            href='/campus-living/settings/approval-chains'
          />

          {/* Section 4 — Notification rules (linked: bespoke full-page editor) */}
          <LinkedSection
            title='Notification rules'
            description='When and how residents and wardens are alerted — the email, SMS and push rules that fire per hostel event.'
            href='/campus-living/settings/notification-rules'
          />

          {/* Section 5 — General settings (linked: bespoke single-form editor) */}
          <LinkedSection
            title='General settings'
            description='Foundational campus-living configuration — academic year, hostel names and basic operational defaults.'
            href='/campus-living/settings/general'
          />

          {/* Dialogs */}
          <HostelLeaveTypeFormDialog
            open={leaveTypeCreate}
            onOpenChange={setLeaveTypeCreate}
            mode='create'
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
