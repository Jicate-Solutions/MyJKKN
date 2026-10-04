'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useSetChecklistItem } from '@/hooks/campus-living/use-hostel-vacate';
import type { HostelClearanceItem } from '@/types/hostel-vacate';

export function ChecklistRow({
  requestId,
  item,
  canEdit,
}: {
  requestId: string;
  item: HostelClearanceItem;
  canEdit: boolean;
}) {
  const setItem = useSetChecklistItem();
  const [notes, setNotes] = useState(item.notes ?? '');
  const [showNotes, setShowNotes] = useState(false);

  const save = (cleared: boolean) =>
    setItem.mutate({ itemId: item.id, requestId, cleared, notes: notes.trim() || null });

  return (
    <div className='rounded-md border p-3'>
      <div className='flex items-center gap-2'>
        <Checkbox
          checked={item.is_cleared}
          disabled={!canEdit || setItem.isPending}
          onCheckedChange={(v) => save(!!v)}
          aria-label={item.item_label}
        />
        <div className='flex-1 min-w-0 flex items-center gap-2'>
          <span className={'text-sm ' + (item.is_cleared ? 'text-muted-foreground' : 'font-medium')}>
            {item.item_label}
          </span>
          {item.is_required ? (
            <Badge variant='outline' className='text-xs'>Required</Badge>
          ) : (
            <Badge variant='secondary' className='text-xs'>Optional</Badge>
          )}
        </div>
        {canEdit && (
          <Button size='sm' variant='ghost' onClick={() => setShowNotes((s) => !s)}>
            {showNotes ? 'Hide' : 'Remarks'}
          </Button>
        )}
      </div>
      {canEdit && (showNotes || item.notes) && (
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes.trim() !== (item.notes ?? '') && save(item.is_cleared)}
          placeholder='Remarks'
          className='mt-2 text-xs'
        />
      )}
      {!canEdit && item.notes && <p className='text-xs text-muted-foreground mt-2'>{item.notes}</p>}
      {item.is_cleared && item.cleared_at && (
        <p className='text-[11px] text-muted-foreground mt-1'>
          Cleared {new Date(item.cleared_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
