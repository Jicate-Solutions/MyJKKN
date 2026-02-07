'use client';

// ============================================================================
// Learning Path - Edit Page
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
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { LearningPathForm } from '../../_components/learning-path-form';
import { useLearningPath, useUpdateLearningPath } from '@/hooks/learning-path';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';
import Loading from '@/components/Loading/Loading';
import type { UpdateLearningPathInput } from '@/types/learning-path';

export default function EditLearningPathPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: path, isLoading: pathLoading, error } = useLearningPath(id);
  const updatePath = useUpdateLearningPath(id);
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  const canEdit = isSuperAdmin || canAccess('learning_paths', 'edit');

  // Loading states
  if (permissionsLoading || pathLoading) {
    return (
      <ContentLayout title="Edit Learning Path">
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
    router.push(`/learning-paths/${id}`);
    return <Loading title="Redirecting..." />;
  }

  // Error state
  if (error || !path) {
    return (
      <ContentLayout title="Edit Learning Path">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Learning Path Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'The learning path you are trying to edit does not exist.'}
            </p>
            <Button onClick={() => router.push('/learning-paths')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Learning Paths
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const handleSubmit = async (data: UpdateLearningPathInput) => {
    try {
      await updatePath.mutateAsync(data as UpdateLearningPathInput);
      toast.success('Learning path updated successfully!');
      router.push(`/learning-paths/${id}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update learning path');
    }
  };

  return (
    <ContentLayout title="Edit Learning Path">
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
              <BreadcrumbLink href={`/learning-paths/${id}`}>{path.title}</BreadcrumbLink>
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
            <Link href={`/learning-paths/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Learning Path</h1>
            <p className="text-muted-foreground">{path.title}</p>
          </div>
        </div>

        {/* Form */}
        <div className="max-w-4xl">
          <LearningPathForm
            institutionId={path.institution_id}
            path={path}
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/learning-paths/${id}`)}
            isSubmitting={updatePath.isPending}
          />
        </div>
      </div>
    </ContentLayout>
  );
}
