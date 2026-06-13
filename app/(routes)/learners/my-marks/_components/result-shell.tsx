'use client';

/**
 * The interactive shell for /learners/my-marks/result.
 *
 * Phase C: loads the ENTIRE result view in ONE call (useMyMarksResultView →
 * COE /api/v1/student-result-view). The payload is grouped by EXAM SESSION —
 * one tab per session, labelled by its regular papers' semester. Each tab lists
 * the regular semester papers plus any arrears sat in that session.
 *
 *   1. MarksViewTabs   — Internal Marks | Semester Result switcher.
 *   2. SemesterTabs    — one tab per session (titled by semester_label).
 *   3. <ResultPanel /> — the active session's result, from the single payload.
 *
 * URL contract: ?semester=<tab key>
 */

import { useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, ClipboardList } from 'lucide-react';
import { useMyMarksResultView } from '@/hooks/learners/use-my-marks';
import type { ResultViewSession } from '@/types/my-marks';
import { MarksViewTabs } from './marks-view-tabs';
import { SemesterTabs } from './semester-tabs';
import { ResultPanel } from './result-panel';

interface ResultShellProps {
  initialSemester?: string;
}

/** Stable tab identifier for a session (semester_code preferred; falls back). */
function tabKeyOf(s: ResultViewSession): string {
  return s.semester_code ?? s.examination_session_id ?? String(s.semester_index);
}

export function ResultShell({ initialSemester }: ResultShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: view, isLoading, error, refetch } = useMyMarksResultView();

  const sessions = useMemo(() => view?.sessions ?? [], [view]);

  // "Current" = the highest semester index (most recent session).
  const currentKey = useMemo(() => {
    if (sessions.length === 0) return null;
    return tabKeyOf(
      [...sessions].sort((a, b) => b.semester_index - a.semester_index)[0]
    );
  }, [sessions]);

  const activeKey = useMemo(() => {
    const fromUrl = searchParams.get('semester') ?? initialSemester ?? null;
    if (fromUrl && sessions.some((s) => tabKeyOf(s) === fromUrl)) {
      return fromUrl;
    }
    return currentKey;
  }, [searchParams, initialSemester, sessions, currentKey]);

  const activeSession = useMemo(
    () => sessions.find((s) => tabKeyOf(s) === activeKey) ?? null,
    [sessions, activeKey]
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
              Could not load your result
            </CardTitle>
            <CardDescription>
              {(error as Error).message ?? 'Something went wrong. Try refreshing the page.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button onClick={() => refetch()} className="text-sm text-primary hover:underline">
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!view || sessions.length === 0) {
    return (
      <div className="space-y-4">
        <MarksViewTabs />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
              No results found
            </CardTitle>
            <CardDescription>
              You don&apos;t have any results yet. They will appear here once your
              institution declares them.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-2 min-w-0 max-w-full pb-24 sm:pb-6">
      <MarksViewTabs />

      {/* Sticky semester/session selector — premium feel on mobile */}
      <div className="sticky top-0 z-10 py-1 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:bg-transparent sm:backdrop-blur-none">
        <SemesterTabs
          semesters={sessions.map((s) => ({
            semester_code: tabKeyOf(s),
            semester_label: s.semester_label,
            count: s.courses.length,
          }))}
          activeCode={activeKey}
          currentCode={currentKey}
          onSelect={(code) => {
            const params = new URLSearchParams(searchParams);
            params.set('semester', code);
            router.push(`${pathname}?${params.toString()}`, { scroll: false });
          }}
        />
      </div>

      {activeSession && (
        <ResultPanel
          session={activeSession}
          gradeBands={view.grade_system}
          gradeSystemCode={view.student.grade_system_code}
        />
      )}
    </div>
  );
}
