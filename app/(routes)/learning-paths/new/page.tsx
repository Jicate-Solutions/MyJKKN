'use client';

// ============================================================================
// Learning Paths - Create New Path
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
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { LearningPathForm } from '../_components/learning-path-form';
import { useCreateLearningPath } from '@/hooks/learning-path';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';
import Loading from '@/components/Loading/Loading';
import type { CreateLearningPathInput } from '@/types/learning-path';

export default function NewLearningPathPage() {
  const router = useRouter();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const createPath = useCreateLearningPath();
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  const canCreate = isSuperAdmin || canAccess('learning_paths', 'create');

  if (permissionsLoading) {
    return <Loading title="Loading..." />;
  }

  if (!canCreate) {
    router.push('/learning-paths');
    return <Loading title="Redirecting..." />;
  }

  if (!institutionId) {
    return (
      <ContentLayout title="Create Learning Path">
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No institution found. Please contact an administrator.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const handleSubmit = async (data: CreateLearningPathInput) => {
    try {
      await createPath.mutateAsync(data as CreateLearningPathInput);
      toast.success('Learning path created successfully!');
      router.push('/learning-paths');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create learning path');
    }
  };

  return (
    <ContentLayout title="Create Learning Path">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/learning-paths">Learning Paths</BreadcrumbLink>
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
            <Link href="/learning-paths">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create New Learning Path</h1>
            <p className="text-muted-foreground">
              Design a personalized learning journey with competency targets
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="max-w-4xl">
          <LearningPathForm
            institutionId={institutionId}
            onSubmit={handleSubmit}
            onCancel={() => router.push('/learning-paths')}
            isSubmitting={createPath.isPending}
          />
        </div>
      </div>
    </ContentLayout>
  );
}
