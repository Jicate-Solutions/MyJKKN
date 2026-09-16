'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { useCreateCdcDrive } from '@/hooks/cdc/use-cdc-drives';
import { DriveForm, type DriveFormValues } from '../_components/drive-form';

export default function NewCdcDrivePage() {
  const router = useRouter();
  const createDrive = useCreateCdcDrive();
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(values: DriveFormValues) {
    setSubmitError(null);
    try {
      const created = await createDrive.mutateAsync({
        ...values,
        eligibility: values.eligibility ?? undefined,
      });
      toast.success('Drive created as draft');
      router.push(`/cdc/drives/${created.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create drive');
    }
  }

  return (
    <PermissionGuard module="cdc.drives" action="create">
      <ContentLayout title="New Campus Drive">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/cdc">CDC</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/cdc/drives">Drives</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-6 mb-6 max-w-4xl">
          <h1 className="text-2xl font-semibold tracking-tight">New Drive</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saved as a <strong>draft</strong>. Announce it and open willingness from the drive page —
            learners in the selected institutions and semesters are notified the moment willingness opens.
          </p>
        </div>

        <DriveForm
          mode="create"
          submitting={createDrive.isPending}
          submitError={submitError}
          onSubmit={handleSubmit}
          cancelHref="/cdc/drives"
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
