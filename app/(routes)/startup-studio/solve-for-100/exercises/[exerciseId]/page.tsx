'use client';

/**
 * SF100 Exercise Detail Page
 *
 * Shows:
 * 1. Exercise description + metadata
 * 2. The form for the current team to fill out (if enrolled)
 * 3. All team responses (full transparency)
 */

import { use, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Calendar, Eye, PenLine } from 'lucide-react';
import {
  useSF100Exercise,
  useSF100Programs,
  useMySF100Enrollment,
  useTeamExerciseResponse,
} from '@/hooks/startup-studio';
import { startupStudioKeys } from '@/lib/query-keys';
import { SF100ExerciseForm } from '../../_components/sf100-exercise-form';
import { SF100ExerciseResponses } from '../../_components/sf100-exercise-responses';
import type { SF100Exercise, SF100ExerciseResponse } from '@/types/startup-studio/sf100';

export default function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = use(params);

  // Fetch exercise
  const { data: exercise, isLoading: loadingExercise } = useSF100Exercise(exerciseId);

  // Get active program for enrollment lookup
  const { data: programsData } = useSF100Programs({ status: 'active', limit: 1 });
  const programs = (programsData as any)?.data || [];
  const activeProgram = programs[0];
  const programId = activeProgram?.id || '';

  // Get current user's enrollment
  const { data: myEnrollment, isLoading: loadingEnrollment } = useMySF100Enrollment(programId);
  const enrollmentId = (myEnrollment as any)?.id || '';

  // Get current team's response (may be null/404)
  const {
    data: existingResponse,
    isLoading: loadingResponse,
  } = useTeamExerciseResponse(exerciseId, enrollmentId);

  const ex = exercise as SF100Exercise | undefined;
  const isLoading = loadingExercise;

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>(enrollmentId ? 'form' : 'responses');

  const handleSubmitSuccess = () => {
    toast.success('Response submitted');
    queryClient.invalidateQueries({
      queryKey: startupStudioKeys.sf100.exercises.responses(exerciseId),
    });
    setActiveTab('responses');
  };

  if (isLoading) {
    return (
      <ContentLayout title="Startup Studio">
        <div className="space-y-4 mt-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!ex) {
    return (
      <ContentLayout title="Startup Studio">
        <div className="text-center py-12">
          <AlertCircle className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Exercise not found.</p>
        </div>
      </ContentLayout>
    );
  }

  const isOverdue = ex.due_date && new Date(ex.due_date) < new Date();
  const hasExistingResponse = !!(existingResponse as SF100ExerciseResponse | null);

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Exercises', href: '/startup-studio/solve-for-100/exercises' },
          { label: ex.title },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <div className="flex items-start gap-3 mb-2">
            <h1 className="text-2xl font-bold py-1">{ex.title}</h1>
            <div className="flex items-center gap-1.5 mt-2">
              {ex.is_required && (
                <Badge variant="destructive" className="text-[10px]">Required</Badge>
              )}
              {ex.status === 'draft' && (
                <Badge variant="secondary">Draft</Badge>
              )}
              {hasExistingResponse && (
                <Badge variant="default" className="bg-green-600 text-[10px]">Submitted</Badge>
              )}
            </div>
          </div>
          {ex.description && (
            <p className="text-sm text-muted-foreground max-w-2xl">{ex.description}</p>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>{ex.fields.length} questions</span>
            {ex.due_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                  Due {new Date(ex.due_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Tabbed view: Form / All Responses */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            {enrollmentId && (
              <TabsTrigger value="form" className="gap-1.5">
                <PenLine className="h-3.5 w-3.5" />
                Your Response
              </TabsTrigger>
            )}
            <TabsTrigger value="responses" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              All Responses
            </TabsTrigger>
          </TabsList>

          {enrollmentId && (
            <TabsContent value="form" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {hasExistingResponse ? 'Update Your Response' : 'Fill Out This Exercise'}
                  </CardTitle>
                  <CardDescription>
                    {hasExistingResponse
                      ? 'You can update your answers at any time. Your latest submission will be saved.'
                      : 'Answer each question thoughtfully. All teams will be able to see your response.'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingResponse ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <SF100ExerciseForm
                      fields={ex.fields}
                      exerciseId={ex.id}
                      enrollmentId={enrollmentId}
                      initialData={(existingResponse as SF100ExerciseResponse | null)?.response_data}
                      onSuccess={handleSubmitSuccess}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="responses" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Team Responses</CardTitle>
                <CardDescription>
                  Full transparency -- every team can see every other team&apos;s answers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SF100ExerciseResponses exerciseId={ex.id} fields={ex.fields} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {!enrollmentId && !loadingEnrollment && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-amber-800 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>
                  You are not enrolled in the active Solve for 100 program. You can view
                  responses but cannot submit your own.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
