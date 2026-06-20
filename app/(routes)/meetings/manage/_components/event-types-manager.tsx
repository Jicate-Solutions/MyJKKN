'use client';

// app/(routes)/meetings/manage/_components/event-types-manager.tsx
//
// Interactive manager for the current user's Cal.com event types.
// All mutations go through the 'use server' actions in ../actions.ts — the
// Cal.com API key never reaches this client bundle.
//
// States handled explicitly (rule #27): list, empty, busy/loading, per-action
// errors (surfaced via toast). No silent failures, no blank screens.
//
// Pattern source: app/(routes)/projects/_components/project-form-dialog.tsx
// (react-hook-form + zod + Shadcn Dialog) and the card/list conventions used
// across app/(routes)/**/_components/*-list.tsx.

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Calendar,
  Clock,
  CreditCard,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  createMyEventType,
  deleteMyEventType,
  updateMyEventType,
  type EventTypeFormInput,
  type ManageEventType,
} from '../actions';

// ─────────────────────────────────────────────────────────────────────────────
// Form schema
// ─────────────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  slug: z
    .string()
    .trim()
    .max(64, 'Slug is too long')
    .optional()
    .or(z.literal('')),
  lengthInMinutes: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole minutes only')
    .positive('Must be greater than 0')
    .max(1440, 'Max 24 hours (1440 min)'),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  hidden: z.boolean(),
  locationMode: z.enum(['in_person', 'phone', 'online']),
  locationText: z.string().trim().max(200, 'Keep the location short').optional().or(z.literal('')),
  // ── M2 slot rules ──────────────────────────────────────────────────────────
  bufferBeforeMin: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole minutes only')
    .min(0, 'Cannot be negative')
    .max(1440, 'Max 24 hours'),
  bufferAfterMin: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole minutes only')
    .min(0, 'Cannot be negative')
    .max(1440, 'Max 24 hours'),
  minNoticeMin: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole minutes only')
    .min(0, 'Cannot be negative')
    .max(525600, 'Max one year'),
  // 0 (and the "Back-to-back" preset) means: use the meeting duration as the step.
  slotIntervalMin: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole minutes only')
    .min(0, 'Cannot be negative')
    .max(1440, 'Max 24 hours'),
  // ── Wave-3: event-type variants + booking lifecycle ──────────────────────────
  kind: z.enum(['solo', 'group', 'collective', 'round_robin']),
  // group only — seats per slot. Ignored unless kind === 'group'.
  capacity: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole numbers only')
    .min(1, 'At least 1 seat')
    .max(1000, 'Max 1000 seats'),
  // collective (co-hosts) / round_robin (pool) — host emails, one per line.
  hostEmails: z.string().trim().max(4000).optional().or(z.literal('')),
  // lifecycle
  redirectUrl: z
    .string()
    .trim()
    .max(2000, 'URL is too long')
    .optional()
    .or(z.literal('')),
  cancellationPolicy: z.string().trim().max(2000, 'Keep the policy under 2000 characters').optional().or(z.literal('')),
  // ── Wave-3 (B): paid bookings ────────────────────────────────────────────────
  requiresDeposit: z.boolean(),
  // Deposit amount in RUPEES in the form (converted to paise on submit).
  // Ignored unless requiresDeposit; validated server-side too.
  depositAmountRupees: z.coerce
    .number({ invalid_type_error: 'Enter an amount' })
    .min(0, 'Cannot be negative')
    .max(100000, 'Max ₹1,00,000'),
});

type FormValues = z.infer<typeof formSchema>;

const LOCATION_OPTIONS = [
  { value: 'in_person', label: 'In person' },
  { value: 'phone', label: 'Phone call' },
  { value: 'online', label: 'Online (Google Meet)' },
] as const;

// Wave-3 event-type variants. Each carries a one-line plain explanation for
// the host (the manage UI's audience is staff, not developers).
const KIND_OPTIONS = [
  { value: 'solo', label: 'One-on-one', hint: 'Just you and one guest (default).' },
  { value: 'group', label: 'Group', hint: 'You + many guests on the same slot (set seats).' },
  {
    value: 'collective',
    label: 'Collective',
    hint: 'You + co-hosts who must ALL be free for a slot.',
  },
  {
    value: 'round_robin',
    label: 'Round-robin',
    hint: 'One of a pool of staff is auto-assigned, evenly shared.',
  },
] as const;

function kindLabel(kind: ManageEventType['kind']): string {
  return KIND_OPTIONS.find((k) => k.value === kind)?.label ?? 'One-on-one';
}

