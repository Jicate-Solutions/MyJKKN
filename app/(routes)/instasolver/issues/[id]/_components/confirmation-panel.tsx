'use client';

import { useState } from 'react';
import { Check, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import type { Issue } from '@/types/instasolver';

/** Shown to the reporter on a completed issue they have not yet judged. */
export function ConfirmationPanel({ issue }: { issue: Pick<Issue, 'id' | 'reference_no'> }) {
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');

  const confirm = useInstaSolverMutation(() => InstaSolverIssueService.confirmFix(issue.id), 'Thank you — fix confirmed');
  const dispute = useInstaSolverMutation(
    () => InstaSolverIssueService.disputeFix(issue.id, reason),
    'Sent to the CAO as still a problem'
  );

  return (
    <Card className="border-emerald-200 dark:border-emerald-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Is it fixed?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Maintenance says the work is done. Check it, then tell us. Your answer does not close the issue, but a
          “still a problem” goes to the top of the CAO’s triage list.
        </p>

        {disputing ? (
          <div className="space-y-2">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="What is still wrong?"
              aria-label="What is still wrong"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                disabled={reason.trim().length < 5 || dispute.isPending}
                onClick={() => dispute.mutate(undefined)}
              >
                {dispute.isPending ? 'Sending…' : 'Send: still a problem'}
              </Button>
              <Button variant="ghost" onClick={() => setDisputing(false)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => confirm.mutate(undefined)} disabled={confirm.isPending}>
              <Check className="mr-1.5 h-4 w-4" />
              {confirm.isPending ? 'Confirming…' : 'Yes, it is fixed'}
            </Button>
            <Button variant="outline" onClick={() => setDisputing(true)}>
              <ThumbsDown className="mr-1.5 h-4 w-4" /> Still a problem
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
