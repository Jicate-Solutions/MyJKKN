'use client';

/**
 * SF100ExerciseResponses — Shows all team responses for an exercise.
 * Full transparency — every team sees everyone's responses.
 *
 * Usage:
 *   <SF100ExerciseResponses exerciseId={exercise.id} fields={exercise.fields} />
 */

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Users, CheckCircle2, Clock } from 'lucide-react';
import { useSF100ExerciseResponses } from '@/hooks/startup-studio';
import type { SF100ExerciseField, SF100ExerciseResponse } from '@/types/startup-studio/sf100';

interface SF100ExerciseResponsesProps {
  exerciseId: string;
  fields: SF100ExerciseField[];
}

export function SF100ExerciseResponses({
  exerciseId,
  fields,
}: SF100ExerciseResponsesProps) {
  const { data: responses, isLoading, error } = useSF100ExerciseResponses(exerciseId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        Unable to load responses.
      </p>
    );
  }

  const responseList = (responses || []) as SF100ExerciseResponse[];

  if (responseList.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No teams have responded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <CheckCircle2 className="h-4 w-4" />
        <span>{responseList.length} team{responseList.length !== 1 ? 's' : ''} responded</span>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {responseList.map((response) => {
          const teamName =
            (response.enrollment as any)?.registration?.team_name || 'Unknown Team';
          const submitterName =
            (response.submitter as any)?.full_name || (response.submitter as any)?.email || 'Unknown';
          const submittedDate = new Date(response.submitted_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <AccordionItem key={response.id} value={response.id} className="border rounded-lg">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 text-left">
                  <div>
                    <p className="font-medium text-sm">{teamName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>by {submitterName}</span>
                      <span aria-hidden="true">·</span>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {submittedDate}
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  {fields.map((field, index) => {
                    const value = response.response_data[field.id];
                    if (value === undefined || value === null || value === '') return null;

                    return (
                      <div key={field.id} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          {index + 1}. {field.label}
                        </p>
                        <div className="text-sm">
                          {renderResponseValue(field, value)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function renderResponseValue(field: SF100ExerciseField, value: any) {
  if (field.type === 'select' || field.type === 'radio') {
    return <Badge variant="outline">{String(value)}</Badge>;
  }
  if (field.type === 'scale') {
    return (
      <Badge variant="secondary" className="tabular-nums">
        {value} / {field.options?.length || 10}
      </Badge>
    );
  }
  if (field.type === 'textarea') {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{String(value)}</p>;
  }
  return <p className="text-sm">{String(value)}</p>;
}
