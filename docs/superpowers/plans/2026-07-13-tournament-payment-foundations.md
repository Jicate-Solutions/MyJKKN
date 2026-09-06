# Tournament Payment Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make online payment for tournament registration actually work end-to-end — host-institution-scoped Razorpay checkout via the `tuition` fee-head, replacing the currently-dead `payment_url` flow — plus the two missing admin controls (host-institution picker, division entry-fee editor) needed to exercise it.

**Architecture:** `EventPaymentService.initiatePayment()` already creates a valid Razorpay order but returns `payment_url: ''`, which every caller checks and finds falsy, so checkout never launches. This plan (a) threads an explicit host-institution + `feeHead: 'tuition'` into that call, (b) adds a new `EventRazorpayHostedRedirect` component (mirroring billing's proven hosted-checkout pattern) that consumes the order fields the backend already returns, (c) rewrites the tournament payment callback route to verify Razorpay's signature + dual inquiry instead of calling the decommissioned HDFC verifier, and (d) adds the two missing admin UI controls. No new database tables — one additive column.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + service-role client), TanStack Query, Razorpay hosted checkout (`RazorpayProvider` / `resolveRazorpayCredentials`).

## Global Constraints

- **No wired test runner** (CLAUDE.md) — every "run the tests" step in the skill's default template is replaced with: re-read the diff for correctness, then a concrete manual browser-verification step. Do not claim "tests pass."
- **TypeScript strict mode is off; `ignoreBuildErrors: true`** — verify each touched file with `mcp__ide__getDiagnostics` if available in your session; otherwise re-read the file carefully for type errors (no full `tsc` — it OOMs/takes minutes).
- **Never fire-and-forget a Supabase mutation** — every `.insert()`/`.update()` in this plan already destructures and checks `{ error }`; preserve that in any edits.
- **Marathon is explicitly out of scope.** `EventPaymentService.handleCallback()` (the old HDFC-based callback handler) and the `HDFCEventClient` import **must not be deleted or modified** — marathon's callback route may still call `handleCallback()`, and this plan does not touch marathon. Only the truly-unreachable HDFC branch *inside* `initiatePayment()` (guarded by a provider check that always throws for non-Razorpay) is removed.
- **Commit real SQL, never a placeholder migration** (CLAUDE.md) — the migration in Task 1 must be applied via the Supabase MCP tool AND committed verbatim to `supabase/migrations/`, then mirrored into `supabase/setup/01_tables.sql`.
- Institution picker/fee editor changes must not touch `TournamentEventService` or the `use-tournaments.ts` hooks' method signatures — `config`/`institution_id` already pass through untouched; only the UI needs new fields.

---

## File Structure

| File | Change |
|---|---|
| `supabase/migrations/20260713120000_event_payment_transactions_return_url.sql` | **Create.** One additive column. |
| `supabase/setup/01_tables.sql` | **Modify.** Mirror the new column. |
| `lib/services/events/core/event-payment-service.ts` | **Modify.** `initiatePayment` gains `institutionIdOverride`/`feeHead`, persists `return_url`, drops the dead HDFC session-creation branch. New methods `verifyAndSettleRazorpayPayment`, `markRazorpayOrderFailed`. |
| `components/events/event-razorpay-hosted-redirect.tsx` | **Create.** Generic hosted-checkout launcher for the events module. |
| `app/api/events/tournament/[eventId]/payment/callback/route.ts` | **Modify (rewrite).** POST handler verifying Razorpay's callback; old GET/HDFC path removed. |
| `app/api/events/tournament/[eventId]/public-register/route.ts` | **Modify.** Fetch host institution, pass `institutionIdOverride`/`feeHead`, widen response. |
| `app/api/events/tournament/[eventId]/entries/route.ts` | **Modify.** Same, for the organizer POST. |
| `app/api/events/tournament/[eventId]/entries/[entryId]/pay/route.ts` | **Modify.** Same, for the payment-link regenerate endpoint. |
| `types/tournament.ts` | **Modify.** Widen `RegisterEntryResult`. |
| `lib/services/events/tournament/tournament-registration-service.ts` | **Modify.** Widen `generatePaymentLink`'s return type. |
| `hooks/events/use-tournament-registrations.ts` | **Modify.** `useGeneratePaymentLink` stops auto-opening a (dead) URL. |
| `app/p/tournament/[id]/register/_components/register-form.tsx` | **Modify.** Render the hosted redirect instead of the dead `payment_url` check. |
| `app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx` | **Modify.** Same, for organizer-created paid entries. |
| `app/(routes)/events/tournament/[id]/page.tsx` | **Modify.** Same, for the "Generate payment link" button. |
| `app/(routes)/events/tournament/new/page.tsx` | **Modify.** Host-institution picker; division entry-fee input. |
| `app/(routes)/events/tournament/_components/edit-tournament-dialog.tsx` | **Modify.** Division entry-fee input in the edit dialog. |

---

### Task 1: Migration — `event_payment_transactions.return_url`

**Files:**
- Create: `supabase/migrations/20260713120000_event_payment_transactions_return_url.sql`
- Modify: `supabase/setup/01_tables.sql`

**Interfaces:**
- Produces: `event_payment_transactions.return_url` (text, nullable) — read/written by Task 2 and Task 3.

- [ ] **Step 1: Write the migration**

```sql
-- Tournament payment checkout fix: stash the initiating flow's return URL so
-- the Razorpay callback route can redirect back to the right
-- audience-appropriate page (guest public page vs organizer management page)
-- without relying on a query string surviving Razorpay's POST-back.

BEGIN;

ALTER TABLE event_payment_transactions
  ADD COLUMN IF NOT EXISTS return_url text;

COMMENT ON COLUMN event_payment_transactions.return_url IS
  'Origin-relative URL to redirect back to after Razorpay hosted checkout completes; set at initiatePayment() time from the caller''s returnUrl.';

COMMIT;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `mcp__supabase__apply_migration` with `name: "event_payment_transactions_return_url"` and the SQL above. Confirm no error is returned.

- [ ] **Step 3: Mirror into the reference schema file**

Open `supabase/setup/01_tables.sql`, find the `CREATE TABLE event_payment_transactions` block, and add `return_url text,` to its column list (alongside the other nullable text columns like `gateway_session_id`). This file is documentation-only (not re-applied), so match the existing formatting style in that block.

- [ ] **Step 4: Verify**

Run `mcp__supabase__list_tables` (or `execute_sql` with `select column_name from information_schema.columns where table_name = 'event_payment_transactions' and column_name = 'return_url'`) and confirm the column exists.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260713120000_event_payment_transactions_return_url.sql supabase/setup/01_tables.sql
git commit -m "feat(events): add return_url column to event_payment_transactions"
```

