'use client';

/**
 * PlaybookLog — the MEMORY of the loop.
 *
 * Lists every closed cycle (week, the decision that was made, the learning that
 * came out of it) so the loop accumulates institutional knowledge rather than
 * repeating itself. Below the log sits the "Close this cycle" panel: one
 * textarea for the single change to carry into next cycle, and a button that
 * calls closeCycle({ learning }).
 *
 * On success → parent refetches (onClose). On { success: false } (RLS denies
 * non-managers) → a friendly inline note; only social managers / admins can
 * close a cycle.
 */

import { useState } from 'react';
import { History, CheckCircle2, Lock, Loader2 } from 'lucide-react';
import type { PlaybookEntry } from '@/lib/types/social-loop';
import { closeCycle } from '@/lib/services/social/loop-service';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

function formatWeek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PlaybookLog({
  playbook,
  onClose,
}: {
  playbook: PlaybookEntry[];
  /** Called after a successful close so the parent can refetch. */
  onClose: () => void;
}) {
  const [learning, setLearning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = [...(playbook ?? [])].sort((a, b) => b.cycle_no - a.cycle_no);

  async function handleClose() {
    if (!learning.trim() || submitting) return;
    setSubmitting(true);
    setDenied(false);
    setError(null);
    try {
      const res = await closeCycle({ learning: learning.trim() });
      if (res.success) {
        setLearning('');
        onClose();
      } else {
        // RLS denial for non-managers, or any other server-side rejection.
        if (/permission|denied|rls|not allowed|forbidden/i.test(res.error ?? '')) {
          setDenied(true);
        } else {
          setError(res.error ?? 'Could not close the cycle. Please try again.');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error while closing the cycle.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Past cycles — the memory */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" />
            Playbook
          </CardTitle>
          <CardDescription>
            What past cycles decided, and what we learned. The loop’s memory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No closed cycles yet. Close your first cycle below to start the
              playbook.
            </p>
          ) : (
            <ol className="space-y-3">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline" className="text-xs">
                      Cycle {e.cycle_no}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      week of {formatWeek(e.week_start)}
                    </span>
                  </div>
                  {e.decide?.formatInstruction && (
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Decided:</span>{' '}
                      {e.decide.formatInstruction}
                    </p>
                  )}
                  {e.learning && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Learned:</span>{' '}
                      {e.learning}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Close this cycle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            Close this cycle
          </CardTitle>
          <CardDescription>
            Write the one change to carry into next cycle, then close it. This
            becomes a permanent entry in the playbook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="The one change for next cycle — e.g. “Lead Reels with the result in the first 2 seconds; carousels under-perform.”"
            value={learning}
            onChange={(ev) => setLearning(ev.target.value)}
            rows={3}
            disabled={submitting}
          />

          {denied && (
            <Alert className="border-l-4 border-l-amber-500">
              <Lock className="h-4 w-4" />
              <AlertDescription>
                Only social managers / admins can close a cycle. Your learning
                wasn’t saved — ask a manager to close it.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleClose}
              disabled={!learning.trim() || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Closing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Close this cycle
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
