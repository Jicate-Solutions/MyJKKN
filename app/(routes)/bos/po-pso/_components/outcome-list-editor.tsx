'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { OutcomeInput } from '@/hooks/bos/use-bos-po-pso';

interface OutcomeListEditorProps {
  rows: OutcomeInput[];
  /** 'PO' or 'PSO' — codes are auto-numbered as PO1, PO2… on add/remove. */
  codePrefix: 'PO' | 'PSO';
  canEdit: boolean;
  onChange: (rows: OutcomeInput[]) => void;
  placeholder: string;
  emptyText: string;
}

export function renumberOutcomes(rows: OutcomeInput[], prefix: string): OutcomeInput[] {
  return rows.map((r, i) => ({ ...r, code: `${prefix}${i + 1}` }));
}

/**
 * Controlled PO/PSO row editor — same visual language as the taxonomy
 * ProgrammeOutcomesEditor (badge code + textarea + trash), but reusable for
 * the institution master and board-override contexts on /bos/po-pso.
 */
export function OutcomeListEditor({
  rows,
  codePrefix,
  canEdit,
  onChange,
  placeholder,
  emptyText,
}: OutcomeListEditorProps) {
  const update = (idx: number, description: string) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, description } : r)));
  const remove = (idx: number) =>
    onChange(renumberOutcomes(rows.filter((_, i) => i !== idx), codePrefix));
  const add = () =>
    onChange(renumberOutcomes([...rows, { code: '', description: '' }], codePrefix));

  return (
    <div className='space-y-3'>
      {rows.map((row, idx) => (
        <div key={idx} className='rounded-md border p-3 space-y-2'>
          <div className='flex items-center justify-between'>
            <Badge variant='outline' className='font-mono text-xs'>
              {row.code}
            </Badge>
            {canEdit && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-7 w-7'
                onClick={() => remove(idx)}
              >
                <Trash2 className='h-3.5 w-3.5 text-destructive' />
              </Button>
            )}
          </div>
          <Textarea
            value={row.description}
            placeholder={placeholder}
            disabled={!canEdit}
            rows={3}
            className='resize-none text-sm'
            onChange={(e) => update(idx, e.target.value)}
          />
        </div>
      ))}

      {rows.length === 0 && (
        <p className='text-xs text-muted-foreground text-center py-4'>{emptyText}</p>
      )}

      {canEdit && (
        <Button type='button' variant='outline' size='sm' onClick={add}>
          <Plus className='h-4 w-4 mr-1' />
          Add {codePrefix}
        </Button>
      )}
    </div>
  );
}
