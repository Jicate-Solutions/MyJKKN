// app/(routes)/accreditation/naac/committees/[id]/_components/ai-assistant-panels.tsx
// ============================================================================
// The three convener-facing surfaces of the AI committee assistant. All three
// are ACCEPT/REJECT — nothing the AI produced is ever applied on its own.
//
//   SittingProposalCard  — a proposed sitting. Confirm creates the meeting;
//                          decline dismisses it. Copy states plainly that
//                          nothing has been sent to anyone, because nothing has.
//   AgendaDraftPanel     — the drafted brief + agenda + ATR skeleton, editable,
//                          with every gate refusal rendered inline.
//   MinutesPolishOffer   — the polished prose offered NEXT TO the structural
//                          minutes in the Close-meeting dialog. "Use this text"
//                          fills the textarea the human then confirms; the
//                          structural prefill is never silently overwritten.
//
// Loading states render Skeletons, never `return null` (a null render collapses
// the panel and shifts the page under the convener's cursor).
// ============================================================================

'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CalendarCheck, Check, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import type {
  MeetingAiDraft,
  MeetingSittingProposal,
} from '@/lib/services/accreditation/committee-meeting-service';
import { naacCommitteeKeys } from '@/hooks/accreditation/use-naac-committees';
import { naacMeetingKeys } from '@/hooks/accreditation/use-naac-committee-meetings';
import { naacMeetingDraftKeys } from '@/hooks/accreditation/use-naac-meeting-drafts';
import {
  discardMeetingDraft,
  okayMeetingDraft,
  respondToSittingProposal,
} from '../_actions/meeting-ai-actions';

// ---------------------------------------------------------------------------
// Shared: turn a gate refusal into one plain sentence for a non-technical reader
// ---------------------------------------------------------------------------

function refusalMessage(res: {
  error?: string;
  ungroundedTokens?: string[];
  doctrineMessage?: string;
  omittedCount?: number;
}): string {
  if (res.doctrineMessage) return res.doctrineMessage;
  if (res.ungroundedTokens?.length) {
    const shown = res.ungroundedTokens.slice(0, 5).join(', ');
    const more =
      res.ungroundedTokens.length > 5 ? ` and ${res.ungroundedTokens.length - 5} more` : '';
    return `This text states figures the committee's own records cannot back: ${shown}${more}. Remove or correct them.`;
  }
  if (res.omittedCount) {
    return `${res.omittedCount} resolution${
      res.omittedCount === 1 ? '' : 's'
    } recorded at this sitting ${
      res.omittedCount === 1 ? 'is' : 'are'
    } missing from this write-up. Minutes may not drop a decision.`;
  }
  return res.error ?? 'That did not go through.';
}

/** Explicit denial copy — never a silent redirect (rule 27). */
function NoAccessNote({ what }: { what: string }) {
  return (
    <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
      You can see {what}, but you do not have permission to act on it. Ask your IQAC coordinator
      for the &ldquo;Record IQAC Meetings &amp; Resolutions&rdquo; permission.
    </p>
  );
}

// ---------------------------------------------------------------------------
// (b) The proposed sitting
// ---------------------------------------------------------------------------

