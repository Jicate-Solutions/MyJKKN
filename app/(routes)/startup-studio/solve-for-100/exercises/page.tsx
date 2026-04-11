'use client';

/**
 * SF100 Exercises List Page
 * Shows all exercises for the active program.
 * Teams can see and complete exercises, admins can create new ones.
 */

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ClipboardList,
  Plus,
  Calendar,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useSF100Programs, useSF100Exercises } from '@/hooks/startup-studio';
import type { SF100Exercise } from '@/types/startup-studio/sf100';

export default function ExercisesPage() {
  // Get the active program
  const { data: programsData, isLoading: loadingPrograms } = useSF100Programs({
    status: 'active',
    limit: 1,
  });

  const programs = (programsData as any)?.data || [];
  const activeProgram = programs[0];
  const programId = activeProgram?.id || '';

  const { data: exercises, isLoading: loadingExercises } = useSF100Exercises(programId);

  const isLoading = loadingPrograms || (!!programId && loadingExercises);
  const exerciseList = (exercises || []) as SF100Exercise[];

  // Separate published from draft/archived
  const published = exerciseList.filter((e) => e.status === 'published');
  const drafts = exerciseList.filter((e) => e.status === 'draft');

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Exercises' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Team Exercises</h1>
            <p className="text-sm text-muted-foreground">
              Complete exercises to sharpen your startup thinking
            </p>
          </div>
          <Link href="/startup-studio/solve-for-100/exercises/create">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Create Exercise
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : !programId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">
                No active program found. Exercises are linked to Solve for 100 programs.
              </p>
            </CardContent>
          </Card>
        ) : published.length === 0 && drafts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">
                No exercises created yet. Click &quot;Create Exercise&quot; to add the first one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {published.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {published.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
              </div>
            )}

            {drafts.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Drafts
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {drafts.map((exercise) => (
                    <ExerciseCard key={exercise.id} exercise={exercise} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}

function ExerciseCard({ exercise }: { exercise: SF100Exercise }) {
  const isOverdue = exercise.due_date && new Date(exercise.due_date) < new Date();

  return (
    <Link href={`/startup-studio/solve-for-100/exercises/${exercise.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{exercise.title}</CardTitle>
            <div className="flex items-center gap-1.5 shrink-0">
              {exercise.is_required && (
                <Badge variant="destructive" className="text-[10px] h-5">
                  Required
                </Badge>
              )}
              {exercise.status === 'draft' && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  Draft
                </Badge>
              )}
            </div>
          </div>
          {exercise.description && (
            <CardDescription className="text-xs line-clamp-2">
              {exercise.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{exercise.fields.length} questions</span>
              {exercise.due_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                    Due {new Date(exercise.due_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