---

### Task 2: `EventPaymentService.initiatePayment` — host-institution override, fee head, return_url

**Files:**
- Modify: `lib/services/events/core/event-payment-service.ts:49-259`

**Interfaces:**
- Consumes: `event_payment_transactions.return_url` (Task 1).
- Produces: `initiatePayment(params)` now accepts `institutionIdOverride?: string | null` and `feeHead?: string | null`; `EventInitiatePaymentResult` shape unchanged (still `{ payment_url, transaction_id, provider, transaction_ref, razorpay_order_id, razorpay_key_id, amount_paise, customer }`). Consumed by Task 6 (route call sites).

- [ ] **Step 1: Replace the `initiatePayment` method**

Replace the entire method body from `static async initiatePayment(params: {` (line 49) through its closing `}` (line 259) with:

```typescript
  static async initiatePayment(params: {
    registrationId: string;
    eventId: string;
    amount: number;
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    discountCode?: string;
    returnUrl: string;
    /**
     * Optional server callback URL the gateway redirects to after payment.
     * When omitted, defaults to the marathon callback (backward compatible).
     * Other event types (e.g. tournaments) pass their own callback route here;
     * `transaction_ref` is appended automatically.
     */
    callbackUrl?: string;
    /**
     * Overrides registration.institution_id for BOTH Razorpay account
     * resolution and the institution_id recorded on the transaction row.
     * Tournaments pass their host event's institution_id here so entry fees
     * settle into the HOST institution's account regardless of the
     * registrant's own institution (or lack of one, for guests). Omit to
     * keep today's behavior (marathon does not pass this).
     */
    institutionIdOverride?: string | null;
    /**
     * Fee head (billing_categories.kind) for Razorpay account resolution at
     * order-creation. Omit to resolve the institution's default account
     * (marathon does not pass this).
     */
    feeHead?: string | null;
  }): Promise<EventInitiatePaymentResult> {
    const supabase = createServiceRoleClient();

    logger.info('events/payment', 'Initiating event payment', {
      registrationId: params.registrationId,
      eventId: params.eventId,
      amount: params.amount,
    });

    // Step 1: Validate registration exists and is unpaid
    const { data: registration, error: regError } = await supabase
      .from('events_registrations')
      .select('id, event_id, payment_status, payment_amount, participant_name, institution_id')
      .eq('id', params.registrationId)
      .eq('event_id', params.eventId)
      .single();

    if (regError || !registration) {
      logger.error('events/payment', 'Registration not found', {
        registrationId: params.registrationId,
        error: regError,
      });
      throw new Error('Registration not found');
    }

    if (registration.payment_status === 'paid') {
      throw new Error('Registration is already paid');
    }

    // Step 2: Generate unique transaction reference
    const transactionRef = this.generateTransactionRef();

    const resolvedInstitutionId =
      params.institutionIdOverride !== undefined
        ? params.institutionIdOverride
        : registration.institution_id;

    // ----------------------------------------------------------------------
    // getActiveProviderName('events') is always 'razorpay' or throws (HDFC
    // SmartGateway decommissioned) — this branch always runs. The old HDFC
    // session-creation code that used to follow it (Steps 3-5) has been
    // removed as dead code. handleCallback() below is UNCHANGED and still
    // HDFC-only — it is out of scope here (see Global Constraints).
    // ----------------------------------------------------------------------
    if (getActiveProviderName('events') !== 'razorpay') {
      throw new Error('No payment provider configured for events');
    }

    const provider = await getPaymentProvider('events', {
      institutionId: resolvedInstitutionId ?? undefined,
      feeHead: params.feeHead ?? null,
      purpose: 'create-order',
    });
    const rzpAccountId = (provider as { accountId?: string }).accountId ?? null;
    const amountPaise = toPaise(params.amount);

    const order = await provider.createOrder({
      transactionRef,
      amountPaise,
      currency: 'INR',
      module: 'events',
      notes: {
        registration_id: params.registrationId,
        event_id: params.eventId,
        transaction_ref: transactionRef,
        institution_id: resolvedInstitutionId ?? '',
      },
      description: `Event Registration - ${registration.participant_name || 'Participant'}`,
      customer: {
        name: params.payerName,
        email: params.payerEmail,
        phone: params.payerPhone,
      },
    });

    const { data: txn, error: txnError } = await (supabase as any)
      .from('event_payment_transactions')
      .insert({
        event_id: params.eventId,
        registration_id: params.registrationId,
        transaction_ref: transactionRef,
        amount: params.amount,
        amount_paise: amountPaise,
        currency: 'INR',
        status: 'initiated',
        payer_name: params.payerName,
        payer_email: params.payerEmail,
        payer_phone: params.payerPhone,
        discount_code: params.discountCode || null,
        discount_amount: 0,
        institution_id: resolvedInstitutionId,
        provider: 'razorpay',
        razorpay_order_id: order.gatewayOrderId,
        razorpay_account_id: rzpAccountId,
        gateway_session_id: order.gatewayOrderId,
        gateway_response: order.raw,
        return_url: params.returnUrl,
      })
      .select('id')
      .single();

    if (txnError || !txn) {
      logger.error('events/payment', 'Failed to create Razorpay event transaction', txnError);
      throw new Error('Failed to create payment transaction');
    }

    logger.info('events/payment', 'Razorpay event payment initiated', {
      transactionId: txn.id,
      transactionRef,
      razorpayOrderId: order.gatewayOrderId,
    });

    return {
      payment_url: '',
      transaction_id: txn.id,
      provider: 'razorpay',
      transaction_ref: transactionRef,
      razorpay_order_id: order.gatewayOrderId,
      razorpay_key_id: order.clientKeyId,
      amount_paise: amountPaise,
      customer: {
        name: params.payerName,
        email: params.payerEmail,
        phone: params.payerPhone,
      },
    };
  }
```

Do **not** touch `handleCallback()` (the next method in the file) — leave it byte-for-byte as-is.

- [ ] **Step 2: Verify**

