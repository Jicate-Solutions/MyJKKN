'use client';

/**
 * Tab 2 (HR head only) — every proposed line, with what it was drawn from:
 * a team member's suggestion (named), or a reason seen N times in the window.
 * Accept as written, edit then accept, or decline with a note.
 * Nobody can decide their own suggestion (the database refuses it too).
 */

import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useDecidePlaybookProposal, usePlaybookProposals } from '@/hooks/hr/use-duty-playbooks';
import type { PlaybookProposal } from '@/types/hr-playbook';
import { PLAYBOOK_LINE_MAX, PLAYBOOK_LINE_MIN, dutyLabel } from '@/types/hr-playbook';

function origin(p: PlaybookProposal): string {
  if (p.source === 'lesson_pattern') {
    const n = p.evidence?.count ?? 0;
    const days = p.evidence?.window_days ?? 0;
    return `Drafted from a reason seen ${n} ${n === 1 ? 'time' : 'times'} in ${days} days${p.reason_label ? `: ${p.reason_label}` : ''}`;
  }
  return `Suggested by ${(p.suggested_by_name && p.suggested_by_name.trim()) || 'a team member'}`;
}

function ProposalRow({ proposal, myId }: { proposal: PlaybookProposal; myId: string | null }) {
  const [text, setText] = useState(proposal.proposed_text);
  const [note, setNote] = useState('');
  const decide = useDecidePlaybookProposal();
  const own = Boolean(myId && proposal.suggested_by === myId);
  const len = text.trim().length;
  const textValid = len >= PLAYBOOK_LINE_MIN && len <= PLAYBOOK_LINE_MAX;

  async function run(decision: 'accept' | 'decline') {
    try {
      await decide.mutateAsync({
        id: proposal.id,
        decision,
        edited_text: decision === 'accept' && text.trim() !== proposal.proposed_text ? text.trim() : null,
        note: note.trim() || null,
      });
      toast.success(decision === 'accept' ? 'Line added to the playbook.' : 'Proposal declined.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the decision.');
    }
  }

  return (
    <li className='space-y-3 py-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline'>{dutyLabel(proposal.duty_code)}</Badge>
        <span className='text-xs text-muted-foreground'>{origin(proposal)}</span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={PLAYBOOK_LINE_MAX}
        aria-label='Proposed line'
        disabled={own}
      />
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        aria-label='Note'
        placeholder='Note (required to decline)'
        disabled={own}
      />
      {own ? (
        <p className='text-xs text-muted-foreground'>
          This is your own suggestion. Another person who decides playbook lines has to accept or decline it.
        </p>
      ) : (
        <div className='flex flex-wrap gap-2'>
          <Button size='sm' disabled={!textValid || decide.isPending} onClick={() => run('accept')}>
            Accept
          </Button>
          <Button size='sm' variant='outline' disabled={!note.trim() || decide.isPending} onClick={() => run('decline')}>
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}

export function ProposalsTab({ myId }: { myId: string | null }) {
  const { data, isLoading, error } = usePlaybookProposals();
  if (isLoading) return <p className='text-sm text-muted-foreground'>Loading proposals…</p>;
  if (error) {
    return (
      <p className='text-sm text-red-600 dark:text-red-400'>
        Could not load proposals: {error instanceof Error ? error.message : 'unknown error'}
      </p>
    );
  }
  if (!data || data.length === 0) {
    return <p className='text-sm text-muted-foreground'>Nothing waiting. New proposals appear here; no message is sent.</p>;
  }
  return (
    <div className='rounded-xl border bg-card px-4 shadow-sm dark:shadow-none'>
      <ul className='divide-y divide-border'>
        {data.map((p) => (
          <ProposalRow key={p.id} proposal={p} myId={myId} />
        ))}
      </ul>
    </div>
  );
}
