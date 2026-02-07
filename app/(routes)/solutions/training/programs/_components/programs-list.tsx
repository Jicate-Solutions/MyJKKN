'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, BookOpen, Users, Calendar, ArrowRight, MapPin, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import {
  useTrainingPrograms,
  getProgramTypeLabel,
  PROGRAM_TYPE_LABELS,
  TRACK_LABELS,
  LOCATION_PREFERENCE_LABELS,
} from '@/hooks/solutions/use-training';

function getStatusFromProgram(program: {
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
}): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (program.actual_end) return { label: 'Completed', variant: 'outline' };
  if (program.actual_start) return { label: 'Active', variant: 'default' };
  if (program.scheduled_start) {
    const start = new Date(program.scheduled_start);
    if (start > new Date()) return { label: 'Planned', variant: 'secondary' };
    return { label: 'Active', variant: 'default' };
  }
  return { label: 'Draft', variant: 'secondary' };
}

export function ProgramsList() {
  const { data: programsData, isLoading, error } = useTrainingPrograms({ limit: 50 });

  const programs = programsData?.data || [];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-24 mb-2" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-9 w-full mt-4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load training programs. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  if (programs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Training Programs Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Training programs will appear here once they are created through solutions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => {
        const status = getStatusFromProgram(program);
        const programTypeLabel = program.program_type
          ? PROGRAM_TYPE_LABELS[program.program_type]
          : 'Custom';

        return (
          <Card key={program.id} className="hover:border-primary transition-colors">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant={status.variant}>
                  {status.label}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {programTypeLabel}
                </Badge>
              </div>
              <CardTitle className="mt-2">
                {(program as any).solution?.title || 'Training Program'}
              </CardTitle>
              <CardDescription>
                {(program as any).solution?.solution_code && (
                  <Link
                    href={`/solutions/${(program as any).solution?.id || ''}`}
                    className="hover:underline"
                  >
                    {(program as any).solution.solution_code}
                  </Link>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-4">
                  {program.participant_count && (
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {program.participant_count} participants
                    </span>
                  )}
                  {program.track && (
                    <span className="flex items-center gap-1">
                      {TRACK_LABELS[program.track]}
                    </span>
                  )}
                </div>
                {program.location && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {program.location}
                    {program.location_preference && (
                      <span className="ml-1">
                        ({LOCATION_PREFERENCE_LABELS[program.location_preference]})
                      </span>
                    )}
                  </div>
                )}
                {program.scheduled_start && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(program.scheduled_start), 'dd MMM yyyy')}
                    {program.scheduled_end && (
                      <span> - {format(new Date(program.scheduled_end), 'dd MMM yyyy')}</span>
                    )}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" className="w-full mt-4" asChild>
                <Link href={`/solutions/training/programs/${program.id}`}>
                  View Details
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