Re-read the modified method and confirm: (a) `institutionIdOverride`/`feeHead` are new, everything else matches the original logic; (b) `handleCallback()`, `handleWebhook()`, `checkPaymentStatus()`, `generateTransactionRef()` below it are untouched; (c) the `HDFCEventClient` import at the top of the file is still present (still used by `handleCallback`). If your session has `mcp__ide__getDiagnostics`, run it on this file and confirm no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/services/events/core/event-payment-service.ts
git commit -m "feat(events): thread institution/fee-head override through initiatePayment, drop dead HDFC branch"
```

---

### Task 3: New `verifyAndSettleRazorpayPayment` + `markRazorpayOrderFailed` methods

**Files:**
- Modify: `lib/services/events/core/event-payment-service.ts` (add import + two new methods)

**Interfaces:**
- Consumes: `RazorpayProvider.verifySignature`, `RazorpayProvider.dualInquiry` (`lib/services/payments/razorpay/razorpay-provider.ts`); `getPaymentProvider('events', { accountId })` (pinned-account resolution, `lib/services/payments/factory.ts`).
- Produces: `EventPaymentService.verifyAndSettleRazorpayPayment(params): Promise<{ success: boolean; registrationId: string | null; transactionId: string | null; returnUrl: string | null }>` and `EventPaymentService.markRazorpayOrderFailed(razorpayOrderId, error): Promise<void>` — both consumed by Task 5 (callback route).

- [ ] **Step 1: Add the import**

At the top of `lib/services/events/core/event-payment-service.ts`, alongside the existing imports:

```typescript
import { RazorpayProvider } from '@/lib/services/payments/razorpay/razorpay-provider';
```

- [ ] **Step 2: Add the two methods**

Insert immediately after the `initiatePayment` method (before `// 2. Handle HDFC Callback`):

```typescript
  // ==========================================================================
  // 2b. Verify + Settle a Razorpay Hosted-Checkout Callback
  // ==========================================================================

  /**
   * Verifies a Razorpay hosted-checkout POST-back (signature + dual inquiry)
   * and settles the transaction + registration on success. Idempotent: if
   * the async webhook already settled this transaction first, this is a
   * no-op that still returns success so the payer sees a correct
   * confirmation page.
   *
   * Razorpay-only — this does not touch HDFC. Marathon's callback route is
   * unchanged and continues to call handleCallback() below.
   */
  static async verifyAndSettleRazorpayPayment(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<{
    success: boolean;
    registrationId: string | null;
    transactionId: string | null;
    returnUrl: string | null;
  }> {
    const supabase = createServiceRoleClient();

    const { data: transaction, error: txnError } = await (supabase as any)
      .from('event_payment_transactions')
      .select('id, registration_id, status, razorpay_account_id, return_url')
      .eq('razorpay_order_id', params.razorpayOrderId)
      .single();

    if (txnError || !transaction) {
      logger.warn('events/payment', 'Razorpay callback for unknown order', {
        razorpayOrderId: params.razorpayOrderId,
      });
      return { success: false, registrationId: null, transactionId: null, returnUrl: null };
    }

    // Idempotency: the webhook may have already settled this transaction.
    if (transaction.status === 'success') {
      return {
        success: true,
        registrationId: transaction.registration_id,
        transactionId: transaction.id,
        returnUrl: transaction.return_url,
      };
    }

    const provider = (await getPaymentProvider('events', {
      accountId: transaction.razorpay_account_id ?? undefined,
    })) as RazorpayProvider;

    const signatureValid = provider.verifySignature({
      gatewayOrderId: params.razorpayOrderId,
      gatewayPaymentId: params.razorpayPaymentId,
      signature: params.razorpaySignature,
    });

    if (!signatureValid) {
      logger.error('events/payment', 'SECURITY: Razorpay signature verification failed', {
        transactionId: transaction.id,
        razorpayOrderId: params.razorpayOrderId,
      });
      await supabase
        .from('event_payment_transactions')
        .update({ status: 'failed' })
        .eq('id', transaction.id);
      return {
        success: false,
        registrationId: transaction.registration_id,
        transactionId: transaction.id,
        returnUrl: transaction.return_url,
      };
    }

    // Dual inquiry (GET /orders + GET /payments) — mandatory per the Razorpay
    // security audit; never settle off the signature alone.
    const status = await provider.dualInquiry(params.razorpayOrderId, params.razorpayPaymentId);

    if (status.status !== 'captured' && status.status !== 'authorized') {
      await supabase
        .from('event_payment_transactions')
        .update({ status: 'failed', gateway_response: status.raw })
        .eq('id', transaction.id);
      return {
        success: false,
        registrationId: transaction.registration_id,
        transactionId: transaction.id,
        returnUrl: transaction.return_url,
      };
    }

    const now = new Date().toISOString();
    await supabase
      .from('event_payment_transactions')
      .update({
        status: 'success',
        razorpay_payment_id: params.razorpayPaymentId,
        gateway_response: status.raw,
        paid_at: now,
      })
      .eq('id', transaction.id);

    if (transaction.registration_id) {
      await supabase
        .from('events_registrations')
        .update({
          payment_status: 'paid',
          payment_method: 'razorpay',
          payment_reference: params.razorpayPaymentId,
        })
        .eq('id', transaction.registration_id);
    }

    logger.info('events/payment', 'Razorpay callback verified and settled', {
      transactionId: transaction.id,
      registrationId: transaction.registration_id,
    });

    return {
      success: true,
      registrationId: transaction.registration_id,
      transactionId: transaction.id,
      returnUrl: transaction.return_url,
    };
  }

  /**
   * Marks a Razorpay order's transaction as failed from a hosted-checkout
   * error callback. Never overwrites an already-terminal status (success or
   * a prior failed) so a late/duplicate error POST can't clobber real data.
   */
  static async markRazorpayOrderFailed(
    razorpayOrderId: string,
    error: { code: string | null; description: string | null }
  ): Promise<void> {
    const supabase = createServiceRoleClient();
    const { data: transaction } = await (supabase as any)
      .from('event_payment_transactions')
      .select('id, status')
      .eq('razorpay_order_id', razorpayOrderId)
      .single();
    if (!transaction || ['success', 'failed'].includes(transaction.status)) return;
    await supabase
      .from('event_payment_transactions')
      .update({ status: 'failed', gateway_response: error })
      .eq('id', transaction.id);
  }
```

- [ ] **Step 3: Verify**

Re-read the file top-to-bottom once: confirm the new `RazorpayProvider` import, the two new methods sit between `initiatePayment` and `handleCallback`, and `handleCallback`/`handleWebhook`/`HDFCEventClient` are still untouched below.

- [ ] **Step 4: Commit**

```bash
git add lib/services/events/core/event-payment-service.ts
git commit -m "feat(events): add Razorpay callback verification + failure-marking methods"
```

---

### Task 4: `EventRazorpayHostedRedirect` component

**Files:**
- Create: `components/events/event-razorpay-hosted-redirect.tsx`

**Interfaces:**
- Produces: `<EventRazorpayHostedRedirect eventId razorpayKeyId razorpayOrderId amountPaise currency customer description? cancelPath />` — consumed by Task 8 (guest form) and Task 9 (organizer dialog + management page).

- [ ] **Step 1: Create the component**

