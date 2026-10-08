'use client';

/**
 * "How this is done" — the short playbook for one HR duty, shown on the screen
 * where the duty is done (20271007161139).
 *
 * Every line names the person credited with it:
 *   - "Written by <name>"                                  (a suggestion or the HR head's own line)
 *   - "Suggested by <name> · edited by <name>"            (a suggestion the decider reworded)
 *   - "Learned from <n> reasons · accepted by <name>"     (drafted from repeated rejection reasons)
 * Names are read from profiles when the card loads, never copied into the line.
 *
 * Any team member can suggest a line; it is credited to them by name and waits
 * for the HR head on /hr/playbooks. Nothing here sends a message.
 */

import { useState } from 'react';
import Link from 'next/link';
import { BookOpenCheck, ChevronDown, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useDutyPlaybook, useSuggestPlaybookLine } from '@/hooks/hr/use-duty-playbooks';
import type { PlaybookLine } from '@/types/hr-playbook';
import { PLAYBOOK_LINE_MAX, PLAYBOOK_LINE_MIN, dutyLabel } from '@/types/hr-playbook';
import { cn } from '@/lib/utils';

/** The card shows at most this many lines; the rest are on /hr/playbooks. */
export const PLAYBOOK_CARD_MAX_LINES = 8;

export function playbookCredit(
  line: Pick<
    PlaybookLine,
    'source' | 'authored_by' | 'author_name' | 'lesson_count' | 'accepted_by_name' | 'edited_by' | 'edited_by_name'
  >,
): string {
  const name = (n: string | null) => (n && n.trim()) || 'a former team member';
  if (line.source === 'lesson_pattern') {
    // Whoever edits a drafted line is the person accepting it, already named here.
    const n = line.lesson_count ?? 0;
    return `Learned from ${n} ${n === 1 ? 'reason' : 'reasons'} · accepted by ${name(line.accepted_by_name)}`;
  }
  if (line.edited_by && line.edited_by !== line.authored_by) {
    return `Suggested by ${name(line.author_name)} · edited by ${name(line.edited_by_name)}`;
  }
  return `Written by ${name(line.author_name)}`;
}

export function SuggestPlaybookLineDialog({
  duty,
  open,
  onOpenChange,
}: {
  duty: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState('');
  const suggest = useSuggestPlaybookLine();
  const length = text.trim().length;
  const valid = length >= PLAYBOOK_LINE_MIN && length <= PLAYBOOK_LINE_MAX;

  async function submit() {
    try {
      await suggest.mutateAsync({ duty, text: text.trim() });
      toast.success('Suggestion sent to the HR head. It is credited to you.');
      setText('');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the suggestion.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Suggest a line</DialogTitle>
          <DialogDescription>
            One short step for {dutyLabel(duty)}. This will be credited to you by name. The HR head reads it on
            the playbooks page and accepts, edits or declines it.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={PLAYBOOK_LINE_MAX}
          rows={3}
          aria-label='Your playbook line'
          placeholder='For example: Open the attached certificate before deciding.'
        />
        <p className={cn('text-xs', length > 0 && !valid ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
          {length}/{PLAYBOOK_LINE_MAX} characters · at least {PLAYBOOK_LINE_MIN}
        </p>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || suggest.isPending}>
            {suggest.isPending ? 'Sending…' : 'Send suggestion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DutyPlaybookCard({ duty, className }: { duty: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const { data: lines, isLoading, error } = useDutyPlaybook(duty);
  const shown = (lines ?? []).slice(0, PLAYBOOK_CARD_MAX_LINES);
  const more = (lines?.length ?? 0) - shown.length;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('rounded-xl border bg-card shadow-sm dark:shadow-none', className)}
    >
      <CollapsibleTrigger asChild>
        <button
          type='button'
          className='flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/50'
        >
          <span className='flex items-center gap-2 text-sm font-semibold text-foreground'>
            <BookOpenCheck aria-hidden='true' className='h-4 w-4 text-primary' />
            How this is done
            {lines && lines.length > 0 && (
              <span className='text-xs font-normal text-muted-foreground'>
                {lines.length} {lines.length === 1 ? 'line' : 'lines'}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden='true'
            className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className='border-t border-border px-4 pb-4 pt-3'>
        {isLoading ? (
          <p className='text-sm text-muted-foreground'>Loading the playbook…</p>
        ) : error ? (
          <p className='text-sm text-red-600 dark:text-red-400'>
            Could not load the playbook: {error instanceof Error ? error.message : 'unknown error'}
          </p>
        ) : shown.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No playbook yet. Suggest the first line.</p>
        ) : (
          <ol className='space-y-3'>
            {shown.map((line, i) => (
              <li key={line.id} className='flex gap-3'>
                <span className='mt-0.5 text-xs font-semibold tabular-nums text-muted-foreground'>{i + 1}.</span>
                <div className='space-y-0.5'>
                  <p className='text-sm text-foreground'>{line.line_text}</p>
                  <p className='text-xs text-muted-foreground'>{playbookCredit(line)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {more > 0 && (
          <p className='mt-2 text-xs text-muted-foreground'>
            {more} more {more === 1 ? 'line' : 'lines'} on the playbooks page.
          </p>
        )}
        <div className='mt-4 flex flex-wrap items-center gap-2'>
          <Button size='sm' variant='outline' onClick={() => setSuggesting(true)}>
            <Lightbulb aria-hidden='true' className='mr-1.5 h-4 w-4' />
            Suggest a line
          </Button>
          <Button size='sm' variant='ghost' asChild>
            <Link href={`/hr/playbooks?duty=${encodeURIComponent(duty)}`}>All playbooks and who wrote them</Link>
          </Button>
        </div>
      </CollapsibleContent>
      <SuggestPlaybookLineDialog duty={duty} open={suggesting} onOpenChange={setSuggesting} />
    </Collapsible>
  );
}

export default DutyPlaybookCard;
