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

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EventRazorpayHostedRedirect } from '@/components/events/event-razorpay-hosted-redirect';
import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';
import {
  asFormUpload,
  isAnswerableField,
  UPLOAD_FIELD_TYPES,
  type EventRegistrationFormField,
} from '@/types/tournament';

interface SectionWithFields {
  id: string;
  title: string;
  display_order: number;
  fields: EventRegistrationFormField[];
}

interface RzpState {
  orderId: string;
  keyId: string;
  amountPaise: number;
  customer: { name?: string; email?: string; phone?: string };
}

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
  sections: SectionWithFields[];
}) {
  const [name, setName] = useState(signedInName ?? '');
  const [email, setEmail] = useState(signedInEmail ?? '');
  const [phone, setPhone] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [rzp, setRzp] = useState<RzpState | null>(null);

  const isPaid = fee > 0;

  // Conditional fields: a hidden field must not be required, or the form becomes
  // unsubmittable for anyone whose answers hide it.
  const visibleFields = useMemo(
    () =>
      sections.flatMap((s) => (s.fields ?? []).filter((f) => isFieldVisible(f, customFields))),
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

  const canSubmit =
    name.trim().length > 0 && (phone.trim().length > 0 || email.trim().length > 0) && !missingRequired;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/public-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          participant_name: name.trim(),
          participant_email: email.trim() || null,
          participant_phone: phone.trim() || null,
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

  return (
    <div className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
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

      {sections.map((section) => {
        const fields = (section.fields ?? []).filter((f) => isFieldVisible(f, customFields));
        if (fields.length === 0) return null;
        return (
          <div key={section.id} className="space-y-4 border-t pt-4">
            {section.title && <h3 className="text-sm font-semibold">{section.title}</h3>}
            {fields.map((field) => (
              <DynamicFieldInput
                key={field.id}
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
            ))}
          </div>
        );
      })}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button onClick={submit} disabled={!canSubmit || busy} className="w-full gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPaid ? `Register & pay ${formatMoney(fee)}` : 'Register'}
      </Button>
    </div>
  );
}
