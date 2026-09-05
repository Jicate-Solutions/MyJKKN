'use client';

// Course Events — package + instalment schedule editor (Phase 2b Task 5).
//
// The package fields and the schedule rows are ONE form with ONE submit. That
// is not a layout preference: fn_course_package_amounts_chk is DEFERRABLE
// INITIALLY DEFERRED on both course_packages and course_package_installments,
// so it evaluates at COMMIT, and PostgREST gives each request its own
// transaction. Saving the price and the schedule separately therefore trips
// 23514 whichever half goes first. One form -> one RPC -> one transaction.
//
// The running total below the rows exists for the same reason. The database
// will reject a schedule that does not add up, but the user should never have
// to meet that error — they should see the shortfall while they type.
//
// Every numeric field uses the z.preprocess form rather than
// z.coerce.number().optional(). A cleared number input reports '', which
// z.coerce.number() turns into 0, so .positive() rejects it and .optional()
// cannot rescue it — the value is PRESENT as ''. Phase 2a shipped that bug.

import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import type { CoursePackage, SaveCoursePackageDto } from '@/types/courses';

/** Compare money in whole paise. 62500.00 * 4 is not exactly 250000 in binary
 *  floating point, and a schedule that is off by 2e-11 must not read as wrong. */
const paise = (n: number) => Math.round((Number(n) || 0) * 100);

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const installmentSchema = z.object({
  label: z.string().optional(),
  // course_package_installments_amount_check: amount > 0
  amount: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? NaN : v),
    z.coerce
      .number({ invalid_type_error: 'Enter an amount' })
      .positive('Must be more than 0'),
  ),
  due_date: z.string().min(1, 'Pick a due date'),
});

const schema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    // course_packages_total_amount_check: total_amount >= 0
    total_amount: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? NaN : v),
      z.coerce
        .number({ invalid_type_error: 'Enter a price' })
        .min(0, 'The price cannot be negative'),
    ),
    // course_packages_seat_cap_check: NULL or > 0
    seat_cap: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.coerce.number().int().positive('Must be at least 1').optional(),
    ),
    sale_opens_at: z.string().optional(),
    sale_closes_at: z.string().optional(),
    is_active: z.boolean().default(true),
    display_order: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.coerce.number().int().min(0, 'Cannot be negative').optional(),
    ),
    installments: z.array(installmentSchema),
  })
  // course_packages_sale_window_chk
  .refine(
    (v) => !v.sale_opens_at || !v.sale_closes_at || v.sale_closes_at >= v.sale_opens_at,
    { message: 'Sales must close on or after they open', path: ['sale_closes_at'] },
  )
  // fn_course_package_amounts_chk. Mirrored here so the mismatch is a field
  // message rather than a database error; it does NOT replace the trigger.
  // An empty schedule is deliberately allowed — that is a draft package, and
  // the trigger permits it too (it only fires when count > 0).
  .refine(
    (v) =>
      v.installments.length === 0 ||
      v.installments.reduce((sum, i) => sum + paise(i.amount), 0) === paise(v.total_amount),
    {
      message: 'The instalment amounts must add up to the package price',
      path: ['installments'],
    },
  );

export type PackageFormValues = z.infer<typeof schema>;

/** datetime-local value -> UTC ISO. `new Date('2026-01-05T09:00')` parses as
 *  LOCAL time, which is what the user typed; toISOString() stores it as UTC.
 *  Sending the raw string would hand Postgres a naive timestamp and shift it by
 *  the session's UTC offset. Deliberately duplicated from course-form.tsx,
 *  where it is private to that module — two small copies beat exporting a
 *  helper across sibling task boundaries for four lines. */