```tsx
'use client';

// Razorpay HOSTED Checkout redirect for the events module (tournament, and any
// future event type). Mirrors components/billing/razorpay-hosted-redirect.tsx —
// same hosted-checkout mechanics (CollectNow-mandated full-page redirect), but
// takes eventId + a relative cancelPath so each event type's own callback
// route (e.g. /api/events/tournament/[eventId]/payment/callback) handles the
// POST-back, instead of hardcoding billing's endpoint.
//
// How it works: renders an auto-submitting <form> that POSTs the order to
// https://api.razorpay.com/v1/checkout/embedded with callback_url +
// cancel_url. On payment, Razorpay POSTs razorpay_order_id /
// razorpay_payment_id / razorpay_signature back to the events callback route,
// which verifies the HMAC signature + dual inquiry server-side.

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

const RAZORPAY_HOSTED_CHECKOUT_URL = 'https://api.razorpay.com/v1/checkout/embedded';

interface Props {
  eventId: string;
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: 'INR';
  customer: { name?: string; email?: string; phone?: string };
  description?: string;
  /** Relative path (with leading /) Razorpay sends the user back to on cancel. */
  cancelPath: string;
}

export function EventRazorpayHostedRedirect(props: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const callbackUrl = `${appOrigin}/api/events/tournament/${props.eventId}/payment/callback`;
  const cancelUrl = `${appOrigin}${props.cancelPath}`;

  useEffect(() => {
    if (submitted.current) return;
    if (!formRef.current) return;
    submitted.current = true;
    formRef.current.submit();
  }, []);

  const fields: Record<string, string> = {
    key_id: props.razorpayKeyId,
    order_id: props.razorpayOrderId,
    amount: String(props.amountPaise),
    currency: props.currency,
    name: 'JKKN',
    description: props.description ?? 'Event registration',
    'prefill[name]': props.customer.name ?? '',
    'prefill[email]': props.customer.email ?? '',
    'prefill[contact]': props.customer.phone ?? '',
    callback_url: callbackUrl,
    cancel_url: cancelUrl,
  };

  return (
    <>
      <form
        ref={formRef}
        method="POST"
        action={RAZORPAY_HOSTED_CHECKOUT_URL}
        className="hidden"
        aria-hidden="true"
      >
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>

      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Redirecting to the secure Razorpay payment page…
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify**

Confirm the file is a near-exact structural mirror of `components/billing/razorpay-hosted-redirect.tsx`, differing only in the props (`eventId`/`cancelPath` instead of `transactionId`/`onClose`) and the callback URL construction.

- [ ] **Step 3: Commit**

```bash
git add components/events/event-razorpay-hosted-redirect.tsx
git commit -m "feat(events): add hosted Razorpay checkout redirect component for events module"
```

---

### Task 5: Rewrite the tournament payment callback route

**Files:**
- Modify: `app/api/events/tournament/[eventId]/payment/callback/route.ts` (full rewrite)

**Interfaces:**
- Consumes: `EventPaymentService.verifyAndSettleRazorpayPayment`, `EventPaymentService.markRazorpayOrderFailed` (Task 3).

- [ ] **Step 1: Replace the entire file**

```typescript
export const dynamic = 'force-dynamic';

// POST /api/events/tournament/[eventId]/payment/callback
// Razorpay's hosted checkout POSTs back here after payment. Verifies the
// signature + runs the dual inquiry server-side (NEVER trusts the client),
// settles the transaction + registration, then redirects the payer back to
// whichever page initiated payment — the transaction's stashed return_url
// (the guest public page or the organizer management page).
//
// Replaces the old GET handler, which only supported the decommissioned HDFC
// SmartGateway redirect contract and is no longer reachable (getActiveProviderName
// throws for anything but 'razorpay').

import { NextRequest, NextResponse } from 'next/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const fallback = (flag: string) =>
    NextResponse.redirect(`${appUrl}/p/tournament/${eventId}?payment=${flag}`, 303);

  const formData = await request.formData().catch(() => null);
  if (!formData) return fallback('error');

  const razorpayOrderId = formData.get('razorpay_order_id')?.toString();
  const razorpayPaymentId = formData.get('razorpay_payment_id')?.toString();
  const razorpaySignature = formData.get('razorpay_signature')?.toString();

  if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
    const result = await EventPaymentService.verifyAndSettleRazorpayPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
    const target = result.returnUrl || `${appUrl}/p/tournament/${eventId}`;
    const url = new URL(target);
    url.searchParams.set('payment', result.success ? 'success' : 'failed');
    return NextResponse.redirect(url, 303);
  }

  // Razorpay hosted-checkout FAILURE callback: no signed success trio; instead
  // error[code]/error[description]/error[metadata] (JSON string with order_id).
  const errorCode = formData.get('error[code]')?.toString();
  const errorMetadataRaw = formData.get('error[metadata]')?.toString();
  let failedOrderId: string | undefined;
  if (errorMetadataRaw) {
    try {
      failedOrderId = JSON.parse(errorMetadataRaw)?.order_id;
    } catch {
      // metadata wasn't JSON; fall back to the bracketed key below.
    }
  }
  failedOrderId = failedOrderId || formData.get('error[metadata][order_id]')?.toString();

  if (failedOrderId) {
    await EventPaymentService.markRazorpayOrderFailed(failedOrderId, {
      code: errorCode ?? null,
      description: formData.get('error[description]')?.toString() ?? null,
    });
  }

  if (errorCode || failedOrderId) return fallback('failed');
  return fallback('error');
}
```

- [ ] **Step 2: Verify**

Confirm the old `import { EventPaymentService } ...` + GET handler calling `handleCallback` is fully replaced, and no `transaction_ref`/`clientStatus` query-param logic remains (that was HDFC-only).

- [ ] **Step 3: Commit**

```bash
git add app/api/events/tournament/[eventId]/payment/callback/route.ts
git commit -m "fix(events): rewrite tournament payment callback for Razorpay hosted checkout"
```

---

### Task 6: Thread host institution + `tuition` fee-head through the three payment-initiating routes

**Files:**
- Modify: `app/api/events/tournament/[eventId]/public-register/route.ts`
- Modify: `app/api/events/tournament/[eventId]/entries/route.ts`
- Modify: `app/api/events/tournament/[eventId]/entries/[entryId]/pay/route.ts`

**Interfaces:**
- Consumes: `EventPaymentService.initiatePayment` with `institutionIdOverride`/`feeHead` (Task 2).
- Produces: all three routes now return `{ razorpay_order_id, razorpay_key_id, amount_paise, customer }` (nullable) alongside their existing fields — consumed by Task 7 (client types) and Tasks 8/9 (UI wiring).

- [ ] **Step 1: `public-register/route.ts`**

In the `events` select (around line 50-55), add `institution_id`:

```typescript
    const { data: ev } = await (svc as any)
      .from('events')
      .select('id, event_type, status, registration_open_date, registration_close_date, institution_id')
      .eq('id', eventId)
      .eq('event_type', 'sports_tournament')
      .maybeSingle();
