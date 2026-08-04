'use client';

// components/events/registration/event-form-cards.tsx
//
// The event console's registration-forms grid: one card per form, each with
// Preview / Responses / Edit / Delete.
//
// Safe to render on the event detail page because listForms() is a pure SELECT.
// The older single-link card deliberately avoided showing a live field count,
// because the only reader then was getOrCreateForm(), which INSERTS a form row
// on first read — merely viewing an event would have materialised one. That is
// no longer how the list is read.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Copy,
  Eye,
  FileText,
  Inbox,
  Link2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { DynamicFieldInput } from '@/components/events/dynamic-field-input';
import {
  useEventRegistrationForms,
  useRegistrationForm,
  useFormResponses,
  useCreateRegistrationForm,
  useCloneRegistrationForm,
  useDeleteRegistrationForm,
  useUpdateRegistrationForm,
} from '@/hooks/events/use-tournament-registration-form';
import { effectiveFee, type EventRegistrationFormSummary } from '@/types/tournament';
import { FormStateBadge } from './registration-schedule-card';
import { RegistrationFormShareDialog } from './registration-form-share-dialog';
import { publicFormUrl, type EventFormVariant } from './public-form-url';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/* ─── Preview ─────────────────────────────────────────────────────
   Renders the form with the SAME component the public page uses, so what an
   organizer previews is literally what a registrant sees — not a second
   rendering that can drift from it. Inputs are live but discarded: wrapping
   them in a disabled fieldset would hide the real appearance of the controls. */
