'use client';

/**
 * Result Shell — Phase 1 stub.
 *
 * Renders the top Internal/Result tabs and a "Coming Soon" card explaining
 * that semester results will appear once the institution publishes them.
 * Drop in real result-loading logic in Phase 2 when the endpoint lands.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Construction, Sparkles } from 'lucide-react';
import { MarksViewTabs } from './marks-view-tabs';

export function ResultShell() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <MarksViewTabs />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Semester Result
          </CardTitle>
          <CardDescription>
            View your published semester result here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 px-4 rounded-lg border border-dashed bg-muted/20 text-center">
            <div className="rounded-full bg-amber-500/10 p-3 mb-4">
              <Construction className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="font-semibold text-base mb-1">Coming Soon</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Your semester result will be available here once the
              examination office publishes it. We&apos;ll notify you when
              it&apos;s ready.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span>
                In the meantime, check the <strong>Internal Marks</strong> tab for round-wise CIA marks.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
