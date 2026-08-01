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
import { useUpdateRegistrationForm } from '@/hooks/events/use-tournament-registration-form';
import type { EventRegistrationFormSummary } from '@/types/tournament';

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
  const [amount, setAmount] = useState(String(form.fee_amount ?? 0));
  const [label, setLabel] = useState(form.fee_label ?? '');
  const [account, setAccount] = useState<AccountStatus | null>(null);

  const parsed = Number(amount);
  const invalid = amount.trim() === '' || Number.isNaN(parsed) || parsed < 0;
  const dirty = !invalid && (parsed !== Number(form.fee_amount ?? 0) || (label || null) !== (form.fee_label ?? null));

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
    updateForm.mutate({
      formId: form.id,
      updates: { fee_amount: parsed, fee_label: label.trim() || null },
    });
  };

  const willFallBack = account && !account.hasAccount && parsed > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <IndianRupee className="h-4 w-4" />
          Registration fee — {form.name}
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Charged to everyone who registers through this form. Set 0 to make it
          free — no payment is requested and the registration confirms
          immediately.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
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
                Enter an amount of 0 or more.
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
          {parsed === 0 && !invalid && (
            <span className="text-xs text-muted-foreground">
              This form is free.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
