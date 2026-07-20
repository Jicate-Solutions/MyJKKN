'use client';

// AI Pulse — Domain Starter Tamil native-review list.
//
// The starter prompts are written by AI. Their English is safe to ship, but
// the AI-written Tamil ("ta") needs a human Tamil reader to approve it before
// any learner sees it — machine Tamil can drop characters or read oddly. Until
// a starter is approved here, fn_ai_pulse_my_domain_starters strips the Tamil
// from what learners receive.
//
// Data:  fn_ai_pulse_domain_starters_pending_tamil()  — every starter whose
//        Tamil still awaits review, most recent first (admin-gated RPC).
// Write: fn_ai_pulse_domain_starter_ta_review(id, 'approved' | 'rejected').
//
// Pattern reference: sibling learner-feedback-card (client-side RPC read via
// React Query) + policies-editor (per-row mutation + toast).

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Languages, Loader2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// The 3 prompt modes carried in prompt_pack.en / prompt_pack.ta.
const MODES: Array<{ key: string; label: string }> = [
  { key: 'build', label: 'Build' },
  { key: 'skill', label: 'Skill' },
  { key: 'career', label: 'Career' },
];

interface PendingStarter {
  starter_id: string;
  cycle_id: string;
  topic_type: 'course' | 'programme' | string;
  topic_label: string;
  prompt_pack: {
    en?: Record<string, string> | null;
    ta?: Record<string, string> | null;
  } | null;
  created_at: string;
}

const QUERY_KEY = ['ai-pulse', 'domain-starter', 'pending-tamil'] as const;

async function fetchPending(): Promise<PendingStarter[]> {
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase.rpc(
    'fn_ai_pulse_domain_starters_pending_tamil',
    { p_cycle_id: null },
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingStarter[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function StarterTamilReviewList() {
  const queryClient = useQueryClient();
  const {
    data: starters,
    isLoading,
    error,
  } = useQuery<PendingStarter[], Error>({
    queryKey: QUERY_KEY,
    queryFn: fetchPending,
  });

  const reviewMutation = useMutation<
    void,
    Error,
    { starterId: string; status: 'approved' | 'rejected'; label: string }
  >({
    mutationFn: async ({ starterId, status }) => {
      const supabase = createClientSupabaseClient() as any;
      const { error: rpcError } = await supabase.rpc(
        'fn_ai_pulse_domain_starter_ta_review',
        { p_starter_id: starterId, p_status: status },
      );
      if (rpcError) throw new Error(rpcError.message);
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.status === 'approved'
          ? `Tamil approved — ${variables.label}`
          : `Tamil rejected — ${variables.label}`,
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => {
      toast.error(`Could not save: ${err.message}`);
    },
  });

  const pendingCount = starters?.length ?? 0;
  // Track which row is mid-request so we can disable just that card's buttons.
  const activeId = reviewMutation.isPending
    ? reviewMutation.variables?.starterId
    : undefined;

  const intro = useMemo(
    () => (
      <div className='rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground'>
        <p className='flex items-start gap-2'>
          <Languages className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
          <span>
            The starter prompts are written by AI. A Tamil reader must approve
            each one&rsquo;s Tamil before learners can see it — until then,
            learners get the English only.
          </span>
        </p>
      </div>
    ),
    [],
  );

  if (isLoading) {
    return (
      <div className='space-y-4'>
        {intro}
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-48 w-full' />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='space-y-4'>
        {intro}
        <div className='rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive'>
          Could not load starters awaiting Tamil review. Reload the page to
          retry. ({error.message})
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {intro}

      <div className='flex items-center gap-2 text-sm'>
        <Badge variant={pendingCount > 0 ? 'default' : 'secondary'}>
          {pendingCount}
        </Badge>
        <span className='text-muted-foreground'>
          {pendingCount === 1
            ? 'starter awaiting Tamil review'
            : 'starters awaiting Tamil review'}
        </span>
      </div>

      {pendingCount === 0 ? (
        <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
          All caught up — no starter Tamil is waiting for review.
        </div>
      ) : (
        starters!.map((starter) => (
          <StarterCard
            key={starter.starter_id}
            starter={starter}
            busy={activeId === starter.starter_id}
            onApprove={() =>
              reviewMutation.mutate({
                starterId: starter.starter_id,
                status: 'approved',
                label: starter.topic_label,
              })
            }
            onReject={() =>
              reviewMutation.mutate({
                starterId: starter.starter_id,
                status: 'rejected',
                label: starter.topic_label,
              })
            }
          />
        ))
      )}
    </div>
  );
}

function StarterCard({
  starter,
  busy,
  onApprove,
  onReject,
}: {
  starter: PendingStarter;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const en = starter.prompt_pack?.en ?? {};
  const ta = starter.prompt_pack?.ta ?? {};
  const topicKind = starter.topic_type === 'programme' ? 'Programme' : 'Course';

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div>
            <CardTitle className='text-base'>{starter.topic_label}</CardTitle>
            <CardDescription className='mt-1'>
              Compare the AI English and AI Tamil for all three modes, then
              approve or reject the Tamil.
            </CardDescription>
          </div>
          <div className='flex flex-col items-end gap-1 text-right'>
            <Badge variant='outline'>{topicKind}</Badge>
            {starter.created_at && (
              <span className='text-xs text-muted-foreground'>
                generated {formatDate(starter.created_at)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {MODES.map((mode) => {
          const enText = en?.[mode.key];
          const taText = ta?.[mode.key];
          return (
            <div key={mode.key} className='space-y-2'>
              <p className='text-sm font-medium'>{mode.label}</p>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                <div className='rounded-md border bg-muted/40 p-3'>
                  <p className='mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                    English
                  </p>
                  {enText ? (
                    <p className='whitespace-pre-wrap text-sm'>{enText}</p>
                  ) : (
                    <p className='text-sm italic text-muted-foreground'>
                      No English text.
                    </p>
                  )}
                </div>
                <div className='rounded-md border bg-muted/40 p-3'>
                  <p className='mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                    Tamil / தமிழ்
                  </p>
                  {taText ? (
                    <p lang='ta' className='whitespace-pre-wrap text-sm'>
                      {taText}
                    </p>
                  ) : (
                    <p className='text-sm italic text-muted-foreground'>
                      No Tamil generated for this mode.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>

      <CardFooter className='justify-end gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={onReject}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <X className='mr-2 h-4 w-4' />
          )}
          Reject
        </Button>
        <Button size='sm' onClick={onApprove} disabled={busy}>
          {busy ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Check className='mr-2 h-4 w-4' />
          )}
          Approve Tamil
        </Button>
      </CardFooter>
    </Card>
  );
}
