'use client';

// =====================================================================
// Free-text follow-ups — anonymous course-level counts (Senior Learner view)
// =====================================================================
// Spec: specs/scf-freetext-carryforward-2026-07-19.md, Director decisions 4+5:
// Senior Learners see COUNTS ONLY of learners' free-text follow-ups in their
// own courses — never the words, never the names — and a course appears only
// once >=3 distinct learners are involved (privacy floor, enforced server-side
// in fn_scf_freetext_carry_counts; this card renders whatever the fn allows).
// Renders NOTHING when every course is under the floor — a small surface that
// earns its place only when there is a real signal.

import { useQuery } from '@tanstack/react-query';
import { MessageSquareQuote } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';

const BRAND = '#0b6d41';

export function FreetextCarryCountsCard() {
  const { data: rows = [] } = useQuery({
    queryKey: ['scf-freetext-carry-counts'],
    queryFn: () => SessionFeedbackService.getFreetextCarryCounts(),
    staleTime: 5 * 60 * 1000,
  });

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareQuote className="h-4 w-4" style={{ color: BRAND }} />
          Written follow-ups in your courses
        </CardTitle>
        <CardDescription>
          Learners who wrote something are asked at their next session whether
          it improved. Counts only — what anyone wrote stays private, and a
          course shows here only once several learners are involved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Course</th>
                <th className="py-1.5 pr-3 text-right font-medium">Learners</th>
                <th className="py-1.5 pr-3 text-right font-medium">Awaiting answer</th>
                <th className="py-1.5 text-right font-medium">Better / Partly / Not yet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.course_code} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">
                    <span className="font-medium">{r.course_code}</span>
                    {r.course_name ? (
                      <span className="text-muted-foreground"> · {r.course_name}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.learners}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.open_concerns}</td>
                  <td className="py-1.5 text-right">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Badge variant="outline" style={{ color: BRAND, borderColor: BRAND }}>
                        {r.resolved}
                      </Badge>
                      <Badge variant="outline">{r.partly}</Badge>
                      <Badge variant="outline" className="text-amber-700 border-amber-400">
                        {r.not_better}
                      </Badge>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