```

Replace the payment block (currently `// ---- payment (online link for paid divisions) ----` through the final `return NextResponse.json`) with:

```typescript
    // ---- payment (Razorpay order for paid divisions) ----
    let paymentResult: Awaited<ReturnType<typeof EventPaymentService.initiatePayment>> | null = null;
    if (fee > 0) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
        paymentResult = await EventPaymentService.initiatePayment({
          registrationId: reg.id,
          eventId,
          amount: fee,
          payerName: dto.entry_name.trim(),
          payerEmail: dto.participant_email || 'noreply@jkkn.ac.in',
          payerPhone: dto.participant_phone || '',
          returnUrl: `${appUrl}/p/tournament/${eventId}`,
          callbackUrl: `${appUrl}/api/events/tournament/${eventId}/payment/callback`,
          institutionIdOverride: ev.institution_id ?? null,
          feeHead: 'tuition',
        });
      } catch {
        return NextResponse.json(
          { entry_id: entry.id, warning: 'Registered (unpaid) — payment link could not be created, please retry.' },
          { status: 207 }
        );
      }
    }

    return NextResponse.json(
      {
        entry_id: entry.id,
        paid_required: fee > 0,
        razorpay_order_id: paymentResult?.razorpay_order_id ?? null,
        razorpay_key_id: paymentResult?.razorpay_key_id ?? null,
        amount_paise: paymentResult?.amount_paise ?? null,
        customer: paymentResult?.customer ?? null,
      },
      { status: 201 }
    );
```

- [ ] **Step 2: `entries/route.ts` (POST)**

Immediately after the division fetch (around line 119-127), add a host-institution lookup:

```typescript
    const { data: hostEvent } = await (svc as any)
      .from('events')
      .select('institution_id')
      .eq('id', eventId)
      .single();
```

Replace the payment block (`// ---- 4. payment (online link) ----` through the final `return NextResponse.json`) with:

```typescript
    // ---- 4. payment (Razorpay order) ----
    let paymentResult: Awaited<ReturnType<typeof EventPaymentService.initiatePayment>> | null = null;
    if (wantsOnline) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        paymentResult = await EventPaymentService.initiatePayment({
          registrationId: reg.id,
          eventId,
          amount: fee,
          payerName: dto.entry_name.trim(),
          payerEmail: dto.participant_email || 'noreply@jkkn.ac.in',
          payerPhone: dto.participant_phone || '',
          returnUrl: `${appUrl}/events/tournament/${eventId}`,
          callbackUrl: `${appUrl}/api/events/tournament/${eventId}/payment/callback`,
          institutionIdOverride: hostEvent?.institution_id ?? null,
          feeHead: 'tuition',
        });
      } catch (payErr) {
        return NextResponse.json(
          {
            entry,
            warning: `Entry created (unpaid) but payment link failed: ${payErr instanceof Error ? payErr.message : 'unknown'}`,
          },
          { status: 207 }
        );
      }
    }

    return NextResponse.json(
      {
        entry,
        payment_url: null,
        transaction_id: paymentResult?.transaction_id ?? null,
        razorpay_order_id: paymentResult?.razorpay_order_id ?? null,
        razorpay_key_id: paymentResult?.razorpay_key_id ?? null,
        amount_paise: paymentResult?.amount_paise ?? null,
        customer: paymentResult?.customer ?? null,
      },
      { status: 201 }
    );
```

