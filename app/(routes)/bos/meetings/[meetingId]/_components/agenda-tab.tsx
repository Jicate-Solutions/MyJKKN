'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { BosAgendaItem, BosResolutionStatus } from '@/types/bos';
import {
  useBosAgendaItems,
  useCreateBosAgendaItem,
  useUpdateBosAgendaItem,
  useDeleteBosAgendaItem,
} from '@/hooks/bos/use-bos-agenda';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Resolution status label map ───────────────────────────────────────────────

const RESOLUTION_STATUS_LABELS: Record<BosResolutionStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  deferred: 'Deferred',
  not_applicable: 'N/A',
};

const RESOLUTION_STATUS_VARIANTS: Record<
  BosResolutionStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'outline',
  in_progress: 'secondary',
  completed: 'default',
  deferred: 'destructive',
  not_applicable: 'secondary',
};

// ── Agenda Item Form Dialog ───────────────────────────────────────────────────

interface AgendaItemFormProps {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  item?: BosAgendaItem; // present when editing
}

function AgendaItemFormDialog({ open, onClose, meetingId, item }: AgendaItemFormProps) {
  const isEdit = !!item;
  const createItem = useCreateBosAgendaItem(meetingId);
  const updateItem = useUpdateBosAgendaItem(meetingId);

  const [title, setTitle] = useState(item?.item_title ?? '');
  const [description, setDescription] = useState(item?.item_description ?? '');
  const [resolutionText, setResolutionText] = useState(item?.resolution_text ?? '');
  const [resolutionStatus, setResolutionStatus] = useState<BosResolutionStatus>(
    item?.resolution_status ?? 'pending'
  );

  const isPending = createItem.isPending || updateItem.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    try {
      const payload = {
        item_title: title.trim(),
        item_description: description.trim() || undefined,
        resolution_text: resolutionText.trim() || undefined,
        resolution_status: resolutionStatus,
      };
      if (isEdit) {
        await updateItem.mutateAsync({ id: item.id, data: payload });
        toast.success('Agenda item updated');
      } else {
        await createItem.mutateAsync(payload as any);
        toast.success('Agenda item added');
      }
      onClose();
    } catch (err) {
      logger.error('academic/bos', 'Failed to save agenda item', err);
      toast.error((err as Error).message || 'Failed to save agenda item');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Agenda Item' : 'Add Agenda Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label>Title <span className='text-destructive'>*</span></Label>
            <Input
              placeholder='e.g. Review of Curriculum for CS301'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>Description</Label>
            <textarea
              className='w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none'
              rows={3}
              placeholder='Background, supporting documents, context...'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>Resolution</Label>
            <textarea
              className='w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none'
              rows={3}
              placeholder='Resolution text from the meeting...'
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>Resolution Status</Label>
            <Select
              value={resolutionStatus}
              onValueChange={(v) => setResolutionStatus(v as BosResolutionStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RESOLUTION_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Agenda Item Row ───────────────────────────────────────────────────────────

function AgendaItemRow({
  item,
  canEdit,
  meetingId,
}: {
  item: BosAgendaItem;
  canEdit: boolean;
  meetingId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const deleteItem = useDeleteBosAgendaItem(meetingId);

  const handleDelete = async () => {
    if (!confirm(`Delete agenda item ${item.item_number}?`)) return;
    try {
      await deleteItem.mutateAsync(item.id);
      toast.success('Item deleted');
    } catch (err) {
      logger.error('academic/bos', 'Failed to delete agenda item', err);
      toast.error('Failed to delete item');
    }
  };

  const hasDetails = item.item_description || item.resolution_text;

  return (
    <>
      <div className='flex items-start gap-3 rounded-lg border p-3'>
        {/* Item number badge */}
        <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground'>
          {item.item_number}
        </div>

        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <p className='font-medium text-sm'>{item.item_title}</p>
            {item.resolution_status && (
              <Badge
                variant={RESOLUTION_STATUS_VARIANTS[item.resolution_status]}
                className='text-xs'
              >
                {RESOLUTION_STATUS_LABELS[item.resolution_status]}
              </Badge>
            )}
          </div>
          {item.resolution_text && !expanded && (
            <p className='text-xs text-muted-foreground mt-1 truncate'>{item.resolution_text}</p>
          )}
          {expanded && (
            <div className='mt-2 space-y-2'>
              {item.item_description && (
                <p className='text-xs text-muted-foreground whitespace-pre-line'>
                  {item.item_description}
                </p>
              )}
              {item.resolution_text && (
                <div className='rounded bg-muted/50 p-2'>
                  <p className='text-xs font-medium text-muted-foreground mb-1'>Resolution</p>
                  <p className='text-xs whitespace-pre-line'>{item.resolution_text}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className='flex items-center gap-1 shrink-0'>
          {hasDetails && (
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7 text-muted-foreground'
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className='h-3.5 w-3.5' /> : <ChevronDown className='h-3.5 w-3.5' />}
            </Button>
          )}
          {canEdit && (
            <>
              <Button
                variant='ghost'
                size='icon'
                className='h-7 w-7 text-muted-foreground hover:text-foreground'
                onClick={() => setEditOpen(true)}
              >
                <Pencil className='h-3.5 w-3.5' />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                className='h-7 w-7 text-muted-foreground hover:text-destructive'
                onClick={handleDelete}
                disabled={deleteItem.isPending}
              >
                <Trash2 className='h-3.5 w-3.5' />
              </Button>
            </>
          )}
        </div>
      </div>

      {editOpen && (
        <AgendaItemFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          meetingId={meetingId}
          item={item}
        />
      )}
    </>
  );
}

// ── Agenda Tab ────────────────────────────────────────────────────────────────

interface AgendaTabProps {
  meetingId: string;
  canEdit: boolean;
}

export function AgendaTab({ meetingId, canEdit }: AgendaTabProps) {
  const { data: items = [], isLoading } = useBosAgendaItems(meetingId);
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) {
    return (
      <div className='space-y-2'>
        {[1, 2, 3].map((i) => <Skeleton key={i} className='h-14 w-full' />)}
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-sm text-muted-foreground'>
          {items.length} agenda {items.length === 1 ? 'item' : 'items'}
        </p>
        {canEdit && (
          <Button size='sm' variant='outline' onClick={() => setAddOpen(true)}>
            <Plus className='mr-2 h-4 w-4' />
            Add Item
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className='rounded-lg border border-dashed p-8 text-center'>
          <p className='text-sm text-muted-foreground'>No agenda items yet.</p>
          {canEdit && (
            <Button variant='link' size='sm' className='mt-1' onClick={() => setAddOpen(true)}>
              Add the first agenda item →
            </Button>
          )}
        </div>
      ) : (
        <div className='space-y-2'>
          {items.map((item) => (
            <AgendaItemRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              meetingId={meetingId}
            />
          ))}
        </div>
      )}

      {addOpen && (
        <AgendaItemFormDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          meetingId={meetingId}
        />
      )}
    </div>
  );
}
