'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Star, MessageSquareText } from 'lucide-react';
import { WorksheetForm } from '@/components/startup-studio/worksheet-form';
import {
  useFoundationsWorksheet,
  useMyFoundationsResponse,
  useSubmitFoundationsResponse,
} from '@/hooks/startup-studio/use-foundations';
import type {
  FoundationsWorksheet,
  FoundationsResponse,
} from '@/types/startup-studio/foundations';

export function WorksheetFill({ worksheetId }: { worksheetId: string }) {
  const { data: worksheet, isLoading } = useFoundationsWorksheet(worksheetId) as {
    data?: FoundationsWorksheet;
    isLoading: boolean;
  };
  const { data: response, isLoading: respLoading } = useMyFoundationsResponse(worksheetId) as {
    data?: FoundationsResponse | null;
    isLoading: boolean;
  };
  const submit = useSubmitFoundationsResponse(worksheetId);

  if (isLoading || respLoading) {
    return <Skeleton className="h-96 w-full rounded-xl mt-4" />;
  }

  if (!worksheet) {
    return (
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">This worksheet could not be found.</p>
        <Button asChild variant="link" className="px-0 mt-2">
          <Link href="/startup-studio/foundations/my-journey">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to My Journey
          </Link>
        </Button>
      </div>
    );
  }

  // Keep mentor feedback visible even after the student resubmits (Director decision
  // 2026-06-22): show it whenever a review exists; flag it as "previous version" once
  // the student has resubmitted (status back to 'submitted') and it awaits re-review.
  const hasFeedback = !!(
    response?.mentor_feedback ||
    response?.mentor_rating != null ||
    response?.reviewed_at
  );
  const feedbackIsStale = hasFeedback && response?.status === 'submitted';

  return (
    <div className="space-y-5 mt-4 max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="px-2 -ml-2">
        <Link href="/startup-studio/foundations/my-journey">
          <ArrowLeft className="h-4 w-4 mr-1" /> My Journey
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold">{worksheet.title}</h1>
        {worksheet.description && (
          <p className="text-sm text-muted-foreground mt-1">{worksheet.description}</p>
        )}
      </div>

      {hasFeedback && (
        <Card className="border-green-600/40 bg-green-50/40 dark:bg-green-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquareText className="h-4 w-4 text-green-700" /> Mentor feedback
              {response?.mentor_rating != null && (
                <Badge variant="secondary" className="ml-1">
                  <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" />
                  {response.mentor_rating}/5
                </Badge>
              )}
            </CardTitle>
            {feedbackIsStale && (
              <CardDescription className="text-xs">
                On your previous version — a mentor will review your update.
              </CardDescription>
            )}
          </CardHeader>
          {response?.mentor_feedback && (
            <CardContent>
              <CardDescription className="whitespace-pre-wrap text-foreground/80">
                {response.mentor_feedback}
              </CardDescription>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <WorksheetForm
            fields={worksheet.fields}
            initialData={response?.response_data as Record<string, unknown> | undefined}
            submitLabel="Submit worksheet"
            updateLabel="Update & resubmit"
            successMessage="Saved! Your progress is updated."
            onSubmit={async (data) => {
              await submit.mutateAsync({ response_data: data, status: 'submitted' });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
