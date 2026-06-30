'use client';

/**
 * Policies & Workflows — unified super-admin configuration page.
 *
 * Consolidates the scattered policy/workflow settings surfaces — curfew, leave
 * types, approval chains, notification rules and general settings — into ONE page
 * of stacked, INLINE sections. Follows the live-verified PR #1683 pattern.
 *
 * Each sub-domain's editor body was extracted into a reusable chrome-less Section
 * component (the …Section exports below); this page embeds them directly so every
 * editor is inline on one page. Leave Types stays a self-fetching table + dialog.
 * No editor logic is rewritten; same `campus_living.settings.view` gate, no new key.
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

// Reuse — leave types editor (self-fetching table + form dialog)
import { HostelLeaveTypesDataTable } from '../leave-types/_components/hostel-leave-types-data-table';
import { HostelLeaveTypeFormDialog } from '../leave-types/_components/hostel-leave-type-form-dialog';

// Inline — the extracted chrome-less section editors (each renders its own heading + cards)
import { CurfewSection } from '../curfew/_components/-curfew-section';
import { ApprovalChainsSection } from '../approval-chains/_components/-approval-chains-section';
import { NotificationRulesSection } from '../notification-rules/_components/-notification-rules-section';
import { GeneralSettingsSection } from '../general/_components/-general-settings-section';

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

/** A divider so each inline editor reads as a distinct section of the page. */
function SectionDivider() {
  return <div className='border-t' />;
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
        <div className='space-y-8'>
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
              curfew, leave, approval chains, notifications and general defaults. Every
              section is inline and reuses its existing editor; changes apply live.
            </p>
          </div>

          {/* Curfew — inline */}
          <CurfewSection />

          <SectionDivider />

          {/* Leave types — inline (self-fetching table + form dialog) */}
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

          <SectionDivider />

          {/* Approval chains — inline */}
          <ApprovalChainsSection />

          <SectionDivider />

          {/* Notification rules — inline */}
          <NotificationRulesSection />

          <SectionDivider />

          {/* General settings — inline */}
          <GeneralSettingsSection />

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
