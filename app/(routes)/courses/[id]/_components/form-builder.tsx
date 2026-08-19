'use client';

// Course Events — registration form builder (Phase 3 Task 5).
//
// Form + sections + fields are ONE form with ONE submit, because
// fn_save_course_registration_form REPLACES the whole structure in a single
// transaction. A partial save would leave a live public form collecting nothing.
//
// Field keys are validated for uniqueness HERE as well as in the database.
// UNIQUE (form_id, field_key) would otherwise surface as a 23505 naming a
// constraint, at submit, after the user has built the whole form.
//
// There is deliberately NO fee field. The price lives on the package and is
// chosen at application time; two fee sources feeding one payment was explicitly
// rejected in the Events module as a genuine hazard (spec §3.3).

import { useState } from 'react';
import {
  useFieldArray, useForm, useFormContext, useWatch, type Control,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, GripVertical, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { CourseFormService } from '@/lib/services/courses/course-form-service';
import {
  EMAIL_KEYS,
  NAME_KEYS,
  PHONE_KEYS,
  findIdentityGaps,
  identityGapMessage,
} from '@/lib/services/courses/applicant-identity';
import {
  COURSE_FIELD_TYPES,
  COURSE_FIELD_TYPES_WITH_OPTIONS,
  type CourseFieldType,
  type CourseForm,
  type SaveCourseFormDto,
} from '@/types/courses';

// course_registration_forms_slug_format_chk
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// field_key is used as a jsonb key in course_applications.custom_fields.
const KEY_RE = /^[a-z0-9_]+$/;

const fieldSchema = z.object({
  field_key: z.string().regex(KEY_RE, 'Lowercase letters, numbers and underscores only'),
  label: z.string().min(1, 'Label is required'),
  field_type: z.enum(COURSE_FIELD_TYPES),
  is_required: z.boolean().default(false),
  /** One option per line. Converted to the jsonb array on submit. */
  options_text: z.string().optional(),
  placeholder: z.string().optional(),
  help_text: z.string().optional(),
});

const sectionSchema = z.object({
  title: z.string().min(1, 'Section title is required'),
  description: z.string().optional(),
  fields: z.array(fieldSchema),
});

const schema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().regex(SLUG_RE, 'Lowercase letters, numbers and single hyphens only'),
    description: z.string().optional(),
    is_enabled: z.boolean().default(false),
    sections: z.array(sectionSchema).min(1, 'A form needs at least one section'),
  })
  // UNIQUE (form_id, field_key) — caught here so the user sees it while building
  // rather than as a 23505 naming a constraint after they submit.
  .superRefine((v, ctx) => {
    const seen = new Map<string, string>();
    v.sections.forEach((s, si) => {
      s.fields.forEach((f, fi) => {
        if (!f.field_key) return;
        const where = seen.get(f.field_key);
        if (where) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sections', si, 'fields', fi, 'field_key'],
            message: `Already used in ${where}. Field keys must be unique across the form.`,
          });
        } else {
          seen.set(f.field_key, s.title || `section ${si + 1}`);
        }
      });
    });
  })
  // A form that cannot say WHO applied cannot be submitted by anyone: the
  // submit route derives applicant_name/applicant_phone from these keys and
  // 400s without them, and event_external_participants is upserted by phone.
  // Enforced HERE because this is the only layer that can prevent the problem —
  // the public widget and the submit route can each only refuse, by which point
  // a stranger is already looking at a form with a permanently disabled button
  // and the admin has had no signal at all.
  .superRefine((v, ctx) => {
    const gaps = findIdentityGaps(
      v.sections.flatMap((s) => s.fields.map((f) => f.field_key)),
    );
    // requireEmail: a participant's login cannot be created without an address,
    // so a form that never asks for one produces applications that can be
    // collected and then never approved.
    const message = identityGapMessage(gaps, { requireEmail: true });
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections'], message });
    }
  })
  // A field type that takes options is useless without any.
  .superRefine((v, ctx) => {
    v.sections.forEach((s, si) => {
      s.fields.forEach((f, fi) => {
        if (
          COURSE_FIELD_TYPES_WITH_OPTIONS.includes(f.field_type) &&
          !(f.options_text ?? '').trim()
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sections', si, 'fields', fi, 'options_text'],
            message: 'Add at least one choice, one per line.',
          });
        }
      });
    });
  });

export type FormBuilderValues = z.infer<typeof schema>;

const toKey = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

const kebab = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Keys the submit route reads to build the applicant. Marked in the UI so an
 *  admin can see which questions are load-bearing before deleting one, and so a
 *  relabelled one is obviously still doing its job. */
const IDENTITY_KEYS = new Set<string>([...NAME_KEYS, ...PHONE_KEYS, ...EMAIL_KEYS]);

/**
 * A new form starts with these already in place.
 *
 * The whole failure mode this guards against is an admin building a perfectly
 * reasonable-looking form that nobody can submit. Seeding beats validating,
 * because the LABEL is free — `toKey` only derives a key when the key is still
 * empty, so relabelling "Full name" to "Student name" keeps `full_name` and the
 * form keeps working. Natural wording costs nothing; only deleting these breaks
 * anything, and the banner catches that.
 */
