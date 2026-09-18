'use client';

// The three things a super admin can do to a feature from the adoption table.
//
//   Ask why   — sends a must-answer question to everyone intended who has
//               never used it. This reaches REAL PEOPLE, so the button is
//               disabled until the feature is old enough and the result says
//               plainly how many were asked.
//   Propose   — raises one card (simplify / retrain / retire) for the Director.
//               Changes nothing by itself.
//   Decide    — only appears when a card is waiting. This is the tap that
//               actually changes the feature's status.
//
// Every rule behind these lives in the database. This component's job is to
// make a refusal readable: an error comes back as its own sentence, never a
// silent no-op.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ASK_WHY_MIN_AGE_DAYS } from '@/lib/adoption/summarise';

export interface PendingProposal {
  id: string;
  proposed_option: string;
  recommendation: string | null;
}

interface FeatureActionsProps {
  featureKey: string;
  title: string;
  daysOld: number;
  canAsk: boolean;
  askedCount: number;
  pendingProposal: PendingProposal | null;
  /** How the feature is judged. A seasonal one is only asked near the end of
   *  its term, so the reason the button is off differs from a new feature's. */
  cadence: 'weekly' | 'term';
}

/** Why the ask button is off for a seasonal feature. The database sends the
 *  question only in the last two weeks of term, so saying "too new" — the
 *  weekly reason — would be wrong on a feature shipped a year ago. */
const TERM_WINDOW_REASON = 'asked only in the last two weeks of the term';

const PROPOSE_OPTIONS = [
  { value: 'simplify', label: 'Simplify — it is too hard to use' },
  { value: 'retrain', label: 'Retrain — people do not know it exists' },
  { value: 'retire', label: 'Retire — nobody needs it' },
] as const;

const DECIDE_OPTIONS = [
  { value: 'simplify', label: 'Simplify' },
  { value: 'retrain', label: 'Retrain' },
  { value: 'retire', label: 'Retire' },
  { value: 'keep', label: 'Keep as it is' },
] as const;

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    asked?: number;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? 'That did not go through.');
  }
  return payload;
}

export function FeatureActions({
  featureKey,
  title,
  daysOld,
  canAsk,
  askedCount,
  pendingProposal,
  cadence,
}: FeatureActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [lastAsk, setLastAsk] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [decideOpen, setDecideOpen] = useState(false);
  const [option, setOption] = useState<string>('simplify');
  const [recommendation, setRecommendation] = useState('');

  const working = isPending || busy !== null;

  // One reason, used for both the tooltip and the line under the buttons, so
  // the two can never disagree. Age is checked first: a seasonal feature
  // shipped last week is off because it is new, not because of its term.
  const daysToWait = ASK_WHY_MIN_AGE_DAYS - daysOld;
  const tooNew = daysToWait > 0;
  const askDisabledReason = canAsk
    ? null
    : tooNew
      ? `Too new to ask — ${daysToWait} more ${daysToWait === 1 ? 'day' : 'days'}.`
      : cadence === 'term'
        ? `Asked only in the last two weeks of the term.`
        : null;

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    try {
      await work();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not go through.');
    } finally {
      setBusy(null);
    }
  }

  function askWhy() {
    void run('ask', async () => {
      const payload = await postJson('/api/admin/adoption/ask-why', {
        feature_key: featureKey,
      });
      const asked = payload.asked ?? 0;
      const line =
        asked === 0
          ? 'Nobody left to ask — everyone intended has used it, was already asked, or was asked something else this week.'
          : `Asked ${asked} ${asked === 1 ? 'person' : 'people'} why they have not used ${title}.`;
      setLastAsk(line);
      toast.success(line);
    });
  }

  function propose() {
    void run('propose', async () => {
      await postJson('/api/admin/adoption/propose', {
        feature_key: featureKey,
        option,
        recommendation: recommendation.trim() || null,
      });
      setProposeOpen(false);
      setRecommendation('');
      toast.success(`Card raised for ${title}. It is waiting on the Director.`);
    });
  }

  function decide(chosen: string) {
    if (!pendingProposal) return;
    void run('decide', async () => {
      await postJson('/api/admin/adoption/decide', {
        proposal_id: pendingProposal.id,
        option: chosen,
      });
      setDecideOpen(false);
      toast.success(
        chosen === 'keep'
          ? `${title} stays as it is.`
          : `${title} is now marked ${chosen}.`
      );
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={askWhy}
          disabled={!canAsk || working}
          title={!canAsk && !tooNew && cadence === 'term' ? TERM_WINDOW_REASON : undefined}
          aria-label={`Ask why people have not used ${title}`}
        >
          {busy === 'ask' ? 'Asking…' : 'Ask why'}
        </Button>

        <Popover open={proposeOpen} onOpenChange={setProposeOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" disabled={working}>
              Propose
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Propose a change</p>
              <p className="text-xs text-muted-foreground">
                This raises one card for the Director. Nothing changes until he taps.
              </p>
            </div>
            <Select value={option} onValueChange={setOption}>
              <SelectTrigger aria-label="What to propose">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPOSE_OPTIONS.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={recommendation}
              onChange={(event) => setRecommendation(event.target.value)}
              placeholder="One line: what you would do and why."
              rows={2}
              aria-label="Recommendation"
            />
            <Button size="sm" onClick={propose} disabled={working} className="w-full">
              {busy === 'propose' ? 'Raising…' : 'Raise the card'}
            </Button>
          </PopoverContent>
        </Popover>

        {pendingProposal ? (
          <Popover open={decideOpen} onOpenChange={setDecideOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" disabled={working}>
                Decide
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  The desk proposes: {pendingProposal.proposed_option}
                </p>
                {pendingProposal.recommendation ? (
                  <p className="text-xs text-muted-foreground">
                    {pendingProposal.recommendation}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {DECIDE_OPTIONS.map((choice) => (
                  <Button
                    key={choice.value}
                    size="sm"
                    variant={choice.value === 'retire' ? 'destructive' : 'outline'}
                    onClick={() => decide(choice.value)}
                    disabled={working}
                  >
                    {choice.label}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {askDisabledReason ? (
        <p className="text-xs text-muted-foreground">{askDisabledReason}</p>
      ) : null}
      {lastAsk ? <p className="text-xs text-muted-foreground">{lastAsk}</p> : null}
      {!lastAsk && askedCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {askedCount} asked so far.
        </p>
      ) : null}
    </div>
  );
}
