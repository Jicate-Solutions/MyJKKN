'use client';

/**
 * The interactive shell for /learners/my-marks/internal.
 *
 * Layers (top to bottom):
 *   1. SemesterTabs       — outermost; one tab per semester the student has
 *                           Approved is_regular registrations in.
 *   2. AssessmentFinalTabs — Assessment | Final segmented control.
 *   3. <AssessmentPanel /> or <FinalPanel /> — actual content.
 *
 * URL contract:
 *   ?semester=<code>&subview=assessment|final&setting=<id>&round=<n>
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, ClipboardList } from 'lucide-react';
import { useMyMarksRegistrations } from '@/hooks/learners/use-my-marks';
import { MarksViewTabs } from './marks-view-tabs';
import { SemesterTabs } from './semester-tabs';
import { AssessmentFinalTabs } from './assessment-final-tabs';
import { AssessmentPanel } from './assessment-panel';
import { FinalPanel } from './final-panel';

interface InternalMarksShellProps {
  initialSemester?: string;
  initialSubview: 'assessment' | 'final';
  initialSetting?: string;
  initialRound?: number;
}

export function InternalMarksShell({
  initialSemester,
  initialSubview,
  initialSetting,
  initialRound,
}: InternalMarksShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data, isLoading, error, refetch } = useMyMarksRegistrations();

  // Track URL state via local mirrors. Source of truth is the URL.
  const [subview, setSubview] = useState<'assessment' | 'final'>(initialSubview);
  useEffect(() => {
    const next = (searchParams.get('subview') as 'assessment' | 'final') ?? 'assessment';
    setSubview(next);
  }, [searchParams]);

  // Resolve the active semester. Default to current_semester_code if URL empty.
  const activeSemesterCode = useMemo(() => {
    const fromUrl = searchParams.get('semester') ?? initialSemester ?? null;
    if (fromUrl && data?.semesters.some((s) => s.semester_code === fromUrl)) {
      return fromUrl;
    }
    return data?.current_semester_code ?? null;
  }, [searchParams, initialSemester, data]);

  const activeSemester = useMemo(
    () => data?.semesters.find((s) => s.semester_code === activeSemesterCode) ?? null,
    [data, activeSemesterCode]
  );

  function pushParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <MarksViewTabs />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading your marks...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Could not load your registrations
          </CardTitle>
          <CardDescription>
            {(error as Error).message ?? 'Something went wrong. Try refreshing the page.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            onClick={() => refetch()}
            className="text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.semesters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            No registrations found
          </CardTitle>
          <CardDescription>
            You don&apos;t have any approved exam registrations yet. Marks will appear here once your registrations are approved by your institution.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <MarksViewTabs />

      {/* Sticky semester selector — premium feel on mobile */}
      <div className="sticky top-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-1 sm:py-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:bg-transparent sm:backdrop-blur-none">
        <SemesterTabs
          semesters={data.semesters}
          activeCode={activeSemesterCode}
          currentCode={data.current_semester_code}
          onSelect={(code) => {
            // Reset CIA setting + round when changing semester to avoid mismatches
            const params = new URLSearchParams(searchParams);
            params.set('semester', code);
            params.delete('setting');
            params.delete('round');
            router.push(`${pathname}?${params.toString()}`, { scroll: false });
          }}
        />
      </div>

      <AssessmentFinalTabs
        value={subview}
        onChange={(v) => pushParam('subview', v === 'assessment' ? null : v)}
      />

      {!activeSemester ? null : subview === 'assessment' ? (
        <AssessmentPanel
          semester={activeSemester}
          initialSettingId={initialSetting}
          initialRound={initialRound}
        />
      ) : (
        <FinalPanel semester={activeSemester} />
      )}
    </div>
  );
}
