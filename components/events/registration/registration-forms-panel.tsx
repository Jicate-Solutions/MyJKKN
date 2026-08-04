'use client';

// components/events/registration/registration-forms-panel.tsx
//
// An event holds MANY registration forms — one per monthly run, typically. This
// panel is the list + the actions around it (new / copy / rename / delete /
// open / close / copy public link), and it renders the builder for whichever
// form is selected.
//
// Why a panel rather than putting the list inside the builder: the builder holds
// a large amount of unsaved local state and deliberately seeds from the server
// only ONCE, so it never clobbers in-progress typing. Switching forms therefore
// has to remount it — see the `key={selectedFormId}` below. Keeping selection
// out here makes that remount trivial and keeps the builder unaware of siblings.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Copy,
  Link2,
  QrCode,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useEventRegistrationForms,
  useCreateRegistrationForm,
  useCloneRegistrationForm,
  useDeleteRegistrationForm,
  useUpdateRegistrationForm,
} from '@/hooks/events/use-tournament-registration-form';
import { effectiveFee, type EventRegistrationFormSummary } from '@/types/tournament';
import { RegistrationFormEditor } from '@/app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor';
import { RegistrationFeeCard } from './registration-fee-card';
import { FormStateBadge, RegistrationScheduleCard } from './registration-schedule-card';
import { RegistrationFormShareDialog } from './registration-form-share-dialog';
import { publicFormUrl } from './public-form-url';

