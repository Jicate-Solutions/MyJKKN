'use client';

// payment-panel.tsx — the right-hand column: what is owed, how it is being
// paid, and the transaction detail that mode requires.
//
// Which fields appear is driven entirely by `form.mode`. Nothing is hidden with
// CSS — an irrelevant field is not rendered, so it cannot be filled in by
// accident and then silently stored against the wrong payment mode.

import { Banknote, FileText, Landmark, Globe, AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { SCHOOL_PAYMENT_MODES } from '@/types/school-fees';
import type { PaymentMode } from '@/types/billing-schedule';
import type { PaymentFormState } from '@/hooks/school-fees/use-school-bill-payment';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const money = (n: number) => `₹${inr.format(Number(n) || 0)}`;

const MODE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  dd: FileText,
  bank_transfer: Landmark,
  online: Globe,
};

interface Props {
  form: PaymentFormState;
  setForm: React.Dispatch<React.SetStateAction<PaymentFormState>>;
  summary: {
    count: number;
    totalBilled: number;
    previouslyPaid: number;
    outstanding: number;
    payingNow: number;
    balanceAfter: number;
    yearOutstanding: number;
  };
  errors: string[];
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}

export function PaymentPanel({
  form,
  setForm,
  summary,
  errors,
  canSubmit,
  submitting,
  onSubmit,
}: Props) {
  const set = <K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4 lg:sticky lg:top-4">
      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Selected bills" value={String(summary.count)} />
          <Row label="Total bill amount" value={money(summary.totalBilled)} />
          <Row label="Previously paid" value={money(summary.previouslyPaid)} muted />
          <Row label="Outstanding" value={money(summary.outstanding)} />
          <div className="border-t pt-2">
            <Row label="Paying now" value={money(summary.payingNow)} emphasis />
          </div>
          <Row label="Balance after payment" value={money(summary.balanceAfter)} muted />
          {summary.yearOutstanding > summary.outstanding ? (
            <p className="text-xs text-muted-foreground pt-1">
              Whole year outstanding: {money(summary.yearOutstanding)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Mode ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mode of Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {SCHOOL_PAYMENT_MODES.map((mode) => {
              const Icon = MODE_ICON[mode.value] ?? Banknote;
              const active = form.mode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => set('mode', mode.value as PaymentMode)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1 rounded-md border p-3 text-sm transition-colors ${
                    active
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'hover:bg-muted/60'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {mode.label}
                </button>
              );
            })}
          </div>

          {/* Fields common to every mode. */}
          <Field label="Payer name" required>
            <Input
              value={form.payerName}
              onChange={(e) => set('payerName', e.target.value)}
              placeholder="Who is paying"
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Payer contact">
              <Input
                value={form.payerContact}
                onChange={(e) => set('payerContact', e.target.value)}
                placeholder="Mobile"
                autoComplete="off"
              />
            </Field>
            <Field label={form.mode === 'cash' ? 'Payment date' : 'Transaction date'} required>
              <Input
                type="date"
                value={form.transactionDate}
                onChange={(e) => set('transactionDate', e.target.value)}
              />
            </Field>
          </div>

          {/* ── DD ──────────────────────────────────────────────────────── */}
          {form.mode === 'dd' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="DD number" required>
                  <Input
                    value={form.referenceNumber}
                    onChange={(e) => set('referenceNumber', e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Date of credit" required>
                  <Input
                    type="date"
                    value={form.dateOfCredit}
                    onChange={(e) => set('dateOfCredit', e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Bank name" required>
                  <Input
                    value={form.bankName}
                    onChange={(e) => set('bankName', e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Branch">
                  <Input
                    value={form.branch}
                    onChange={(e) => set('branch', e.target.value)}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </>
          ) : null}

          {/* ── NEFT (stored as payment_mode='bank_transfer') ───────────── */}
          {form.mode === 'bank_transfer' ? (
            <>
              <Field label="UTR / transaction reference" required>
                <Input
                  value={form.referenceNumber}
                  onChange={(e) => set('referenceNumber', e.target.value)}
                  placeholder="UTR number"
                  autoComplete="off"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date of credit" required>
                  <Input
                    type="date"
                    value={form.dateOfCredit}
                    onChange={(e) => set('dateOfCredit', e.target.value)}
                  />
                </Field>
                <Field label="Bank name">
                  <Input
                    value={form.bankName}
                    onChange={(e) => set('bankName', e.target.value)}
                    autoComplete="off"
                  />
                </Field>
              </div>
              <Field label="Remitter name">
                <Input
                  value={form.remitterName}
                  onChange={(e) => set('remitterName', e.target.value)}
                  placeholder="As named on the bank record"
                  autoComplete="off"
                />
              </Field>
            </>
          ) : null}

          {/* ── Online ──────────────────────────────────────────────────── */}
          {form.mode === 'online' ? (
            <Alert>
              <Globe className="h-4 w-4" />
              <AlertTitle>Online payment</AlertTitle>
              <AlertDescription className="text-xs">
                Confirming hands off to the payment gateway. The receipt is issued only after the
                gateway result is verified server-side — never from the browser redirect.
              </AlertDescription>
            </Alert>
          ) : null}

          <Field label="Remarks">
            <Textarea
              rows={2}
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </CardContent>
      </Card>

      {/* ── Blockers + CTA ──────────────────────────────────────────────── */}
      {errors.length > 0 && summary.count > 0 ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Cannot record this payment yet</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-0.5 text-xs">
              {/* De-duplicated: the same rule can fail on several bills at once. */}
              {[...new Set(errors)].slice(0, 4).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Button
        className="w-full"
        size="lg"
        disabled={!canSubmit || submitting}
        onClick={onSubmit}
      >
        {submitting
          ? 'Processing…'
          : form.mode === 'online'
            ? `Proceed to Pay ${money(summary.payingNow)}`
            : `Collect ${money(summary.payingNow)}`}
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span
        className={`tabular-nums ${emphasis ? 'text-lg font-bold' : 'font-medium'} ${
          muted ? 'text-muted-foreground' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
