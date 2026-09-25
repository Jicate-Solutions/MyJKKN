'use client';

// Public self-service registration form for a GENERAL event.
//
// Deliberately much smaller than the tournament equivalent: no divisions, no
// eligibility rules, no team roster, no school-directory picker. A lecture or
// convocation collects a participant, their contact details, whatever the
// organizer asked on the form, and (if the form charges one) a fee.
//
// Hybrid identity mirrors the tournament page: a signed-in JKKN user has their
// name prefilled and their profile linked server-side; a guest types theirs.

import type { FormFieldCondition } from '@/types/tournament';
import { useMemo, useState } from 'react';
import { CheckCircle2, ListOrdered, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EventRazorpayHostedRedirect } from '@/components/events/event-razorpay-hosted-redirect';
import {
  DynamicFieldInput,
  isFieldVisible,
  isSectionVisible,
} from '@/components/events/dynamic-field-input';
import {
  applyRegistrationPrefill,
  deriveContactFromAnswers,
  formCanSupplyName,
  type ContactBlockMode,
  type RegistrationPrefill,
} from '@/lib/services/events/registration/form-prefill';
import {
  asFormUpload,
  isAnswerableField,
  UPLOAD_FIELD_TYPES,
  type EventRegistrationFormField,
} from '@/types/tournament';

/**
 * Fields laid out two per row inside a section ("left & right"); anything that
 * needs the full width — long text, pictures, uploads, multi-choice — spans
 * both columns. Everything is one column on a phone.
 */
const FULL_WIDTH_TYPES = new Set(['textarea', 'image_display', 'file', 'image', 'multi_select', 'checkbox']);

interface SectionWithFields {
  id: string;
  title: string;
  display_order: number;
  condition?: FormFieldCondition | null;
  fields: EventRegistrationFormField[];
}

interface RzpState {
  orderId: string;
  keyId: string;
  amountPaise: number;
  customer: { name?: string; email?: string; phone?: string };
}

/** Section cards cycle through these so a long form reads as distinct blocks. */
const SECTION_TONES = [
  { card: 'border-sky-200/70 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/30', title: 'text-sky-900 dark:text-sky-100', bar: 'bg-sky-500' },
  { card: 'border-violet-200/70 bg-violet-50/50 dark:border-violet-900 dark:bg-violet-950/30', title: 'text-violet-900 dark:text-violet-100', bar: 'bg-violet-500' },
  { card: 'border-amber-200/70 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30', title: 'text-amber-900 dark:text-amber-100', bar: 'bg-amber-500' },
  { card: 'border-rose-200/70 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/30', title: 'text-rose-900 dark:text-rose-100', bar: 'bg-rose-500' },
  { card: 'border-teal-200/70 bg-teal-50/50 dark:border-teal-900 dark:bg-teal-950/30', title: 'text-teal-900 dark:text-teal-100', bar: 'bg-teal-500' },
];

