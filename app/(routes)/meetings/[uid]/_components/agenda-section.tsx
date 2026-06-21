'use client';

// app/(routes)/meetings/[uid]/_components/agenda-section.tsx
//
// Meeting Agenda Engine PR1 — the manual agenda surface on a booking detail.
// Renders the ordered agenda items; when the viewer is the host (canEdit), adds
// add / edit / delete / reorder controls. All mutations go through the
// host-verified server actions in ../agenda-actions; after each success we
// router.refresh() so the list re-syncs from the server (single source of truth).
//
// State is intentionally minimal: the list itself is rendered straight from the
// `items` prop (refreshed by the server), so local state only covers the
// add-form, the row being edited, and the row pending delete-confirm.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  addAgendaItemAction,
  updateAgendaItemAction,
  deleteAgendaItemAction,
  moveAgendaItemAction,
} from '../agenda-actions';

export interface AgendaItemView {
  id: string;
  title: string;
  body: string | null;
  order_index: number;
}

interface AgendaSectionProps {
  bookingId: string;
  uid: string;
  canEdit: boolean;
  items: AgendaItemView[];
}

export function AgendaSection({ bookingId, uid, canEdit, items }: AgendaSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // add-form
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [adding, setAdding] = useState(false);

  // edit / delete row state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleAdd() {
    const title = newTitle.trim();
    if (!title) {
      toast.error('Enter a title for the agenda item.');
      return;
    }
    startTransition(async () => {
      const res = await addAgendaItemAction(bookingId, uid, { title, body: newBody.trim() });
      if (res.success) {
        toast.success('Agenda item added.');
        setNewTitle('');
        setNewBody('');
        setAdding(false);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not add the item.');
      }
    });
  }

  function startEdit(item: AgendaItemView) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditBody(item.body ?? '');
    setConfirmDeleteId(null);
  }

  function handleSaveEdit(itemId: string) {
    const title = editTitle.trim();
    if (!title) {
      toast.error('Title cannot be empty.');
      return;
    }
    startTransition(async () => {
      const res = await updateAgendaItemAction(itemId, uid, { title, body: editBody.trim() });
      if (res.success) {
        toast.success('Agenda item updated.');
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save the change.');
      }
    });
  }

  function handleDelete(itemId: string) {
    startTransition(async () => {
      const res = await deleteAgendaItemAction(itemId, uid);
      if (res.success) {
        toast.success('Agenda item removed.');
        setConfirmDeleteId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not remove the item.');
      }
    });
  }

  function handleMove(itemId: string, direction: 'up' | 'down') {
    startTransition(async () => {
      const res = await moveAgendaItemAction(itemId, uid, direction);
      if (res.success) {
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not reorder the item.');
      }
    });
  }

  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? 'No agenda yet. Add the points you want to cover in this meeting.'
            : 'No agenda has been prepared for this meeting yet.'}
        </p>
      ) : (
        <ol className="space-y-2">
          {sorted.map((item, idx) => {
            const isEditing = editingId === item.id;
            return (
              <li
                key={item.id}
                className="rounded-md border border-border/60 bg-card p-3 text-sm"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Agenda item title"
                      maxLength={300}
                      disabled={pending}
                    />
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      placeholder="Details (optional)"
                      rows={2}
                      disabled={pending}
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(item.id)} disabled={pending}>
                        {pending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        )}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        disabled={pending}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {idx + 1}.
                        </span>
                        <span className="font-medium break-words">{item.title}</span>
                      </div>
                      {item.body ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                          {item.body}
                        </p>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleMove(item.id, 'up')}
                          disabled={pending || idx === 0}
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleMove(item.id, 'down')}
                          disabled={pending || idx === sorted.length - 1}
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => startEdit(item)}
                          disabled={pending}
                          aria-label="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        {confirmDeleteId === item.id ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7"
                            onClick={() => handleDelete(item.id)}
                            disabled={pending}
                          >
                            {pending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              'Confirm'
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setConfirmDeleteId(item.id)}
                            disabled={pending}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {canEdit ? (
        adding ? (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Agenda item title"
              maxLength={300}
              disabled={pending}
              autoFocus
            />
            <Textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Details (optional)"
              rows={2}
              disabled={pending}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleAdd} disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                Add item
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setNewTitle('');
                  setNewBody('');
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add agenda item
          </Button>
        )
      ) : null}
    </div>
  );
}
