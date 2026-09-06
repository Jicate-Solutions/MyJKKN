'use client';

// The event console's Feedback surface: a card per feedback form, and the two
// sub-views a coordinator moves between (the question builder and the response
// reader).
//
// One component with an internal view, rather than three routes per console.
// The feature is mounted on FOUR consoles (general, tournament, marathon,
// induction); at three routes each that is twelve near-identical page files to
// keep in step. Here each console is a five-line route that renders this panel
// with its own eventId and backHref.

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useEventFeedbackForms,
  useCreateFeedbackForm,
  useUpdateFeedbackForm,
  useDeleteFeedbackForm,
} from '@/hooks/events/use-event-feedback';
import { FeedbackFormEditor } from '@/components/events/feedback/feedback-form-editor';
import {
  FeedbackResponsesView,
  FeedbackStateBadge,
} from '@/components/events/feedback/feedback-responses-view';
import { feedbackFormState, FEEDBACK_STATE_LABELS } from '@/types/event-feedback';
import type { EventFeedbackFormSummary } from '@/types/event-feedback';

/** A timestamptz as the value a <input type="datetime-local"> expects, in LOCAL time. */
function toLocalInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The inverse: a local datetime-local string back to an ISO instant, or null when blank. */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type View =
  | { kind: 'list' }
  | { kind: 'edit'; form: EventFeedbackFormSummary }
  | { kind: 'responses'; form: EventFeedbackFormSummary };

