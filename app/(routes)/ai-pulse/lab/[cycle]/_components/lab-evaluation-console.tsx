'use client';

// app/(routes)/ai-pulse/lab/[cycle]/_components/lab-evaluation-console.tsx
// Main client orchestrator for the Lab Evaluation Console. Owns the per-
// department draft state (scores + Gold picks), threads it to
// DeptEvaluationPanel, persists via useSaveDeptEvaluation (read-merge-write
// into startup_events.config.ai_pulse.gold_selections).
//
// Pattern source: admin/quiz/[cycle]/_components/quiz-editor.tsx

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ListOrdered, Medal, Trophy } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTabParam } from '@/hooks/use-tab-param';
import {
  deriveDeptRankings,
  useLabCycleEvaluation,
  useLabPolicies,
  type DeptGoldSelection,
} from '@/lib/services/ai-pulse/lab-evaluation-service';

import { DeptEvaluationPanel } from './dept-evaluation-panel';
import { DeptRankingPanel } from './dept-ranking-panel';

interface LabEvaluationConsoleProps {
  cycleId: string;
  canSelectGold: boolean;
}

function emptySelection(): DeptGoldSelection {
  return { submission_ids: [], selected_by: null, selected_at: null, scores: {} };
}

const LAB_EVAL_TABS = ['evaluate', 'ranking'] as const;

export function LabEvaluationConsole({
  cycleId,
  canSelectGold,
}: LabEvaluationConsoleProps) {
  const { data: evaluation, isLoading, error } = useLabCycleEvaluation(cycleId);
  const { data: policies } = useLabPolicies();
  const [activeTab, setActiveTab] = useTabParam('evaluate', LAB_EVAL_TABS);

  const goldCap = policies?.gold_standard_count ?? 2;
  const labDay = policies?.lab_presentation_day ?? 'Monday';

  // Per-department drafts, hydrated from the server selections on load.
  const [drafts, setDrafts] = useState<Record<string, DeptGoldSelection>>({});

  useEffect(() => {
    if (!evaluation) return;
    // Hydrate from server, but never clobber a department draft the faculty
    // is still editing (refetch fires after every per-department save).
    setDrafts((prev) => {
      const next: Record<string, DeptGoldSelection> = {};
      for (const dept of evaluation.departments) {
        next[dept.department_id] =
          prev[dept.department_id] ??
          evaluation.gold_selections[dept.department_id] ??
          emptySelection();
      }
      return next;
    });
  }, [evaluation]);

  const serverSelections = useMemo(
    () => evaluation?.gold_selections ?? {},
    [evaluation],
  );

  // Ranking is derived (read-only) from the server selections — never the local
  // editing drafts — so it reflects saved faculty judgment, not in-flight edits.
  const rankings = useMemo(
    () => (evaluation ? deriveDeptRankings(evaluation) : []),
    [evaluation],
  );

  if (isLoading) {
    return (
      <div className="mt-4 space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load cycle</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!evaluation) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Cycle not found</AlertTitle>
        <AlertDescription>
          No AI Pulse cycle with id <code className="font-mono">{cycleId}</code>.
          Verify the cycle exists in <code>startup_events</code> with{' '}
          <code>config.kind = &apos;ai_pulse&apos;</code>.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {/* Cycle context */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">
                {evaluation.cycle_name || 'AI Pulse cycle'}
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Session: {evaluation.demo_date ? evaluation.demo_date.slice(0, 10) : '—'}
                </span>
                <Badge variant="secondary">{evaluation.status}</Badge>
              </CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              <Medal className="h-3.5 w-3.5 text-amber-500" />
              Gold cap: {goldCap} per department
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Lab day: {labDay} — first working day after the Thursday session.
            Score each presentation on domain relevance and clarity (1–10),
            then select up to {goldCap} Gold Standard team
            {goldCap === 1 ? '' : 's'} per department. Gold picks feed the NAAC
            evidence export as faculty-verified entries.
          </p>
          {!canSelectGold && (
            <p className="mt-2 text-xs text-amber-600">
              You can score presentations, but Gold Standard selection requires
              the <code className="font-mono">aiPulse:gold.select</code>{' '}
              permission.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Department panels: Evaluate (score + pick Gold) | Ranking (leaderboard) */}
      {evaluation.departments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No team submissions for this cycle yet. Teams submit their build
              artifacts after the Thursday session; evaluations open once the
              first submission lands.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="evaluate" className="gap-1.5">
              <Medal className="h-3.5 w-3.5" />
              Evaluate
            </TabsTrigger>
            <TabsTrigger value="ranking" className="gap-1.5">
              <ListOrdered className="h-3.5 w-3.5" />
              Ranking
            </TabsTrigger>
          </TabsList>

          <TabsContent value="evaluate" className="space-y-6">
            {evaluation.departments.map((dept) => (
              <DeptEvaluationPanel
                key={dept.department_id}
                cycleId={cycleId}
                dept={dept}
                draft={drafts[dept.department_id] ?? emptySelection()}
                serverSelection={serverSelections[dept.department_id] ?? null}
                goldCap={goldCap}
                canSelectGold={canSelectGold}
                onChange={(next) =>
                  setDrafts((prev) => ({ ...prev, [dept.department_id]: next }))
                }
              />
            ))}
          </TabsContent>

          <TabsContent value="ranking" className="space-y-6">
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="flex items-start gap-2 py-3 text-xs text-muted-foreground">
                <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  Submissions are ranked per department by faculty score (domain
                  relevance + clarity). The {goldCap} faculty-selected Gold
                  Standard team{goldCap === 1 ? '' : 's'} are highlighted. Save a
                  department on the Evaluate tab to update its ranking.
                </span>
              </CardContent>
            </Card>
            {rankings.map((ranking) => (
              <DeptRankingPanel
                key={ranking.department_id}
                ranking={ranking}
                goldCap={goldCap}
              />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