(`payment_url` is kept in the response, always `null` now, only so `RegisterEntryResult` — widened in Task 7 — stays a strict superset of today's shape; nothing reads it as truthy anymore after Task 9.)

- [ ] **Step 3: `entries/[entryId]/pay/route.ts`**

Add a host-institution fetch after the existing division fetch (around line 52-58):

```typescript
    const { data: hostEvent } = await (svc as any)
      .from('events')
      .select('institution_id')
      .eq('id', eventId)
      .single();
```

Replace the final block (`const appUrl = ...` through the end of the function) with:

```typescript
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await EventPaymentService.initiatePayment({
      registrationId: entry.registration_id,
      eventId,
      amount: fee,
      payerName: entry.entry_name,
      payerEmail: reg?.participant_email || 'noreply@jkkn.ac.in',
      payerPhone: reg?.participant_phone || '',
      returnUrl: `${appUrl}/events/tournament/${eventId}`,
      callbackUrl: `${appUrl}/api/events/tournament/${eventId}/payment/callback`,
      institutionIdOverride: hostEvent?.institution_id ?? null,
      feeHead: 'tuition',
    });

    return NextResponse.json({
      transaction_id: res.transaction_id,
      razorpay_order_id: res.razorpay_order_id ?? null,
      razorpay_key_id: res.razorpay_key_id ?? null,
      amount_paise: res.amount_paise ?? null,
      customer: res.customer ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create payment link' },
      { status: 500 }
    );
  }
}
```

(Keep the existing `try {` opening and the surrounding function signature untouched — only the body from `const appUrl = ...` onward changes.)

- [ ] **Step 4: Verify**

Re-read all three files. Confirm each institution lookup happens before its `initiatePayment` call, `feeHead: 'tuition'` is present in all three calls, and each response includes the four new nullable fields.

- [ ] **Step 5: Commit**

```bash
git add app/api/events/tournament/[eventId]/public-register/route.ts app/api/events/tournament/[eventId]/entries/route.ts "app/api/events/tournament/[eventId]/entries/[entryId]/pay/route.ts"
git commit -m "fix(events): route tournament payments through host institution's tuition fee-head account"
```

---

### Task 7: Widen client-side types and the registration service

**Files:**
- Modify: `types/tournament.ts:237-241` (`RegisterEntryResult`)
- Modify: `lib/services/events/tournament/tournament-registration-service.ts:79-87` (`generatePaymentLink`)

**Interfaces:**
- Consumes: the widened JSON shapes from Task 6.
- Produces: `RegisterEntryResult` and `generatePaymentLink()`'s return type both carry `razorpay_order_id`, `razorpay_key_id`, `amount_paise`, `customer` — consumed by Task 8 and Task 9.

- [ ] **Step 1: Widen `RegisterEntryResult`**

In `types/tournament.ts`, replace:

```typescript
/** Result of a register call: the created entry, plus a payment link when online. */
export interface RegisterEntryResult {
  entry: TournamentEntry;
  payment_url?: string | null;
  transaction_id?: string | null;
}
```

with:

```typescript
/** Result of a register call: the created entry, plus Razorpay order details when a payment was initiated. */
export interface RegisterEntryResult {
  entry: TournamentEntry;
  payment_url?: string | null;
  transaction_id?: string | null;
  razorpay_order_id?: string | null;
  razorpay_key_id?: string | null;
  amount_paise?: number | null;
  customer?: { name?: string; email?: string; phone?: string } | null;
}
```

- [ ] **Step 2: Widen `generatePaymentLink`'s return type**

In `lib/services/events/tournament/tournament-registration-service.ts`, replace:

```typescript
  /** Generate (or re-generate) an online payment link for an unpaid entry. */
  static async generatePaymentLink(
    eventId: string,
    entryId: string
  ): Promise<{ payment_url: string | null; transaction_id: string | null }> {
    const res = await fetch(`/api/events/tournament/${eventId}/entries/${entryId}/pay`, {
      method: 'POST',
    });
    return asJson<{ payment_url: string | null; transaction_id: string | null }>(res);
  }
```

with:

```typescript
  /** Generate (or re-generate) a Razorpay payment order for an unpaid entry. */
  static async generatePaymentLink(
    eventId: string,
    entryId: string
  ): Promise<{
    transaction_id: string | null;
    razorpay_order_id: string | null;
    razorpay_key_id: string | null;
    amount_paise: number | null;
    customer: { name?: string; email?: string; phone?: string } | null;
  }> {
    const res = await fetch(`/api/events/tournament/${eventId}/entries/${entryId}/pay`, {
      method: 'POST',
    });
    return asJson(res);
  }
```

- [ ] **Step 3: Verify**

Re-read both files; confirm no other code in either file referenced the old narrower shapes in a way that would now break (both are pure widenings — additive optional fields — so nothing should break).

- [ ] **Step 4: Commit**

```bash
git add types/tournament.ts lib/services/events/tournament/tournament-registration-service.ts
git commit -m "feat(events): widen tournament registration types to carry Razorpay order details"
```

---

### Task 8: Wire the guest registration form to the hosted redirect

**Files:**
- Modify: `app/p/tournament/[id]/register/_components/register-form.tsx`

**Interfaces:**
- Consumes: `EventRazorpayHostedRedirect` (Task 4); the widened `public-register` response (Task 6).

- [ ] **Step 1: Add the import and state**

Add near the top imports:

```typescript
import { EventRazorpayHostedRedirect } from '@/components/events/event-razorpay-hosted-redirect';
```

Add a new state variable alongside the existing `useState` calls (after `const [done, setDone] = useState(false);`):

```typescript
  const [rzp, setRzp] = useState<{
    orderId: string;
    keyId: string;
    amountPaise: number;
    customer: { name?: string; email?: string; phone?: string };
  } | null>(null);
```

- [ ] **Step 2: Replace the dead `payment_url` check in `submit()`**

Replace:

```typescript
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(body.error || `Failed (${res.status})`);
      if (body.payment_url) {
        window.location.href = body.payment_url; // go pay
        return;
      }
      setDone(true);
```

with:

```typescript
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(body.error || `Failed (${res.status})`);
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
```

- [ ] **Step 3: Render the redirect and fix the misleading confirmation copy**

Immediately before `if (done) {` add:

```tsx
  if (rzp) {
    return (
      <EventRazorpayHostedRedirect
        eventId={eventId}
        razorpayKeyId={rzp.keyId}
        razorpayOrderId={rzp.orderId}
        amountPaise={rzp.amountPaise}
        currency="INR"
        customer={rzp.customer}
        description="Tournament entry fee"
        cancelPath={`/p/tournament/${eventId}/register`}
      />
    );
  }

```

Then fix the confirmation copy — replace:

```tsx
          {fee > 0 ? 'Your payment is confirmed.' : 'No entry fee for this division.'} See you at the tournament.
```

with:

```tsx
          {fee > 0
            ? 'Your registration is recorded — your payment is being confirmed.'
            : 'No entry fee for this division.'}{' '}
          See you at the tournament.
```

(`done` only becomes `true` today for the `fee > 0` case if the payment step is somehow skipped — which after this change can't happen for a successful order creation, since a truthy order routes to `rzp` instead. `done` is reached directly only for free divisions, or as a fallback if the server responds without order fields; the copy fix is defensive so it's never falsely reassuring either way.)

- [ ] **Step 4: Verify — start the dev server and exercise the guest flow**

```bash
npm run dev
```

Navigate to a tournament's public register page (`/p/tournament/<id>/register`) for a division with `entry_fee > 0` (set one via Task 11 if none exists yet), fill the form as a guest, and submit. Confirm the browser redirects to Razorpay's hosted checkout page (not a JSON error, not the old dead-end). Cancelling on Razorpay should return to the register page.

- [ ] **Step 5: Commit**

```bash
git add "app/p/tournament/[id]/register/_components/register-form.tsx"
git commit -m "fix(events): launch Razorpay hosted checkout from tournament guest registration"
```

---

### Task 9: Wire organizer-side payment flows (add-entry dialog + management page) to the hosted redirect

**Files:**
- Modify: `app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx:318-354`
- Modify: `app/(routes)/events/tournament/[id]/page.tsx` (state near line 308-311, button near line 660, and the component's main render)
- Modify: `hooks/events/use-tournament-registrations.ts:82-93` (`useGeneratePaymentLink`)

**Interfaces:**
- Consumes: `EventRazorpayHostedRedirect` (Task 4); widened `RegisterEntryResult`/`generatePaymentLink` return type (Task 7).

- [ ] **Step 1: `add-entry-dialog.tsx` — add state and import**

Add the import near the top:

```typescript
import { EventRazorpayHostedRedirect } from '@/components/events/event-razorpay-hosted-redirect';
```

Add state near the component's other `useState` calls (this component already has `eventId` in scope as a prop, consumed by `useRegisterEntry(eventId)` — confirm the exact prop name in this file and use it consistently below):

```typescript
  const [rzp, setRzp] = useState<{
    orderId: string;
    keyId: string;
    amountPaise: number;
    customer: { name?: string; email?: string; phone?: string };
  } | null>(null);
```

- [ ] **Step 2: Replace the dead `window.open` in `submit()`**

Replace:

```typescript
    const result = await register.mutateAsync(dto);
    if (result.payment_url) window.open(result.payment_url, '_blank', 'noopener');
    reset();
    onOpenChange(false);
```

with:

```typescript
    const result = await register.mutateAsync(dto);
    if (result.razorpay_order_id && result.razorpay_key_id) {
      setRzp({
        orderId: result.razorpay_order_id,
        keyId: result.razorpay_key_id,
        amountPaise: result.amount_paise ?? 0,
        customer: result.customer ?? {},
      });
      return; // keep the dialog open to show the redirect overlay
    }
    reset();
    onOpenChange(false);
```

- [ ] **Step 3: Render the redirect**

Immediately before the component's `return (` (the line starting `<Dialog open={open} onOpenChange={onOpenChange}>`), add:

```tsx
  if (rzp) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent>
          <EventRazorpayHostedRedirect
            eventId={eventId}
            razorpayKeyId={rzp.keyId}
            razorpayOrderId={rzp.orderId}
            amountPaise={rzp.amountPaise}
            currency="INR"
            customer={rzp.customer}
            description="Tournament entry fee"
            cancelPath={`/events/tournament/${eventId}`}
          />
        </DialogContent>
      </Dialog>
    );
  }

```

(This full-page-redirects the browser away from the management page entirely, same as billing's `RazorpayHostedRedirect` already does for staff-initiated payments — Razorpay's hosted-checkout mandate means there is no "open in a background tab" option anymore.)

- [ ] **Step 4: `use-tournament-registrations.ts` — stop auto-opening the (now nonexistent) URL**

Replace `useGeneratePaymentLink`:

```typescript
export function useGeneratePaymentLink(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => TournamentRegistrationService.generatePaymentLink(eventId, entryId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.entries(eventId) });
      if (res.payment_url) window.open(res.payment_url, '_blank', 'noopener');
      else toast.error('No payment link returned');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create payment link'),
  });
}
```

with:

```typescript
export function useGeneratePaymentLink(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => TournamentRegistrationService.generatePaymentLink(eventId, entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.entries(eventId) });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create payment link'),
  });
}
```

(The redirect decision moves to the caller, since only the caller — the management page — can render the hosted-redirect overlay.)

- [ ] **Step 5: `page.tsx` — wire the "Generate payment link" button**

Add state near the existing `dialogOpen`/`dialogDivision` state (around line 310-311):

```typescript
  const [rzp, setRzp] = useState<{
    orderId: string;
    keyId: string;
    amountPaise: number;
    customer: { name?: string; email?: string; phone?: string };
  } | null>(null);
```

Add the import:

```typescript
import { EventRazorpayHostedRedirect } from '@/components/events/event-razorpay-hosted-redirect';
```

Replace the button's `onClick`:

```typescript
                                  onClick={() => payLink.mutate(e.id)}
```

with:

```typescript
                                  onClick={() =>
                                    payLink.mutateAsync(e.id).then((res) => {
                                      if (res.razorpay_order_id && res.razorpay_key_id) {
                                        setRzp({
                                          orderId: res.razorpay_order_id,
                                          keyId: res.razorpay_key_id,
                                          amountPaise: res.amount_paise ?? 0,
                                          customer: res.customer ?? {},
                                        });
                                      } else {
                                        toast.error('No payment link returned');
                                      }
                                    })
                                  }
```

Add a render guard directly before the component function's final `return (` statement (i.e., before whatever JSX the page normally renders — search for the last top-level `return (` in the component, after any loading/not-found early returns):

```tsx
  if (rzp) {
    return (
      <EventRazorpayHostedRedirect
        eventId={id}
        razorpayKeyId={rzp.keyId}
        razorpayOrderId={rzp.orderId}
        amountPaise={rzp.amountPaise}
        currency="INR"
        customer={rzp.customer}
        description="Tournament entry fee"
        cancelPath={`/events/tournament/${id}`}
      />
    );
  }

```

- [ ] **Step 6: Verify — exercise both organizer paths in the browser**

With the dev server running, open a tournament's management page as an organizer (`sports.tournaments.manage`), add a paid entry via "Add Entry" and confirm the dialog redirects to Razorpay. Separately, create an unpaid entry, click the card icon ("Generate online payment link") on it, and confirm the page redirects to Razorpay. Cancel on Razorpay both times and confirm you land back on `/events/tournament/<id>` with the existing `?payment=` toast (lines 313-323 of `page.tsx`, unchanged) firing correctly.

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx" "app/(routes)/events/tournament/[id]/page.tsx" hooks/events/use-tournament-registrations.ts
git commit -m "fix(events): launch Razorpay hosted checkout from organizer tournament payment flows"
```

---

### Task 10: Host-institution picker on tournament creation

**Files:**
- Modify: `app/(routes)/events/tournament/new/page.tsx`

**Interfaces:**
- Consumes: `useInstitutionsWithAccess()` (`hooks/organization/use-institutions-with-access.ts`).

- [ ] **Step 1: Swap imports**

Replace:

```typescript
import { useCreateTournament } from '@/hooks/events/use-tournaments';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
```

with:

```typescript
import { useEffect, useState } from 'react';
import { useCreateTournament } from '@/hooks/events/use-tournaments';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
```

(This file currently imports `{ useState }` from `'react'` on its own line — merge that import with the new `useEffect` instead of duplicating it; the existing `import { useState } from 'react';` line should become `import { useEffect, useState } from 'react';`.)

- [ ] **Step 2: Replace the institution derivation**

Replace:

```typescript
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId || profile?.institution_id || '';
  const createMutation = useCreateTournament();
```

with:

```typescript
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const [institutionId, setInstitutionId] = useState('');
  const createMutation = useCreateTournament();

  // Convenience default: pre-select the first accessible institution, but the
  // picker stays visible and editable — explicit per the product decision.
  useEffect(() => {
    if (!institutionId && institutions.length > 0) {
      setInstitutionId(institutions[0].id);
    }
  }, [institutions, institutionId]);
```

- [ ] **Step 3: Add the picker UI**

Immediately before the "Name" field block (`{/* Name */}`), add:

```tsx
              {/* Host Institution */}
              <div className="space-y-2">
                <Label htmlFor="host_institution">
                  Host Institution <span className="text-destructive">*</span>
                </Label>
                <Select value={institutionId} onValueChange={setInstitutionId}>
                  <SelectTrigger id="host_institution">
                    <SelectValue
                      placeholder={institutionsLoading ? 'Loading institutions…' : 'Select host institution'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Registration fees for this tournament settle into this institution&apos;s payment account.
                </p>
              </div>

```

- [ ] **Step 4: Verify**

Re-read the file. Confirm `useAuth`/`useUserInstitutionAccess` are no longer imported or referenced anywhere else in the file (they were only used for the old derivation), the submit button's `disabled={... || !institutionId}` and the "No institution selected" warning below the form still work unchanged (they already reference the `institutionId` variable name, now sourced from the new state).

- [ ] **Step 5: Verify in browser**

With the dev server running, open `/events/tournament/new` and confirm a "Host Institution" dropdown appears above "Tournament Name", pre-populated if you have institution access, and that changing it changes which institution the created tournament belongs to (check the row in the tournaments list afterward, or query `events.institution_id` for the new row).

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/events/tournament/new/page.tsx"
git commit -m "feat(events): add explicit host-institution picker to tournament creation"
```

---

### Task 11: Division entry-fee editor (create + edit)

**Files:**
- Modify: `app/(routes)/events/tournament/new/page.tsx`
- Modify: `app/(routes)/events/tournament/_components/edit-tournament-dialog.tsx`

**Interfaces:**
- Consumes: `CreateDivisionDto.config` / `UpdateDivisionDto.config` (already typed as `Record<string, unknown>` in `types/tournament.ts` — no type change needed).

- [ ] **Step 1: `new/page.tsx` — add the fee field to form state**

In the `form` state object, add `entry_fee: ''` alongside the other division fields (next to `age_band: ''`):

```typescript
    age_band: '',
    entry_fee: '',
```

Add the input to the "Gender + Age band" grid — change that block's grid from 2 columns to include a third field, or add a new row immediately after it:

```tsx
              <div className="space-y-2">
                <Label htmlFor="entry_fee">Entry Fee (₹, optional)</Label>
                <Input
                  id="entry_fee"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0 = free entry"
                  value={form.entry_fee}
                  onChange={(e) => update('entry_fee', e.target.value)}
                />
              </div>
```

(Place this as its own `<div className="space-y-2">...</div>` row, after the "Age Band" grid and before "Dates".)

- [ ] **Step 2: `new/page.tsx` — pass it into the seeded division's `config`**

In `handleSubmit`, the seeded division object currently is:

```typescript
        divisions: [
          {
            sport: form.sport,
            gender: form.gender,
            age_band: form.age_band.trim() || undefined,
            format: form.format,
            level: form.level,
            sort_order: 0,
          },
        ],
```

Change to:

```typescript
        divisions: [
          {
            sport: form.sport,
            gender: form.gender,
            age_band: form.age_band.trim() || undefined,
            format: form.format,
            level: form.level,
            sort_order: 0,
            config: form.entry_fee ? { entry_fee: Number(form.entry_fee) } : undefined,
          },
        ],
```

- [ ] **Step 3: `edit-tournament-dialog.tsx` — add the fee field to `DivisionFields`**

Change the `DivisionFields` function signature from:

```typescript
function DivisionFields({
  division,
  edits,
  onEdit,
}: {
  division: TournamentDivision;
  edits: UpdateDivisionDto;
  onEdit: (field: keyof UpdateDivisionDto, value: string) => void;
}) {
```

to:

```typescript
function DivisionFields({
  division,
  edits,
  onEdit,
  onEditConfig,
}: {
  division: TournamentDivision;
  edits: UpdateDivisionDto;
  onEdit: (field: keyof UpdateDivisionDto, value: string) => void;
  onEditConfig: (patch: Record<string, unknown>) => void;
}) {
```

Add, right after the `sportOptions` computation:

```typescript
  const currentFee = Number(
    ((edits.config ?? division.config) as { entry_fee?: number } | undefined)?.entry_fee ?? 0
  );
```

Add this block at the end of the function's returned JSX, after the "Age Band" field's closing `</div>`:

```tsx
      <div className="space-y-1.5">
        <Label htmlFor="t-entry-fee">Entry Fee (₹)</Label>
        <Input
          id="t-entry-fee"
          type="number"
          min="0"
          step="1"
          value={currentFee || ''}
          onChange={(e) =>
            onEditConfig({
              ...(division.config as Record<string, unknown>),
              entry_fee: e.target.value ? Number(e.target.value) : 0,
            })
          }
          placeholder="0 = free"
        />
      </div>
```

- [ ] **Step 4: `edit-tournament-dialog.tsx` — thread `onEditConfig` from `EditTournamentForm`**

In `EditTournamentForm`, right after `const setDivision = ...`, add:

```typescript
  const setDivisionConfig = (patch: Record<string, unknown>) =>
    setDivisionEdits((prev) => ({ ...prev, config: patch }));
```

Change the `<DivisionFields ... />` call to pass the new prop:

```tsx
            <DivisionFields
              division={selectedDivision}
              edits={divisionEdits}
              onEdit={setDivision}
              onEditConfig={setDivisionConfig}
            />
```

- [ ] **Step 5: Verify**

Re-read both files. Confirm `config` flows through `UpdateDivisionDto` unchanged (no type edits needed — it's already `Record<string, unknown>`), and that `updateDivision.mutateAsync({ dto: { ...divisionEdits, ... } })` (already in the file, unchanged) will include `config` whenever `onEditConfig` was called.

- [ ] **Step 6: Verify in browser**

Create a tournament with a nonzero entry fee via `/events/tournament/new` — confirm after creation (query `tournament_divisions.config` or check the public register page's "Entry fee ₹N" text) that the fee was saved. Then edit an existing division via the Edit Tournament dialog, change the fee, save, and confirm the new value persists (re-open the dialog).

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/events/tournament/new/page.tsx" "app/(routes)/events/tournament/_components/edit-tournament-dialog.tsx"
git commit -m "feat(events): add division entry-fee editor to tournament create and edit forms"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1-3 cover spec §5.6 points 1 (feeHead threading), and the callback/webhook fix (points 3-4). Task 4 covers point 2 (hosted redirect component). Task 5 covers point 3. Task 6-9 cover wiring all three payment-initiating surfaces + both consumer UIs. Task 10 covers §5.1 (host institution picker). Task 11 covers §5.2 (division fee editor). Point 5 of §5.6 (dead HDFC cleanup) is intentionally narrowed to the unreachable branch inside `initiatePayment` only — `handleCallback`/`HDFCEventClient` are explicitly preserved per this plan's Global Constraints (marathon out of scope), which is a deliberate, documented refinement of the design spec's broader wording.
- **Placeholder scan:** no TBD/TODO; every step shows complete code.
- **Type consistency:** `RegisterEntryResult` (Task 7) matches exactly what Task 6's `entries/route.ts` response returns; `generatePaymentLink`'s widened return type (Task 7) matches Task 6's `pay/route.ts` response; `EventRazorpayHostedRedirect`'s props (Task 4) are used identically across Tasks 8 and 9.
- **Out of scope, deliberately:** the dynamic form builder, the MyJKKN-vs-guest audience split, the QR code, and the Payments tab are Plans 2-4 — none of this plan's tasks depend on them, and none of them depend on this plan beyond "payment now works," which each will assume.
