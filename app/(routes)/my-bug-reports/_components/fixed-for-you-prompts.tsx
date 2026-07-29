'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

interface FeedbackPrompt {
  id: string;
  bug_id: string;
  display_id: string | null;
  description: string;
  status: 'sent' | 'delivered' | 'answered';
  answer: 'fixed' | 'not_fixed' | null;
  expires_at: string;
}

/**
 * "Is this fixed for you?" prompts — increment #2 of the bug-fix loop.
 * THE GROUND TRUTH: the reporter's one-tap answer (never an AI verdict) is
 * what the fix loop measures itself against.
 *
 * Delivery is at-least-once: when a prompt RENDERS here, the client ACKS it
 * (delivered) — reading is never counted as answering. The 👍/👎 is a
 * separate explicit tap, changeable while the question is open.
 *
 * Renders nothing when the reporter has no open prompts.
 */
export function FixedForYouPrompts({ bugId }: { bugId?: string }) {
  const queryClient = useQueryClient();
  const acked = useRef<Set<string>>(new Set());

  const { data: prompts } = useQuery<FeedbackPrompt[]>({
    queryKey: ['bug-feedback-prompts', 'mine'],
    queryFn: async () => {
      const response = await fetch('/api/bug-reports/feedback/mine');
      if (!response.ok) throw new Error('Failed to load');
      const json = await response.json();
      return json.prompts ?? [];
    },
    staleTime: 60 * 1000
  });

  const visible = (prompts ?? []).filter((p) => !bugId || p.bug_id === bugId);

  // At-least-once ACK on render: mark each newly-visible 'sent' prompt
  // delivered. Failures are silent — the next render retries (at-least-once).
  useEffect(() => {
    for (const p of visible) {
      if (p.status === 'sent' && !acked.current.has(p.id)) {
        acked.current.add(p.id);
        fetch(`/api/bug-reports/feedback/${p.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ack' })
        }).catch(() => acked.current.delete(p.id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((p) => p.id).join(',')]);

  const answerMutation = useMutation({
    mutationFn: async ({ id, answer }: { id: string; answer: 'fixed' | 'not_fixed' }) => {
      const response = await fetch(`/api/bug-reports/feedback/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', answer })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not record your answer');
      return json;
    },
    onSuccess: (data) => {
      toast.success(
        data.answer === 'fixed'
          ? 'Thanks! Glad it works for you now.'
          : "Thanks for telling us — we've flagged that it's still broken for you."
      );
      queryClient.invalidateQueries({ queryKey: ['bug-feedback-prompts', 'mine'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Could not record your answer')
  });

  if (visible.length === 0) return null;

  const unanswered = visible.filter((p) => p.status !== 'answered').length;

  return (
    <div className='rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-4 space-y-3'>
      <div className='flex items-center gap-2'>
        <Sparkles className='w-4 h-4 text-emerald-600 shrink-0' />
        <p className='text-sm font-medium text-emerald-900 dark:text-emerald-100'>
          {unanswered > 0
            ? `${unanswered} of your reports may be fixed — does it work for you now?`
            : 'Thanks for confirming your reports!'}
        </p>
      </div>

      <div className='space-y-2'>
        {visible.map((p) => (
          <div
            key={p.id}
            className='flex flex-wrap items-center gap-2 rounded-md border bg-background/70 px-3 py-2'
          >
            <div className='min-w-0 flex-1'>
              <span className='font-mono text-xs font-semibold'>{p.display_id ?? '—'}</span>
              <p className='text-xs text-muted-foreground truncate'>{p.description}</p>
            </div>
            <div className='flex items-center gap-1.5 shrink-0'>
              <Button
                size='sm'
                variant={p.answer === 'fixed' ? 'default' : 'outline'}
                className={p.answer === 'fixed' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                disabled={answerMutation.isPending}
                onClick={() => answerMutation.mutate({ id: p.id, answer: 'fixed' })}
              >
                <ThumbsUp className='w-3.5 h-3.5 mr-1' />
                Fixed
              </Button>
              <Button
                size='sm'
                variant={p.answer === 'not_fixed' ? 'destructive' : 'outline'}
                disabled={answerMutation.isPending}
                onClick={() => answerMutation.mutate({ id: p.id, answer: 'not_fixed' })}
              >
                <ThumbsDown className='w-3.5 h-3.5 mr-1' />
                Still broken
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className='text-[11px] text-emerald-800/80 dark:text-emerald-200/80'>
        Your answer goes straight to the team that fixed it — it keeps the
        fixes honest. You can change it while the question is open.
      </p>
    </div>
  );
}
