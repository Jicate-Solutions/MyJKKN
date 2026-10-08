'use client';

// The learned rules: each one says "a CVViZ job titled like this goes to this
// MyJKKN job", and who taught it. Deleting asks for a second tap in the page.

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeleteIntakeRule, useIntakeRules } from '@/hooks/hr/use-recruitment-intake';
import { IntakeEmpty, IntakeError, IntakeLoading } from './intake-states';
import { formatDate } from './intake-labels';

export function RulesList() {
  const { data, isLoading, isError, error, refetch } = useIntakeRules();
  const remove = useDeleteIntakeRule();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (isLoading) return <IntakeLoading label="Loading learned rules…" />;
  if (isError || !data) {
    return <IntakeError title="Could not load learned rules" error={error} onRetry={() => void refetch()} />;
  }
  if (data.length === 0) {
    return (
      <IntakeEmpty
        title="No learned rules yet"
        detail="When someone changes the job on a candidate card, the helper remembers it here and credits them."
      />
    );
  }

  async function confirmDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      setConfirmId(null);
      toast.success('Rule deleted. Future uploads will no longer use it.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the rule. Try again.');
    }
  }

  return (
    <ul className="space-y-3">
      {data.map((rule) => (
        <li
          key={rule.id}
          className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none"
        >
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
            <span className="text-muted-foreground">CVViZ job</span>
            <span className="font-medium text-foreground">&ldquo;{rule.cvviz_job_title_norm}&rdquo;</span>
            <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
            <span className="text-muted-foreground">goes to</span>
            <span className="font-medium text-foreground">{rule.job_title || 'a job that is no longer listed'}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Learned from {rule.created_by_name || 'an earlier correction'} on {formatDate(rule.created_at)} · used{' '}
            {rule.times_used} {rule.times_used === 1 ? 'time' : 'times'}
          </p>

          {confirmId === rule.id ? (
            <div
              role="group"
              aria-label="Confirm delete"
              className="flex flex-col gap-2 rounded-lg border border-red-600/30 p-3 text-sm dark:border-red-400/30 sm:flex-row sm:items-center"
            >
              <p className="flex-1 text-foreground">
                Delete this rule? Candidates already filed stay as they are; only future uploads change.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => void confirmDelete(rule.id)}
                >
                  {remove.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Yes, delete
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmId(null)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(rule.id)}>
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Delete rule
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
