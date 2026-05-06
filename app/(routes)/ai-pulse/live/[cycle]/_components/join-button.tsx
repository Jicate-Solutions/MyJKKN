'use client';

/**
 * AI Pulse — Join Button
 *
 * Two side effects when pressed:
 *   1. Records joined_at via `useRecordJoin(cycleId)`. The service computes
 *      joined_within_5min from the cycle's starts_at.
 *   2. Opens the Champion-set Meet URL (events.config.ai_pulse.meet_url) in
 *      a new tab.
 *
 * If meet_url is null we still record the join (the engagement-gate counter
 * cares about the timestamp, not the URL) and surface a friendly notice.
 *
 * Disabled once the learner has already joined this cycle to prevent dup
 * "joined" rows. Re-clicking is unnecessary — the service already merges
 * on conflict.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRecordJoin } from '@/lib/services/ai-pulse/live-session-service';

interface JoinButtonProps {
  cycleId: string;
  meetUrl: string | null;
  alreadyJoined: boolean;
}

export function JoinButton({ cycleId, meetUrl, alreadyJoined }: JoinButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const recordJoin = useRecordJoin(cycleId);

  const handleClick = async () => {
    setSubmitting(true);
    try {
      // Open Meet URL FIRST (synchronous user gesture — required by browsers)
      if (meetUrl) {
        window.open(meetUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast(
          'Meet link not yet set by the Champion — your join is still being recorded.',
          { icon: 'ℹ️' },
        );
      }
      await recordJoin.mutateAsync();
      toast.success('Joined — engagement clock running.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not record join.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadyJoined) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        Joined this session
      </Button>
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={submitting || recordJoin.isPending}
      className="gap-2"
      data-testid="ai-pulse-join-button"
    >
      {submitting || recordJoin.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Joining…
        </>
      ) : (
        <>
          <ExternalLink className="h-4 w-4" />
          Join Live Session
        </>
      )}
    </Button>
  );
}
