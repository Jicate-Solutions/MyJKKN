'use client';

/**
 * The interactive shell for /learners/my-marks/internal.
 *
 * Loads the ENTIRE internal/CIA view in ONE call (useMyMarksCiaView → COE
 * /api/v1/student-cia-view), grouped by exam session — same model as the Result
 * tab. Layers:
 *   1. MarksViewTabs       — Internal | Result switcher.
 *   2. SemesterTabs        — one tab per session (titled by semester_label).
 *   3. AssessmentFinalTabs — Assessment | Final.
 *   4. <AssessmentPanel /> or <FinalPanel /> — content from the single payload.
 *
 * URL contract: ?semester=<tab key>&subview=assessment|final&setting=<id>&round=<n>
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, ClipboardList } from 'lucide-react';
import { useMyMarksCiaView } from '@/hooks/learners/use-my-marks';
import type { CiaViewSession } from '@/types/my-marks';
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

/** Stable tab identifier for a session (semester_code preferred; falls back). */
function tabKeyOf(s: CiaViewSession): string {
  return s.semester_code ?? s.examination_session_id ?? String(s.semester_index);
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

  const { data: view, isLoading, error, refetch } = useMyMarksCiaView();

  const sessions = useMemo(() => view?.sessions ?? [], [view]);

  const [subview, setSubview] = useState<'assessment' | 'final'>(initialSubview);
  useEffect(() => {
    const next = (searchParams.get('subview') as 'assessment' | 'final') ?? 'assessment';
    setSubview(next);
  }, [searchParams]);

  const currentKey = useMemo(() => {
    if (sessions.length === 0) return null;
    return tabKeyOf(
      [...sessions].sort((a, b) => b.semester_index - a.semester_index)[0]
    );
  }, [sessions]);

  const activeKey = useMemo(() => {
    const fromUrl = searchParams.get('semester') ?? initialSemester ?? null;
    if (fromUrl && sessions.some((s) => tabKeyOf(s) === fromUrl)) return fromUrl;
    return currentKey;
  }, [searchParams, initialSemester, sessions, currentKey]);

  const activeSession = useMemo(
    () => sessions.find((s) => tabKeyOf(s) === activeKey) ?? null,
    [sessions, activeKey]
  );

  function pushParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <MarksViewTabs />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading your marks...</span>
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
              Could not load your marks
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
              No registrations found
            </CardTitle>
            <CardDescription>
              You don&apos;t have any approved exam registrations yet. Marks will appear
              here once your registrations are approved by your institution.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-2 min-w-0 max-w-full pb-24 sm:pb-6">
      <MarksViewTabs />

      {/* Sticky semester/session selector */}
      <div className="sticky top-0 z-10 py-1 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:bg-transparent sm:backdrop-blur-none">
        <SemesterTabs
          semesters={sessions.map((s) => ({
            semester_code: tabKeyOf(s),
            semester_label: s.semester_label,
            // Internal tab shows regular (current) papers only — count them, not arrears.
            count: s.courses.filter((c) => c.is_regular !== false).length,
          }))}
          activeCode={activeKey}
          currentCode={currentKey}
          onSelect={(code) => {
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

      {!activeSession ? null : subview === 'assessment' ? (
        <AssessmentPanel
          session={activeSession}
          initialSettingId={initialSetting}
          initialRound={initialRound}
        />
      ) : (
        <FinalPanel session={activeSession} />
      )}
    </div>
  );
}
