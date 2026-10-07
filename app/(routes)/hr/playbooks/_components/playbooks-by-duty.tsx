'use client';

/**
 * Tab 1 — every duty's playbook, one duty at a time, with each line's credit.
 * The HR head (hr.harness.playbooks.manage) can retire a line with a note.
 */

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { playbookCredit, SuggestPlaybookLineDialog } from '@/components/hr/duty-playbook/duty-playbook-card';
import { useDutyPlaybook, useRetirePlaybookLine } from '@/hooks/hr/use-duty-playbooks';
import { PLAYBOOK_DUTIES } from '@/types/hr-playbook';
import { cn } from '@/lib/utils';

export function PlaybooksByDuty({
  duty,
  onDutyChange,
  canManage,
}: {
  duty: string;
  onDutyChange: (duty: string) => void;
  canManage: boolean;
}) {
  const { data: lines, isLoading, error } = useDutyPlaybook(duty);
  const retire = useRetirePlaybookLine();
  const [suggesting, setSuggesting] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const current = PLAYBOOK_DUTIES.find((d) => d.code === duty);

  async function confirmRetire(id: string) {
    try {
      await retire.mutateAsync({ id, note: note.trim() });
      toast.success('Line retired. It no longer shows on the duty screen.');
      setRetiringId(null);
      setNote('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not retire the line.');
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-2' role='group' aria-label='Choose a duty'>
        {PLAYBOOK_DUTIES.map((d) => (
          <Button
            key={d.code}
            size='sm'
            variant={d.code === duty ? 'default' : 'outline'}
            aria-pressed={d.code === duty}
            onClick={() => onDutyChange(d.code)}
          >
            {d.label}
          </Button>
        ))}
      </div>

      <div className='rounded-xl border bg-card p-4 shadow-sm dark:shadow-none'>
        <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
          <h2 className='text-lg font-semibold text-foreground'>{current?.label ?? duty}</h2>
          <div className='flex gap-2'>
            {current && (
              <Button size='sm' variant='ghost' asChild>
                <Link href={current.href}>Open the duty screen</Link>
              </Button>
            )}
            <Button size='sm' variant='outline' onClick={() => setSuggesting(true)}>
              Suggest a line
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className='text-sm text-muted-foreground'>Loading…</p>
        ) : error ? (
          <p className='text-sm text-red-600 dark:text-red-400'>
            Could not load this playbook: {error instanceof Error ? error.message : 'unknown error'}
          </p>
        ) : !lines || lines.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No playbook yet. Suggest the first line.</p>
        ) : (
          <ol className='divide-y divide-border'>
            {lines.map((line, i) => (
              <li key={line.id} className='py-3'>
                <div className='flex gap-3'>
                  <span className='mt-0.5 text-xs font-semibold tabular-nums text-muted-foreground'>{i + 1}.</span>
                  <div className='flex-1 space-y-1'>
                    <p className='text-sm text-foreground'>{line.line_text}</p>
                    <p className='text-xs text-muted-foreground'>{playbookCredit(line)}</p>
                    {canManage && retiringId !== line.id && (
                      <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' onClick={() => setRetiringId(line.id)}>
                        Retire this line
                      </Button>
                    )}
                    {canManage && retiringId === line.id && (
                      <div className={cn('mt-2 space-y-2')}>
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={2}
                          maxLength={500}
                          aria-label='Why this line is retired'
                          placeholder='Why this line no longer applies (required)'
                        />
                        <div className='flex gap-2'>
                          <Button
                            size='sm'
                            variant='destructive'
                            disabled={!note.trim() || retire.isPending}
                            onClick={() => confirmRetire(line.id)}
                          >
                            Retire
                          </Button>
                          <Button size='sm' variant='outline' onClick={() => { setRetiringId(null); setNote(''); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <SuggestPlaybookLineDialog duty={duty} open={suggesting} onOpenChange={setSuggesting} />
    </div>
  );
}