function locationLabel(et: ManageEventType): string {
  if (et.locationMode === 'phone') return 'Phone call';
  if (et.locationMode === 'online') return 'Google Meet';
  return et.locationText || 'In person';
}

/** Lowercase-hyphenated slug derived from a title. */
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const DURATION_PRESETS = [15, 30, 45, 60] as const;

// M2: slot-increment quick picks. 0 = back-to-back (engine uses the duration).
const SLOT_INTERVAL_PRESETS = [
  { value: 0, label: 'Back-to-back' },
  { value: 15, label: '15' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Main manager
// ─────────────────────────────────────────────────────────────────────────────

export function EventTypesManager({
  initialEventTypes,
}: {
  initialEventTypes: ManageEventType[];
}) {
  const [eventTypes, setEventTypes] = useState<ManageEventType[]>(initialEventTypes);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManageEventType | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ManageEventType | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(et: ManageEventType) {
    setEditing(et);
    setDialogOpen(true);
  }

  function handleSaved(saved: ManageEventType) {
    setEventTypes((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    setDialogOpen(false);
    setEditing(null);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    startDelete(async () => {
      const res = await deleteMyEventType(target.id);
      if (res.success) {
        setEventTypes((prev) => prev.filter((e) => e.id !== target.id));
        toast.success(`Deleted "${target.title}"`);
        setPendingDelete(null);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {eventTypes.length === 0
            ? 'No meeting types yet.'
            : `${eventTypes.length} meeting type${eventTypes.length === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          New meeting type
        </Button>
      </div>

      {eventTypes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Calendar
              className="mx-auto h-10 w-10 text-muted-foreground/40"
              aria-hidden
            />
            <h3 className="mt-3 text-sm font-medium">Create your first meeting type</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              A meeting type is something people can book with you — like a
              &ldquo;15-min intro call&rdquo; or a &ldquo;30-min counselling
              session.&rdquo;
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New meeting type
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {eventTypes.map((et) => (
            <Card key={et.id} className="group transition-colors hover:bg-accent/40">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{et.title}</h3>
                      {et.kind && et.kind !== 'solo' && (
                        <Badge variant="outline" className="shrink-0">
                          {kindLabel(et.kind)}
                          {et.kind === 'group' && et.capacity ? ` · ${et.capacity}` : ''}
                        </Badge>
                      )}
                      {et.requiresDeposit && et.depositAmountPaise ? (
                        <Badge variant="outline" className="shrink-0 gap-1">
                          <CreditCard className="h-3 w-3" aria-hidden />
                          {`₹${(et.depositAmountPaise / 100).toLocaleString('en-IN')}`}
                        </Badge>
                      ) : null}
                      {et.hidden && (
                        <Badge variant="secondary" className="shrink-0 gap-1">
                          <EyeOff className="h-3 w-3" aria-hidden />
                          Hidden
                        </Badge>
                      )}
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      /{et.slug}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {locationLabel(et)}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 gap-1">
                    <Clock className="h-3 w-3" aria-hidden />
                    {et.lengthInMinutes} min
                  </Badge>
                </div>

                {et.description ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {et.description}
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground/60">
                    No description
                  </p>
                )}

                <div className="mt-auto flex justify-end gap-1 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(et)}
                    aria-label={`Edit ${et.title}`}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(et)}
                    aria-label={`Delete ${et.title}`}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EventTypeDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o && !isDeleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this meeting type?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; will be permanently removed and can
              no longer be booked. Existing bookings are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / Edit dialog
// ─────────────────────────────────────────────────────────────────────────────

function EventTypeDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ManageEventType | null;
  onSaved: (saved: ManageEventType) => void;
}) {
  const [isSaving, startSave] = useTransition();
  const [slugTouched, setSlugTouched] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      title: editing?.title ?? '',
      slug: editing?.slug ?? '',
      lengthInMinutes: editing?.lengthInMinutes ?? 30,
      description: editing?.description ?? '',
      hidden: editing?.hidden ?? false,
      locationMode: editing?.locationMode ?? 'in_person',
      locationText: editing?.locationText ?? '',
      bufferBeforeMin: editing?.bufferBeforeMin ?? 0,
      bufferAfterMin: editing?.bufferAfterMin ?? 0,
      minNoticeMin: editing?.minNoticeMin ?? 0,
      // null in the DB ↔ 0 in the form ("back-to-back").
      slotIntervalMin: editing?.slotIntervalMin ?? 0,
      // Wave-3 variants + lifecycle.
      kind: editing?.kind ?? 'solo',
      capacity: editing?.capacity ?? 1,
      hostEmails: (editing?.hostEmails ?? []).join('\n'),
      redirectUrl: editing?.redirectUrl ?? '',
      cancellationPolicy: editing?.cancellationPolicy ?? '',
      // Wave-3 (B): paid bookings — paise in the DB ↔ rupees in the form.
      requiresDeposit: editing?.requiresDeposit ?? false,
      depositAmountRupees: editing?.depositAmountPaise ? editing.depositAmountPaise / 100 : 0,
    },
  });

  const titleValue = watch('title');
  const slugValue = watch('slug');
  const durationValue = watch('lengthInMinutes');
  const hiddenValue = watch('hidden');
  const locationModeValue = watch('locationMode');
  const locationTextValue = watch('locationText');
  const slotIntervalValue = watch('slotIntervalMin');
  const kindValue = watch('kind');
  const requiresDepositValue = watch('requiresDeposit');

  function onTitleChange(value: string) {
    setValue('title', value, { shouldValidate: true });
    // Auto-fill slug from title until the user edits the slug manually.
    if (!editing && !slugTouched) {
      setValue('slug', slugify(value));
    }
  }

  function onSubmit(values: FormValues) {
    // Split the host-emails textarea (collective co-hosts / round-robin pool)
    // into a clean list; the server resolves emails → profile ids.
    const hostEmails = (values.hostEmails ?? '')
      .split(/[\n,]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const payload: EventTypeFormInput = {
      title: values.title,
      slug: (values.slug && values.slug.trim()) || slugify(values.title),
      lengthInMinutes: values.lengthInMinutes,
      description: values.description?.trim() || undefined,
      hidden: values.hidden,
      locationMode: values.locationMode,
      locationText: values.locationText?.trim() || undefined,
      bufferBeforeMin: values.bufferBeforeMin,
      bufferAfterMin: values.bufferAfterMin,
      minNoticeMin: values.minNoticeMin,
      // 0 → null (back-to-back) is handled server-side in validateForm.
      slotIntervalMin: values.slotIntervalMin,
      // Wave-3 variants + lifecycle.
      kind: values.kind,
      capacity: values.kind === 'group' ? values.capacity : undefined,
      hostEmails: values.kind === 'collective' || values.kind === 'round_robin' ? hostEmails : [],
      redirectUrl: values.redirectUrl?.trim() || undefined,
      cancellationPolicy: values.cancellationPolicy?.trim() || undefined,
      // Wave-3 (B): paid bookings — rupees → paise; cleared when not required.
      requiresDeposit: values.requiresDeposit,
      depositAmountPaise: values.requiresDeposit
        ? Math.round((values.depositAmountRupees || 0) * 100)
        : null,
    };

    startSave(async () => {
      const res = editing
        ? await updateMyEventType(editing.id, payload)
        : await createMyEventType(payload);

      if (res.success) {
        toast.success(editing ? 'Meeting type updated' : 'Meeting type created');
        onSaved(res.data);
        reset();
        setSlugTouched(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isSaving) return;
        onOpenChange(o);
        if (!o) {
          reset();
          setSlugTouched(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit meeting type' : 'New meeting type'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update the details people see when booking with you.'
                : 'Define something people can book with you.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="et-title">Title</Label>
              <Input
                id="et-title"
                placeholder="e.g. 15-min intro call"
                value={titleValue}
                onChange={(e) => onTitleChange(e.target.value)}
                aria-invalid={!!errors.title}
                autoFocus
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <Label htmlFor="et-slug">
                Booking link <span className="text-muted-foreground">(slug)</span>
              </Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="et-slug"
                  placeholder="15-min-intro-call"
                  className="font-mono"
                  value={slugValue ?? ''}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setValue('slug', e.target.value, { shouldValidate: true });
                  }}
                  onBlur={(e) => setValue('slug', slugify(e.target.value))}
                  aria-invalid={!!errors.slug}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-filled from the title. Lowercase letters, numbers and hyphens.
              </p>
              {errors.slug && (
                <p className="text-xs text-destructive">{errors.slug.message}</p>
              )}
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label htmlFor="et-duration">Duration (minutes)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="et-duration"
                  type="number"
                  min={1}
                  max={1440}
                  className="w-28"
                  {...register('lengthInMinutes')}
                  aria-invalid={!!errors.lengthInMinutes}
                />
                <div className="flex gap-1">
                  {DURATION_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant={Number(durationValue) === preset ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setValue('lengthInMinutes', preset, { shouldValidate: true })
                      }
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>
              {errors.lengthInMinutes && (
                <p className="text-xs text-destructive">
                  {errors.lengthInMinutes.message}
                </p>
              )}
            </div>

            {/* Booking type (Wave-3 variants) — segmented buttons + a contextual
                panel (seats for group, host list for collective/round-robin). */}
            <div className="space-y-1.5">
              <Label>Booking type</Label>
              <div className="flex flex-wrap gap-1">
                {KIND_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={kindValue === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setValue('kind', opt.value, { shouldValidate: true })}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {KIND_OPTIONS.find((k) => k.value === kindValue)?.hint}
              </p>

              {kindValue === 'group' && (
                <div className="mt-2 space-y-1.5">
                  <Label htmlFor="et-capacity" className="text-xs">
                    Seats per slot
                  </Label>
                  <Input
                    id="et-capacity"
                    type="number"
                    min={1}
                    max={1000}
                    className="w-32"
                    {...register('capacity')}
                    aria-invalid={!!errors.capacity}
                  />
                  {errors.capacity && (
                    <p className="text-xs text-destructive">{errors.capacity.message}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    How many people can book the same time. The slot shows
                    &ldquo;seats left&rdquo; until it&rsquo;s full.
                  </p>
                </div>
              )}

              {(kindValue === 'collective' || kindValue === 'round_robin') && (
                <div className="mt-2 space-y-1.5">
                  <Label htmlFor="et-host-emails" className="text-xs">
                    {kindValue === 'collective' ? 'Co-host emails' : 'Staff pool emails'}
                  </Label>
                  <Textarea
                    id="et-host-emails"
                    placeholder={'name1@jkkn.ac.in\nname2@jkkn.ac.in'}
                    rows={3}
                    className="font-mono text-xs"
                    {...register('hostEmails')}
                  />
                  {errors.hostEmails && (
                    <p className="text-xs text-destructive">{errors.hostEmails.message}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    One email per line.{' '}
                    {kindValue === 'collective'
                      ? 'All of these people (plus you) must be free for a slot to be offered.'
                      : 'One of these people (plus you) is auto-assigned to each booking, evenly shared.'}{' '}
                    Unknown emails are ignored.
                  </p>
                </div>
              )}
            </div>

            {/* Where (U3, D4) — segmented buttons, same pattern as the
                duration presets (avoids a Radix Select for 3 fixed values). */}
            <div className="space-y-1.5">
              <Label>Where does this meeting happen?</Label>
              <div className="flex flex-wrap gap-1">
                {LOCATION_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={locationModeValue === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setValue('locationMode', opt.value, { shouldValidate: true })}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              {locationModeValue === 'in_person' && (
                <Input
                  placeholder="e.g. Pharmacy block, Room 204"
                  value={locationTextValue ?? ''}
                  onChange={(e) => setValue('locationText', e.target.value)}
                  aria-label="Meeting location"
                />
              )}
              {locationModeValue === 'online' && (
                <p className="text-xs text-muted-foreground">
                  A Google Meet link is created automatically when your Google
                  Calendar is connected.
                </p>
              )}
              {locationModeValue === 'phone' && (
                <p className="text-xs text-muted-foreground">
                  You call the attendee on the phone number they provide.
                </p>
              )}
              {errors.locationText && (
                <p className="text-xs text-destructive">{errors.locationText.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="et-description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="et-description"
                placeholder="What is this meeting for? Shown on the booking page."
                rows={3}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* ── M2 scheduling rules ─────────────────────────────────────────
                Buffers, minimum notice and slot increment. All optional; the
                native slot engine consumes them (computeSlots). */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Scheduling rules</Label>
                <p className="text-xs text-muted-foreground">
                  Control the gaps around each meeting and how the times are offered.
                </p>
              </div>

              {/* Buffers */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="et-buffer-before" className="text-xs">
                    Buffer before (min)
                  </Label>
                  <Input
                    id="et-buffer-before"
                    type="number"
                    min={0}
                    max={1440}
                    {...register('bufferBeforeMin')}
                    aria-invalid={!!errors.bufferBeforeMin}
                  />
                  {errors.bufferBeforeMin && (
                    <p className="text-xs text-destructive">
                      {errors.bufferBeforeMin.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="et-buffer-after" className="text-xs">
                    Buffer after (min)
                  </Label>
                  <Input
                    id="et-buffer-after"
                    type="number"
                    min={0}
                    max={1440}
                    {...register('bufferAfterMin')}
                    aria-invalid={!!errors.bufferAfterMin}
                  />
                  {errors.bufferAfterMin && (
                    <p className="text-xs text-destructive">
                      {errors.bufferAfterMin.message}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Padding kept free on either side of the meeting (e.g. travel or
                notes time). Other bookings can&rsquo;t fall inside the padding.
              </p>

              {/* Minimum notice */}
              <div className="space-y-1.5">
                <Label htmlFor="et-min-notice" className="text-xs">
                  Minimum notice (min)
                </Label>
                <Input
                  id="et-min-notice"
                  type="number"
                  min={0}
                  className="w-32"
                  {...register('minNoticeMin')}
                  aria-invalid={!!errors.minNoticeMin}
                />
                {errors.minNoticeMin && (
                  <p className="text-xs text-destructive">{errors.minNoticeMin.message}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  How far ahead someone must book. e.g. 120 = no bookings within
                  the next 2 hours.
                </p>
              </div>

              {/* Slot increment */}
              <div className="space-y-1.5">
                <Label htmlFor="et-slot-interval" className="text-xs">
                  Slot increment (min)
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="et-slot-interval"
                    type="number"
                    min={0}
                    max={1440}
                    className="w-32"
                    {...register('slotIntervalMin')}
                    aria-invalid={!!errors.slotIntervalMin}
                  />
                  <div className="flex gap-1">
                    {SLOT_INTERVAL_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        type="button"
                        variant={Number(slotIntervalValue) === preset.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() =>
                          setValue('slotIntervalMin', preset.value, { shouldValidate: true })
                        }
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
                {errors.slotIntervalMin && (
                  <p className="text-xs text-destructive">{errors.slotIntervalMin.message}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  The grid start times sit on. <strong>0 = back-to-back</strong>{' '}
                  (offered every {durationValue || 30} min, your meeting length).
                  Set e.g. 15 to offer a 60-min meeting at :00, :15, :30, :45.
                </p>
              </div>
            </div>

            {/* ── Wave-3 booking lifecycle ──────────────────────────────────
                After-booking redirect + cancellation policy text. */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">After booking</Label>
                <p className="text-xs text-muted-foreground">
                  What happens once someone books, and what they see if they cancel.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="et-redirect" className="text-xs">
                  Redirect URL <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="et-redirect"
                  type="url"
                  inputMode="url"
                  placeholder="https://… or /thank-you"
                  {...register('redirectUrl')}
                  aria-invalid={!!errors.redirectUrl}
                />
                {errors.redirectUrl && (
                  <p className="text-xs text-destructive">{errors.redirectUrl.message}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Send the booker here after a successful booking instead of the
                  default confirmation. Leave blank to keep the default.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="et-cancel-policy" className="text-xs">
                  Cancellation policy <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="et-cancel-policy"
                  rows={2}
                  placeholder="e.g. Please cancel at least 24 hours in advance."
                  {...register('cancellationPolicy')}
                  aria-invalid={!!errors.cancellationPolicy}
                />
                {errors.cancellationPolicy && (
                  <p className="text-xs text-destructive">{errors.cancellationPolicy.message}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Shown to the attendee on the cancel page.
                </p>
              </div>
            </div>

            {/* ── Wave-3 (B) paid bookings — require a Razorpay deposit ───────── */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="et-requires-deposit" className="text-sm">
                    Require a deposit to book
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Collect a payment before the booking is confirmed.
                  </p>
                </div>
                <Switch
                  id="et-requires-deposit"
                  checked={requiresDepositValue}
                  onCheckedChange={(v) => setValue('requiresDeposit', v, { shouldValidate: true })}
                />
              </div>

              {requiresDepositValue && (
                <div className="space-y-1.5">
                  <Label htmlFor="et-deposit-amount" className="text-xs">
                    Deposit amount (₹)
                  </Label>
                  <Input
                    id="et-deposit-amount"
                    type="number"
                    min={1}
                    max={100000}
                    step="1"
                    className="w-40"
                    {...register('depositAmountRupees')}
                    aria-invalid={!!errors.depositAmountRupees}
                  />
                  {errors.depositAmountRupees && (
                    <p className="text-xs text-destructive">
                      {errors.depositAmountRupees.message}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Charged via Razorpay on the booking page. If online payments
                    aren&rsquo;t set up yet, the meeting can still be booked for free.
                  </p>
                </div>
              )}
            </div>

            {/* Hidden toggle (edit only — new types default visible) */}
            {editing && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="et-hidden" className="text-sm">
                    Hide from booking page
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Hidden types can&rsquo;t be booked via your public link.
                  </p>
                </div>
                <Switch
                  id="et-hidden"
                  checked={hiddenValue}
                  onCheckedChange={(v) => setValue('hidden', v)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