export function EventFeedbackPanel({
  eventId,
  eventName,
  backHref,
}: {
  eventId: string;
  eventName?: string;
  /** Where the builder's and reader's "Back" returns to — the event's console. */
  backHref: string;
}) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAnonymous, setNewAnonymous] = useState(false);

  const [settingsFor, setSettingsFor] = useState<EventFeedbackFormSummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventFeedbackFormSummary | null>(null);

  const { data: forms, isLoading } = useEventFeedbackForms(eventId);
  const createForm = useCreateFeedbackForm(eventId);
  const updateForm = useUpdateFeedbackForm(eventId);
  const deleteForm = useDeleteFeedbackForm(eventId);

  // ── Sub-views ──
  if (view.kind === 'edit') {
    return (
      <FeedbackFormEditor
        eventId={eventId}
        formId={view.form.id}
        // Back returns to THIS list, not to the event page — the coordinator
        // got here from the list and expects to land back on it.
        onBack={() => setView({ kind: 'list' })}
      />
    );
  }
  if (view.kind === 'responses') {
    return (
      <FeedbackResponsesView form={view.form} onBack={() => setView({ kind: 'list' })} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          {/* The list is the panel's top level, so this is the only place the
              event console is one click away — the sub-views' own Back buttons
              return here, not out to the event. */}
          <Button asChild variant="ghost" size="icon" className="mt-0.5" title="Back to event">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-base font-semibold">Feedback</h2>
            <p className="text-sm text-muted-foreground">
              Questionnaires for {eventName ? `“${eventName}”` : 'this event'}. Only registered
              attendees can answer, once each.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New feedback form
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      )}

      {!isLoading && !forms?.length && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquarePlus className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No feedback form yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Create one to ask attendees how the event went. You choose every question, and
              you can change them at any time — including after responses start arriving.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New feedback form
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {forms?.map((form) => {
          const state = feedbackFormState(form);
          return (
            <Card key={form.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">{form.name}</CardTitle>
                  <FeedbackStateBadge state={FEEDBACK_STATE_LABELS[state]} />
                </div>
                {form.description && (
                  <p className="text-xs text-muted-foreground">{form.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {form.question_count}{' '}
                    {form.question_count === 1 ? 'question' : 'questions'}
                  </span>
                  <span>
                    {form.response_count}{' '}
                    {form.response_count === 1 ? 'response' : 'responses'}
                  </span>
                  {form.is_anonymous && <span>Anonymous</span>}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setView({ kind: 'edit', form })}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Questions
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setView({ kind: 'responses', form })}
                    // Nothing to read yet; the empty view would only say so.
                    disabled={form.response_count === 0}
                  >
                    <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Results
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSettingsFor(form)}>
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingDelete(form)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Create ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New feedback form</DialogTitle>
            <DialogDescription>
              It starts closed, so you can write the questions before anyone can answer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fb-name">Name</Label>
              <Input
                id="fb-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Day 1 Feedback"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-desc">Description (optional)</Label>
              <Textarea
                id="fb-desc"
                rows={2}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Shown to attendees above the questions"
              />
            </div>
            <div className="flex items-start gap-2 rounded-md border p-3">
              <Switch id="fb-anon" checked={newAnonymous} onCheckedChange={setNewAnonymous} />
              <div className="space-y-0.5">
                <Label htmlFor="fb-anon" className="text-sm">
                  Hide names in the results
                </Label>
                <p className="text-xs text-muted-foreground">
                  Responses are shown and exported without attendee names. The system still
                  records which registration each one came from, so one-response-per-attendee
                  can be enforced — do not promise attendees it is untraceable.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newName.trim() || createForm.isPending}
              // try/catch, not a bare await: a Supabase failure rejects with a
              // PostgrestError — a PLAIN OBJECT, not an Error — so an unhandled
              // rejection here reaches Next's dev overlay as the useless
              // "[object Object]", burying the readable toast the mutation's
              // onError already raised. The catch exists to swallow the
              // rejection, not to report it; the dialog stays open with the
              // typed values intact so the coordinator can retry.
              onClick={async () => {
                try {
                  await createForm.mutateAsync({
                    name: newName,
                    description: newDescription.trim() || null,
                    isAnonymous: newAnonymous,
                  });
                } catch {
                  return;
                }
                setCreateOpen(false);
                setNewName('');
                setNewDescription('');
                setNewAnonymous(false);
              }}
            >
              {createForm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Settings ── */}
      {settingsFor && (
        <FeedbackSettingsDialog
          key={settingsFor.id}
          form={settingsFor}
          onClose={() => setSettingsFor(null)}
          onSave={async (updates) => {
            // See the create button: swallow the rejection so it cannot surface
            // as "[object Object]". The dialog stays open on failure.
            try {
              await updateForm.mutateAsync({ formId: settingsFor.id, updates });
            } catch {
              return;
            }
            setSettingsFor(null);
          }}
          saving={updateForm.isPending}
        />
      )}

      {/* ── Delete ──
          A separate top-level AlertDialog driven by its own state, NOT opened
          from inside another dialog's onOpenChange. Nesting the two is what
          leaves Radix's pointer-events lock on the body and freezes the page. */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.response_count
                ? `This form has ${pendingDelete.response_count} ${
                    pendingDelete.response_count === 1 ? 'response' : 'responses'
                  }. Deleting it deletes them too, permanently. Export the CSV first if you need them.`
                : 'This deletes the form and all of its questions. It cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                // catch, NOT finally — finally re-throws, which is exactly the
                // unhandled rejection this is here to prevent. The toast from
                // the mutation's onError is the user-facing report.
                try {
                  await deleteForm.mutateAsync(pendingDelete.id);
                } catch {
                  /* reported by the toast */
                }
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Name / description / anonymity / open window. Its own component so its local
 *  draft state resets cleanly when a different form is opened (via `key`). */
function FeedbackSettingsDialog({
  form,
  onClose,
  onSave,
  saving,
}: {
  form: EventFeedbackFormSummary;
  onClose: () => void;
  onSave: (updates: {
    name?: string;
    description?: string | null;
    is_enabled?: boolean;
    is_anonymous?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
  }) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? '');
  const [isEnabled, setIsEnabled] = useState(form.is_enabled);
  const [isAnonymous, setIsAnonymous] = useState(form.is_anonymous);
  const [startsAt, setStartsAt] = useState(toLocalInput(form.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(form.ends_at));

  // The DB rejects ends_at < starts_at outright; catching it here turns a
  // constraint error into something the coordinator can actually act on.
  const windowInvalid = !!startsAt && !!endsAt && new Date(endsAt) < new Date(startsAt);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feedback form settings</DialogTitle>
          <DialogDescription>
            The questions themselves are edited from the Questions button.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 rounded-md border p-3">
            <Switch id="s-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
            <Label htmlFor="s-enabled" className="text-sm">
              Open for responses
            </Label>
          </div>

          <div className="flex items-start gap-2 rounded-md border p-3">
            <Switch id="s-anon" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
            <div className="space-y-0.5">
              <Label htmlFor="s-anon" className="text-sm">
                Hide names in the results
              </Label>
              <p className="text-xs text-muted-foreground">
                Applies to the results view and the CSV export, including responses already
                submitted.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-start">Opens (optional)</Label>
              <Input
                id="s-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-end">Closes (optional)</Label>
              <Input
                id="s-end"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave both blank to control the form with the switch alone. A form is answerable
            only when it is open <em>and</em> inside this window.
          </p>
          {windowInvalid && (
            <p className="text-xs text-destructive">
              The closing time is before the opening time.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || windowInvalid || saving}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || null,
                is_enabled: isEnabled,
                is_anonymous: isAnonymous,
                starts_at: fromLocalInput(startsAt),
                ends_at: fromLocalInput(endsAt),
              })
            }
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