function toIso(local: string | undefined): string | null {
  if (!local?.trim()) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** timestamptz -> value for <input type="datetime-local"> (local wall time). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface PackageFormProps {
  courseEventId: string;
  /** Absent = create. */
  editing?: CoursePackage | null;
  onSubmit: (dto: SaveCoursePackageDto) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function PackageForm({
  courseEventId, editing, onSubmit, onCancel, submitting,
}: PackageFormProps) {
  const form = useForm<PackageFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? '',
      description: editing?.description ?? '',
      total_amount: editing ? Number(editing.total_amount) : undefined,
      seat_cap: editing?.seat_cap ?? undefined,
      sale_opens_at: toLocalInput(editing?.sale_opens_at),
      sale_closes_at: toLocalInput(editing?.sale_closes_at),
      is_active: editing?.is_active ?? true,
      display_order: editing?.display_order ?? 0,
      installments: (editing?.installments ?? []).map((i) => ({
        label: i.label ?? '',
        amount: Number(i.amount),
        due_date: i.due_date,
      })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'installments',
  });

  // Live reconciliation. Subscribed rather than read on submit so the shortfall
  // is visible while the user types, not after the database refuses the save.
  //
  // useWatch, NOT form.watch(): watch() returns a function the React Compiler
  // cannot memoize safely, so touching it makes the compiler skip optimising
  // this whole component (eslint react-hooks/incompatible-library). course-form
  // .tsx gets away with watch() because it reads one scalar; subscribing to a
  // field array here trips it. useWatch is the subscription API and is clean.
  //
  // The sums below are computed inline rather than in useMemo — a reduce over a
  // handful of rows per keystroke costs nothing, and useMemo over watched values
  // is the other half of the same compiler problem.
  const watchedInstallments = useWatch({ control: form.control, name: 'installments' });
  const watchedTotal = useWatch({ control: form.control, name: 'total_amount' });

  const scheduledPaise = (watchedInstallments ?? []).reduce(
    (sum, i) => sum + paise(i?.amount as number),
    0,
  );
  const pricePaise = paise(watchedTotal as number);

  const scheduled = scheduledPaise / 100;
  const price = pricePaise / 100;
  const balanced =
    (watchedInstallments ?? []).length === 0 || scheduledPaise === pricePaise;
  const shortfall = price - scheduled;

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({
      package: {
        id: editing?.id ?? null,
        course_event_id: courseEventId,
        name: values.name,
        description: values.description || null,
        total_amount: values.total_amount,
        currency: 'INR',
        seat_cap: values.seat_cap ?? null,
        sale_opens_at: toIso(values.sale_opens_at),
        sale_closes_at: toIso(values.sale_closes_at),
        is_active: values.is_active,
        display_order: values.display_order ?? 0,
      },
      installments: values.installments.map((i) => ({
        label: i.label?.trim() || null,
        amount: i.amount,
        due_date: i.due_date,
      })),
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Package name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Standard" {...field} />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                Must be unique within this course.
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
                <Textarea rows={3} placeholder="What this package includes" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="total_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price (₹) *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="250000"
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
            name="seat_cap"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Seat cap</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
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
            name="display_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display order</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="sale_opens_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sales open</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sale_closes_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sales close</FormLabel>
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
          name="is_active"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Available for selection</FormLabel>
                <p className="text-sm text-muted-foreground">
                  Turn off to retire this package without deleting it.
                </p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* ── the schedule ───────────────────────────────────────────────── */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Instalment schedule</p>
              <p className="text-sm text-muted-foreground">
                Leave empty to keep this package a draft. Due dates are absolute,
                the same for everyone on the course.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ label: '', amount: undefined as unknown as number, due_date: '' })}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add instalment
            </Button>
          </div>

          {fields.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No instalments — the full price is payable in one go.
            </p>
          ) : (
            <div className="space-y-2">
              {fields.map((row, index) => (
                <div key={row.id} className="grid items-start gap-2 sm:grid-cols-[1fr_140px_170px_auto]">
                  <FormField
                    control={form.control}
                    name={`installments.${index}.label`}
                    render={({ field }) => (
                      <FormItem>
                        {index === 0 && <FormLabel className="text-xs">Label</FormLabel>}
                        <FormControl>
                          <Input placeholder={`Instalment ${index + 1}`} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`installments.${index}.amount`}
                    render={({ field }) => (
                      <FormItem>
                        {index === 0 && <FormLabel className="text-xs">Amount (₹)</FormLabel>}
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="62500"
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
                    name={`installments.${index}.due_date`}
                    render={({ field }) => (
                      <FormItem>
                        {index === 0 && <FormLabel className="text-xs">Due date</FormLabel>}
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={index === 0 ? 'mt-6 text-muted-foreground' : 'text-muted-foreground'}
                    onClick={() => remove(index)}
                    aria-label={`Remove instalment ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* The running total. The DB rejects a mismatch anyway; this is here so
              the user never has to meet that rejection. */}
          {fields.length > 0 && (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                balanced
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
              }`}
            >
              <span>
                {fields.length} instalment{fields.length === 1 ? '' : 's'} totalling{' '}
                <span className="font-semibold">{inr.format(scheduled)}</span> against a price of{' '}
                <span className="font-semibold">{inr.format(price)}</span>
              </span>
              <span className="font-medium">
                {balanced
                  ? 'Balanced'
                  : shortfall > 0
                    ? `${inr.format(shortfall)} unallocated`
                    : `${inr.format(Math.abs(shortfall))} over`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting || !balanced}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? 'Save package' : 'Create package'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          {!balanced && (
            <span className="text-sm text-muted-foreground">
              The schedule must add up to the price before this can be saved.
            </span>
          )}
        </div>
      </form>
    </Form>
  );
}
