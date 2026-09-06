'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Vote, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParentPolls } from '@/hooks/parent/use-parent-features';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';
import type { Poll } from '@/types/parent-portal';

function PollCard({ poll }: { poll: Poll }) {
  const { activeLearnerId } = useParentSession();
  const queryClient = useQueryClient();
  const voted = !!poll.myOptionId || poll.isClosed;

  const vote = async (optionId: string) => {
    if (voted || !activeLearnerId) return;
    try {
      await ParentFeatures.vote({ learnerId: activeLearnerId, pollId: poll.id, optionId });
      queryClient.invalidateQueries({ queryKey: ['parent-polls'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to vote');
    }
  };

  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold">{poll.question}</h2>
      <div className="space-y-2">
        {poll.options.map((opt) => {
          const count = poll.results?.[opt.id] ?? 0;
          const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
          const mine = poll.myOptionId === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => vote(opt.id)}
              disabled={voted}
              className={cn(
                'relative w-full overflow-hidden rounded-xl border p-3 text-left text-sm',
                mine ? 'border-[#0b6d41]' : 'border-black/10',
                voted ? 'cursor-default' : 'hover:border-[#0b6d41]/50'
              )}
            >
              {poll.results && (
                <span
                  className="absolute inset-y-0 left-0 bg-[#0b6d41]/10"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  {mine && <Check className="h-4 w-4 text-[#0b6d41]" />}
                  {opt.label}
                </span>
                {poll.results && <span className="text-xs text-muted-foreground">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {poll.isClosed ? 'Closed' : voted ? 'Thanks for voting' : 'Tap an option to vote'} ·{' '}
        {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
      </p>
    </Card>
  );
}

export default function PollsPage() {
  const { data, isLoading } = useParentPolls();
  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Opinion Poll</h1>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Vote className="mx-auto mb-2 h-6 w-6 text-[#0b6d41]" />
          No active polls.
        </Card>
      ) : (
        items.map((p) => <PollCard key={p.id} poll={p} />)
      )}
    </div>
  );
}
