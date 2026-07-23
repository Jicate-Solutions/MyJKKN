'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Circle, PenLine, ChevronRight, GraduationCap } from 'lucide-react';
import {
  useFoundationsJourney,
  useFoundationsProgress,
} from '@/hooks/startup-studio/use-foundations';
import type {
  FoundationsWorksheetWithResponse,
  FoundationsProgress,
  FoundationsResponseStatus,
} from '@/types/startup-studio/foundations';

const STRAND_LABEL: Record<string, string> = {
  mindset: 'Founder Mindset',
  ideation: 'Ideation',
  evaluation: 'Evaluation',
  model: 'Business Model',
  pitch: 'Pitch',
  reflection: 'Reflection',
};

function statusMeta(status: FoundationsResponseStatus | null) {
  switch (status) {
    case 'reviewed':
      return { label: 'Reviewed', cls: 'bg-green-600 hover:bg-green-600 text-white', Icon: CheckCircle2 };
    case 'submitted':
      return { label: 'Submitted', cls: 'bg-blue-600 hover:bg-blue-600 text-white', Icon: CheckCircle2 };
    case 'draft':
      return { label: 'Draft', cls: 'bg-amber-500 hover:bg-amber-500 text-white', Icon: PenLine };
    default:
      return { label: 'Not started', cls: 'bg-muted text-muted-foreground', Icon: Circle };
  }
}

export function MyJourney() {
  const { data: journey, isLoading } = useFoundationsJourney() as {
    data?: FoundationsWorksheetWithResponse[];
    isLoading: boolean;
  };
  const { data: progress } = useFoundationsProgress() as { data?: FoundationsProgress };

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const worksheets = journey ?? [];

  return (
    <div className="space-y-6 mt-4">
      <div>
        <h1 className="text-2xl font-bold py-1">My Journey</h1>
        <p className="text-sm text-muted-foreground">
          Complete each worksheet at your own pace. Your answers are private to you and your mentor.
        </p>
      </div>

      {progress && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {progress.submitted_required} of {progress.total_required} completed
              </span>
              <span className="font-semibold tabular-nums flex items-center gap-1.5">
                {progress.graduated && <GraduationCap className="h-4 w-4 text-green-600" />}
                {progress.completion_pct}%
              </span>
            </div>
            <Progress value={progress.completion_pct} className="h-2" />
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {worksheets.map((w, idx) => {
          const meta = statusMeta(w.response?.status ?? null);
          return (
            <Link key={w.id} href={`/startup-studio/foundations/${w.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center gap-4 py-4">
                  <meta.Icon
                    className={`h-5 w-5 shrink-0 ${
                      w.response?.status === 'submitted' || w.response?.status === 'reviewed'
                        ? 'text-green-600'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="font-medium truncate">{w.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {STRAND_LABEL[w.strand] ?? w.strand}
                    </p>
                  </div>
                  <Badge className={meta.cls} variant="secondary">
                    {meta.label}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {worksheets.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No worksheets are available yet. Please check back soon.
          </p>
        )}
      </div>
    </div>
  );
}
