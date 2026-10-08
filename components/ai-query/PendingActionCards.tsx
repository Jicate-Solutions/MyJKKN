'use client';

/**
 * PendingActionCards
 *
 * Under an AI Assistant answer, shows every action the assistant PROPOSED for
 * that answer (an in-app message, an email or a task) as a card: what it is,
 * the exact text that will be sent (for an email, including the "sent on
 * behalf of" line), and exactly who will receive it — each person with their
 * college, role and register / roll / employee number, so two people with the
 * same name can be told apart. Nothing is sent until the person clicks
 * Confirm; Cancel discards it. After the click the card shows the outcome in
 * plain words.
 *
 * Reads through fn_ai_my_action_proposals (owner-only). Confirm / Cancel go to
 * /api/ai-query/actions/[id]/confirm|cancel, which re-check everything at
 * click time — the buttons here are a convenience, never the gate.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Mail,
  ListTodo,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { composeEmailText } from '@/lib/services/ai-query/actions/compose-email';

type ActionKind = 'in_app_message' | 'email' | 'create_task';
type EffectiveStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'expired';

interface Recipient {
  profile_id: string;
  display_name: string;
  has_email: boolean;
  college?: string | null;
  role?: string | null;
  id_label?: string | null;
  id_number?: string | null;
}

interface ActionProposal {
  id: string;
  kind: ActionKind;
  title: string;
  body: string;
  recipients: Recipient[];
  recipient_count: number;
  task: { project_id: string; project_title?: string | null; due_date?: string | null } | null;
  email_footer?: string | null;
  effective_status: EffectiveStatus;
  expires_at: string;
  result: { delivered?: number; total?: number } | null;
  error: string | null;
}

const KIND_META: Record<ActionKind, { icon: typeof Bell; label: string; note: string }> = {
  in_app_message: {
    icon: Bell,
    label: 'In-app message',
    note: 'Arrives in their MyJKKN notifications.',
  },
  email: {
    icon: Mail,
    label: 'Email',
    note: 'Sent from MyJKKN on your behalf. Each person gets their own copy; replies come to you.',
  },
  create_task: {
    icon: ListTodo,
    label: 'Task',
    note: 'Created in the project as you, and given to this person.',
  },
};

const PREVIEW_COUNT = 10;

function peopleWord(n: number) {
  return n === 1 ? '1 person' : `${n} people`;
}

/** Role, college and identifier — what tells two people with one name apart. */
function recipientDetails(r: Recipient): string {
  const parts = [r.role, r.college, r.id_number ? `${r.id_label ?? 'No.'} ${r.id_number}` : null];
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).join(' · ');
}

/** Exactly what will be sent: the email gets its stored "sent on behalf of" line. */
function sentText(p: ActionProposal): string {
  return p.kind === 'email' ? composeEmailText(p.body, p.email_footer) : p.body;
}

/** The final status in plain words. */
function outcomeText(p: ActionProposal): string {
  const total = p.result?.total ?? p.recipient_count;
  const delivered = p.result?.delivered ?? total;
  switch (p.effective_status) {
    case 'sent':
      if (p.kind === 'create_task') {
        return `Task created for ${p.recipients[0]?.display_name ?? 'this person'}.${p.error ? ` ${p.error}` : ''}`;
      }
      if (delivered < total) {
        return `${p.kind === 'email' ? 'Emailed' : 'Sent to'} ${delivered} of ${total} people. ${p.error ?? ''}`.trim();
      }
      return p.kind === 'email' ? `Emailed ${peopleWord(delivered)}.` : `Sent to ${peopleWord(delivered)}.`;
    case 'failed':
      return `Failed: ${p.error ?? 'nothing was sent.'}`;
    case 'cancelled':
      return 'Cancelled. Nothing was sent.';
    case 'expired':
      return 'Expired. Nothing was sent. Ask the assistant again if you still want this.';
    case 'sending':
      return 'Sending…';
    default:
      return '';
  }
}

