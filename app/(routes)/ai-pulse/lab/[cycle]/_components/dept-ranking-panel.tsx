'use client';

// app/(routes)/ai-pulse/lab/[cycle]/_components/dept-ranking-panel.tsx
// Read-only per-department leaderboard for the Lab console. For each department
// it lists that department's submissions ordered DESC by faculty score
// (relevance + clarity, SOP Phase IV rubric), with the faculty-selected Gold
// picks highlighted in amber (same Medal + amber-500 treatment as the Evaluate
// tab's dept-evaluation-panel). "Top 2 of 10" is narrative only — there is NO
// cohort cap; every submission is ranked and the Gold 2 are flagged.
//
// Pattern source: app/(routes)/ai-pulse/lab/[cycle]/_components/dept-evaluation-panel.tsx
// (gold badge + amber styling) + dept-heatmap-service (departments.id ordering).
// Data is derived purely from the LabCycleEvaluation already loaded by the
// console — deriveDeptRankings() in lab-evaluation-service — so no extra read.

import { ExternalLink, Medal, Trophy } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DeptRanking } from '@/lib/services/ai-pulse/lab-evaluation-service';

interface DeptRankingPanelProps {
  ranking: DeptRanking;
  goldCap: number;
}

export function DeptRankingPanel({ ranking, goldCap }: DeptRankingPanelProps) {
  const { department_name, submissions, scored_count, gold_count } = ranking;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{department_name}</CardTitle>
            <CardDescription>
              {submissions.length} submission
              {submissions.length === 1 ? '' : 's'} · {scored_count} scored ·{' '}
              {gold_count} Gold pick{gold_count === 1 ? '' : 's'}
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1">
            <Medal className="h-3.5 w-3.5 text-amber-500" />
            Top {goldCap} = Gold
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No submissions for this department yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Team / Project</TableHead>
                <TableHead className="w-20 text-center">Relevance</TableHead>
                <TableHead className="w-20 text-center">Clarity</TableHead>
                <TableHead className="w-20 text-center">Score</TableHead>
                <TableHead className="w-24 text-right">Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((sub) => (
                <TableRow
                  key={sub.submission_id}
                  className={
                    sub.is_gold ? 'bg-amber-50 hover:bg-amber-50/80' : undefined
                  }
                >
                  <TableCell className="font-medium tabular-nums">
                    {sub.is_gold ? (
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <Trophy className="h-3.5 w-3.5" aria-hidden />
                        {sub.rank}
                      </span>
                    ) : (
                      sub.rank
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {sub.app_name || 'Untitled project'}
                      </span>
                      {sub.team_name && (
                        <span className="text-xs text-muted-foreground">
                          {sub.team_name}
                        </span>
                      )}
                      {sub.is_gold && (
                        <Badge className="gap-1 bg-amber-500 text-[10px] text-white hover:bg-amber-500">
                          <Medal className="h-3 w-3" />
                          Gold Standard
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">
                    {sub.relevance ?? '—'}
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">
                    {sub.clarity ?? '—'}
                  </TableCell>
                  <TableCell className="text-center text-sm font-semibold tabular-nums">
                    {sub.faculty_score ?? (
                      <span className="font-normal text-muted-foreground">
                        Unscored
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {sub.github_url && (
                        <a
                          href={sub.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          title="GitHub"
                        >
                          GitHub <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {sub.live_app_url && (
                        <a
                          href={sub.live_app_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          title="Live app"
                        >
                          Live <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {!sub.github_url && !sub.live_app_url && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
