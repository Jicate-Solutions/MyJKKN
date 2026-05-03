'use client';

// app/apply/[slug]/_components/public-form-client.tsx
// Dynamic form renderer for public admission forms
// Renders fields from schema, handles conditional logic, validates, submits
// Added: 2026-04-08

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  AdmissionForm,
  AdmissionFormField,
  AdmissionFormSection,
  FormFieldCondition,
} from '@/types/admission';

interface Institution {
  id: string;
  name: string;
  logo_url: string | null;
}

interface Program {
  id: string;
  name: string;
  institution_id: string;
}

interface PublicFormClientProps {
  form: AdmissionForm & {
    sections: (AdmissionFormSection & { fields: AdmissionFormField[] })[];
  };
  institutions: Institution[];
  programs: Program[];
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /** When true, disables analytics tracking and submission — used by admin preview. */
  previewMode?: boolean;
}

// ─── Dynamic Zod schema builder ─────────────────────────────────────────────

function buildFieldSchema(field: AdmissionFormField): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.field_type) {
    case 'phone':
      schema = z
        .string()
        .regex(
          /^(\+91|0)?[6-9]\d{9}$/,
          'Enter a valid 10-digit Indian mobile number'
        );
      break;
    case 'email':
      schema = z.string().email('Enter a valid email address');
      break;
    case 'number':
      schema = z.coerce.number({ invalid_type_error: 'Must be a number' });
      if (field.min_value !== null && field.min_value !== undefined) {
        schema = (schema as z.ZodNumber).min(field.min_value, `Minimum: ${field.min_value}`);
      }
      if (field.max_value !== null && field.max_value !== undefined) {
        schema = (schema as z.ZodNumber).max(field.max_value, `Maximum: ${field.max_value}`);
      }
      break;
    case 'date':
      schema = z.string().min(1, 'Select a date');
      break;
    case 'multi_select':
      schema = z.array(z.string());
      break;
    case 'checkbox':
      schema = z.boolean();
      break;
    case 'institution_program_selector':
      schema = z.object({
        institution_id: z.string().min(1, 'Select an institution'),
        program_id: z.string().min(1, 'Select a program'),
      });
      break;
    case 'file':
      schema = z.any();
      break;
    default:
      schema = z.string();
      if (field.min_length) {
        schema = (schema as z.ZodString).min(field.min_length, `Minimum ${field.min_length} characters`);
      }
      if (field.max_length) {
        schema = (schema as z.ZodString).max(field.max_length, `Maximum ${field.max_length} characters`);
      }
      if (field.pattern) {
        try {
          schema = (schema as z.ZodString).regex(new RegExp(field.pattern), 'Invalid format');
        } catch {
          // ignore invalid regex
        }
      }
  }

  if (!field.is_required) {
    schema = schema.optional().or(z.literal('').transform(() => undefined));
  } else {
    if (field.field_type === 'text' || field.field_type === 'textarea') {
      schema = (schema as z.ZodString).min(1, `${field.field_label} is required`);
    }
  }

  return schema;
}

function buildFormSchema(fields: AdmissionFormField[]): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.field_key] = buildFieldSchema(field);
  }
  // Add honeypot
  shape['company_website'] = z.string().optional();
  return z.object(shape);
}

// ─── Conditional logic evaluator ────────────────────────────────────────────

function evaluateCondition(
  condition: FormFieldCondition | null,
  values: Record<string, any>
): boolean {
  if (!condition) return true;
  const fieldValue = values[condition.field];
  switch (condition.op) {
    case 'eq':
      return fieldValue === condition.value;
    case 'neq':
      return fieldValue !== condition.value;
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(condition.value);
    case 'not_empty':
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
    case 'empty':
      return fieldValue === undefined || fieldValue === null || fieldValue === '';
    case 'program_category':
      // Reserved for advanced program-category-based conditions
      return true;
    default:
      return true;
  }
}

// ─── Analytics tracking helper ──────────────────────────────────────────────