function ProposalCard({ proposal, onChanged }: { proposal: ActionProposal; onChanged: () => void }) {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const meta = KIND_META[proposal.kind] ?? KIND_META.in_app_message;
  const Icon = meta.icon;
  const status = proposal.effective_status;
  const people = proposal.recipients;
  const shown = showAll ? people : people.slice(0, PREVIEW_COUNT);
  const hidden = people.length - PREVIEW_COUNT;

  const act = async (which: 'confirm' | 'cancel') => {
    if (busy) return;
    setBusy(which);
    setMessage(null);
    try {
      const res = await fetch(`/api/ai-query/actions/${proposal.id}/${which}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessage(typeof body?.error === 'string' ? body.error : 'Something went wrong. Try again.');
      }
    } catch {
      setMessage('Could not reach MyJKKN. Check your connection and try again.');
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const tone =
    status === 'sent'
      ? 'border-emerald-500/40 dark:border-emerald-400/30'
      : status === 'failed'
        ? 'border-destructive/40'
        : status === 'pending'
          ? 'border-primary/40'
          : 'border-border';

  return (
    <div className={cn('w-full rounded-lg border bg-background p-3 shadow-sm', tone)}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {meta.label}
            {status === 'pending' ? ' · waiting for you' : ''}
          </p>
          <p className="break-words text-sm font-semibold text-foreground">{proposal.title}</p>
        </div>
      </div>

      <p className="mt-2 text-[11px] font-medium text-muted-foreground">
        Drafted by the assistant — check it before you confirm.
      </p>
      <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-xs text-foreground">
        {sentText(proposal)}
      </p>

      <div className="mt-2 text-xs text-foreground">
        <p className="font-medium">
          {proposal.kind === 'create_task' ? 'Given to:' : `To ${peopleWord(proposal.recipient_count)}:`}
        </p>
        <ul className={cn('mt-1 space-y-1', showAll && 'max-h-64 overflow-y-auto pr-1')}>
          {shown.map((r) => {
            const details = recipientDetails(r);
            return (
              <li key={r.profile_id} className="break-words">
                <span className="text-foreground">{r.display_name}</span>
                {details && <span className="text-muted-foreground"> · {details}</span>}
              </li>
            );
          })}
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-1 inline-flex items-center gap-0.5 text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {showAll ? (
              <>
                Show fewer <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Show all {people.length} <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>

      {proposal.task && (
        <p className="mt-1 text-xs text-muted-foreground">
          Project: <span className="text-foreground">{proposal.task.project_title ?? 'Project'}</span>
          {proposal.task.due_date ? ` · Due ${proposal.task.due_date}` : ''}
        </p>
      )}

      <p className="mt-1 text-[11px] text-muted-foreground/80">{meta.note}</p>

      {status === 'pending' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8 text-xs" disabled={busy !== null} onClick={() => act('confirm')}>
            {busy === 'confirm' && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Confirm and send
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy !== null}
            onClick={() => act('cancel')}
          >
            {busy === 'cancel' && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Cancel
          </Button>
          <span className="text-[11px] text-muted-foreground">Nothing is sent until you click Confirm.</span>
        </div>
      ) : (
        <p
          className={cn(
            'mt-3 inline-flex items-start gap-1.5 text-xs font-medium',
            status === 'sent' && 'text-emerald-700 dark:text-emerald-400',
            status === 'failed' && 'text-destructive',
            (status === 'cancelled' || status === 'expired' || status === 'sending') && 'text-muted-foreground'
          )}
        >
          {status === 'sent' && <CheckCircle2 className="mt-px h-3.5 w-3.5 flex-shrink-0" />}
          {status === 'failed' && <XCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" />}
          {status === 'cancelled' && <Ban className="mt-px h-3.5 w-3.5 flex-shrink-0" />}
          {status === 'expired' && <Clock className="mt-px h-3.5 w-3.5 flex-shrink-0" />}
          {status === 'sending' && <Loader2 className="mt-px h-3.5 w-3.5 flex-shrink-0 animate-spin" />}
          <span>{outcomeText(proposal)}</span>
        </p>
      )}

      {message && <p className="mt-2 text-xs text-destructive">{message}</p>}
    </div>
  );
}

/** The owner's proposals for one answer; null when the read failed. */
async function fetchProposals(jobId: string): Promise<ActionProposal[] | null> {
  try {
    const supabase = createClientSupabaseClient();
    // fn not yet in generated types (ships with 20270302090000_ai_action_proposals).
    const { data, error } = await (supabase as any).rpc('fn_ai_my_action_proposals', {
      p_conversation_id: null,
      p_job_id: jobId,
    });
    if (error || !Array.isArray(data)) return null;
    return (data as ActionProposal[]).map((p) => ({
      ...p,
      recipients: Array.isArray(p.recipients) ? p.recipients : [],
    }));
  } catch {
    // Cards are an addition to the answer; a failed read leaves the answer as is.
    return null;
  }
}

export function PendingActionCards({ jobId }: { jobId: string }) {
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  // Bumped after every Confirm / Cancel so the cards re-read their final status.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetchProposals(jobId).then((rows) => {
      if (alive && rows) setProposals(rows);
    });
    return () => {
      alive = false;
    };
  }, [jobId, version]);

  if (proposals.length === 0) return null;

  return (
    <div className="mt-2 flex w-full max-w-md flex-col gap-2">
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} onChanged={reload} />
      ))}
    </div>
  );
}

export default PendingActionCards;