const IDENTITY_STARTER = [
  {
    field_key: 'full_name',
    label: 'Full name',
    field_type: 'text' as CourseFieldType,
    is_required: true,
    options_text: '',
    placeholder: '',
    help_text: '',
  },
  {
    field_key: 'phone',
    label: 'Phone number',
    field_type: 'phone' as CourseFieldType,
    is_required: true,
    options_text: '',
    placeholder: '',
    help_text: 'We will contact you on this number about your application.',
  },
  {
    field_key: 'email',
    label: 'Email address',
    field_type: 'email' as CourseFieldType,
    is_required: true,
    options_text: '',
    placeholder: '',
    help_text: '',
  },
];

/** Called, never spread: handing out the same object references would let an
 *  edit in one form mutate the constant and seed the next form with it. */
const identityStarter = () => IDENTITY_STARTER.map((f) => ({ ...f }));

const FIELD_TYPE_LABEL: Record<CourseFieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  number: 'Number',
  email: 'Email',
  phone: 'Phone',
  date: 'Date',
  select: 'Dropdown (one)',
  multiselect: 'Dropdown (many)',
  checkbox: 'Checkbox',
  radio: 'Radio buttons',
  file: 'File upload',
};

/** Fields of ONE section. Split out because react-hook-form's useFieldArray
 *  cannot be called for a nested path from inside a parent's map callback —
 *  hooks must be unconditional and at the top level of a component. */
