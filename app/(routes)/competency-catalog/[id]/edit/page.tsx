'use client';

// ============================================================================
// Competency Catalog - Edit Competency
// ============================================================================

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CompetencyForm } from '../../_components/competency-form';
import { useCompetency, useUpdateCompetency } from '@/hooks/competency';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';
import Loading from '@/components/Loading/Loading';
import type { UpdateCompetencyDTO } from '@/types/competency';

export default function EditCompetencyPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: competency, isLoading: competencyLoading, error } = useCompetency(id);
  const updateCompetency = useUpdateCompetency(id);
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  const canEdit = isSuperAdmin || canAccess('competency.catalog', 'edit');

  // Loading states
  if (permissionsLoading || competencyLoading) {
    return (
      <ContentLayout title="Edit Competency">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // Permission check
  if (!canEdit) {
    router.push(`/competency-catalog/${id}`);
    return <Loading title="Redirecting..." />;
  }

  // Error state
  if (error || !competency) {
    return (
      <ContentLayout title="Edit Competency">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Competency Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'The competency you are trying to edit does not exist.'}
            </p>
            <Button onClick={() => router.push('/competency-catalog')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Catalog
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const handleSubmit = async (data: UpdateCompetencyDTO) => {
    try {
      await updateCompetency.mutateAsync(data);
      toast.success('Competency updated successfully!');
      router.push(`/competency-catalog/${id}`);
    } catch (error: any) {
      if (error?.code === '23505' || error?.message?.includes('duplicate')) {
        toast.error('A competency with this code already exists');
      } else {
        toast.error(error?.message || 'Failed to update competency');
      }
    }
  };

  return (
    <PermissionGuard module="competency.catalog" action="edit">
      <ContentLayout title="Edit Competency">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/competency-catalog">Competency Catalog</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/competency-catalog/${id}`}>
                  {competency.competency_code}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Edit</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/competency-catalog/${id}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Edit Competency</h1>
              <p className="text-muted-foreground">
                {competency.competency_code} - {competency.competency_name}
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="max-w-4xl">
            <CompetencyForm
              competency={competency}
              institutionId={competency.institution_id}
              onSubmit={handleSubmit}
              onCancel={() => router.push(`/competency-catalog/${id}`)}
              isSubmitting={updateCompetency.isPending}
            />
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
