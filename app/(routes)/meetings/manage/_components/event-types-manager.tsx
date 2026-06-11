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
});

type FormValues = z.infer<typeof formSchema>;

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
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{et.title}</h3>
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
    },
  });

  const titleValue = watch('title');
  const slugValue = watch('slug');
  const durationValue = watch('lengthInMinutes');
  const hiddenValue = watch('hidden');

  function onTitleChange(value: string) {
    setValue('title', value, { shouldValidate: true });
    // Auto-fill slug from title until the user edits the slug manually.
    if (!editing && !slugTouched) {
      setValue('slug', slugify(value));
    }
  }

  function onSubmit(values: FormValues) {
    const payload: EventTypeFormInput = {
      title: values.title,
      slug: (values.slug && values.slug.trim()) || slugify(values.title),
      lengthInMinutes: values.lengthInMinutes,
      description: values.description?.trim() || undefined,
      hidden: values.hidden,
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
