'use client';

/**
 * AI Pulse — Join Button
 *
 * Two side effects when pressed:
 *   1. Records joined_at via `useRecordJoin(cycleId)`. The service computes
 *      joined_within_5min from the cycle's starts_at.
 *   2. Opens the Champion-set meeting URL (events.config.ai_pulse.meet_url)
 *      in a new tab. The link is platform-agnostic — Teams, Meet, whatever
 *      the Champion pastes (Teams preferred: 1000-participant capacity).
 *
 * If meet_url is null we still record the join (the engagement-gate counter
 * cares about the timestamp, not the URL) and surface a friendly notice.
 *
 * Disabled before the doors-open window (`join_open` from useLiveSession —
 * policy `join_doors_open_minutes`, seeded 15). Cycles surface on My Pulse
 * up to a week early; without this gate, a Monday click would earn the
 * on-time gate for Thursday's session. UI-level gate only — consistent with
 * the service's existing auth.uid()-trust model.
 *
 * Disabled once the learner has already joined this cycle to prevent dup
 * "joined" rows. Re-clicking is unnecessary — the service already merges
 * on conflict.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRecordJoin } from '@/lib/services/ai-pulse/live-session-service';

interface JoinButtonProps {
  cycleId: string;
  meetUrl: string | null;
  alreadyJoined: boolean;
  /** From useLiveSession — false outside the doors-open→session-end window. */
  joinOpen: boolean;
  /** ISO timestamp when the button unlocks (null when underivable). */
  joinOpensAt: string | null;
}

function formatIstTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function JoinButton({
  cycleId,
  meetUrl,
  alreadyJoined,
  joinOpen,
  joinOpensAt,
}: JoinButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const recordJoin = useRecordJoin(cycleId);

  const handleClick = async () => {
    setSubmitting(true);
    try {
      // Open the meeting URL FIRST (synchronous user gesture — required by browsers)
      if (meetUrl) {
        window.open(meetUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast(
          'Meeting link not yet set by the Champion — your join is still being recorded.',
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

  if (!joinOpen) {
    return (
      <Button
        variant="outline"
        disabled
        className="gap-2"
        data-testid="ai-pulse-join-button"
      >
        <Clock className="h-4 w-4" />
        {joinOpensAt
          ? `Join opens ${formatIstTime(joinOpensAt)} IST`
          : 'Join is not open'}
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