function SectionFields({
  control,
  sectionIndex,
}: {
  control: Control<FormBuilderValues>;
  sectionIndex: number;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `sections.${sectionIndex}.fields`,
  });

  // shadcn's <Form> is a FormProvider, so the parent's setValue/getValues are
  // available here without prop-drilling them through.
  const { setValue, getValues } = useFormContext<FormBuilderValues>();

  const watched = useWatch({ control, name: `sections.${sectionIndex}.fields` });

  return (
    <div className="space-y-2">
      {fields.length === 0 && (
        <p className="py-3 text-center text-sm text-muted-foreground">
          No questions in this section yet.
        </p>
      )}

      {fields.map((row, fi) => {
        const type = watched?.[fi]?.field_type as CourseFieldType | undefined;
        const needsOptions = type ? COURSE_FIELD_TYPES_WITH_OPTIONS.includes(type) : false;

        return (
          <div key={row.id} className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_170px_auto]">
              <FormField
                control={control}
                name={`sections.${sectionIndex}.fields.${fi}.label`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Question shown to the applicant"
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          // Fill the key from the label ONLY when it is still
                          // empty. Derived on blur rather than on every
                          // keystroke so a key the user has already typed — or
                          // one loaded from an existing form — is never
                          // rewritten under them. field_key is the jsonb key in
                          // course_applications.custom_fields, so changing it
                          // silently would orphan every answer already stored.
                          const path =
                            `sections.${sectionIndex}.fields.${fi}.field_key` as const;
                          if (!getValues(path)) {
                            setValue(path, toKey(e.target.value), { shouldValidate: true });
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name={`sections.${sectionIndex}.fields.${fi}.field_type`}
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COURSE_FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{FIELD_TYPE_LABEL[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(fi)}
                aria-label={`Remove question ${fi + 1}`}
                className="text-muted-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
              <FormField
                control={control}
                name={`sections.${sectionIndex}.fields.${fi}.field_key`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder="field_key" className="font-mono text-xs" {...field} />
                    </FormControl>
                    {/* Left EDITABLE on purpose. Locking it the instant the text
                        matched would trap someone mid-keystroke as they typed
                        `full_name`, and typing it by hand is exactly how an
                        existing broken form gets repaired. */}
                    {IDENTITY_KEYS.has(watched?.[fi]?.field_key ?? '') && (
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <KeyRound className="h-3 w-3" />
                        Identifies the applicant
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`sections.${sectionIndex}.fields.${fi}.help_text`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder="Help text (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`sections.${sectionIndex}.fields.${fi}.is_required`}
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 pt-1">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0 text-xs">Required</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            {needsOptions && (
              <FormField
                control={control}
                name={`sections.${sectionIndex}.fields.${fi}.options_text`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Choices — one per line</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder={'Option one\nOption two'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          append({
            field_key: '',
            label: '',
            field_type: 'text',
            is_required: false,
            options_text: '',
            placeholder: '',
            help_text: '',
          })
        }
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add question
      </Button>
    </div>
  );
}

interface FormBuilderProps {
  courseEventId: string;
  editing?: CourseForm | null;
  onSubmit: (dto: SaveCourseFormDto) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function FormBuilder({
  courseEventId, editing, onSubmit, onCancel, submitting,
}: FormBuilderProps) {
  const form = useForm<FormBuilderValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? '',
      slug: editing?.slug ?? '',
      description: editing?.description ?? '',
      is_enabled: editing?.is_enabled ?? false,
      sections:
        editing?.sections?.length
          ? editing.sections.map((s) => ({
              title: s.title,
              description: s.description ?? '',
              fields: (s.fields ?? []).map((f) => ({
                field_key: f.field_key,
                label: f.label,
                field_type: f.field_type as CourseFieldType,
                is_required: f.is_required,
                options_text: Array.isArray(f.options) ? (f.options as string[]).join('\n') : '',
                placeholder: f.placeholder ?? '',
                help_text: f.help_text ?? '',
              })),
            }))
          // A NEW form starts able to identify an applicant. An admin who never
          // opens the field-key input still ships a working form.
          : [{ title: 'Your details', description: '', fields: identityStarter() }],
    },
  });

  const { fields: sections, append: addSection, remove: removeSection } = useFieldArray({
    control: form.control,
    name: 'sections',
  });

  // useWatch, never form.watch(): watch() on a field array defeats the React
  // Compiler's memoisation and re-renders the whole builder on every keystroke.
  const watchedSections = useWatch({ control: form.control, name: 'sections' });
  const identityGaps = findIdentityGaps(
    (watchedSections ?? []).flatMap((s) =>
      (s?.fields ?? []).map((f: { field_key?: string }) => f?.field_key ?? ''),
    ),
  );
  const identityMessage = identityGapMessage(identityGaps, { requireEmail: true });

  /** Put the missing identity questions back, at the top of the first section
   *  where an applicant expects them. Only the missing ones — an admin who
   *  already has `phone` under a different label keeps it. */
  const restoreIdentityQuestions = () => {
    const current = form.getValues('sections');
    const missing = identityStarter().filter((f) => {
      if (NAME_KEYS.includes(f.field_key)) return identityGaps.name;
      if (PHONE_KEYS.includes(f.field_key)) return identityGaps.phone;
      if (EMAIL_KEYS.includes(f.field_key)) return identityGaps.email;
      return false;
    });
    if (missing.length === 0) return;

    form.setValue('sections.0.fields', [...missing, ...(current[0]?.fields ?? [])], {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  // UNIQUE (course_event_id, slug) — checked on blur so a duplicate is a field
  // message instead of a raw 23505 at submit. Mirrors CourseForm's slug check.
  const [slugChecking, setSlugChecking] = useState(false);
  const checkSlug = async () => {
    const slug = form.getValues('slug');
    if (!slug || !SLUG_RE.test(slug)) return;
    setSlugChecking(true);
    try {
      const free = await CourseFormService.slugAvailable(courseEventId, slug, editing?.id);
      if (free) form.clearErrors('slug');
      else form.setError('slug', { message: 'This course already has a form with that URL' });
    } finally {
      setSlugChecking(false);
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({
      form: {
        id: editing?.id ?? null,
        course_event_id: courseEventId,
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        display_order: editing?.display_order ?? 0,
        is_enabled: values.is_enabled,
      },
      sections: values.sections.map((s) => ({
        title: s.title,
        description: s.description || null,
        fields: s.fields.map((f) => ({
          field_key: f.field_key,
          label: f.label,
          field_type: f.field_type,
          is_required: f.is_required,
          // The textarea is the editing surface; the column is a jsonb array.
          options: (f.options_text ?? '')
            .split('\n')
            .map((o) => o.trim())
            .filter(Boolean),
          placeholder: f.placeholder || null,
          help_text: f.help_text || null,
          validation: {},
        })),
      })),
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Form name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. General application"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (!editing) form.setValue('slug', kebab(e.target.value));
                    }}
                  />
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
                    placeholder="general-application"
                    {...field}
                    onBlur={() => {
                      field.onBlur();
                      void checkSlug();
                    }}
                  />
                </FormControl>
                <p className="text-sm text-muted-foreground">
                  {slugChecking ? 'Checking…' : 'Appears in the public link as ?form=<slug>.'}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="Shown above the form" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_enabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Accepting applications</FormLabel>
                <p className="text-sm text-muted-foreground">
                  When on, anyone with the public link can submit this form.
                </p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* ── sections ────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {sections.map((section, si) => (
            <div key={section.id} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <FormField
                  control={form.control}
                  name={`sections.${si}.title`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input placeholder="Section title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSection(si)}
                  disabled={sections.length === 1}
                  aria-label={`Remove section ${si + 1}`}
                  className="text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <SectionFields control={form.control} sectionIndex={si} />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addSection({ title: '', description: '', fields: [] })}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add section
          </Button>
        </div>

        {/* Rendered from the watched values rather than formState.errors: a zod
            issue on the `sections` array path is awkward to surface through RHF,
            and this has to be visible BEFORE the first submit attempt — the
            whole point is that the admin never gets as far as saving a form
            nobody can submit. The superRefine above is the hard gate behind it. */}
        {identityMessage && (
          <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
              {identityMessage}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={restoreIdentityQuestions}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add them
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting || Boolean(identityMessage)}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? 'Save form' : 'Create form'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
