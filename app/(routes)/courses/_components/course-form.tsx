'use client';

// Course Events — shared create/edit form (Phase 2a Task 6).
//
// Reused by /courses/new (this task, mode="create") and, from Task 7
// onward, by the /courses/[id] edit surface (mode="edit") — hence `mode`
// and `defaultValues` from the start rather than retrofitted later. The
// form itself owns no mutation: it hands the validated, DTO-shaped values
// to `onSubmit` and lets the page pick useCreateCourseEvent vs
// useUpdateCourseEvent. `submitting` is likewise driven by the caller's
// mutation state, not react-hook-form's own isSubmitting.
//
// Every Zod rule below mirrors a live CHECK constraint in course_events
// (supabase/migrations/20260813100000_course_events_core.sql). Mirroring
// them here turns a raw Postgres error into a field message; it does not
// replace the DB constraint.
//
// Note: the component prop `mode` ('create' | 'edit') and the course's own
// `mode` field (offline/online/hybrid, the DB column name) are unrelated —
// same name, different namespace (JS prop vs. form field key).

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { CourseEventService } from '@/lib/services/courses/course-event-service';
import { COURSE_EVENT_MODES, COURSE_EVENT_STATUSES } from '@/types/courses';

// course_events_slug_format_chk
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const schema = z.object({
  institution_id: z.string().uuid('Select an institution'),
  title: z.string().min(1, 'Title is required'),
  slug: z.string().regex(SLUG_RE, 'Lowercase letters, numbers and single hyphens only'),
  code: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(COURSE_EVENT_MODES),
  status: z.enum(COURSE_EVENT_STATUSES).default('draft'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  application_opens_at: z.string().optional(),
  application_closes_at: z.string().optional(),
  // course_events_total_seats_check: NULL or > 0
  total_seats: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  venue_text: z.string().optional(),
})
  // course_events_date_order_chk
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: 'End date must be on or after start date', path: ['end_date'],
  })
  // course_events_application_window_chk
  .refine((v) => !v.application_opens_at || !v.application_closes_at
      || v.application_closes_at >= v.application_opens_at, {
    message: 'Applications must close on or after they open', path: ['application_closes_at'],
  });

export type CourseFormValues = z.infer<typeof schema>;

/** Shape handed to `onSubmit`. application_opens_at/closes_at arrive from the
 *  DOM as datetime-local strings (local wall time) and are converted to UTC
 *  ISO here so neither the create nor the edit page has to duplicate that
 *  conversion — see toIso() below for why the conversion is required at all. */
export interface CourseFormOutput
  extends Omit<CourseFormValues, 'application_opens_at' | 'application_closes_at'> {
  application_opens_at: string | null;
  application_closes_at: string | null;
}

function kebabCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** datetime-local value → UTC ISO. `new Date('2026-01-05T09:00')` is parsed as
 *  LOCAL time, which is what the user typed; toISOString() converts to UTC
 *  for storage. Sending the raw local string would hand Postgres a naive
 *  timestamp and silently shift it by the session's UTC offset (mirrors
 *  components/events/registration/registration-schedule-card.tsx's toIso). */
function toIso(local: string | undefined): string | null {
  if (!local?.trim()) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface CourseFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<CourseFormValues>;
  /** The record's own id in edit mode — excluded from the slug uniqueness
   *  check so a course doesn't collide with its own slug. */
  excludeId?: string;
  onSubmit: (values: CourseFormOutput) => void | Promise<void>;
  submitting?: boolean;
}

export function CourseForm({
  mode, defaultValues, excludeId, onSubmit, submitting,
}: CourseFormProps) {
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      institution_id: '',
      title: '',
      slug: '',
      code: '',
      description: '',
      mode: 'offline',
      status: 'draft',
      start_date: '',
      end_date: '',
      application_opens_at: '',
      application_closes_at: '',
      total_seats: undefined,
      venue_text: '',
      ...defaultValues,
    },
  });

  // Auto-select the institution when the user only has access to one —
  // same convenience pattern as admission/leads/new/page.tsx. Create only:
  // an edit form's institution was chosen when the course was made.
  useEffect(() => {
    if (mode === 'create' && !form.getValues('institution_id') && institutions.length === 1) {
      form.setValue('institution_id', institutions[0].id, { shouldValidate: true });
    }
  }, [mode, institutions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-derive slug from title on CREATE only — the slug is the public URL,
  // so silently changing it on edit would break live links. Stops
  // overwriting the moment the user hand-edits the slug, even on create.
  const [slugTouched, setSlugTouched] = useState(false);
  const titleValue = form.watch('title');
  useEffect(() => {
    if (mode !== 'create' || slugTouched) return;
    form.setValue('slug', kebabCase(titleValue || ''), { shouldValidate: false });
  }, [titleValue, mode, slugTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  // UNIQUE (institution_id, slug) — check on blur so a duplicate surfaces as
  // a field message instead of a raw 23505 at submit.
  const [slugChecking, setSlugChecking] = useState(false);
  const checkSlug = async () => {
    const institutionId = form.getValues('institution_id');
    const slug = form.getValues('slug');
    if (!institutionId || !slug || !SLUG_RE.test(slug)) return;
    setSlugChecking(true);
    try {
      const available = await CourseEventService.slugAvailable(institutionId, slug, excludeId);
      if (available) {
        form.clearErrors('slug');
      } else {
        form.setError('slug', {
          message: 'That URL is already used by another course at this institution',
        });
      }
    } finally {
      setSlugChecking(false);
    }
  };

  const handleSubmit = form.handleSubmit((values) => onSubmit({
    ...values,
    application_opens_at: toIso(values.application_opens_at),
    application_closes_at: toIso(values.application_closes_at),
  }));

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="institution_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Institution *</FormLabel>
                {/* Locked in edit mode — moving institutions would orphan this course's packages/sessions/applications/enrollments/bills, which each carry their own institution_id. */}
                <Select onValueChange={field.onChange} value={field.value} disabled={mode === 'edit'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={institutionsLoading ? 'Loading…' : 'Select institution'}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Code</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. WKSHP-DS-01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Data Science Bootcamp" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL slug *</FormLabel>
              <FormControl>
                <Input
                  placeholder="data-science-bootcamp"
                  {...field}
                  onChange={(e) => {
                    setSlugTouched(true);
                    field.onChange(e);
                  }}
                  onBlur={() => {
                    field.onBlur();
                    void checkSlug();
                  }}
                />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                {slugChecking
                  ? 'Checking availability…'
                  : 'Used in the public course URL. Must be unique per institution.'}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mode *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COURSE_EVENT_MODES.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COURSE_EVENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="total_seats"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total seats</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    // An empty number input reports '' — z.coerce.number()
                    // would coerce that to 0 and fail .positive(), breaking
                    // "leave blank for unlimited". Store undefined instead so
                    // the schema's .optional() short-circuits correctly.
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="application_opens_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Applications open</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="application_closes_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Applications close</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="venue_text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Venue</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Seminar Hall 2" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'create' ? 'Create course' : 'Save changes'}
        </Button>
      </form>
    </Form>
  );
}
