'use client';

/**
 * /cdc/drives/[id]/edit — edit an existing drive (all fields, audience,
 * circular, eligibility, deadline). Content edits never re-notify; an audience
 * change on an open drive notifies only the newly eligible learners.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { useCdcDrive, useUpdateCdcDrive } from '@/hooks/cdc/use-cdc-drives';
import { CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';
import { DriveForm, type DriveFormValues } from '../../_components/drive-form';
import { DriveStatusBadge } from '../../_components/drive-status-badge';
import { WillingnessCyclesCard } from '../../_components/willingness-cycles-card';

const WINDOW_MANAGED_STATUSES = new Set(['willingness_open', 'eligibility_locked', 'attendance_day', 'results_announced']);

export default function EditCdcDrivePage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.drives" action="edit">
      <EditContent {...props} />
    </PermissionGuard>
  );
}

function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading, error } = useCdcDrive(id);
  const updateDrive = useUpdateCdcDrive();
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <ContentLayout title="Edit drive">
        <p className="text-sm text-muted-foreground p-6">Loading drive…</p>
      </ContentLayout>
    );
  }
  if (error || !data) {
    return (
      <ContentLayout title="Edit drive">
        <div className="p-6">
          <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Drive not found'}</p>
          <Button asChild variant="outline" className="mt-4"><Link href="/cdc/drives">Back to drives</Link></Button>
        </div>
      </ContentLayout>
    );
  }

  const drive = data.data;
  const terminal = drive.status === 'closed' || drive.status === 'cancelled';
  const windowManagedByCycles = WINDOW_MANAGED_STATUSES.has(drive.status);

  async function handleSubmit(values: DriveFormValues) {
    setSubmitError(null);
    try {
      const result = await updateDrive.mutateAsync({ driveId: id, payload: values });
      const n = result.notify;
      if (result.notify_error) {
        toast.error(`Saved, but notifying newly eligible learners failed: ${result.notify_error}`);
      } else if (n && n.notified > 0) {
        toast.success(
          `Saved. ${n.notified} newly eligible learner${n.notified === 1 ? '' : 's'} notified` +
            (n.already_notified ? ` · ${n.already_notified} already notified earlier` : '')
        );
      } else if (result.targeting_changed && drive.status === 'willingness_open') {
        toast.success('Saved. Audience changed, but every eligible learner had already been notified.');
      } else {
        toast.success('Drive updated');
      }
      router.push(`/cdc/drives/${id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save drive');
    }
  }

  return (
    <ContentLayout title={`Edit — ${drive.title}`}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/cdc/drives">Drives</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href={`/cdc/drives/${id}`}>{drive.title}</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Edit</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 mb-6 max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Edit Drive</h1>
          <DriveStatusBadge status={drive.status} />
        </div>
        {terminal ? (
          <Alert className="mt-3">
            <Info className="h-4 w-4" />
            <AlertTitle>This drive is {CDC_DRIVE_STATUS_LABELS[drive.status].toLowerCase()}</AlertTitle>
            <AlertDescription>Closed and cancelled drives cannot be edited.</AlertDescription>
          </Alert>
        ) : drive.status === 'willingness_open' ? (
          <p className="text-sm text-muted-foreground mt-1">
            Willingness is open. Editing details does not re-notify anyone. Changing institutions or
            semesters notifies only learners who become newly eligible.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">Changes are saved to the drive immediately.</p>
        )}
      </div>

      {!terminal ? (
        <DriveForm
          key={drive.updated_at}
          mode="edit"
          drive={drive}
          eligibility={data.eligibility}
          submitting={updateDrive.isPending}
          submitError={submitError}
          onSubmit={handleSubmit}
          cancelHref={`/cdc/drives/${id}`}
          windowManagedByCycles={windowManagedByCycles}
        />
      ) : null}

      {windowManagedByCycles ? (
        <div className="mt-8 mb-10">
          <WillingnessCyclesCard driveId={id} driveStatus={drive.status} />
        </div>
      ) : null}
    </ContentLayout>
  );
}