const formatMoney = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function EventRegisterForm({
  eventId,
  formId,
  formName,
  fee,
  feeLabel,
  signedInName,
  signedInEmail,
  prefill,
  contactBlock = 'top',
  alreadyRegistered = false,
  full = false,
  claimOnly = false,
  sections,
}: {
  eventId: string;
  formId: string;
  formName: string;
  /** Already Number()-ed by the page — PostgREST hands numeric back as a string. */
  fee: number;
  feeLabel: string | null;
  signedInName: string | null;
  signedInEmail: string | null;
  /** The signed-in person's profile values, keyed by prefill source; {} for a guest. */
  prefill?: RegistrationPrefill;
  /** Where the built-in name/phone/email block sits, or 'hidden'. */
  contactBlock?: ContactBlockMode;
  /** The signed-in visitor already holds a live registration on this form. */
  alreadyRegistered?: boolean;
  /**
   * The event has no places left AND its cap_behavior is 'waitlist', so this
   * form is still open on purpose for a signed-in person: sending it joins the
   * queue — or, if a place is being held for them, takes that place up.
   */
  full?: boolean;
  /**
   * The registration window has shut, but a place is being held for THIS
   * signed-in visitor, so the form is open only so they can take it up.
   */
  claimOnly?: boolean;
  sections: SectionWithFields[];
}) {
  const [name, setName] = useState(signedInName ?? '');
  const [email, setEmail] = useState(signedInEmail ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  // Seed once from the profile; the person can change anything afterwards.
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(() =>
    applyRegistrationPrefill(
      sections.flatMap((s) => s.fields ?? []),
      prefill ?? {},
      {},
    ),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Told by the page (pre-check) or by the API (a second Register tap).
  const [already, setAlready] = useState(alreadyRegistered);
  /**
   * The event was full and this person went onto the waiting list instead
   * (HTTP 202). Its own state: 202 is an `ok` response, so without this branch
   * a queued person would be shown "You're registered!".
   */
  const [queued, setQueued] = useState<{ position: number | null; message: string } | null>(
    null
  );
  const [rzp, setRzp] = useState<RzpState | null>(null);

  const isPaid = fee > 0;

  // Conditional fields: a hidden field must not be required, or the form becomes
  // unsubmittable for anyone whose answers hide it.
  // A field is visible only if its SECTION is — a required field inside a
  // hidden section must not block submission.
  const visibleFields = useMemo(
    () =>
      sections
        .filter((s) => isSectionVisible(s, customFields))
        .flatMap((s) => (s.fields ?? []).filter((f) => isFieldVisible(f, customFields))),
    [sections, customFields]
  );

  const missingRequired = visibleFields.some((f) => {
    // A display-only image has no input; treating it as unanswered would make
    // the form permanently unsubmittable.
    if (!isAnswerableField(f.field_type)) return false;
    if (!f.is_required) return false;
    const v = customFields[f.field_key];
    // An upload answer is an object, so the scalar checks below would accept
    // `{}` (a half-finished upload) as answered. Require a real storage path.
    if (UPLOAD_FIELD_TYPES.has(f.field_type)) return !asFormUpload(v);
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === null || v === '';
  });

  // 'hidden' only works when the organizer's fields can supply a name; if they
  // cannot, fall back to showing the block rather than shipping an
  // unsubmittable form.
  const allFields = useMemo(() => sections.flatMap((s) => s.fields ?? []), [sections]);
  const blockMode: ContactBlockMode =
    contactBlock === 'hidden' && !formCanSupplyName(allFields) ? 'top' : contactBlock;
  const derived = useMemo(
    () => (blockMode === 'hidden' ? deriveContactFromAnswers(visibleFields, customFields) : null),
    [blockMode, visibleFields, customFields],
  );
  // What is actually sent: the block's inputs, or the answers standing in for them.
  const contactName = derived ? derived.name : name;
  const contactEmail = derived ? derived.email : email;
  const contactPhone = derived ? derived.phone : phone;

  const canSubmit =
    contactName.trim().length > 0 &&
    (contactPhone.trim().length > 0 || contactEmail.trim().length > 0) &&
    !missingRequired;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/public-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          participant_name: contactName.trim(),
          participant_email: contactEmail.trim() || null,
          participant_phone: contactPhone.trim() || null,
          custom_fields: customFields,
        }),
      });
      const body = await res.json().catch(() => ({}));
      // 207 = registered but the payment link could not be created; the
      // registration is real, so treat it as success with a warning rather than
      // telling the user nothing happened.
      if (!res.ok && res.status !== 207) {
        throw new Error(body.error || `Registration failed (${res.status})`);
      }
      if (body.already_registered) {
        setAlready(true);
        return;
      }
      if (res.status === 202 && body.waitlisted) {
        setQueued({
          position: typeof body.position === 'number' ? body.position : null,
          message:
            body.message || 'This event is full, so you have been added to the waiting list.',
        });
        return;
      }
      if (body.razorpay_order_id && body.razorpay_key_id) {
        setRzp({
          orderId: body.razorpay_order_id,
          keyId: body.razorpay_key_id,
          amountPaise: body.amount_paise ?? 0,
          customer: body.customer ?? {},
        });
        return;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  if (rzp) {
    return (
      <EventRazorpayHostedRedirect
        eventId={eventId}
        razorpayKeyId={rzp.keyId}
        razorpayOrderId={rzp.orderId}
        amountPaise={rzp.amountPaise}
        currency="INR"
        customer={rzp.customer}
        description={feeLabel || `${formName} — registration fee`}
        callbackPath={`/api/events/${eventId}/payment/callback`}
        cancelPath={`/p/event/${eventId}/register`}
      />
    );
  }

  if (queued) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
        <ListOrdered className="mx-auto mb-2 h-10 w-10 text-amber-600" />
        <h2 className="text-lg font-semibold">
          {queued.position
            ? `You're number ${queued.position} on the waiting list`
            : "You're on the waiting list"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{queued.message}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          If a place frees up it is offered to whoever is at the front of the queue and
          held for them for 24 hours. You will be told in MyJKKN — then come back to this
          page, signed in, and send the form again to take the place up.
        </p>
      </div>
    );
  }

  if (already) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
        <h2 className="text-lg font-semibold">You&apos;re already registered</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This account has a registration for {formName ? `"${formName}"` : 'this event'} already,
          so there is nothing more to do. See you there.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
        <h2 className="text-lg font-semibold">You&apos;re registered!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isPaid
            ? 'Your registration is recorded — your payment is being confirmed.'
            : 'There is no registration fee for this event.'}{' '}
          See you there.
        </p>
      </div>
    );
  }

  const contactBlockEl = (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="participant_name">
            Your name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="participant_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="participant_phone">Phone</Label>
            <Input
              id="participant_phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="participant_email">Email</Label>
            <Input
              id="participant_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Give at least one of phone or email so the organizer can reach you.
        </p>
      </div>
  );

  return (
    <div className="space-y-6 rounded-2xl border border-emerald-200/70 bg-card p-5 shadow-md sm:p-7 dark:border-emerald-900">
      {full && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <ListOrdered className="h-4 w-4" />
            {claimOnly ? 'A place is being held for you' : 'This event is full'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {claimOnly
              ? 'Registration has otherwise closed. Send this form to take the place up before the hold lapses.'
              : 'Send this form to join the waiting list. If a place frees up it is offered to whoever is at the front and held for them for 24 hours — or, if a place is already being held for you, sending this takes it up.'}
          </p>
        </div>
      )}

      {isPaid && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">
            {feeLabel ?? 'Registration fee'}: {formatMoney(fee)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You&apos;ll be taken to a secure Razorpay page to pay after you submit.
          </p>
        </div>
      )}

      {blockMode === 'top' && (
        <section className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h3 className="mb-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">Your details</h3>
          {contactBlockEl}
        </section>
      )}

      {sections.map((section, idx) => {
        if (!isSectionVisible(section, customFields)) return null;
        const fields = (section.fields ?? []).filter((f) => isFieldVisible(f, customFields));
        if (fields.length === 0) return null;
        const tone = SECTION_TONES[idx % SECTION_TONES.length];
        return (
          <section key={section.id} className={`rounded-xl border p-4 ${tone.card}`}>
            {section.title && (
              <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${tone.title}`}>
                <span className={`h-5 w-1.5 rounded-full ${tone.bar}`} aria-hidden />
                {section.title}
              </h3>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div
                  key={field.id}
                  className={FULL_WIDTH_TYPES.has(field.field_type) ? 'sm:col-span-2' : undefined}
                >
                  <DynamicFieldInput
                    field={field}
                    value={customFields[field.field_key]}
                    // Enables real uploading. Without it the control renders
                    // disabled — which is what the builder's preview wants, but
                    // would silently break the live form.
                    uploadContext={{ eventId, formId }}
                    onChange={(value) =>
                      setCustomFields((prev) => ({ ...prev, [field.field_key]: value }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {blockMode === 'bottom' && (
        <section className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h3 className="mb-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">Your details</h3>
          {contactBlockEl}
        </section>
      )}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        onClick={submit}
        disabled={!canSubmit || busy}
        size="lg"
        className="w-full gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 text-white shadow-md hover:from-emerald-700 hover:via-teal-700 hover:to-sky-700"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPaid ? `Register & pay ${formatMoney(fee)}` : 'Register'}
      </Button>
    </div>
  );
}
