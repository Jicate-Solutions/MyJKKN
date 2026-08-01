'use client';

// components/events/registration/registration-fee-card.tsx
//
// The registration fee for ONE form. An event holds many forms (one per monthly
// run) and each can charge a different amount, so the fee lives on the form.
//
// GENERAL EVENTS ONLY — the caller gates this on variant === 'general'. A sports
// tournament charges per DIVISION (tournament_divisions.config->>'entry_fee'),
// which the public tournament register route reads. Showing a form-level fee
// there too would create two competing sources of truth for one payment.
//
// Saves through useUpdateRegistrationForm (a plain UPDATE), NOT through the
// builder's save_event_registration_form RPC — see the service comment on
// updateForm for why the RPC is left alone.

import { useEffect, useState } from 'react';
import { AlertTriangle, IndianRupee, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUpdateRegistrationForm } from '@/hooks/events/use-tournament-registration-form';
import { effectiveFee, type EventRegistrationFormSummary } from '@/types/tournament';

interface AccountStatus {
  hasAccount: boolean;
  institutionName: string | null;
}

export function RegistrationFeeCard({
  eventId,
  form,
}: {
  eventId: string;
  form: EventRegistrationFormSummary;
}) {
  const updateForm = useUpdateRegistrationForm(eventId);

  // Seeded per form; the key on the caller remounts this when the selection
  // changes, so a half-typed amount never leaks onto another form.
  const [enabled, setEnabled] = useState(!!form.fee_enabled);
  const [amount, setAmount] = useState(String(form.fee_amount ?? 0));
  const [label, setLabel] = useState(form.fee_label ?? '');
  const [account, setAccount] = useState<AccountStatus | null>(null);

  const parsed = Number(amount);
  // An amount only has to be valid while the fee is switched ON. Turning the fee
  // off must never be blocked by a price the organizer no longer cares about.
  const invalid = enabled && (amount.trim() === '' || Number.isNaN(parsed) || parsed <= 0);
  const dirty =
    enabled !== !!form.fee_enabled ||
    (enabled &&
      (parsed !== Number(form.fee_amount ?? 0) || (label || null) !== (form.fee_label ?? null)));

  // Which Razorpay account a fee on this event would settle into. Read from a
  // server route because razorpay_accounts is unreadable by `authenticated` —
  // only a boolean + the institution name come back, never key material.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${eventId}/payment-account-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AccountStatus | null) => {
        if (!cancelled && d) setAccount(d);
      })
      .catch(() => {
        // A failed hint must never block editing the fee — leave it unshown.
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const save = () => {
    if (invalid) return;
    // Switching OFF keeps the stored amount and label untouched — that is the
    // point of a separate toggle. Switching back on restores the old price
    // instead of making the organizer retype it.
    updateForm.mutate({
      formId: form.id,
      updates: enabled
        ? { fee_enabled: true, fee_amount: parsed, fee_label: label.trim() || null }
        : { fee_enabled: false },
    });
  };

  const willFallBack = account && !account.hasAccount && enabled && parsed > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <IndianRupee className="h-4 w-4" />
          Registration fee — {form.name}
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Off by default. Switch it on only if this form should collect money —
          while it is off the form is free and no payment is ever requested.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="min-w-0 pr-3">
            <Label htmlFor={`fee_enabled_${form.id}`} className="cursor-pointer">
              Charge a registration fee
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {enabled
                ? 'Registrants pay through Razorpay before their place is confirmed.'
                : 'This form is free — registrations confirm immediately.'}
            </p>
          </div>
          <Switch
            id={`fee_enabled_${form.id}`}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Hidden rather than disabled while off: a greyed-out price still reads
            as "this form costs ₹500", which is the opposite of what off means. */}
        {enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`fee_amount_${form.id}`}>Amount (INR)</Label>
            <Input
              id={`fee_amount_${form.id}`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {invalid && (
              <p className="text-xs text-destructive">
                Enter an amount greater than 0, or switch the fee off.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`fee_label_${form.id}`}>
              Label <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`fee_label_${form.id}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Delegate fee"
            />
          </div>
        </div>
        )}

        {/* D3: never let money route silently. When the host institution has no
            Razorpay account of its own, resolveRazorpayCredentials falls back to
            the group's common env account — correct behaviour, but the organizer
            has to know it is happening. */}
        {willFallBack && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <p className="text-amber-900 dark:text-amber-200">
              <strong>{account?.institutionName ?? 'This institution'}</strong> has
              no Razorpay account. Fees collected on this form will settle into
              the group&apos;s default account, not this institution&apos;s. Ask
              Finance to add one if that is not what you want.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={!dirty || invalid || updateForm.isPending} className="gap-1.5">
            {updateForm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save fee
          </Button>
          {/* Reflects what is SAVED, not what is typed — otherwise the line
              flips to "free" the moment a field is cleared, before any save. */}
          <span className="text-xs text-muted-foreground">
            {effectiveFee(form) > 0
              ? `Currently charging ₹${effectiveFee(form).toLocaleString('en-IN')}.`
              : 'This form is currently free.'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
