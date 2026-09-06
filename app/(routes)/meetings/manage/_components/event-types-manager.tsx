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

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Calendar,
  CalendarClock,
  Clock,
  CreditCard,
  EyeOff,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
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
import { cn } from '@/lib/utils';

import {
  addMyEventTypeLocation,
  createMyEventType,
  deleteMyEventType,
  listMyScheduleChoices,
  moveOnlineMeetingsToOnlineHours,
  removeMyEventTypeLocation,
  updateMyEventType,
  type EventTypeFormInput,
  type ManageEventType,
  type ManageEventTypeLocation,
  type MeetingLocationMode,
  type ScheduleChoice,
} from '../actions';
import { VenueRoomPicker } from './venue-room-picker';

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
  purposeGroup: z.string().trim().max(80, 'Keep the group label short').optional().or(z.literal('')),
  hidden: z.boolean(),
  locationMode: z.enum(['in_person', 'phone', 'online']),
  locationText: z.string().trim().max(200, 'Keep the location short').optional().or(z.literal('')),
  // Venue from Resource Management (PR1): a "Spaces & Venues" room id ('' = none).
  locationResourceId: z.string().optional().or(z.literal('')),
  // Which of the host's schedules this type is bookable in ('' = normal hours).
  scheduleId: z.string().optional().or(z.literal('')),
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
}).superRefine((val, ctx) => {
  // Venue-from-resource PR1: an in-person meeting must name a place — either a
  // room from the registry OR a custom text location. Mirrors the server rule
  // in actions.ts validateForm so the host gets feedback before submitting.
  if (val.locationMode === 'in_person') {
    const hasRoom = Boolean(val.locationResourceId && val.locationResourceId.trim());
    const hasText = Boolean(val.locationText && val.locationText.trim());
    if (!hasRoom && !hasText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationResourceId'],
        message: 'Pick a venue, or type a custom place, for in-person meetings.',
      });
    }
  }
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
  return et.locationResourceName || et.locationText || 'In person';
}

// The list's word for "schedule_id is NULL" — the host's default working hours.
// Deliberately plainer than the dialog's "My normal working hours" button so it
// fits a card line on a phone.
const NORMAL_HOURS_LABEL = 'Normal hours';

/**
 * Which working-hours calendar a meeting type is bookable in, for the list card.
 *
 * `scheduleId === null` means the host's normal working hours, and a type pinned
 * AT the default schedule means the same thing (some production types were
 * pinned outside the app) — both read as NORMAL_HOURS_LABEL.
 *
 * Returns null only while the host's schedules are still loading AND the type
 * points at a named one: printing a name we cannot resolve yet would be a guess,
 * so the line appears when the data does.
 */
function hoursLabel(
  et: ManageEventType,
  schedules: ScheduleChoice[],
  defaultScheduleId: string | null,
): { name: string; tone: 'normal' | 'named' | 'unknown' } | null {
  if (!et.scheduleId || et.scheduleId === defaultScheduleId) {
    return { name: NORMAL_HOURS_LABEL, tone: 'normal' };
  }
  if (schedules.length === 0) return null;
  const match = schedules.find((s) => s.id === et.scheduleId);
  return match
    ? { name: match.name, tone: 'named' }
    : { name: 'Other hours', tone: 'unknown' };
}

/**
 * The "which hours does this use?" line on a list card (2026-08-31).
 *
 * This answer already existed, but only inside the edit dialog — one page away
 * from where the calendars are created — so the whole model was invisible from
 * the list. Reads from the schedules the manager already loaded; no extra fetch.
 */
function HoursLine({
  et,
  schedules,
  defaultScheduleId,
}: {
  et: ManageEventType;
  schedules: ScheduleChoice[];
  defaultScheduleId: string | null;
}) {
  const hours = hoursLabel(et, schedules, defaultScheduleId);
  if (!hours) return null;

  const title =
    hours.tone === 'normal'
      ? 'Bookable inside your normal working hours.'
      : hours.tone === 'named'
        ? `Bookable inside your “${hours.name}” working hours.`
        : 'These working hours are not one of yours — open Edit to pick one.';

  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground" title={title}>
      <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="sr-only">Working hours: </span>
      <span
        className={cn(
          'truncate',
          hours.tone === 'named' && 'font-medium text-foreground',
          hours.tone === 'unknown' && 'font-medium text-destructive',
        )}
      >
        {hours.name}
      </span>
    </p>
  );
}