/** "₹200 · Delegate fee", or null when the form is free (fee off, or unpriced). */
function feeLabelFor(form: EventRegistrationFormSummary): string | null {
  const amount = effectiveFee(form);
  if (!(amount > 0)) return null;
  const money = `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  return form.fee_label ? `${money} · ${form.fee_label}` : money;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'clone'; form: EventRegistrationFormSummary }
  | { kind: 'rename'; form: EventRegistrationFormSummary };

export function RegistrationFormsPanel({
  eventId,
  variant = 'tournament',
  backHref,
  eventName,
}: {
  eventId: string;
  variant?: 'tournament' | 'general';
  backHref?: string;
  /** Used in the share dialog's WhatsApp / email text. Optional: the dialog
   *  falls back to "our event" rather than requiring every caller to thread it. */
  eventName?: string;
}) {
  const { data: forms, isLoading } = useEventRegistrationForms(eventId);
  const createForm = useCreateRegistrationForm(eventId);
  const cloneForm = useCloneRegistrationForm(eventId);
  const deleteForm = useDeleteRegistrationForm(eventId);
  const updateForm = useUpdateRegistrationForm(eventId);

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [nameDraft, setNameDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<EventRegistrationFormSummary | null>(null);
  const [sharing, setSharing] = useState<EventRegistrationFormSummary | null>(null);

  // ?form=<id> lets the event console's "Edit" deep-link straight to one form.
  const requestedFormId = useSearchParams()?.get('form') ?? null;

  // Keep a valid selection: honour the deep link, else the first form, and
  // recover if the selected one is deleted underneath us.
  useEffect(() => {
    if (!forms?.length) return;
    setSelectedFormId((current) => {
      if (current && forms.some((f) => f.id === current)) return current;
      if (requestedFormId && forms.some((f) => f.id === requestedFormId)) {
        return requestedFormId;
      }
      return forms[0].id;
    });
  }, [forms, requestedFormId]);

  const selected = useMemo(
    () => forms?.find((f) => f.id === selectedFormId) ?? null,
    [forms, selectedFormId]
  );

  const closeDialog = () => {
    setDialog({ kind: 'none' });
    setNameDraft('');
  };

  const submitDialog = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    try {
      if (dialog.kind === 'create') {
        const created = await createForm.mutateAsync({ name });
        setSelectedFormId(created.id);
      } else if (dialog.kind === 'clone') {
        const newId = await cloneForm.mutateAsync({ formId: dialog.form.id, newName: name });
        setSelectedFormId(newId);
      } else if (dialog.kind === 'rename') {
        await updateForm.mutateAsync({ formId: dialog.form.id, updates: { name } });
        toast.success('Form renamed');
      }
      closeDialog();
    } catch {
      // The hooks already surface the real error; keep the dialog open so the
      // typed name isn't lost.
    }
  };

  const copyLink = async (form: EventRegistrationFormSummary) => {
    try {
      await navigator.clipboard.writeText(publicFormUrl(eventId, form.slug, variant));
      toast.success('Registration link copied');
    } catch {
      toast.error('Could not copy — copy it from the address bar instead');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteForm.mutateAsync(pendingDelete.id).catch(() => undefined);
    setPendingDelete(null);
  };

  const busy = createForm.isPending || cloneForm.isPending || updateForm.isPending;

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Registration forms</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              One form per run of this event. Copy last month&apos;s to start the next
              one — each form keeps its own questions, its own link and its own
              responses.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-1"
            onClick={() => {
              setNameDraft('');
              setDialog({ kind: 'create' });
            }}
          >
            <Plus className="h-4 w-4" /> New form
          </Button>
        </CardHeader>

        <CardContent>
          {!forms?.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No registration forms yet. Create one to start collecting responses.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {forms.map((form) => {
                const isSelected = form.id === selectedFormId;
                return (
                  <li
                    key={form.id}
                    className={`flex flex-wrap items-center gap-3 p-3 transition-colors ${
                      isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFormId(form.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{form.name}</span>
                        <FormStateBadge form={form} />
                        {isSelected && <Badge variant="outline">Editing</Badge>}
                        {/* Only meaningful for general events — a tournament's
                            fee comes from its divisions, not from the form. */}
                        {variant === 'general' && feeLabelFor(form) && (
                          <Badge variant="outline" className="font-normal">
                            {feeLabelFor(form)}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {form.field_count} {form.field_count === 1 ? 'question' : 'questions'} ·{' '}
                        {form.response_count}{' '}
                        {form.response_count === 1 ? 'response' : 'responses'} · /{form.slug}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => copyLink(form)}
                        title="Copy this form's public registration link"
                      >
                        <Link2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Link</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setSharing(form)}
                        title="QR code and sharing options for this form"
                      >
                        <QrCode className="h-4 w-4" />
                        <span className="hidden sm:inline">Share</span>
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={`Actions for ${form.name}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setNameDraft(`${form.name} (copy)`);
                              setDialog({ kind: 'clone', form });
                            }}
                          >
                            <Copy className="mr-2 h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setNameDraft(form.name);
                              setDialog({ kind: 'rename', form });
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              updateForm.mutate({
                                formId: form.id,
                                updates: { is_enabled: !form.is_enabled },
                              })
                            }
                          >
                            {form.is_enabled ? 'Set inactive' : 'Set active'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setPendingDelete(form)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Fee for the selected form. General events only: a tournament charges
          per division, so a second form-level fee would be a competing source of
          truth for one payment. Keyed like the builder below so a half-typed
          amount never carries across a form switch. */}
      {/* Status + window for the selected form. Both variants: a tournament's
          monthly form needs a schedule as much as a lecture's. */}
      {selected && (
        <RegistrationScheduleCard key={`sched-${selected.id}`} eventId={eventId} form={selected} />
      )}

      {selected && variant === 'general' && (
        <RegistrationFeeCard key={`fee-${selected.id}`} eventId={eventId} form={selected} />
      )}

      {/* The builder for the selected form. Remounted on switch (key) so its
          once-only seeding re-runs against the newly chosen form instead of
          showing the previous form's fields. */}
      {selected && (
        <RegistrationFormEditor
          key={selected.id}
          eventId={eventId}
          formId={selected.id}
          variant={variant}
          backHref={backHref}
        />
      )}

      {/* New / Duplicate / Rename all collect one thing: a name. */}
      <Dialog open={dialog.kind !== 'none'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.kind === 'create'
                ? 'New registration form'
                : dialog.kind === 'clone'
                  ? 'Duplicate form'
                  : 'Rename form'}
            </DialogTitle>
            <DialogDescription>
              {dialog.kind === 'clone'
                ? 'Copies every section and question into a new form. The copy starts closed so you can edit it before anyone can register.'
                : dialog.kind === 'create'
                  ? 'Name it after the run it collects for, e.g. "January 2026". It starts closed.'
                  : 'Only the name changes — the link, questions and responses stay as they are.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="form_name">Form name</Label>
            <Input
              id="form_name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="e.g. January 2026"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameDraft.trim() && !busy) submitDialog();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={submitDialog} disabled={!nameDraft.trim() || busy} className="gap-1">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {dialog.kind === 'clone' ? 'Duplicate' : dialog.kind === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RegistrationFormShareDialog
        open={!!sharing}
        onOpenChange={(o) => !o && setSharing(null)}
        form={sharing}
        url={sharing ? publicFormUrl(eventId, sharing.slug, variant) : ''}
        eventName={eventName}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{pendingDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the form and its {pendingDelete?.field_count ?? 0} question(s), and its
              public link stops working.{' '}
              {(pendingDelete?.response_count ?? 0) > 0
                ? `Its ${pendingDelete?.response_count} response(s) are kept, but they will no longer say which form collected them.`
                : 'It has no responses.'}{' '}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