export function SittingProposalCard({
  proposal,
  isLoading,
  canManage,
}: {
  proposal: MeetingSittingProposal | null | undefined;
  isLoading: boolean;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  if (isLoading) return <Skeleton className="mb-3 h-24 w-full" />;
  if (!proposal) return <></>;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: naacMeetingDraftKeys.proposals });
    void qc.invalidateQueries({ queryKey: naacMeetingKeys.meetings });
    void qc.invalidateQueries({ queryKey: naacCommitteeKeys.all });
  };

  const respond = async (action: 'confirm' | 'decline') => {
    setBusy(true);
    try {
      const res = await respondToSittingProposal(proposal.id, action, {
        scheduledFor: date || proposal.proposed_for,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'That did not go through.');
        return;
      }
      toast.success(
        action === 'confirm'
          ? 'Sitting confirmed and added to this committee. No invitations were sent.'
          : 'Proposal declined.',
      );
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/60 dark:bg-blue-950/30">
      <div className="mb-1.5 flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-blue-700 dark:text-blue-300" />
        <span className="text-sm font-semibold">Proposed sitting — awaiting your confirmation</span>
        <Badge variant="outline" className="text-[11px]">
          draft only
        </Badge>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {proposal.rationale ??
          'A sitting looks due for this committee. Nothing has been sent to anyone — confirming adds it to this committee.'}
      </p>
      {proposal.proposed_member_ids.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          Suggested attendees: this committee&rsquo;s {proposal.proposed_member_ids.length} active
          member
          {proposal.proposed_member_ids.length === 1 ? '' : 's'}. This is a note for the convener —
          attendance is not recorded in this system, and no one has been contacted.
        </p>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Sitting date</Label>
            <Input
              type="date"
              className="h-8 w-[170px]"
              value={date || proposal.proposed_for}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={busy} onClick={() => respond('confirm')}>
            <Check className="mr-1.5 h-4 w-4" />
            {busy ? 'Working…' : 'Confirm sitting'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => respond('decline')}>
            <X className="mr-1.5 h-4 w-4" />
            Decline
          </Button>
        </div>
      ) : (
        <NoAccessNote what="this proposal" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared gate-verdict strip
// ---------------------------------------------------------------------------

function GateVerdicts({ draft }: { draft: MeetingAiDraft }) {
  const blockers: string[] = [];
  if (draft.grounding_verdict === 'ungrounded') {
    blockers.push(
      `States ${draft.ungrounded_tokens.length} figure(s) the records cannot back: ${draft.ungrounded_tokens
        .slice(0, 5)
        .join(', ')}`,
    );
  }
  if (draft.draft_kind === 'agenda' && draft.forbidden_number_hits.length > 0) {
    blockers.push(
      `Carries ${draft.forbidden_number_hits.length} figure(s) on the agenda itself — they belong in the brief: ${draft.forbidden_number_hits
        .slice(0, 5)
        .map((h) => `"${h.token}" (line ${h.lineNo})`)
        .join(', ')}`,
    );
  }
  if (draft.draft_kind === 'minutes' && draft.omitted_resolution_ids.length > 0) {
    blockers.push(
      `Drops ${draft.omitted_resolution_ids.length} resolution(s) recorded at this sitting.`,
    );
  }

  if (blockers.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        Every automatic check passed. Read it, edit anything, then okay it.
      </p>
    );
  }
  return (
    <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-900/60 dark:bg-amber-950/30">
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-3.5 w-3.5" />
        Cannot be okayed as written:
      </p>
      {blockers.map((b) => (
        <p key={b} className="pl-5 text-xs text-amber-900/90 dark:text-amber-200/90">
          {b}
        </p>
      ))}
      <p className="pl-5 text-xs text-muted-foreground">
        Fix the text below and okay it — the same checks run again on your edit.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (a) + (d) The agenda papers
// ---------------------------------------------------------------------------

export function AgendaDraftPanel({
  draft,
  isLoading,
  canManage,
}: {
  draft: MeetingAiDraft | undefined;
  isLoading: boolean;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <Skeleton className="h-28 w-full" />;
  if (!draft) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        No AI-drafted papers for this sitting yet. They are prepared automatically a few days
        before the sitting date.
      </p>
    );
  }

  const text = body ?? draft.body_md ?? '';
  const refresh = () => qc.invalidateQueries({ queryKey: naacMeetingDraftKeys.drafts });

  const act = async (kind: 'okay' | 'discard') => {
    setBusy(true);
    try {
      const res =
        kind === 'okay' ? await okayMeetingDraft(draft.id, text) : await discardMeetingDraft(draft.id);
      if (!res.ok) {
        toast.error(refusalMessage(res));
        return;
      }
      toast.success(kind === 'okay' ? 'Papers okayed.' : 'Draft discarded.');
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">AI-drafted papers — brief, agenda, ATR skeleton</span>
        <Badge variant="outline" className="text-[11px]">
          {draft.status === 'ai_drafted' ? 'awaiting your okay' : draft.status.replace('_', ' ')}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        The brief carries the figures. The agenda deliberately carries none — anything readable from
        the platform belongs in the brief, so the sitting is spent on decisions, not readouts.
      </p>

      {draft.status === 'ai_drafted' && <GateVerdicts draft={draft} />}

      {draft.status === 'ai_drafted' && canManage ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => act('okay')}>
              <Check className="mr-1.5 h-4 w-4" />
              {busy ? 'Checking…' : 'Okay these papers'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act('discard')}>
              <X className="mr-1.5 h-4 w-4" />
              Discard
            </Button>
          </div>
        </>
      ) : (
        <>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-xs leading-relaxed">
            {text || '—'}
          </pre>
          {draft.status === 'ai_drafted' && !canManage && <NoAccessNote what="these papers" />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// (c) The minutes prose polish — offered beside the structural prefill
// ---------------------------------------------------------------------------

export function MinutesPolishOffer({
  draft,
  onUse,
}: {
  draft: MeetingAiDraft | undefined;
  /** Fills the Close-meeting textarea. The human still presses Confirm & close. */
  onUse: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!draft || !draft.body_md) return <></>;

  const blocked =
    draft.grounding_verdict === 'ungrounded' || draft.omitted_resolution_ids.length > 0;

  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          A formal write-up of these same decisions is ready
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Read it'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={blocked}
            onClick={() => {
              onUse(draft.body_md ?? '');
              toast.success('Text inserted — edit it, then confirm to close the meeting.');
            }}
          >
            Use this text
          </Button>
        </div>
      </div>
      {blocked && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {draft.omitted_resolution_ids.length > 0
            ? 'This write-up left out a decision recorded at the sitting, so it cannot be used. The minutes above are complete.'
            : 'This write-up states something the records cannot back, so it cannot be used. The minutes above are complete.'}
        </p>
      )}
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-background p-2 font-sans text-xs leading-relaxed">
          {draft.body_md}
        </pre>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Nothing is replaced automatically. The minutes stay exactly as you leave them in the box
        above until you confirm.
      </p>
    </div>
  );
}
