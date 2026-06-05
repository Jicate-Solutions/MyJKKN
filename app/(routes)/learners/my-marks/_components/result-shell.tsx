'use client';

/**
 * The interactive shell for /learners/my-marks/result.
 *
 * Mirrors InternalMarksShell:
 *   1. MarksViewTabs   — Internal Marks | Semester Result switcher.
 *   2. SemesterTabs    — one tab per semester the student has Approved
 *                        is_regular registrations in.
 *   3. <ResultPanel /> — published result for the active semester.
 *
 * URL contract:
 *   ?semester=<code>
 *
 * The registrations index is shared with the Internal tab (same React Query
 * key), so switching tabs is instant — no refetch.
 */

import { useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, ClipboardList } from 'lucide-react';
import { useMyMarksRegistrations } from '@/hooks/learners/use-my-marks';
import { MarksViewTabs } from './marks-view-tabs';
import { SemesterTabs } from './semester-tabs';
import { ResultPanel } from './result-panel';

interface ResultShellProps {
  initialSemester?: string;
}

export function ResultShell({ initialSemester }: ResultShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data, isLoading, error, refetch } = useMyMarksRegistrations();

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <MarksViewTabs />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading your result...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <MarksViewTabs />
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
      </div>
    );
  }

  if (!data || data.semesters.length === 0) {
    return (
      <div className="space-y-4">
        <MarksViewTabs />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
              No registrations found
            </CardTitle>
            <CardDescription>
              You don&apos;t have any approved exam registrations yet. Your
              result will appear here once your institution declares it.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-2 min-w-0 max-w-full pb-24 sm:pb-6">
      <MarksViewTabs />

      {/* Sticky semester selector — premium feel on mobile */}
      <div className="sticky top-0 z-10 py-1 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:bg-transparent sm:backdrop-blur-none">
        <SemesterTabs
          semesters={data.semesters}
          activeCode={activeSemesterCode}
          currentCode={data.current_semester_code}
          onSelect={(code) => {
            const params = new URLSearchParams(searchParams);
            params.set('semester', code);
            router.push(`${pathname}?${params.toString()}`, { scroll: false });
          }}
        />
      </div>

      {activeSemester && <ResultPanel semester={activeSemester} />}
    </div>
  );
}
