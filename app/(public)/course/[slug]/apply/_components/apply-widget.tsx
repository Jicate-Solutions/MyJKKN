'use client';

// The public application form.
//
// Renders whatever the admin built, plus a package chooser — the price lives on
// the package, never on the form (spec §3.3), so it is picked here.
//
// This component validates for the APPLICANT'S benefit only. Every rule is
// re-checked server-side in /api/public/courses/[slug]/apply, which is the real
// gate: the course must be published and in its window, the form must belong to
// it and be enabled, and the package is re-read from the database rather than
// trusted. Nothing here is a security control.
//
// It carries its own <Toaster>: public routes do not mount the authenticated
// shell, so without one every error message would be invisible.

import { useState } from 'react';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { PublicCourseApplyForm, PublicFormField } from '@/types/courses';
import { NAME_KEYS, PHONE_KEYS } from '@/lib/services/courses/applicant-identity';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** The submit route derives the applicant's identity from these keys, so the
 *  form is refused client-side if the admin never asked for them — better than
 *  letting someone fill in twelve questions and be rejected at the end.
 *
 *  Imported rather than redeclared: this used to be a third private copy of a
 *  contract the submit route stated inline and the builder did not state at all,
 *  which is how a form with no name or phone question reached the public. */

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PublicFormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `f_${field.field_key}`;
  const common = { id, placeholder: field.placeholder ?? undefined };

  switch (field.field_type) {
    case 'textarea':
      return (
        <Textarea
          {...common}
          rows={4}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'select':
    case 'radio':
      return (
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder={field.placeholder ?? 'Choose one'} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2 rounded-md border p-3">
          {field.options.map((o) => (
            <div key={o} className="flex items-center gap-2">
              <Checkbox
                id={`${id}_${o}`}
                checked={selected.includes(o)}
                onCheckedChange={(c) =>
                  onChange(c ? [...selected, o] : selected.filter((x) => x !== o))
                }
              />
              <Label htmlFor={`${id}_${o}`} className="font-normal">{o}</Label>
            </div>
          ))}
        </div>
      );
    }
    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={Boolean(value)}
            onCheckedChange={(c) => onChange(Boolean(c))}
          />
          <Label htmlFor={id} className="font-normal">Yes</Label>
        </div>
      );
    case 'file':
      // File upload is not wired in this phase. Rendering a dead file input
      // would collect nothing and look like it worked, so ask for a link.
      return (
        <Input
          {...common}
          type="url"
          placeholder={field.placeholder ?? 'Paste a link to the document'}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <Input
          {...common}
          type={
            field.field_type === 'email' ? 'email'
              : field.field_type === 'phone' ? 'tel'
              : field.field_type === 'number' ? 'number'
              : field.field_type === 'date' ? 'date'
              : 'text'
          }
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function ApplyWidget({
  form,
  courseSlug,
}: {
  form: PublicCourseApplyForm;
  courseSlug: string;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [packageId, setPackageId] = useState<string>(
    form.packages.length === 1 ? form.packages[0].id : '',
  );
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  // The course charges fees, but no tier is on sale right now. `packages` is
  // empty in this case exactly as it is for a free course, which is why the
  // loader reports the two separately — without that the chooser silently
  // vanished and the application was accepted with package_id NULL, which
  // course_enrollments (package_id NOT NULL) can never turn into an enrollment.
  const noPackageOnSale = form.packagesExist && form.packages.length === 0;

  const allFields = form.sections.flatMap((s) => s.fields);
  const hasName = allFields.some((f) => NAME_KEYS.includes(f.field_key));
  const hasPhone = allFields.some((f) => PHONE_KEYS.includes(f.field_key));

  const set = (key: string, v: unknown) => setAnswers((prev) => ({ ...prev, [key]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const missing = allFields
      .filter((f) => f.is_required)
      .filter((f) => {
        const v = answers[f.field_key];
        return v === undefined || v === null || String(v).trim() === '';
      })
      .map((f) => f.label);

    if (missing.length > 0) {
      toast.error(`Please answer: ${missing.join(', ')}`);
      return;
    }
    if (noPackageOnSale) {
      toast.error('Fees for this course are not on sale right now.');
      return;
    }
    if (form.packages.length > 0 && !packageId) {
      toast.error('Please choose a package.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/courses/${courseSlug}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formSlug: form.formSlug,
          packageId: packageId || undefined,
          answers,
          honeypot,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? 'Could not submit your application. Please try again.');
        return;
      }
      setReference(json.reference ?? null);
    } catch {
      toast.error('Could not reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirmation, NOT a redirect to a status page. An external applicant's
  // profile_id is NULL until approval mints their identity, so there is no page
  // they could sign into to check — telling them to look would be a dead end.
  if (reference) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="h-1.5 w-full bg-primary" />
        <main className="mx-auto w-full max-w-xl px-5 py-16 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-bold">Application received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you for applying to {form.courseTitle}.
          </p>
          {reference && (
            <p className="mt-4 text-sm">
              Your reference is{' '}
              <span className="rounded bg-muted px-2 py-1 font-mono font-semibold">
                {reference}
              </span>
            </p>
          )}
          <p className="mt-6 text-sm text-muted-foreground">
            Your application will be reviewed by the institution. If it is accepted you will
            receive a JKKN ID and a login by email or WhatsApp, and you will be able to pay
            your instalments there. Nothing is payable now.
          </p>
          <Link
            href={`/course/${courseSlug}`}
            className="mt-8 inline-block text-sm underline"
          >
            Back to the course
          </Link>
        </main>
        <Toaster richColors position="top-center" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="h-1.5 w-full bg-primary" />

      <main className="mx-auto w-full max-w-2xl px-5 py-10">
        <Link href={`/course/${courseSlug}`} className="text-sm text-muted-foreground underline">
          ← {form.courseTitle}
        </Link>

        <h1 className="mt-3 text-2xl font-bold">{form.formName}</h1>
        {form.formDescription && (
          <p className="mt-2 text-sm text-muted-foreground">{form.formDescription}</p>
        )}

        {(!hasName || !hasPhone) && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            This form is missing a required question, so it cannot be submitted yet. Please
            contact the institution.
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-8">
          {form.sections.map((section) => (
            <section key={section.title} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
                {section.description && (
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                )}
              </div>

              {section.fields.map((field) => (
                <div key={field.field_key} className="space-y-1.5">
                  <Label htmlFor={`f_${field.field_key}`}>
                    {field.label}
                    {field.is_required && <span className="text-destructive"> *</span>}
                  </Label>
                  <FieldInput
                    field={field}
                    value={answers[field.field_key]}
                    onChange={(v) => set(field.field_key, v)}
                  />
                  {field.help_text && (
                    <p className="text-xs text-muted-foreground">{field.help_text}</p>
                  )}
                </div>
              ))}
            </section>
          ))}

          {/* Rendered INSTEAD of the chooser, never in place of nothing. A
              section that simply disappears reads as "this course is free", and
              the applicant submits something that can never be priced. */}
          {noPackageOnSale && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Choose a package</h2>
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Fees for this course are not on sale at the moment, so
                applications cannot be accepted yet. Please check back later — or
                contact the institution if you were sent this link.
              </div>
            </section>
          )}

          {form.packages.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Choose a package</h2>
              <div className="space-y-2">
                {form.packages.map((p) => (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 ${
                      packageId === p.id ? 'border-primary bg-muted/40' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <input
                        type="radio"
                        name="package"
                        className="sr-only"
                        checked={packageId === p.id}
                        onChange={() => setPackageId(p.id)}
                      />
                      <span className="block font-medium">{p.name}</span>
                      {p.description && (
                        <span className="block text-sm text-muted-foreground">
                          {p.description}
                        </span>
                      )}
                      {p.installments.length > 0 && (
                        <span className="block text-sm text-muted-foreground">
                          {p.installments.length} instalment
                          {p.installments.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-semibold">{inr.format(p.total_amount)}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Nothing is payable now. You will be billed only if your application is
                accepted.
              </p>
            </section>
          )}

          {/* Honeypot — invisible to people, irresistible to bots. A filled value
              makes the server return a plausible success and write nothing. */}
          <div aria-hidden className="hidden">
            <label htmlFor="company_website">Company website</label>
            <input
              id="company_website"
              name="company_website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 border-t pt-5">
            <Button
              type="submit"
              disabled={submitting || !hasName || !hasPhone || noPackageOnSale}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit application
            </Button>
            <span className="text-xs text-muted-foreground">
              Do not enter card details anywhere on this page.
            </span>
          </div>
        </form>
      </main>

      {/* Public routes do not inherit the authenticated shell's Toaster. */}
      <Toaster richColors position="top-center" />
    </div>
  );
}