/** Same label, for one row of the places list. */
function placeLabel(place: ManageEventTypeLocation): string {
  if (place.locationMode === 'phone') return 'Phone call';
  if (place.locationMode === 'online') return 'Google Meet';
  return place.locationResourceName || place.locationText || 'In person';
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

  // The host's own working-hours schedules, for the picker in the dialog and
  // for the online-hours shortcut below. Loaded once — the page itself does not
  // fetch them, so a host who has never opened Availability still sees the
  // single "My normal working hours" option rather than an empty control.
  const [schedules, setSchedules] = useState<ScheduleChoice[]>([]);
  const [onlineScheduleId, setOnlineScheduleId] = useState<string | null>(null);
  const [isMoving, startMove] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listMyScheduleChoices().then((res) => {
      if (cancelled || !res.success) return;
      setSchedules(res.data.schedules);
      setOnlineScheduleId(res.data.onlineScheduleId);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // "My normal working hours" is stored as NULL, so a type pinned AT the default
  // schedule means the same thing and must read the same on the list.
  const defaultScheduleId = schedules.find((s) => s.isDefault)?.id ?? null;

  // Offer the shortcut only when it would actually do something: the host has
  // one clearly-online schedule AND at least one online meeting type still on
  // their normal hours.
  const movableOnlineCount = eventTypes.filter(
    (e) => e.locationMode === 'online' && e.scheduleId === null,
  ).length;
  const canUseOnlineHours = Boolean(onlineScheduleId) && movableOnlineCount > 0;
  const onlineScheduleName =
    schedules.find((s) => s.id === onlineScheduleId)?.name ?? 'your online hours';

  function moveOnlineTypes() {
    startMove(async () => {
      const res = await moveOnlineMeetingsToOnlineHours();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      if (res.data.moved === 0) {
        toast.info('Nothing to move — your online meeting types already have their own hours.');
        return;
      }
      toast.success(
        `Moved ${res.data.moved} online meeting type${res.data.moved === 1 ? '' : 's'} to "${res.data.scheduleName}".`,
      );
      setEventTypes((prev) =>
        prev.map((e) =>
          e.locationMode === 'online' && e.scheduleId === null
            ? { ...e, scheduleId: onlineScheduleId }
            : e,
        ),
      );
    });
  }

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

  /**
   * Places are saved immediately (not on form submit), so keep the list in sync
   * without touching `editing` — replacing that object would re-sync the open
   * form and discard any field the host is part-way through typing.
   */
  function handleLocationsChanged(typeId: string, locations: ManageEventTypeLocation[]) {
    setEventTypes((prev) =>
      prev.map((e) => (e.id === typeId ? { ...e, locations } : e)),
    );
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm text-muted-foreground">
            {eventTypes.length === 0
              ? 'No meeting types yet.'
              : `${eventTypes.length} meeting type${eventTypes.length === 1 ? '' : 's'}`}
          </p>
          {/* The calendars themselves are created and named on Availability.
              Nothing here used to say so, which is why hosts believed the
              multiple-hours model did not exist (2026-08-31). */}
          <p className="text-xs text-muted-foreground">
            Each one is bookable inside a working-hours calendar.{' '}
            <Link
              href="/meetings/availability"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              Add or rename calendars on Availability
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canUseOnlineHours && (
            <Button
              size="sm"
              variant="outline"
              onClick={moveOnlineTypes}
              disabled={isMoving}
              title={`Put your ${movableOnlineCount} online meeting type${movableOnlineCount === 1 ? '' : 's'} on "${onlineScheduleName}" instead of your normal working hours.`}
            >
              {isMoving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Clock className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              Use &ldquo;{onlineScheduleName}&rdquo; for online meetings
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New meeting type
          </Button>
        </div>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      {et.locations && et.locations.length > 1
                        ? `${et.locations.length} places`
                        : locationLabel(et)}
                    </p>
                    <HoursLine
                      et={et}
                      schedules={schedules}
                      defaultScheduleId={defaultScheduleId}
                    />
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
        schedules={schedules}
        onSaved={handleSaved}
        onLocationsChanged={handleLocationsChanged}
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
  schedules,
  onSaved,
  onLocationsChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ManageEventType | null;
  /** The host's own working-hours schedules; empty until they load. */
  schedules: ScheduleChoice[];
  onSaved: (saved: ManageEventType) => void;
  onLocationsChanged: (typeId: string, locations: ManageEventTypeLocation[]) => void;
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
      purposeGroup: editing?.purposeGroup ?? '',
      hidden: editing?.hidden ?? false,
      locationMode: editing?.locationMode ?? 'in_person',
      locationText: editing?.locationText ?? '',
      locationResourceId: editing?.locationResourceId ?? '',
      // '' = "My normal working hours" (schedule_id NULL in the database).
      scheduleId: editing?.scheduleId ?? '',
      // A NEW type starts with a 5-minute gap on each side, so a stranger
      // cannot chain-book straight onto the end of an existing meeting. `??`
      // falls through only when `editing` is absent, so an existing type keeps
      // its own value — including a deliberate 0. The host can still change
      // either number here before saving. Matched by the column default
      // (20260820000000) and by scripts/meetings/provision-*-native.ts.
      bufferBeforeMin: editing?.bufferBeforeMin ?? 5,
      bufferAfterMin: editing?.bufferAfterMin ?? 5,
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
  const locationResourceIdValue = watch('locationResourceId');
  const slotIntervalValue = watch('slotIntervalMin');
  const kindValue = watch('kind');
  const requiresDepositValue = watch('requiresDeposit');
  const scheduleIdValue = watch('scheduleId');

  // "My normal working hours" is stored as NULL. A type that already points AT
  // the default schedule (47 of production's 250 types were pinned outside the
  // app) means the same thing, so it highlights the same button.
  const defaultScheduleId = schedules.find((s) => s.isDefault)?.id ?? null;
  const usingNormalHours = !scheduleIdValue || scheduleIdValue === defaultScheduleId;
  const otherSchedules = schedules.filter((s) => !s.isDefault);
  // Only a NON-default pick can carry the "no hours set yet" warning; saying it
  // about the normal hours themselves would be circular.
  const pickedSchedule = usingNormalHours
    ? null
    : otherSchedules.find((s) => s.id === scheduleIdValue) ?? null;

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
      purposeGroup: values.purposeGroup?.trim() || null,
      hidden: values.hidden,
      locationMode: values.locationMode,
      locationText: values.locationText?.trim() || undefined,
      locationResourceId: values.locationResourceId?.trim() || undefined,
      // '' → null = "my normal working hours" (the host's default schedule).
      scheduleId: values.scheduleId?.trim() || null,
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
                <div className="space-y-2">
                  {/* PR1: pick a real room from Resource Management (all JKKN,
                      searchable). Picking a room supersedes any custom text. */}
                  <VenueRoomPicker
                    value={locationResourceIdValue ?? ''}
                    onChange={(id) => {
                      setValue('locationResourceId', id, { shouldValidate: true });
                      if (id) setValue('locationText', '', { shouldValidate: true });
                    }}
                    initialName={editing?.locationResourceName ?? null}
                  />
                  {/* Custom-place fallback — only when no registry room is chosen
                      (e.g. an off-campus venue). Required-for-in-person is
                      enforced by the schema refine + server validateForm. */}
                  {!locationResourceIdValue && (
                    <Input
                      placeholder="…or type a custom place (e.g. Pharmacy block, Room 204)"
                      value={locationTextValue ?? ''}
                      onChange={(e) =>
                        setValue('locationText', e.target.value, { shouldValidate: true })
                      }
                      aria-label="Custom meeting location"
                    />
                  )}
                  {errors.locationResourceId && (
                    <p className="text-xs text-destructive">
                      {errors.locationResourceId.message}
                    </p>
                  )}
                </div>
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

            {/* Other places this meeting can happen in. Edit-only — a place
                needs a saved meeting type to attach to — and hidden entirely
                when `locations` is null, which means the places table is not
                on this database yet (migration 20260830030000 is Director-gated). */}
            {editing && editing.locations !== null && (
              <PlacesSection
                key={editing.id}
                meetingTypeId={editing.id}
                initialPlaces={editing.locations}
                onChanged={(places) => onLocationsChanged(editing.id, places)}
              />
            )}

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

            {/* Purpose group — collapses formats of the same meeting into one
                choice on the public page (added 2026-08-03). */}
            <div className="space-y-1.5">
              <Label htmlFor="et-purpose-group">
                Group with <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="et-purpose-group"
                placeholder='e.g. "Full review"'
                {...register('purposeGroup')}
              />
              <p className="text-xs text-muted-foreground">
                Give two meetings the same label to show them as ONE choice on your
                booking page — the visitor picks the purpose first, then whether to
                meet in person or online. Leave blank to list this on its own.
              </p>
              {errors.purposeGroup && (
                <p className="text-xs text-destructive">{errors.purposeGroup.message}</p>
              )}
            </div>

            {/* Which working hours this meeting kind is bookable in (2026-08-21).
                Hidden when the host has only one schedule — the answer is then
                always "my normal working hours" and the control is noise. */}
            {schedules.length > 1 && (
              <div className="space-y-1.5">
                <Label>Which hours does this use?</Label>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant={usingNormalHours ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setValue('scheduleId', '', { shouldValidate: true })}
                  >
                    My normal working hours
                  </Button>
                  {otherSchedules.map((s) => (
                    <Button
                      key={s.id}
                      type="button"
                      variant={scheduleIdValue === s.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setValue('scheduleId', s.id, { shouldValidate: true })}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {pickedSchedule && !pickedSchedule.hasHours
                    ? `"${pickedSchedule.name}" has no hours set yet, so your normal working hours are used until you add some — nobody ever sees an empty calendar.`
                    : 'People can only book this inside the hours you pick here. Change the hours themselves on the Availability tab.'}
                </p>
                {scheduleIdValue && !usingNormalHours && !pickedSchedule && (
                  <p className="text-xs text-destructive">
                    This meeting type points at working hours that are not yours. Pick one
                    of the above to fix it.
                  </p>
                )}
              </div>
            )}

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

// ─────────────────────────────────────────────────────────────────────────────
// Places — one meeting type, many locations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add / remove the places a meeting type can happen in.
 *
 * A meeting type used to hold exactly one location, which is why the booking
 * page carries near-duplicate records that differ only by where the meeting is
 * — "One to One Meeting … 15 Minutes" and "Online One to One 15Mins Meeting"
 * are the same purpose in two places. Listing several places here is what lets
 * those collapse into one record.
 *
 * Saves immediately rather than on form submit: a place belongs to a saved
 * meeting type, so there is nothing to defer, and the host sees the result of
 * each click. The single location above is untouched — it still drives the
 * booking page until a later change moves the read path across.
 */
function PlacesSection({
  meetingTypeId,
  initialPlaces,
  onChanged,
}: {
  meetingTypeId: string;
  initialPlaces: ManageEventTypeLocation[];
  onChanged: (places: ManageEventTypeLocation[]) => void;
}) {
  const [places, setPlaces] = useState<ManageEventTypeLocation[]>(initialPlaces);
  const [mode, setMode] = useState<MeetingLocationMode>('in_person');
  const [resourceId, setResourceId] = useState('');
  const [customText, setCustomText] = useState('');
  const [isBusy, startBusy] = useTransition();

  function commit(next: ManageEventTypeLocation[]) {
    setPlaces(next);
    onChanged(next);
  }

  function addPlace() {
    startBusy(async () => {
      const res = await addMyEventTypeLocation(meetingTypeId, {
        locationMode: mode,
        locationResourceId: mode === 'in_person' ? resourceId || null : null,
        locationText: mode === 'in_person' && !resourceId ? customText.trim() || null : null,
      });
      if (res.success) {
        commit([...places, res.data]);
        setResourceId('');
        setCustomText('');
        toast.success(`Added ${placeLabel(res.data)}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function removePlace(place: ManageEventTypeLocation) {
    startBusy(async () => {
      const res = await removeMyEventTypeLocation(meetingTypeId, place.id);
      if (res.success) {
        commit(places.filter((p) => p.id !== place.id));
        toast.success(`Removed ${placeLabel(place)}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  // In person needs a room or a typed place; phone and online carry neither.
  const canAdd = mode !== 'in_person' || Boolean(resourceId || customText.trim());

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-0.5">
        <Label className="text-sm">Places this meeting can happen in</Label>
        <p className="text-xs text-muted-foreground">
          List every place you are happy to hold this meeting, so you don&rsquo;t
          need a separate meeting type for each one. Saved as you go.
        </p>
      </div>

      {places.length === 0 ? (
        <p className="text-xs italic text-muted-foreground/70">
          No places listed — your booking page uses the single location above.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {places.map((place) => (
            <li
              key={place.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                <span className="truncate text-xs">{placeLabel(place)}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-destructive hover:text-destructive"
                disabled={isBusy}
                onClick={() => removePlace(place)}
                aria-label={`Remove ${placeLabel(place)}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add one more place */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap gap-1">
          {LOCATION_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={mode === opt.value ? 'default' : 'outline'}
              size="sm"
              disabled={isBusy}
              onClick={() => setMode(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {mode === 'in_person' && (
          <div className="space-y-2">
            <VenueRoomPicker
              value={resourceId}
              onChange={(id) => {
                setResourceId(id);
                if (id) setCustomText('');
              }}
              disabled={isBusy}
            />
            {!resourceId && (
              <Input
                placeholder="…or type a custom place (e.g. Pharmacy block, Room 204)"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                disabled={isBusy}
                aria-label="Custom place to add"
              />
            )}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy || !canAdd}
          onClick={addPlace}
        >
          {isBusy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Add place
        </Button>
      </div>
    </div>
  );
}
