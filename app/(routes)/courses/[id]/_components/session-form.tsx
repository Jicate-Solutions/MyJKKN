'use client';

// Course Events — session editor (Phase 2c Task 5).
//
// Saving does TWO things: it writes the session, and it TRIES to hold the room.
// Those can disagree — the sitting is scheduled but the hall is busy — so the
// form says up front that the room is attempted, and the caller's toast reports
// which of the two happened. See CourseSessionService.create for why the hold
// cannot be part of the same transaction.
//
// Neither picker is new. The room picker is Resource Management's canonical
// "Spaces & Venues" registry via the events copy, and the trainer picker is the
// shared profiles directory — whose own docs say `member.id` is the real
// profiles.id to store, which is exactly what course_sessions.trainer_profile_id
// is a FK to. Note the CDC TrainerPicker looks like a fit and is NOT one: it
// lives in another route's private _components/ and emits a STAFF id, not a
// profile id.

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { VenueRoomPicker } from '@/components/events/venue/venue-room-picker';
import { MemberPicker, type MemberPickerResult } from '@/components/cohort-core/member-picker';
import type { CourseSession, CreateCourseSessionDto } from '@/types/courses';

const schema = z
  .object({
    // Nullable numeric — the preprocess form, not z.coerce.number().optional().
    // A cleared number input reports '', which coerce turns into 0 and
    // .positive() then rejects; .optional() cannot help because '' is PRESENT.
    session_no: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.coerce.number().int().positive('Must be at least 1').optional(),
    ),
    title: z.string().optional(),
    session_date: z.string().min(1, 'Pick a date'),
    start_time: z.string().min(1, 'Pick a start time'),
    end_time: z.string().min(1, 'Pick an end time'),
    trainer_profile_id: z.string().optional(),
    trainer_name: z.string().optional(),
    venue_resource_id: z.string().optional(),
    venue_text: z.string().optional(),
  })
  // Mirrors course_sessions_time_order_chk so it is a field message rather than
  // a Postgres error. 'HH:mm' strings compare correctly lexicographically.
  .refine((v) => !v.start_time || !v.end_time || v.end_time > v.start_time, {
    message: 'End time must be after start time',
    path: ['end_time'],
  });

export type SessionFormValues = z.infer<typeof schema>;

/** Postgres `time` comes back as 'HH:MM:SS'; <input type="time"> wants 'HH:MM'. */
const toTimeInput = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

interface SessionFormProps {
  courseEventId: string;
  editing?: CourseSession | null;
  onSubmit: (dto: CreateCourseSessionDto) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function SessionForm({
  courseEventId, editing, onSubmit, onCancel, submitting,
}: SessionFormProps) {
  const form = useForm<SessionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      session_no: editing?.session_no ?? undefined,
      title: editing?.title ?? '',
      session_date: editing?.session_date ?? '',
      start_time: toTimeInput(editing?.start_time),
      end_time: toTimeInput(editing?.end_time),
      trainer_profile_id: editing?.trainer_profile_id ?? '',
      trainer_name: editing?.trainer_name ?? '',
      venue_resource_id: editing?.venue_resource_id ?? '',
      venue_text: editing?.venue_text ?? '',
    },
  });

  // MemberPicker is controlled by the picked OBJECT (it renders a clearable
  // chip), while the form stores only the id. Seed it from the joined trainer so
  // an edit shows the name before any search runs.
  const [trainer, setTrainer] = useState<MemberPickerResult | null>(
    editing?.trainer
      ? {
          id: editing.trainer.id,
          full_name: editing.trainer.full_name,
          email: null,
          role: null,
          avatar_url: null,
          institution_id: null,
        }
      : null,
  );

  // An external trainer is a name with no profile behind it. Derived from the
  // value so an edit opens in the right mode, with an explicit toggle on top.
  const [manualMode, setManualMode] = useState<'internal' | 'external' | null>(null);
  const external =
    manualMode !== null
      ? manualMode === 'external'
      : Boolean(editing?.trainer_name && !editing?.trainer_profile_id);

  // useWatch, NOT form.watch(): watch() returns a function React Compiler cannot
  // memoize, and this value is passed straight into a child component's prop —
  // which is precisely the case the rule warns about
  // (react-hooks/incompatible-library). It makes the compiler skip optimising
  // this whole component. course-form.tsx gets away with watch() only because
  // its watched value is consumed by a useEffect, never handed to a child.
  const venueResourceId = useWatch({ control: form.control, name: 'venue_resource_id' });

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({
      course_event_id: courseEventId,
      session_no: values.session_no ?? null,
      title: values.title || null,
      session_date: values.session_date,
      start_time: values.start_time,
      end_time: values.end_time,
      // Exactly one identity for the trainer — switching mode clears the other,
      // so a session never carries a stale profile link under a typed name.
      trainer_profile_id: external ? null : values.trainer_profile_id || null,
      trainer_name: external ? values.trainer_name || null : null,
      venue_resource_id: values.venue_resource_id || null,
      venue_text: values.venue_text || null,
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
          <FormField
            control={form.control}
            name="session_no"
            render={({ field }) => (
              <FormItem>
                <FormLabel>No.</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="1"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : e.target.value)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Introduction to regression" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="session_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date *</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="start_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts *</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="end_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends *</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* ── trainer ─────────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Trainer</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (external) {
                  setManualMode('internal');
                  form.setValue('trainer_name', '');
                } else {
                  setManualMode('external');
                  setTrainer(null);
                  form.setValue('trainer_profile_id', '');
                }
              }}
            >
              {external ? 'Pick from MyJKKN instead' : 'External trainer instead'}
            </Button>
          </div>

          {external ? (
            <FormField
              control={form.control}
              name="trainer_name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder="Trainer's name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <MemberPicker
              value={trainer}
              onSelect={(m) => {
                setTrainer(m);
                form.setValue('trainer_profile_id', m.id);
              }}
              onClear={() => {
                setTrainer(null);
                form.setValue('trainer_profile_id', '');
              }}
              placeholder="Search MyJKKN by name or email…"
            />
          )}
        </div>

        {/* ── venue ───────────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Venue</p>
          <VenueRoomPicker
            value={venueResourceId ?? ''}
            onChange={(id) => form.setValue('venue_resource_id', id)}
            initialName={editing?.venue_resource?.name ?? null}
          />
          {!venueResourceId && (
            <FormField
              control={form.control}
              name="venue_text"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder="Or describe the place (no room will be held)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <p className="text-sm text-muted-foreground">
            {venueResourceId
              ? 'Saving will try to hold this room for the time above. A room in another college needs its caretaker to approve.'
              : 'Free text only — nothing is reserved. Pick a room above to hold it.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? 'Save session' : 'Schedule session'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