function PreviewDialog({
  form,
  open,
  onClose,
}: {
  form: EventRegistrationFormSummary;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useRegistrationForm(open ? form.id : '');
  const [values, setValues] = useState<Record<string, unknown>>({});

  const sections = data?.sections ?? [];
  const isEmpty = !isLoading && sections.every((s) => !(s.fields ?? []).length);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.name}</DialogTitle>
          <DialogDescription>
            Exactly what a registrant sees. Nothing typed here is saved.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : isEmpty ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            This form has no questions yet. Use Edit to add some.
          </p>
        ) : (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.id} className="space-y-3">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <Separator />
                {(section.fields ?? []).map((field) => (
                  <DynamicFieldInput
                    key={field.id}
                    field={field}
                    value={values[field.field_key]}
                    onChange={(v: unknown) =>
                      setValues((prev) => ({ ...prev, [field.field_key]: v }))
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Responses ───────────────────────────────────────────────── */
function ResponsesDialog({
  form,
  open,
  onClose,
}: {
  form: EventRegistrationFormSummary;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useFormResponses(form.id, open);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Responses · {form.name}</DialogTitle>
          <DialogDescription>
            Everyone who registered through this form. Other forms on this event
            keep their own separate responses.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !data?.length ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No responses yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.participant_name || 'Unnamed registrant'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateTime(r.created_at)}
                  </span>
                </div>
                {(r.participant_email || r.participant_phone) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[r.participant_email, r.participant_phone].filter(Boolean).join(' · ')}
                  </p>
                )}
                {r.answers.length > 0 && (
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    {r.answers.map((a, i) => (
                      <div key={i} className="text-sm">
                        <dt className="text-xs text-muted-foreground">{a.label}</dt>
                        <dd className="break-words">{a.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── One form card ─────────────────────────────────────────────
   Actions are ICONS with tooltips rather than labelled buttons: there are seven
   of them now, and a 2-column grid of text buttons made the card taller than the
   information it was presenting. */

/** Icon action with an accessible name — the tooltip is not the only label. */
function CardAction({
  label,
  onClick,
  href,
  destructive,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  const className = `h-8 w-8 ${destructive ? 'text-destructive hover:text-destructive' : ''}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Button asChild variant="ghost" size="icon" className={className}>
            <Link href={href} aria-label={label}>
              {children}
            </Link>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={className}
            onClick={onClick}
            aria-label={label}
          >
            {children}
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function FormCard({
  eventId,
  form,
  variant,
  editHref,
  onPreview,
  onResponses,
  onDuplicate,
  onDelete,
  onShare,
  onToggle,
  toggling,
}: {
  eventId: string;
  form: EventRegistrationFormSummary;
  variant: EventFormVariant;
  editHref: string;
  onPreview: () => void;
  onResponses: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShare: () => void;
  onToggle: () => void;
  toggling: boolean;
}) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicFormUrl(eventId, form.slug, variant));
      toast.success('Registration link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const fee = effectiveFee(form);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{form.name}</CardTitle>
          {/* Four states, not two: a form can be enabled yet Scheduled or
              Expired, and "Open" would be a lie in both cases. */}
          <span className="shrink-0">
            <FormStateBadge form={form} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs text-muted-foreground">/{form.slug}</p>
          {fee > 0 && (
            <Badge variant="outline" className="font-normal">
              ₹{fee.toLocaleString('en-IN')}
              {form.fee_label ? ` · ${form.fee_label}` : ''}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <strong className="font-medium">{form.field_count}</strong>
            <span className="text-muted-foreground">
              {form.field_count === 1 ? 'question' : 'questions'}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <strong className="font-medium">{form.response_count}</strong>
            <span className="text-muted-foreground">
              {form.response_count === 1 ? 'response' : 'responses'}
            </span>
          </span>
        </div>

        <Separator />

        {/* Every action as an icon. Share is the new one — it opens the QR +
            link dialog, which is the thing an organizer actually hands out. */}
        <TooltipProvider delayDuration={200}>
          <div className="mt-auto flex flex-wrap items-center gap-0.5 pt-1">
            <CardAction label="Preview form" onClick={onPreview}>
              <Eye className="h-4 w-4" />
            </CardAction>
            <CardAction label="View responses" onClick={onResponses}>
              <Inbox className="h-4 w-4" />
            </CardAction>
            <CardAction label="Edit questions" href={editHref}>
              <Pencil className="h-4 w-4" />
            </CardAction>
            <CardAction label="Copy registration link" onClick={copyLink}>
              <Link2 className="h-4 w-4" />
            </CardAction>
            <CardAction label="QR code & sharing" onClick={onShare}>
              <QrCode className="h-4 w-4" />
            </CardAction>
            <CardAction label="Duplicate form" onClick={onDuplicate}>
              <Copy className="h-4 w-4" />
            </CardAction>
            <CardAction label="Delete form" onClick={onDelete} destructive>
              <Trash2 className="h-4 w-4" />
            </CardAction>

            {/* Stays a labelled button: it changes state rather than opening
                something, and an icon alone would not say which way it flips. */}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={toggling}
              onClick={onToggle}
            >
              {toggling && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {form.is_enabled ? 'Set inactive' : 'Set active'}
            </Button>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

/* ─── The grid ────────────────────────────────────────────────── */
export function EventFormCards({
  eventId,
  editHrefFor,
  variant = 'general',
  eventName,
}: {
  eventId: string;
  /** Where Edit goes. The builder route differs for tournaments vs general events. */
  editHrefFor: (formId: string) => string;
  /**
   * Which public registration page the links point at. Defaults to 'general'
   * because this grid's only caller is the general event console — the previous
   * hardcoded /p/tournament/ meant every link it produced was dead.
   */
  variant?: EventFormVariant;
  /** Used in the share dialog's WhatsApp / email text. */
  eventName?: string;
}) {
  const { data: forms, isLoading } = useEventRegistrationForms(eventId);
  const createForm = useCreateRegistrationForm(eventId);
  const cloneForm = useCloneRegistrationForm(eventId);
  const deleteForm = useDeleteRegistrationForm(eventId);
  const updateForm = useUpdateRegistrationForm(eventId);

  const [previewing, setPreviewing] = useState<EventRegistrationFormSummary | null>(null);
  const [viewingResponses, setViewingResponses] = useState<EventRegistrationFormSummary | null>(
    null
  );
  const [deleting, setDeleting] = useState<EventRegistrationFormSummary | null>(null);
  const [sharing, setSharing] = useState<EventRegistrationFormSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const totals = useMemo(
    () =>
      (forms ?? []).reduce(
        (acc, f) => ({
          open: acc.open + (f.is_enabled ? 1 : 0),
          responses: acc.responses + f.response_count,
        }),
        { open: 0, responses: 0 }
      ),
    [forms]
  );

  const submitCreate = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    try {
      await createForm.mutateAsync({ name });
      setCreating(false);
      setNameDraft('');
    } catch {
      // the hook toasts the real reason; keep the typed name
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Registration forms
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            One form per run of this event. Duplicate last month&apos;s to start the
            next — each keeps its own questions, its own link and its own responses.
          </p>
          {!!forms?.length && (
            <p className="mt-1 text-xs text-muted-foreground">
              {forms.length} {forms.length === 1 ? 'form' : 'forms'} · {totals.open} open ·{' '}
              {totals.responses} total {totals.responses === 1 ? 'response' : 'responses'}
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1"
          onClick={() => {
            setNameDraft('');
            setCreating(true);
          }}
        >
          <Plus className="h-4 w-4" /> New form
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        ) : !forms?.length ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">No registration forms yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one to start collecting responses for this event.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {forms.map((form) => (
              <FormCard
                key={form.id}
                eventId={eventId}
                form={form}
                variant={variant}
                editHref={editHrefFor(form.id)}
                onPreview={() => setPreviewing(form)}
                onResponses={() => setViewingResponses(form)}
                onDuplicate={() =>
                  cloneForm.mutate({ formId: form.id, newName: `${form.name} (copy)` })
                }
                onDelete={() => setDeleting(form)}
                onShare={() => setSharing(form)}
                onToggle={() =>
                  updateForm.mutate({
                    formId: form.id,
                    updates: { is_enabled: !form.is_enabled },
                  })
                }
                toggling={updateForm.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>

      <RegistrationFormShareDialog
        open={!!sharing}
        onOpenChange={(o) => !o && setSharing(null)}
        form={sharing}
        url={sharing ? publicFormUrl(eventId, sharing.slug, variant) : ''}
        eventName={eventName}
      />

      {previewing && (
        <PreviewDialog form={previewing} open onClose={() => setPreviewing(null)} />
      )}
      {viewingResponses && (
        <ResponsesDialog
          form={viewingResponses}
          open
          onClose={() => setViewingResponses(null)}
        />
      )}

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New registration form</DialogTitle>
            <DialogDescription>
              Name it after the run it collects for, e.g. &ldquo;January 2026&rdquo;. It
              starts closed so you can add questions before anyone can register.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new_form_name">Form name</Label>
            <Input
              id="new_form_name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="e.g. January 2026"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameDraft.trim() && !createForm.isPending) {
                  submitCreate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitCreate}
              disabled={!nameDraft.trim() || createForm.isPending}
              className="gap-1"
            >
              {createForm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the form and its {deleting?.field_count ?? 0} question(s), and its
              public link stops working.{' '}
              {(deleting?.response_count ?? 0) > 0
                ? `Its ${deleting?.response_count} response(s) are kept, but they will no longer say which form collected them.`
                : 'It has no responses.'}{' '}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) deleteForm.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Delete form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
