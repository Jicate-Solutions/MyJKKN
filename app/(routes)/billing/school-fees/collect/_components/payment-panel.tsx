'use client';

// payment-panel.tsx — the right-hand column: what is owed, how it is being
// paid, and the transaction detail that mode requires.
//
// Which fields appear is driven entirely by `form.mode`. Nothing is hidden with
// CSS — an irrelevant field is not rendered, so it cannot be filled in by
// accident and then silently stored against the wrong payment mode.

import { Banknote, FileText, Landmark, Globe, AlertCircle, Calculator, CreditCard, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

import { SECTION_THEMES } from '../../_components/section-theme';

const T = SECTION_THEMES.collect;

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

// Each mode gets its own hue so the active tile is recognisable from across
// the counter; the ring stays in the section teal so it still reads as "this
// screen". Full strings so Tailwind can see them.
const MODE_STYLE: Record<string, { idle: string; active: string; icon: string }> = {
  cash: {
    idle: 'hover:border-emerald-300 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30',
    active: 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-100',
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  },
  dd: {
    idle: 'hover:border-violet-300 hover:bg-violet-50/60 dark:hover:bg-violet-950/30',
    active: 'border-violet-500 bg-violet-50 text-violet-900 ring-2 ring-violet-500/30 dark:border-violet-400 dark:bg-violet-950/50 dark:text-violet-100',
    icon: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
  },
  bank_transfer: {
    idle: 'hover:border-indigo-300 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30',
    active: 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/30 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-100',
    icon: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200',
  },
  online: {
    idle: 'hover:border-sky-300 hover:bg-sky-50/60 dark:hover:bg-sky-950/30',
    active: 'border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-500/30 dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-100',
    icon: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200',
  },
};
const DEFAULT_MODE_STYLE = {
  idle: 'hover:bg-muted/60',
  active: 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/30 dark:border-teal-400 dark:bg-teal-950/50',
  icon: 'bg-muted text-muted-foreground',
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
      <Card className={T.cardBorder}>
        <CardHeader className={cn('pb-3', T.cardHeader)}>
          <CardTitle className="text-base flex items-center gap-2">
            <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', T.iconTileSm)}>
              <Calculator className="h-3.5 w-3.5" />
            </span>
            Payment Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4 text-sm">
          {/* Hero — the one number the clerk and the parent both look at. */}
          <div className={cn('relative overflow-hidden rounded-xl px-4 py-3 shadow-sm', T.headerGradient)}>
            <div
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-xl"
            />
            <div className="relative">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                Paying now
              </div>
              <div className="text-3xl font-bold tabular-nums leading-tight">
                {money(summary.payingNow)}
              </div>
              <div className="mt-0.5 text-xs text-white/80">
                {summary.count === 0
                  ? 'Select bills on the left to begin'
                  : `${summary.count} bill${summary.count === 1 ? '' : 's'} selected`}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Row label="Total bill amount" value={money(summary.totalBilled)} />
            <Row label="Previously paid" value={money(summary.previouslyPaid)} muted />
            <Row label="Outstanding" value={money(summary.outstanding)} />
            <div className="border-t pt-1.5">
              <Row
                label="Balance after payment"
                value={money(summary.balanceAfter)}
                emphasis
                tone={summary.balanceAfter > 0 ? 'amber' : 'emerald'}
              />
            </div>
          </div>

          {summary.yearOutstanding > summary.outstanding ? (
            <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Whole year outstanding:{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {money(summary.yearOutstanding)}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Mode ────────────────────────────────────────────────────────── */}
      <Card className={T.cardBorder}>
        <CardHeader className={cn('pb-3', T.cardHeader)}>
          <CardTitle className="text-base flex items-center gap-2">
            <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', T.iconTileSm)}>
              <CreditCard className="h-3.5 w-3.5" />
            </span>
            Mode of Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-2">
            {SCHOOL_PAYMENT_MODES.map((mode) => {
              const Icon = MODE_ICON[mode.value] ?? Banknote;
              const style = MODE_STYLE[mode.value] ?? DEFAULT_MODE_STYLE;
              const active = form.mode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => set('mode', mode.value as PaymentMode)}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border bg-background p-3 text-sm transition-all',
                    active ? cn('font-semibold shadow-sm', style.active) : style.idle,
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      active ? style.icon : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
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
        className={cn(
          'w-full h-12 text-base font-semibold shadow-md transition-all',
          canSubmit && !submitting && 'hover:shadow-lg hover:-translate-y-px',
          T.button,
        )}
        size="lg"
        disabled={!canSubmit || submitting}
        onClick={onSubmit}
      >
        <ShieldCheck className="h-5 w-5 mr-2" />
        {submitting
          ? 'Processing…'
          : form.mode === 'online'
            ? `Proceed to Pay ${money(summary.payingNow)}`
            : `Collect ${money(summary.payingNow)}`}
      </Button>
    </div>
  );
}

const ROW_TONE = {
  amber: 'text-amber-700 dark:text-amber-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
} as const;

function Row({
  label,
  value,
  muted,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
  tone?: keyof typeof ROW_TONE;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          emphasis ? 'text-base font-bold' : 'font-medium',
          muted && 'text-muted-foreground',
          tone && ROW_TONE[tone],
        )}
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
