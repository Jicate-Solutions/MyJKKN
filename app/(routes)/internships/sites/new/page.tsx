'use client';

/**
 * New internship site — wraps the shared SiteForm and routes back to the list
 * (or to the new site's detail page) on success.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateSite } from '@/hooks/internships/useSites';
import {
  SiteForm,
  formValuesToCreatePayload,
  type SiteFormValues,
} from '../../_components/sites/site-form';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../../_components/no-access-alert';

export const navMeta = {
  invokedFrom: '/internships/sites',
} as const;

export default function NewInternshipSitePage() {
  const router = useRouter();
  const create = useCreateSite();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: SiteFormValues) => {
    setError(null);
    try {
      const created = await create.mutateAsync(formValuesToCreatePayload(values));
      if (created?.id) {
        router.push(`/internships/sites/${created.id}`);
      } else {
        router.push('/internships/sites');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create site');
    }
  };

  return (
    <PermissionGuard module="internship.sites" action="create" fallback={<NoAccessAlert />}>
    <ContentLayout title="Internships — New Site">
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
            <BreadcrumbLink asChild><Link href="/internships/sites">Sites</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-3xl">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Add a site</h1>
          <Button asChild variant="ghost" size="sm">
            <Link href="/internships/sites">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sites
            </Link>
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <SiteForm
          onSubmit={handleSubmit}
          onCancel={() => router.push('/internships/sites')}
          submitLabel="Create site"
          submitting={create.isPending}
        />
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
