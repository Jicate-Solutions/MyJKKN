'use client';

/**
 * Final Panel — Phase 1 stub.
 *
 * Renders a "Coming soon" card. The endpoint at
 * /api/learners/my-marks/internal-final returns { status: 'coming_soon' }
 * until the COE final-CIA API is wired up. When that lands, replace the
 * card body with a real subject-by-subject table.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction, Award } from 'lucide-react';
import { useMyMarksInternalFinal } from '@/hooks/learners/use-my-marks';
import type { CiaViewSession } from '@/types/my-marks';

interface Props {
  session: CiaViewSession;
}

export function FinalPanel({ session }: Props) {
  const { data } = useMyMarksInternalFinal();
  const courseCount = session.courses.length;

  if (!data || data.status === 'coming_soon') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-amber-600" />
            Final marks coming soon
          </CardTitle>
          <CardDescription>
            Consolidated final marks for {session.semester_label} will be
            published here once your institution finalizes the assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              <span>
                You have <strong>{courseCount}</strong>{' '}
                registered course{courseCount === 1 ? '' : 's'} this semester.
              </span>
            </div>
            <p>
              Check the <strong>Assessment</strong> tab to view round-wise
              marks while finals are being prepared.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // When the real shape lands, render the rows here.
  return (
    <Card>
      <CardHeader>
        <CardTitle>Final Marks</CardTitle>
        <CardDescription>
          Consolidated CIA totals for {session.semester_label}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          Final marks endpoint is ready but the renderer for this shape isn&apos;t implemented yet.
        </div>
      </CardContent>
    </Card>
  );
}
