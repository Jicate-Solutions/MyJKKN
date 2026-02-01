'use client';

// ============================================================================
// Competency Catalog - Create New Competency
// ============================================================================

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CompetencyForm } from '../_components/competency-form';
import { useCreateCompetency } from '@/hooks/competency';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';
import Loading from '@/components/Loading/Loading';
import type { CreateCompetencyDTO } from '@/types/competency';

export default function NewCompetencyPage() {
  const router = useRouter();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const createCompetency = useCreateCompetency();
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('competency.catalog', 'create');

  if (permissionsLoading) {
    return <Loading title="Loading..." />;
  }

  if (!canCreate) {
    router.push('/competency-catalog');
    return <Loading title="Redirecting..." />;
  }

  if (!institutionId) {
    return (
      <ContentLayout title="Create Competency">
        <div className="text-center py-12">
          <p className="text-muted-foreground">No institution found. Please contact an administrator.</p>
        </div>
      </ContentLayout>
    );
  }

  const handleSubmit = async (data: CreateCompetencyDTO) => {
    try {
      await createCompetency.mutateAsync(data);
      toast.success('Competency created successfully!');
      router.push('/competency-catalog');
    } catch (error: any) {
      if (error?.code === '23505' || error?.message?.includes('duplicate')) {
        toast.error('A competency with this code already exists');
      } else {
        toast.error(error?.message || 'Failed to create competency');
      }
    }
  };

  return (
    <PermissionGuard module="competency.catalog" action="create">
      <ContentLayout title="Create Competency">
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
                <BreadcrumbPage>Create</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/competency-catalog">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Create New Competency</h1>
              <p className="text-muted-foreground">
                Define a new skill or learning target for your institution
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="max-w-4xl">
            <CompetencyForm
              institutionId={institutionId}
              onSubmit={handleSubmit}
              onCancel={() => router.push('/competency-catalog')}
              isSubmitting={createCompetency.isPending}
            />
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
