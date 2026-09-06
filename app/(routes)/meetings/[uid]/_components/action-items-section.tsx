'use client';

// app/(routes)/meetings/[uid]/_components/action-items-section.tsx
//
// Meeting Agenda Engine PR2 — the after-meeting capture surface on a booking.
// The host records decisions + action items (owner + due date), toggles them
// done, edits, and deletes. Open items here are what the PastActions adapter
// surfaces onto the host's NEXT meeting with the same person (the loop).
//
// All mutations go through the host-verified server actions in
// ../action-item-actions; after each success we router.refresh() so the list
// re-syncs from the server (single source of truth). Hooks are declared
// unconditionally before any return (no conditional-hook crash).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Square,
  CheckSquare,
  User,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  addActionItemAction,
  updateActionItemAction,
  setActionItemStatusAction,
  deleteActionItemAction,
} from '../action-item-actions';

export interface ActionItemView {
  id: string;
  action_text: string;
  decision_text: string | null;
  owner_label: string | null;
  due_date: string | null;
  status: 'open' | 'done';
}

interface ActionItemsSectionProps {
  bookingId: string;
  uid: string;
  canEdit: boolean;
  items: ActionItemView[];
}

function fmtDue(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ActionItemsSection({ bookingId, uid, canEdit, items }: ActionItemsSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // add-form
  const [adding, setAdding] = useState(false);
  const [newAction, setNewAction] = useState('');
  const [newDecision, setNewDecision] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newDue, setNewDue] = useState('');

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAction, setEditAction] = useState('');
  const [editDecision, setEditDecision] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editDue, setEditDue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function resetAdd() {
    setNewAction('');
    setNewDecision('');
    setNewOwner('');
    setNewDue('');
    setAdding(false);
  }

  function handleAdd() {
    const action = newAction.trim();
    if (!action) {
      toast.error('Enter the action item.');
      return;
    }
    startTransition(async () => {
      const res = await addActionItemAction(bookingId, uid, {
        action,
        decision: newDecision.trim(),
        owner: newOwner.trim(),
        dueDate: newDue || null,
      });
      if (res.success) {
        toast.success('Action item recorded.');
        resetAdd();
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not record the item.');
      }
    });
  }

  function startEdit(item: ActionItemView) {
    setEditingId(item.id);
    setEditAction(item.action_text);
    setEditDecision(item.decision_text ?? '');
    setEditOwner(item.owner_label ?? '');
    setEditDue(item.due_date ?? '');
    setConfirmDeleteId(null);
  }

  function handleSaveEdit(itemId: string) {
    const action = editAction.trim();
    if (!action) {
      toast.error('Action cannot be empty.');
      return;
    }
    startTransition(async () => {
      const res = await updateActionItemAction(itemId, uid, {
        action,
        decision: editDecision.trim(),
        owner: editOwner.trim(),
        dueDate: editDue || null,
      });
      if (res.success) {
        toast.success('Action item updated.');
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save the change.');
      }
    });
  }

  function handleToggle(item: ActionItemView) {
    const next = item.status === 'open' ? 'done' : 'open';
    startTransition(async () => {
      const res = await setActionItemStatusAction(item.id, uid, next);
      if (res.success) {
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not update the item.');
      }
    });
  }

  function handleDelete(itemId: string) {
    startTransition(async () => {
      const res = await deleteActionItemAction(itemId, uid);
      if (res.success) {
        toast.success('Action item removed.');
        setConfirmDeleteId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not remove the item.');
      }
    });
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? 'No decisions or action items yet. After the meeting, capture what was decided and who owns each follow-up.'
            : 'No decisions or action items have been recorded for this meeting yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const isEditing = editingId === item.id;
            const isDone = item.status === 'done';
            const due = fmtDue(item.due_date);
            if (isEditing) {
              return (
                <li key={item.id} className="rounded-md border border-border/60 bg-card p-3">
                  <div className="space-y-2">
                    <Input
                      value={editAction}
                      onChange={(e) => setEditAction(e.target.value)}
                      placeholder="Action item (what needs to happen)"
                      maxLength={500}
                      disabled={pending}
                    />
                    <Textarea
                      value={editDecision}
                      onChange={(e) => setEditDecision(e.target.value)}
                      placeholder="Decision / context (optional)"
                      rows={2}
                      disabled={pending}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Input
                        value={editOwner}
                        onChange={(e) => setEditOwner(e.target.value)}
                        placeholder="Owner (optional)"
                        className="w-44"
                        disabled={pending}
                      />
                      <Input
                        type="date"
                        value={editDue}
                        onChange={(e) => setEditDue(e.target.value)}
                        className="w-44"
                        disabled={pending}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(item.id)} disabled={pending}>
                        {pending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        )}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={pending}>
                        <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </li>
              );
            }
            return (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-md border border-border/60 bg-card p-3 text-sm"
              >
                <button
                  type="button"
                  onClick={() => canEdit && handleToggle(item)}
                  disabled={pending || !canEdit}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-60"
                  aria-label={isDone ? 'Mark as open' : 'Mark as done'}
                >
                  {isDone ? (
                    <CheckSquare className="h-4 w-4 text-green-600" aria-hidden />
                  ) : (
                    <Square className="h-4 w-4" aria-hidden />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`font-medium break-words ${isDone ? 'text-muted-foreground line-through' : ''}`}>
                    {item.action_text}
                  </p>
                  {item.decision_text ? (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {item.decision_text}
                    </p>
                  ) : null}
                  {(item.owner_label || due) ? (
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {item.owner_label ? (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" aria-hidden />
                          {item.owner_label}
                        </span>
                      ) : null}
                      {due ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" aria-hidden />
                          {due}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-1">
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
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : 'Confirm'}
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
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        adding ? (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <Input
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
              placeholder="Action item (what needs to happen)"
              maxLength={500}
              disabled={pending}
              autoFocus
            />
            <Textarea
              value={newDecision}
              onChange={(e) => setNewDecision(e.target.value)}
              placeholder="Decision / context (optional)"
              rows={2}
              disabled={pending}
            />
            <div className="flex flex-wrap gap-2">
              <Input
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="Owner (optional)"
                className="w-44"
                disabled={pending}
              />
              <Input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="w-44"
                disabled={pending}
                aria-label="Due date"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleAdd} disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                Add action item
              </Button>
              <Button size="sm" variant="ghost" onClick={resetAdd} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add action item
          </Button>
        )
      ) : null}
    </div>
  );
}
