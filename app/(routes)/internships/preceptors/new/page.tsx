'use client';

/**
 * New preceptor page — wraps the shared PreceptorForm. Accepts an optional
 * ?site_id= query param so launching from a site detail page pre-selects.
 */

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useCreatePreceptor } from '@/hooks/internships/usePreceptors';
import {
  PreceptorForm,
  formValuesToCreatePayload,
  type PreceptorFormValues,
} from '../../_components/preceptors/preceptor-form';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../../_components/no-access-alert';

export const navMeta = {
  invokedFrom: '/internships/preceptors',
} as const;

function NewPreceptorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultSiteId = searchParams.get('site_id') ?? undefined;
  const create = useCreatePreceptor();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: PreceptorFormValues) => {
    setError(null);
    try {
      const created = await create.mutateAsync(formValuesToCreatePayload(values));
      if (created?.id) {
        router.push(`/internships/preceptors/${created.id}`);
      } else {
        router.push('/internships/preceptors');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create preceptor');
    }
  };

  return (
    <div className="mt-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Add a preceptor</h1>
        <Button asChild variant="ghost" size="sm">
          <Link href="/internships/preceptors">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to preceptors
          </Link>
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <PreceptorForm
        defaultSiteId={defaultSiteId}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/internships/preceptors')}
        submitLabel="Create preceptor"
        submitting={create.isPending}
      />
    </div>
  );
}

export default function NewPreceptorPage() {
  return (
    <PermissionGuard module="internship.preceptors" action="create" fallback={<NoAccessAlert />}>
    <ContentLayout title="Internships — New Preceptor">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/internships">Internships</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/internships/preceptors">Preceptors</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* useSearchParams() requires a Suspense boundary in App Router. */}
      <Suspense fallback={<div className="mt-6 max-w-3xl">Loading…</div>}>
        <NewPreceptorContent />
      </Suspense>
    </ContentLayout>
    </PermissionGuard>
  );
}