// Identity-bearing field keys whose RAW value is forwarded to the server so the
// server can SHA-256 hash and write only the digest into metadata. The client
// never persists raw PII to the events table — the server route enforces this.
// Keep in sync with IDENTITY_PHONE_KEYS / IDENTITY_EMAIL_KEYS in
// app/api/public/forms/events/route.ts.
const IDENTITY_FIELD_KEYS = new Set([
  'phone',
  'parent_phone',
  'mobile',
  'whatsapp_number',
  'email',
  'parent_email',
]);

function trackEvent(
  formId: string,
  eventType: string,
  sessionId: string,
  fieldKey: string | null = null,
  metadata: Record<string, unknown> = {},
  fieldValue?: string
) {
  fetch('/api/public/forms/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      formId,
      eventType,
      fieldKey,
      sessionId,
      metadata,
      ...(fieldValue !== undefined ? { fieldValue } : {}),
    }),
  }).catch(() => {
    // Silent fail — analytics shouldn't break the form
  });
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function PublicFormClient({
  form,
  institutions,
  programs,
  utmSource,
  utmMedium,
  utmCampaign,
  previewMode = false,
}: PublicFormClientProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sessionIdRef = useRef<string>('');
  const startedRef = useRef(false);

  // Generate session ID once
  if (!sessionIdRef.current) {
    sessionIdRef.current =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // Flatten all fields
  const allFields = useMemo(() => form.sections.flatMap((s) => s.fields ?? []), [form]);

  // Build dynamic schema
  const schema = useMemo(() => buildFormSchema(allFields), [allFields]);

  // Default values
  const defaultValues = useMemo(() => {
    const defaults: Record<string, any> = {};
    for (const field of allFields) {
      if (field.field_type === 'checkbox') defaults[field.field_key] = false;
      else if (field.field_type === 'multi_select') defaults[field.field_key] = [];
      else if (field.field_type === 'institution_program_selector')
        defaults[field.field_key] = { institution_id: '', program_id: '' };
      else defaults[field.field_key] = '';
    }
    defaults['company_website'] = '';
    return defaults;
  }, [allFields]);

  const { control, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const watchedValues = watch();

  // Track form_viewed on mount (skipped in preview mode)
  useEffect(() => {
    if (previewMode) return;
    trackEvent(form.id, 'form_viewed', sessionIdRef.current, null, {
      utmSource,
      utmMedium,
      utmCampaign,
    });
  }, [form.id, utmSource, utmMedium, utmCampaign, previewMode]);

  // Track form_started on first interaction (no-op in preview mode)
  const handleFieldFocus = (fieldKey: string) => {
    if (previewMode) return;
    if (!startedRef.current) {
      startedRef.current = true;
      trackEvent(form.id, 'form_started', sessionIdRef.current);
    }
    trackEvent(form.id, 'field_focused', sessionIdRef.current, fieldKey);
  };

  const handleFieldBlur = (fieldKey: string, value: any) => {
    if (previewMode) return;
    if (value !== undefined && value !== null && value !== '') {
      // For identity-bearing fields (phone/email), forward the raw string value
      // to the server; the server SHA-256 hashes it before insert. Raw PII never
      // lands in admission_form_events.metadata. Non-identity fields send no
      // fieldValue at all (server ignores).
      const stringValue =
        IDENTITY_FIELD_KEYS.has(fieldKey) && typeof value === 'string' ? value : undefined;
      trackEvent(
        form.id,
        'field_completed',
        sessionIdRef.current,
        fieldKey,
        {},
        stringValue
      );
    }
  };

  // Submit handler
  const onSubmit = async (data: any) => {
    // Preview mode: don't actually submit, just show confirmation toast
    if (previewMode) {
      toast.success('Preview mode: form would submit successfully');
      return;
    }

    setIsSubmitting(true);
    try {
      const { company_website: honeypot, ...formData } = data;

      const res = await fetch(`/api/public/forms/${form.slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData,
          honeypot,
          sessionId: sessionIdRef.current,
          utmSource,
          utmMedium,
          utmCampaign,
          referrerUrl: typeof document !== 'undefined' ? document.referrer : '',
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(result.error || 'You have already applied with this phone number.');
        } else {
          toast.error(result.error || 'Submission failed. Please try again.');
        }
        setIsSubmitting(false);
        return;
      }

      router.push(`/apply/${form.slug}/thank-you`);
    } catch (err: any) {
      toast.error('Network error. Please check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  const primary = form.primary_color || '#1a73e8';

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        {form.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.logo_url} alt="Logo" className="h-16 mx-auto mb-4" />
        )}
        {form.banner_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.banner_url}
            alt="Banner"
            className="w-full rounded-lg mb-4 object-cover max-h-48"
          />
        )}
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
          {form.name}
        </h1>
        {form.description && (
          <p className="text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-line">
            {form.description}
          </p>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Honeypot — invisible to humans, bots fill it */}
        <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
          <Controller
            name="company_website"
            control={control}
            render={({ field }) => (
              <input {...field} type="text" tabIndex={-1} autoComplete="off" />
            )}
          />
        </div>

        {form.sections.map((section) => {
          // Section conditional visibility
          if (!evaluateCondition(section.condition, watchedValues)) return null;

          // Hide sections with no visible fields — prevents empty cards when
          // all fields have been removed or hidden by conditional logic
          const visibleFields = (section.fields ?? []).filter((f) =>
            evaluateCondition(f.condition, watchedValues)
          );
          if (visibleFields.length === 0) return null;

          return (
            <Card key={section.id}>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {section.title}
                  </h2>
                  {section.description && (
                    <p className="text-sm text-gray-500 mt-1">{section.description}</p>
                  )}
                </div>

                {(section.fields ?? []).map((field) => {
                  // Field conditional visibility
                  if (!evaluateCondition(field.condition, watchedValues)) return null;

                  return (
                    <div key={field.id} className="space-y-1.5">
                      <Label htmlFor={field.field_key}>
                        {field.field_label}
                        {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
                      </Label>

                      <Controller
                        name={field.field_key}
                        control={control}
                        render={({ field: rhfField }) => {
                          const onFocus = () => handleFieldFocus(field.field_key);
                          const onBlur = () => handleFieldBlur(field.field_key, rhfField.value);

                          switch (field.field_type) {
                            case 'textarea':
                              return (
                                <Textarea
                                  {...rhfField}
                                  id={field.field_key}
                                  placeholder={field.placeholder ?? ''}
                                  onFocus={onFocus}
                                  onBlur={onBlur}
                                  rows={4}
                                />
                              );
                            case 'select':
                              return (
                                <Select
                                  value={rhfField.value || ''}
                                  onValueChange={(v) => {
                                    rhfField.onChange(v);
                                    handleFieldBlur(field.field_key, v);
                                  }}
                                >
                                  <SelectTrigger onFocus={onFocus}>
                                    <SelectValue placeholder={field.placeholder ?? 'Select...'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(field.options ?? []).map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            case 'radio':
                              return (
                                <RadioGroup
                                  value={rhfField.value || ''}
                                  onValueChange={(v) => {
                                    rhfField.onChange(v);
                                    handleFieldBlur(field.field_key, v);
                                  }}
                                >
                                  {(field.options ?? []).map((opt) => (
                                    <div key={opt.value} className="flex items-center space-x-2">
                                      <RadioGroupItem value={opt.value} id={`${field.field_key}-${opt.value}`} />
                                      <Label htmlFor={`${field.field_key}-${opt.value}`} className="font-normal">
                                        {opt.label}
                                      </Label>
                                    </div>
                                  ))}
                                </RadioGroup>
                              );
                            case 'checkbox':
                              return (
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    checked={!!rhfField.value}
                                    onCheckedChange={(checked) => {
                                      rhfField.onChange(checked);
                                      handleFieldBlur(field.field_key, checked);
                                    }}
                                    id={field.field_key}
                                  />
                                  <Label htmlFor={field.field_key} className="font-normal">
                                    {field.placeholder || field.field_label}
                                  </Label>
                                </div>
                              );
                            case 'multi_select':
                              return (
                                <div className="space-y-2">
                                  {(field.options ?? []).map((opt) => {
                                    const selected: string[] = Array.isArray(rhfField.value) ? rhfField.value : [];
                                    const isChecked = selected.includes(opt.value);
                                    return (
                                      <div key={opt.value} className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`${field.field_key}-${opt.value}`}
                                          checked={isChecked}
                                          onCheckedChange={(checked) => {
                                            const next = checked
                                              ? [...selected, opt.value]
                                              : selected.filter((v) => v !== opt.value);
                                            rhfField.onChange(next);
                                          }}
                                        />
                                        <Label
                                          htmlFor={`${field.field_key}-${opt.value}`}
                                          className="font-normal"
                                        >
                                          {opt.label}
                                        </Label>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            case 'date':
                              return (
                                <Input
                                  {...rhfField}
                                  id={field.field_key}
                                  type="date"
                                  onFocus={onFocus}
                                  onBlur={onBlur}
                                />
                              );
                            case 'number':
                              return (
                                <Input
                                  {...rhfField}
                                  id={field.field_key}
                                  type="number"
                                  placeholder={field.placeholder ?? ''}
                                  onFocus={onFocus}
                                  onBlur={onBlur}
                                />
                              );
                            case 'file':
                              return (
                                <Input
                                  id={field.field_key}
                                  type="file"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    rhfField.onChange(file ? file.name : '');
                                  }}
                                  onFocus={onFocus}
                                />
                              );
                            case 'institution_program_selector': {
                              const selected = (rhfField.value as any) || {
                                institution_id: '',
                                program_id: '',
                              };
                              const filteredPrograms = programs.filter(
                                (p) => p.institution_id === selected.institution_id
                              );
                              return (
                                <div className="space-y-2">
                                  <Select
                                    value={selected.institution_id}
                                    onValueChange={(institutionId) => {
                                      rhfField.onChange({
                                        institution_id: institutionId,
                                        program_id: '',
                                      });
                                      handleFieldFocus(field.field_key);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select institution..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {institutions.map((inst) => (
                                        <SelectItem key={inst.id} value={inst.id}>
                                          {inst.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={selected.program_id}
                                    onValueChange={(programId) => {
                                      rhfField.onChange({
                                        ...selected,
                                        program_id: programId,
                                      });
                                      handleFieldBlur(field.field_key, {
                                        ...selected,
                                        program_id: programId,
                                      });
                                    }}
                                    disabled={!selected.institution_id}
                                  >
                                    <SelectTrigger>
                                      <SelectValue
                                        placeholder={
                                          selected.institution_id
                                            ? 'Select program...'
                                            : 'Select institution first'
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {filteredPrograms.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {p.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            }
                            default:
                              return (
                                <Input
                                  {...rhfField}
                                  id={field.field_key}
                                  type={field.field_type === 'phone' ? 'tel' : field.field_type === 'email' ? 'email' : 'text'}
                                  placeholder={field.placeholder ?? ''}
                                  onFocus={onFocus}
                                  onBlur={onBlur}
                                />
                              );
                          }
                        }}
                      />

                      {field.help_text && (
                        <p className="text-xs text-gray-500">{field.help_text}</p>
                      )}
                      {errors[field.field_key] && (
                        <p className="text-xs text-red-500">
                          {(errors[field.field_key] as any)?.message ||
                            (errors[field.field_key] as any)?.institution_id?.message ||
                            (errors[field.field_key] as any)?.program_id?.message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full"
          style={{ backgroundColor: primary }}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Application'
          )}
        </Button>

        <p className="text-xs text-center text-gray-500">
          By submitting this form, you agree to be contacted by our admission team.
        </p>
      </form>
    </div>
  );
}
