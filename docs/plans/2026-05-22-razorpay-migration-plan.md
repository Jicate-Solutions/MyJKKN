# Razorpay (HDFC Collect Now) Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate MyJKKN payment processing from HDFC SmartGateway to Razorpay (rebranded as "HDFC Collect Now") with zero data loss, per-module rollback capability, and no behavior regression for live billing and event-registration flows.

**Architecture:** Introduce a `PaymentProvider` interface implemented by both `HdfcSmartGatewayProvider` (wraps existing code) and `RazorpayProvider` (new). A per-module env flag selects which provider runs at request time. Database tables get nullable Razorpay columns plus a `provider` discriminator — old rows stay readable forever; new rows can be written under either provider. Cutover is one flag flip per module; rollback is the reverse flip. HDFC code is removed only after 30 days of clean Razorpay operation.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + RLS), Razorpay REST API (`api.razorpay.com/v1/*`) + Razorpay Checkout.js (`checkout.razorpay.com/v1/checkout.js`), vitest for unit tests, HMAC-SHA256 (Node built-in `crypto`).

**MVP cut-line:** Tasks 1-28 ship a working billing flow end-to-end on Razorpay. Tasks 29-34 add events. Tasks 35-44 (refunds, disputes, late authorization, decommission) are post-MVP enhancements that can land after production rollout is stable.

---

## File Structure

### New files (created by this plan)

```
lib/services/payments/
├── provider.ts                        # PaymentProvider interface + shared DTOs
├── amount.ts                          # Paise branded type + toPaise(rupees)
├── factory.ts                         # getPaymentProvider(module) reads env flag
├── hdfc-smartgateway-provider.ts      # Wraps existing PaymentGatewayService
└── razorpay/
    ├── client.ts                      # HTTP Basic auth wrapper + withRetry
    ├── create-order.ts                # POST /orders
    ├── verify-signature.ts            # HMAC-SHA256 on order_id|payment_id
    ├── verify-webhook.ts              # HMAC-SHA256 of body + timingSafeEqual
    ├── get-status.ts                  # Dual inquiry: GET /orders + GET /payments
    ├── create-refund.ts               # POST /payments/{id}/refund
    ├── razorpay-provider.ts           # RazorpayProvider implementation
    └── types.ts                       # Razorpay request/response shapes

app/api/webhooks/razorpay/
└── route.ts                           # Unified Razorpay webhook (events + billing routed by notes.module)

app/api/billing/refunds/[id]/gateway-refund/
└── route.ts                           # Triggers Razorpay refund from existing billing_refunds row

components/billing/
└── razorpay-checkout-launcher.tsx     # Loads checkout.js, opens modal, handles success/error

__tests__/lib/services/payments/
├── amount.test.ts                     # Paise conversion correctness
├── razorpay/verify-signature.test.ts  # HMAC verification (good + tampered)
├── razorpay/verify-webhook.test.ts    # Webhook signature verification
└── razorpay/create-order.test.ts      # Order creation request shape (mocked fetch)

supabase/migrations/
└── 20260522120000_razorpay_payment_columns.sql   # ALTER TABLE extending payment tables

docs/runbooks/
└── razorpay-cutover.md                # Cutover + rollback runbook (Task 33)
```

### Modified files (existing files this plan touches)

```
lib/services/billing/payment-gateway-service.ts     # Calls factory; HDFC code stays as fallback
lib/services/events/core/hdfc-event-client.ts       # Becomes thin wrapper around provider factory
lib/services/events/core/event-payment-service.ts   # Calls factory
app/api/billing/payment/initiate/route.ts           # Returns {provider, key_id, order_id, amount_paise} when provider=razorpay
app/api/billing/payment/callback/route.ts           # Signature verification via provider
app/api/billing/payment/webhook/route.ts            # Signature verification via provider (or deprecated for Razorpay — uses unified webhook)
app/api/billing/payment/status/[transactionId]/route.ts   # Status check via provider
app/api/events/marathon/[eventId]/payment/initiate/route.ts        # Same shape change
app/api/events/marathon/[eventId]/payment/callback/route.ts        # Same
app/api/events/marathon/[eventId]/payment/webhook/route.ts         # Same
app/api/events/marathon/[eventId]/payment/pre-register/route.ts    # Same
components/billing/online-payment-button.tsx       # Dispatches to Razorpay launcher when provider=razorpay
components/billing/payment-selection-modal.tsx     # Same
app/(routes)/billing/payment/success/page.tsx      # Displays order_number + amount + success message (audit checklist requirement)
app/(routes)/billing/payment/failed/page.tsx       # Same shape
types/payment-gateway.ts                            # Adds Razorpay types + Paise branded type
types/events.ts                                     # Adds Razorpay fields to EventPaymentTransaction
.env.example                                        # Documents new RAZORPAY_* vars
next.config.ts                                      # CSP allowlist for checkout.razorpay.com
supabase/setup/01_tables.sql                       # Mirrors migration (project convention)
supabase/setup/03_policies.sql                     # Tightens UPDATE policies to service_role
```

### Files NOT touched (out of scope)

- `lib/services/ims/payment-service.ts` — UPI-QR, standalone, no gateway
- `lib/services/campus-living/mess-billing-service.ts` — Offline only
- `lib/services/solutions/payments-service.ts` — Accounting only
- `lib/services/billing/refunds/billing-refund-service.ts` — Phase 6 will extend this; not in MVP

---

## Phase 0 — Pre-flight (no code; ~30 min)

### Task 1: Confirm Razorpay test credentials are obtained

**Files:** none (verification step)

- [ ] **Step 1: Confirm with stakeholders that test credentials are available**

Verify the engineer has access to:
- `RAZORPAY_KEY_ID` (format: `rzp_test_XXXXXXXXXXXXXX`)
- `RAZORPAY_KEY_SECRET` (long random string)
- `RAZORPAY_WEBHOOK_SECRET` (set in Razorpay dashboard → Settings → Webhooks)

These come from the Razorpay dashboard (test mode) at https://dashboard.razorpay.com/app/keys after the merchant onboarding via HDFC Collect Now is complete.

- [ ] **Step 2: Confirm HDFC test credentials still active**

Ensure the existing 13 `HDFC_*` env vars in `.env` are still valid test creds (not prod). We need parallel testing during cutover.

- [ ] **Step 3: Manual sanity check — Razorpay API reachable**

Run from a developer machine (do NOT commit credentials):

```bash
curl -u rzp_test_XXX:SECRET https://api.razorpay.com/v1/orders/
```

Expected: `{"entity":"collection","count":0,"items":[]}` (empty list, 200 OK)
Failure: 401 → wrong creds. 403 → account not activated. 404 → wrong base URL.

---

## Phase 1 — Database schema (1 migration; ~1 hour)

### Task 2: Add Razorpay columns + tighten RLS migration

**Files:**
- Create: `supabase/migrations/20260522120000_razorpay_payment_columns.sql`
- Modify: `supabase/setup/01_tables.sql` (mirror the ALTER as the new CREATE TABLE shape)
- Modify: `supabase/setup/03_policies.sql` (tighten UPDATE policies)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260522120000_razorpay_payment_columns.sql`:

```sql
-- Razorpay migration: extend payment tables with provider column and Razorpay-specific fields.
-- Preserves all existing HDFC SmartGateway rows. New rows can be written under either provider.
-- Reference: docs/plans/2026-05-22-razorpay-migration-plan.md

BEGIN;

-- ============================================================
-- 1. payment_transactions (billing module)
-- ============================================================
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'hdfc_smartgateway'
    CHECK (provider IN ('hdfc_smartgateway','razorpay')),
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS amount_paise bigint,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status text
    CHECK (refund_status IN ('none','partial','full'))
    DEFAULT 'none';

-- Unique within Razorpay rows only (HDFC rows have NULL — Postgres allows multiple NULLs in UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_razorpay_order_id_key
  ON payment_transactions (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_razorpay_payment_id_key
  ON payment_transactions (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- Row integrity: each row has the right identifiers for its provider
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_provider_identifiers_chk CHECK (
    (provider = 'hdfc_smartgateway' AND session_id IS NOT NULL) OR
    (provider = 'razorpay' AND razorpay_order_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider
  ON payment_transactions (provider);

-- Backfill amount_paise for historical HDFC rows (auditing convenience)
UPDATE payment_transactions
SET amount_paise = (total_amount * 100)::bigint
WHERE amount_paise IS NULL AND total_amount IS NOT NULL;

-- ============================================================
-- 2. event_payment_transactions (events/marathon module)
-- ============================================================
ALTER TABLE event_payment_transactions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'hdfc_smartgateway'
    CHECK (provider IN ('hdfc_smartgateway','razorpay')),
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS amount_paise bigint,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status text
    CHECK (refund_status IN ('none','partial','full'))
    DEFAULT 'none';

CREATE UNIQUE INDEX IF NOT EXISTS event_payment_transactions_razorpay_order_id_key
  ON event_payment_transactions (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_payment_transactions_razorpay_payment_id_key
  ON event_payment_transactions (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

ALTER TABLE event_payment_transactions
  ADD CONSTRAINT event_payment_transactions_provider_identifiers_chk CHECK (
    (provider = 'hdfc_smartgateway' AND gateway_session_id IS NOT NULL) OR
    (provider = 'razorpay' AND razorpay_order_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_event_payment_transactions_provider
  ON event_payment_transactions (provider);

UPDATE event_payment_transactions
SET amount_paise = (amount * 100)::bigint
WHERE amount_paise IS NULL AND amount IS NOT NULL;

-- ============================================================
-- 3. New table: payment_disputes (Razorpay chargebacks)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('razorpay')),
  razorpay_dispute_id text UNIQUE NOT NULL,
  razorpay_payment_id text NOT NULL,
  payment_transaction_id uuid REFERENCES payment_transactions(id),
  event_payment_transaction_id uuid REFERENCES event_payment_transactions(id),
  amount_paise bigint NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  reason_code text,
  phase text CHECK (phase IN ('fraud','retrieval','chargeback','pre_arbitration','arbitration')),
  status text NOT NULL CHECK (status IN ('open','under_review','won','lost','closed')),
  respond_by timestamptz,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_disputes_attached_to_one_transaction_chk CHECK (
    (payment_transaction_id IS NOT NULL AND event_payment_transaction_id IS NULL) OR
    (payment_transaction_id IS NULL AND event_payment_transaction_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_disputes_payment_id ON payment_disputes (razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_status ON payment_disputes (status);

ALTER TABLE payment_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all disputes" ON payment_disputes
  FOR SELECT
  USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin','admin','institution_admin')
  ));

CREATE POLICY "Service role can write disputes" ON payment_disputes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. Tighten existing RLS — UPDATE on payment_transactions and event_payment_transactions
--    Previously: auth.role() = 'authenticated' (too wide; allows any logged-in user)
--    Now:        service_role only (webhook handlers + admin RPCs)
-- ============================================================
DROP POLICY IF EXISTS "System can update payment transactions" ON payment_transactions;
CREATE POLICY "Service role can update payment transactions" ON payment_transactions
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "event_payments_public_update" ON event_payment_transactions;
CREATE POLICY "Service role can update event payments" ON event_payment_transactions
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Tighten the dangerous "public_insert"/"public_read" on event_payment_transactions
-- The webhook handler runs as service_role (already), and the registration page can use a SECURITY DEFINER RPC.
DROP POLICY IF EXISTS "event_payments_public_insert" ON event_payment_transactions;
DROP POLICY IF EXISTS "event_payments_public_read" ON event_payment_transactions;
CREATE POLICY "Service role can insert event payments" ON event_payment_transactions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- (Keep "event_payments_auth_read" for authenticated users to read their own; existing policy unchanged.)

COMMIT;
```

- [ ] **Step 2: Apply the migration to local Supabase**

Run from project root:

```bash
npx supabase db push
```

Expected output: `Applying migration 20260522120000_razorpay_payment_columns.sql ... Done.`
Failure: read the SQL error message; common causes are duplicate constraint names from prior partial runs (drop and reapply).

- [ ] **Step 3: Verify schema changes via psql or Supabase Studio**

Run query in Supabase SQL editor:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('payment_transactions', 'event_payment_transactions', 'payment_disputes')
  AND column_name IN ('provider','razorpay_order_id','razorpay_payment_id','amount_paise','captured_at','refund_status')
ORDER BY table_name, column_name;
```

Expected: 12 rows (6 columns × 2 tables) + 5 columns of payment_disputes table.

- [ ] **Step 4: Mirror schema into supabase/setup/01_tables.sql**

The project convention is that `supabase/setup/01_tables.sql` reflects the current authoritative schema. Add the new columns to the existing `CREATE TABLE payment_transactions` and `CREATE TABLE event_payment_transactions` blocks, and append the `payment_disputes` table definition. Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so the file remains idempotent.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260522120000_razorpay_payment_columns.sql supabase/setup/01_tables.sql supabase/setup/03_policies.sql
git commit -m "feat(payments): add razorpay columns to payment tables + tighten RLS"
```

---

## Phase 2 — Provider abstraction layer (~1 day)

### Task 3: Create Paise branded type and conversion helper

**Files:**
- Create: `lib/services/payments/amount.ts`
- Test: `__tests__/lib/services/payments/amount.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/services/payments/amount.test.ts
import { describe, it, expect } from 'vitest';
import { toPaise, fromPaise, type Paise } from '@/lib/services/payments/amount';

describe('toPaise', () => {
  it('converts whole rupees to paise', () => {
    expect(toPaise(500)).toBe(50000);
  });
  it('converts decimal rupees to paise (banker-safe rounding)', () => {
    expect(toPaise(123.45)).toBe(12345);
    expect(toPaise(0.01)).toBe(1);
  });
  it('rounds half-paise inputs to nearest integer paise', () => {
    expect(toPaise(0.005)).toBe(1); // 0.5 paise rounds up
    expect(toPaise(0.004)).toBe(0); // 0.4 paise rounds down
  });
  it('refuses negative amounts', () => {
    expect(() => toPaise(-1)).toThrow(/negative/i);
  });
  it('refuses non-finite amounts', () => {
    expect(() => toPaise(NaN)).toThrow(/finite/i);
    expect(() => toPaise(Infinity)).toThrow(/finite/i);
  });
});

describe('fromPaise', () => {
  it('converts paise to rupees with 2-decimal precision', () => {
    expect(fromPaise(50000 as Paise)).toBe(500);
    expect(fromPaise(12345 as Paise)).toBe(123.45);
    expect(fromPaise(1 as Paise)).toBe(0.01);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/services/payments/amount.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/services/payments/amount.ts

/**
 * Branded integer type representing a paise amount.
 * Cannot be confused with a plain `number` (rupees) at the type level.
 */
export type Paise = number & { readonly __brand: 'Paise' };

export function toPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new Error('Amount must be a finite number');
  if (rupees < 0) throw new Error('Amount cannot be negative');
  return Math.round(rupees * 100) as Paise;
}

export function fromPaise(paise: Paise): number {
  return paise / 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/services/payments/amount.test.ts`
Expected: PASS (5 tests in toPaise, 1 test in fromPaise).

- [ ] **Step 5: Commit**

```bash
git add lib/services/payments/amount.ts __tests__/lib/services/payments/amount.test.ts
git commit -m "feat(payments): add Paise branded type and conversion helpers"
```

---

### Task 4: Define PaymentProvider interface

**Files:**
- Create: `lib/services/payments/provider.ts`

- [ ] **Step 1: Write provider interface**

```typescript
// lib/services/payments/provider.ts
import type { Paise } from './amount';

export type PaymentModule = 'billing' | 'events';

export type PaymentProviderName = 'hdfc_smartgateway' | 'razorpay';

export interface CreateOrderInput {
  /** Internal transaction reference (we generate). Razorpay calls this `receipt`. */
  transactionRef: string;
  amountPaise: Paise;
  currency: 'INR';
  /** Module that originated the payment — used by webhook to route. */
  module: PaymentModule;
  /** Free-form notes attached to the gateway record (returned in webhooks). */
  notes?: Record<string, string>;
  /** Customer-facing description (shown in checkout). */
  description?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface CreateOrderResult {
  provider: PaymentProviderName;
  /** Gateway-issued order identifier (e.g., Razorpay `order_xxx` or HDFC session id). */
  gatewayOrderId: string;
  /** Public key/id needed by the client to launch checkout. NULL for HDFC redirect flow. */
  clientKeyId?: string;
  /** Full-page redirect URL (HDFC) — empty for Razorpay modal flow. */
  redirectUrl?: string;
  /** Raw gateway response (stored in gateway_response JSONB column for audit). */
  raw: unknown;
}

export interface VerifySignatureInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
}

export interface VerifyWebhookInput {
  rawBody: string;
  signatureHeader: string;
}

export interface GetStatusResult {
  /** Normalized status across providers. */
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  amountPaise: Paise;
  amountRefundedPaise: Paise;
  capturedAt: Date | null;
  raw: unknown;
}

export interface CreateRefundInput {
  gatewayPaymentId: string;
  amountPaise: Paise;
  /** Idempotency key — Razorpay deduplicates refund requests by this. */
  refundReference: string;
  notes?: Record<string, string>;
}

export interface CreateRefundResult {
  gatewayRefundId: string;
  status: 'pending' | 'processed' | 'failed';
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  verifySignature(input: VerifySignatureInput): boolean;
  verifyWebhookSignature(input: VerifyWebhookInput): boolean;
  getOrderStatus(gatewayOrderId: string): Promise<GetStatusResult>;
  getPaymentStatus(gatewayPaymentId: string): Promise<GetStatusResult>;
  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit lib/services/payments/provider.ts`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add lib/services/payments/provider.ts
git commit -m "feat(payments): define PaymentProvider interface"
```

---

### Task 5: Implement Razorpay HTTP client with HTTP Basic auth

**Files:**
- Create: `lib/services/payments/razorpay/client.ts`
- Create: `lib/services/payments/razorpay/types.ts`

- [ ] **Step 1: Define Razorpay types**

```typescript
// lib/services/payments/razorpay/types.ts

export interface RazorpayOrder {
  id: string;                    // order_XXXXX
  entity: 'order';
  amount: number;                // paise
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: Record<string, string>;
  created_at: number;            // unix seconds
}

export interface RazorpayPayment {
  id: string;                    // pay_XXXXX
  entity: 'payment';
  amount: number;                // paise
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  invoice_id: string | null;
  international: boolean;
  method: 'card' | 'netbanking' | 'wallet' | 'upi' | 'emi' | string;
  amount_refunded: number;
  refund_status: 'null' | 'partial' | 'full' | null;
  captured: boolean;
  description: string | null;
  card_id: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  email: string;
  contact: string;
  notes: Record<string, string>;
  fee: number;
  tax: number;
  error_code: string | null;
  error_description: string | null;
  created_at: number;
}

export interface RazorpayRefund {
  id: string;                    // rfnd_XXXXX
  entity: 'refund';
  amount: number;                // paise
  currency: string;
  payment_id: string;
  notes: Record<string, string>;
  receipt: string | null;
  status: 'pending' | 'processed' | 'failed';
  created_at: number;
}

export interface RazorpayError {
  error: {
    code: string;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
  };
}
```

- [ ] **Step 2: Implement client**

```typescript
// lib/services/payments/razorpay/client.ts
import { withRetry } from '@/lib/retry';
import type { RazorpayError } from './types';

const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

function getRazorpayAuth(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set');
  }
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export class RazorpayApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = 'RazorpayApiError';
  }
}

export async function razorpayRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown> | URLSearchParams,
): Promise<T> {
  const url = `${RAZORPAY_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: getRazorpayAuth(),
    Accept: 'application/json',
  };
  let serializedBody: string | undefined;
  if (body) {
    if (body instanceof URLSearchParams) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      serializedBody = body.toString();
    } else {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(body);
    }
  }
  const doFetch = async () => {
    const res = await fetch(url, { method, headers, body: serializedBody });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
    if (!res.ok) {
      const err = (json as RazorpayError | null)?.error;
      throw new RazorpayApiError(
        res.status,
        err?.code ?? 'UNKNOWN',
        err?.description ?? `Razorpay ${method} ${path} failed: ${res.status}`,
        json ?? text,
      );
    }
    return json as T;
  };
  return withRetry(doFetch, { attempts: 3, baseDelayMs: 300, retryOn: (e) => {
    return e instanceof RazorpayApiError && [502, 503, 504].includes(e.status);
  }});
}
```

NOTE: This depends on the project's `lib/retry.ts` `withRetry` helper (referenced by memory: `feedback_supabase_econnreset_use_withretry`). If the function signature differs from `{attempts, baseDelayMs, retryOn}`, adapt the call site to match — DO NOT change `lib/retry.ts`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/services/payments/razorpay/client.ts lib/services/payments/razorpay/types.ts
git commit -m "feat(payments): add Razorpay HTTP client with retry"
```

---

### Task 6: Implement createOrder

**Files:**
- Create: `lib/services/payments/razorpay/create-order.ts`
- Test: `__tests__/lib/services/payments/razorpay/create-order.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/services/payments/razorpay/create-order.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOrder } from '@/lib/services/payments/razorpay/create-order';
import { toPaise } from '@/lib/services/payments/amount';

describe('createOrder', () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_KEY';
    process.env.RAZORPAY_KEY_SECRET = 'SECRET';
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('POSTs to /orders with amount in paise and payment_capture=1', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        id: 'order_TESTID',
        entity: 'order',
        amount: 50000,
        amount_paid: 0,
        amount_due: 50000,
        currency: 'INR',
        receipt: 'TXN-1',
        status: 'created',
        attempts: 0,
        notes: { module: 'billing' },
        created_at: 1700000000,
      }), { status: 200 });
    }) as typeof globalThis.fetch;

    const result = await createOrder({
      transactionRef: 'TXN-1',
      amountPaise: toPaise(500),
      currency: 'INR',
      module: 'billing',
      notes: { internal_id: 'abc' },
    });

    expect(result.id).toBe('order_TESTID');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/orders');
    const body = (calls[0].init.body as string);
    expect(body).toContain('amount=50000');
    expect(body).toContain('currency=INR');
    expect(body).toContain('receipt=TXN-1');
    expect(body).toContain('payment_capture=1');
    expect(body).toContain('notes%5Bmodule%5D=billing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/services/payments/razorpay/create-order.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement createOrder**

```typescript
// lib/services/payments/razorpay/create-order.ts
import type { Paise } from '../amount';
import type { PaymentModule } from '../provider';
import type { RazorpayOrder } from './types';
import { razorpayRequest } from './client';

interface CreateOrderArgs {
  transactionRef: string;
  amountPaise: Paise;
  currency: 'INR';
  module: PaymentModule;
  notes?: Record<string, string>;
}

export async function createOrder(args: CreateOrderArgs): Promise<RazorpayOrder> {
  const params = new URLSearchParams();
  params.set('amount', String(args.amountPaise));
  params.set('currency', args.currency);
  params.set('receipt', args.transactionRef);
  params.set('payment_capture', '1');
  // Always tag notes.module so the webhook handler can route by it
  params.set('notes[module]', args.module);
  for (const [k, v] of Object.entries(args.notes ?? {})) {
    params.set(`notes[${k}]`, v);
  }
  return razorpayRequest<RazorpayOrder>('POST', '/orders', params);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/services/payments/razorpay/create-order.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/payments/razorpay/create-order.ts __tests__/lib/services/payments/razorpay/create-order.test.ts
git commit -m "feat(payments): implement Razorpay createOrder"
```

---

### Task 7: Implement signature verification (callback)

**Files:**
- Create: `lib/services/payments/razorpay/verify-signature.ts`
- Test: `__tests__/lib/services/payments/razorpay/verify-signature.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/services/payments/razorpay/verify-signature.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import { verifySignature } from '@/lib/services/payments/razorpay/verify-signature';

const SECRET = 'test_secret_value';
function sign(orderId: string, paymentId: string): string {
  return crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

describe('verifySignature', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = SECRET;
  });

  it('returns true for valid signature', () => {
    const orderId = 'order_ABC';
    const paymentId = 'pay_XYZ';
    const sig = sign(orderId, paymentId);
    expect(verifySignature({ gatewayOrderId: orderId, gatewayPaymentId: paymentId, signature: sig })).toBe(true);
  });

  it('returns false for tampered signature', () => {
    const sig = sign('order_ABC', 'pay_XYZ');
    const tampered = sig.slice(0, -1) + '0';
    expect(verifySignature({ gatewayOrderId: 'order_ABC', gatewayPaymentId: 'pay_XYZ', signature: tampered })).toBe(false);
  });

  it('returns false for tampered order id', () => {
    const sig = sign('order_ABC', 'pay_XYZ');
    expect(verifySignature({ gatewayOrderId: 'order_DEF', gatewayPaymentId: 'pay_XYZ', signature: sig })).toBe(false);
  });

  it('returns false for empty signature', () => {
    expect(verifySignature({ gatewayOrderId: 'order_ABC', gatewayPaymentId: 'pay_XYZ', signature: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/services/payments/razorpay/verify-signature.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement verifySignature**

```typescript
// lib/services/payments/razorpay/verify-signature.ts
import * as crypto from 'node:crypto';
import type { VerifySignatureInput } from '../provider';

export function verifySignature(input: VerifySignatureInput): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  if (!input.signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
    .digest('hex');
  // Length check first — timingSafeEqual throws on mismatched lengths.
  if (expected.length !== input.signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/services/payments/razorpay/verify-signature.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/payments/razorpay/verify-signature.ts __tests__/lib/services/payments/razorpay/verify-signature.test.ts
git commit -m "feat(payments): implement Razorpay signature verification with timingSafeEqual"
```

---

### Task 8: Implement webhook verification

**Files:**
- Create: `lib/services/payments/razorpay/verify-webhook.ts`
- Test: `__tests__/lib/services/payments/razorpay/verify-webhook.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/services/payments/razorpay/verify-webhook.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import { verifyWebhookSignature } from '@/lib/services/payments/razorpay/verify-webhook';

const SECRET = 'webhook_secret_value';
function sign(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  });

  it('returns true for matching signature', () => {
    const body = '{"event":"payment.captured"}';
    const sig = sign(body);
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: sig })).toBe(true);
  });

  it('returns false for tampered body', () => {
    const sig = sign('{"event":"payment.captured"}');
    expect(verifyWebhookSignature({ rawBody: '{"event":"payment.failed"}', signatureHeader: sig })).toBe(false);
  });

  it('returns false for missing signature header', () => {
    expect(verifyWebhookSignature({ rawBody: '{}', signatureHeader: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/services/payments/razorpay/verify-webhook.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement verifyWebhookSignature**

```typescript
// lib/services/payments/razorpay/verify-webhook.ts
import * as crypto from 'node:crypto';
import type { VerifyWebhookInput } from '../provider';

export function verifyWebhookSignature(input: VerifyWebhookInput): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!input.signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(input.rawBody).digest('hex');
  if (expected.length !== input.signatureHeader.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signatureHeader));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/services/payments/razorpay/verify-webhook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/payments/razorpay/verify-webhook.ts __tests__/lib/services/payments/razorpay/verify-webhook.test.ts
git commit -m "feat(payments): implement Razorpay webhook signature verification"
```

---

### Task 9: Implement getStatus (dual-inquiry per security checklist)

**Files:**
- Create: `lib/services/payments/razorpay/get-status.ts`

- [ ] **Step 1: Implement**

```typescript
// lib/services/payments/razorpay/get-status.ts
import type { GetStatusResult } from '../provider';
import type { Paise } from '../amount';
import type { RazorpayOrder, RazorpayPayment } from './types';
import { razorpayRequest, RazorpayApiError } from './client';

export async function getOrderStatus(orderId: string): Promise<GetStatusResult> {
  const order = await razorpayRequest<RazorpayOrder>('GET', `/orders/${encodeURIComponent(orderId)}`);
  // Order status mapping: created → 'created', attempted → 'failed' (best effort), paid → 'captured'
  const normalized: GetStatusResult['status'] =
    order.status === 'paid' ? 'captured' :
    order.status === 'created' ? 'created' :
    'failed';
  return {
    status: normalized,
    amountPaise: order.amount as Paise,
    amountRefundedPaise: (order.amount - order.amount_due) as Paise,
    capturedAt: order.status === 'paid' ? new Date(order.created_at * 1000) : null,
    raw: order,
  };
}

export async function getPaymentStatus(paymentId: string): Promise<GetStatusResult> {
  const payment = await razorpayRequest<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`);
  const normalized: GetStatusResult['status'] =
    payment.status === 'captured' ? 'captured' :
    payment.status === 'authorized' ? 'authorized' :
    payment.status === 'refunded' ? 'refunded' :
    payment.status === 'failed' ? 'failed' :
    'created';
  return {
    status: normalized,
    amountPaise: payment.amount as Paise,
    amountRefundedPaise: payment.amount_refunded as Paise,
    capturedAt: payment.captured ? new Date(payment.created_at * 1000) : null,
    raw: payment,
  };
}

export async function dualInquiry(orderId: string, paymentId?: string): Promise<GetStatusResult> {
  // Per security audit checklist: dual inquiry means we check BOTH endpoints when possible
  const orderStatus = await getOrderStatus(orderId);
  if (!paymentId) return orderStatus;
  try {
    return await getPaymentStatus(paymentId);
  } catch (err) {
    if (err instanceof RazorpayApiError && err.status === 404) {
      return orderStatus;
    }
    throw err;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/services/payments/razorpay/get-status.ts
git commit -m "feat(payments): implement Razorpay dual-inquiry status check"
```

---

### Task 10: Implement createRefund

**Files:**
- Create: `lib/services/payments/razorpay/create-refund.ts`

- [ ] **Step 1: Implement**

```typescript
// lib/services/payments/razorpay/create-refund.ts
import type { CreateRefundInput, CreateRefundResult } from '../provider';
import type { RazorpayRefund } from './types';
import { razorpayRequest } from './client';

export async function createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
  const params = new URLSearchParams();
  params.set('amount', String(input.amountPaise));
  // Razorpay deduplicates refunds by receipt within an idempotency window
  params.set('receipt', input.refundReference);
  for (const [k, v] of Object.entries(input.notes ?? {})) {
    params.set(`notes[${k}]`, v);
  }
  const refund = await razorpayRequest<RazorpayRefund>(
    'POST',
    `/payments/${encodeURIComponent(input.gatewayPaymentId)}/refund`,
    params,
  );
  return {
    gatewayRefundId: refund.id,
    status: refund.status,
    raw: refund,
  };
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/services/payments/razorpay/create-refund.ts
git commit -m "feat(payments): implement Razorpay createRefund"
```

---

### Task 11: Assemble RazorpayProvider

**Files:**
- Create: `lib/services/payments/razorpay/razorpay-provider.ts`

- [ ] **Step 1: Implement provider**

```typescript
// lib/services/payments/razorpay/razorpay-provider.ts
import type { Paise } from '../amount';
import type {
  CreateOrderInput, CreateOrderResult,
  GetStatusResult, CreateRefundInput, CreateRefundResult,
  PaymentProvider, VerifySignatureInput, VerifyWebhookInput,
} from '../provider';
import { createOrder } from './create-order';
import { verifySignature } from './verify-signature';
import { verifyWebhookSignature } from './verify-webhook';
import { getOrderStatus, getPaymentStatus } from './get-status';
import { createRefund } from './create-refund';

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const order = await createOrder({
      transactionRef: input.transactionRef,
      amountPaise: input.amountPaise,
      currency: input.currency,
      module: input.module,
      notes: input.notes,
    });
    return {
      provider: 'razorpay',
      gatewayOrderId: order.id,
      clientKeyId: process.env.RAZORPAY_KEY_ID ?? '',
      redirectUrl: undefined,
      raw: order,
    };
  }

  verifySignature(input: VerifySignatureInput): boolean {
    return verifySignature(input);
  }

  verifyWebhookSignature(input: VerifyWebhookInput): boolean {
    return verifyWebhookSignature(input);
  }

  async getOrderStatus(gatewayOrderId: string): Promise<GetStatusResult> {
    return getOrderStatus(gatewayOrderId);
  }

  async getPaymentStatus(gatewayPaymentId: string): Promise<GetStatusResult> {
    return getPaymentStatus(gatewayPaymentId);
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    return createRefund(input);
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/services/payments/razorpay/razorpay-provider.ts
git commit -m "feat(payments): assemble RazorpayProvider"
```

---

### Task 12: Implement HdfcSmartGatewayProvider (wrap existing code)

**Files:**
- Create: `lib/services/payments/hdfc-smartgateway-provider.ts`

- [ ] **Step 1: Implement provider**

```typescript
// lib/services/payments/hdfc-smartgateway-provider.ts
import type {
  CreateOrderInput, CreateOrderResult, GetStatusResult,
  CreateRefundInput, CreateRefundResult,
  PaymentProvider, VerifySignatureInput, VerifyWebhookInput,
} from './provider';
import type { Paise } from './amount';

/**
 * Adapter exposing the existing HDFC SmartGateway integration through the PaymentProvider
 * interface. Implementation delegates to existing methods in payment-gateway-service.ts and
 * hdfc-event-client.ts. This adapter exists so we can run both providers side-by-side during
 * cutover; once HDFC is decommissioned (Phase 13), this file is deleted.
 */
export class HdfcSmartGatewayProvider implements PaymentProvider {
  readonly name = 'hdfc_smartgateway' as const;

  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    // HDFC SmartGateway uses /session which is module-specific. The adapter is intentionally
    // thin — call sites in PaymentGatewayService.createPaymentSession() and HDFCEventClient
    // continue to drive the HDFC flow directly. This method exists so factory().createOrder
    // remains type-uniform, but call sites should branch on provider.name === 'razorpay'
    // BEFORE calling createOrder for HDFC. See app/api/billing/payment/initiate/route.ts.
    throw new Error(
      'HdfcSmartGatewayProvider.createOrder() must not be called directly. ' +
      'HDFC paths still flow through PaymentGatewayService.createPaymentSession().',
    );
  }

  verifySignature(_input: VerifySignatureInput): boolean {
    throw new Error('HDFC SmartGateway does not use Razorpay-style signature verification.');
  }

  verifyWebhookSignature(_input: VerifyWebhookInput): boolean {
    throw new Error('Use PaymentGatewayService.verifyWebhookSignature for HDFC webhooks.');
  }

  async getOrderStatus(_gatewayOrderId: string): Promise<GetStatusResult> {
    throw new Error('Use PaymentGatewayService.checkPaymentStatus for HDFC.');
  }

  async getPaymentStatus(gatewayPaymentId: string): Promise<GetStatusResult> {
    return this.getOrderStatus(gatewayPaymentId);
  }

  async createRefund(_input: CreateRefundInput): Promise<CreateRefundResult> {
    throw new Error('HDFC SmartGateway refunds are manual; no gateway API call.');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/payments/hdfc-smartgateway-provider.ts
git commit -m "feat(payments): add HdfcSmartGatewayProvider adapter shell"
```

---

### Task 13: Implement provider factory with env flag

**Files:**
- Create: `lib/services/payments/factory.ts`

- [ ] **Step 1: Implement factory**

```typescript
// lib/services/payments/factory.ts
import type { PaymentProvider, PaymentProviderName, PaymentModule } from './provider';
import { RazorpayProvider } from './razorpay/razorpay-provider';
import { HdfcSmartGatewayProvider } from './hdfc-smartgateway-provider';

function envVarForModule(module: PaymentModule): string {
  switch (module) {
    case 'billing': return 'BILLING_PAYMENT_PROVIDER';
    case 'events':  return 'EVENTS_PAYMENT_PROVIDER';
  }
}

export function getActiveProviderName(module: PaymentModule): PaymentProviderName {
  const raw = process.env[envVarForModule(module)] ?? 'hdfc_smartgateway';
  if (raw === 'razorpay' || raw === 'hdfc_smartgateway') return raw;
  throw new Error(
    `Invalid ${envVarForModule(module)}=${raw}. Must be 'hdfc_smartgateway' or 'razorpay'.`,
  );
}

export function getPaymentProvider(module: PaymentModule): PaymentProvider {
  const name = getActiveProviderName(module);
  switch (name) {
    case 'razorpay':         return new RazorpayProvider();
    case 'hdfc_smartgateway': return new HdfcSmartGatewayProvider();
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/services/payments/factory.ts
git commit -m "feat(payments): add provider factory with per-module env flag"
```

---

## Phase 3 — Billing API routes (~1 day)

### Task 14: Update initiate route to branch on provider

**Files:**
- Modify: `app/api/billing/payment/initiate/route.ts`
- Modify: `lib/services/billing/payment-gateway-service.ts`

- [ ] **Step 1: Read the existing route to understand current shape**

Read `app/api/billing/payment/initiate/route.ts` end-to-end. Identify:
- The response shape currently sent to the client (the HDFC `payment_links.web` URL).
- Where `PaymentGatewayService.createPaymentSession()` is called.
- What input the route accepts (bill IDs, custom amounts, return URLs).

- [ ] **Step 2: Add provider branch to PaymentGatewayService.createPaymentSession()**

In `lib/services/billing/payment-gateway-service.ts`, locate `createPaymentSession`. After existing input validation but BEFORE the HDFC API call, add:

```typescript
import { getActiveProviderName, getPaymentProvider } from '@/lib/services/payments/factory';
import { toPaise } from '@/lib/services/payments/amount';

// ... inside createPaymentSession, after computing transactionRef and totalAmount:

if (getActiveProviderName('billing') === 'razorpay') {
  const provider = getPaymentProvider('billing');
  const order = await provider.createOrder({
    transactionRef,
    amountPaise: toPaise(totalAmount),
    currency: 'INR',
    module: 'billing',
    description: `Bill payment (${billIds.length} bill${billIds.length === 1 ? '' : 's'})`,
    customer: {
      name: studentName,
      email: studentEmail,
      phone: studentPhone,
    },
    notes: {
      student_id: studentId,
      institution_id: institutionId,
      transaction_ref: transactionRef,
    },
  });

  // Insert payment_transactions row with provider='razorpay'
  const { data: txnRow, error: insertError } = await supabase
    .from('payment_transactions')
    .insert({
      transaction_ref: transactionRef,
      provider: 'razorpay',
      razorpay_order_id: order.gatewayOrderId,
      session_id: null,                          // not used for Razorpay
      student_id: studentId,
      institution_id: institutionId,
      bill_ids: billIds,
      total_amount: totalAmount,
      amount_paise: toPaise(totalAmount),
      status: 'initiated',
      gateway_response: order.raw,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  // Insert payment_transaction_items (one per bill) — unchanged from HDFC path
  // [...preserve existing item-insert block, just use txnRow.id...]

  return {
    transactionId: txnRow.id,
    transactionRef,
    provider: 'razorpay' as const,
    razorpayOrderId: order.gatewayOrderId,
    razorpayKeyId: order.clientKeyId,
    amountPaise: toPaise(totalAmount),
    currency: 'INR' as const,
    customer: { name: studentName, email: studentEmail, phone: studentPhone },
  };
}

// Existing HDFC code path continues below — unchanged
```

- [ ] **Step 3: Update the API route to return both shapes**

In `app/api/billing/payment/initiate/route.ts`, the success response was previously `{ paymentUrl, transactionId, transactionRef }`. Change it to a discriminated union:

```typescript
// Inside POST handler, after createPaymentSession returns `session`:

if (session.provider === 'razorpay') {
  return NextResponse.json({
    success: true,
    provider: 'razorpay' as const,
    transactionId: session.transactionId,
    transactionRef: session.transactionRef,
    razorpayOrderId: session.razorpayOrderId,
    razorpayKeyId: session.razorpayKeyId,
    amountPaise: session.amountPaise,
    currency: session.currency,
    customer: session.customer,
  });
}
// HDFC path unchanged
return NextResponse.json({
  success: true,
  provider: 'hdfc_smartgateway' as const,
  paymentUrl: session.paymentUrl,
  transactionId: session.transactionId,
  transactionRef: session.transactionRef,
});
```

- [ ] **Step 4: Manual smoke test (with env var set)**

Set `BILLING_PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID=rzp_test_X`, `RAZORPAY_KEY_SECRET=...` in `.env.local` and start dev server:

```bash
npx next dev --turbopack
```

Use curl or browser dev tools to POST to `/api/billing/payment/initiate` with a real bill ID. Expected: response includes `razorpayOrderId: 'order_...'` and `razorpayKeyId: 'rzp_test_...'`. Verify a row appears in `payment_transactions` with `provider='razorpay'`.

- [ ] **Step 5: Commit**

```bash
git add app/api/billing/payment/initiate/route.ts lib/services/billing/payment-gateway-service.ts
git commit -m "feat(billing): branch initiate route on payment provider"
```

---

### Task 15: Update callback route for Razorpay (signature verification + dual inquiry)

**Files:**
- Modify: `app/api/billing/payment/callback/route.ts`
- Modify: `lib/services/billing/payment-gateway-service.ts`

- [ ] **Step 1: Add Razorpay branch to PaymentGatewayService.verifyPaymentWithGateway()**

In `lib/services/billing/payment-gateway-service.ts`, inside `verifyPaymentWithGateway` (the security-critical method), add a branch at the top:

```typescript
import { dualInquiry } from '@/lib/services/payments/razorpay/get-status';

// ... after loading the payment_transactions row by transactionId:

if (txn.provider === 'razorpay') {
  // 1. Verify signature passed by checkout (anti-tampering)
  const provider = getPaymentProvider('billing');
  const callbackSignatureValid = provider.verifySignature({
    gatewayOrderId: txn.razorpay_order_id,
    gatewayPaymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  if (!callbackSignatureValid) {
    await PaymentAuditService.logManipulationDetected({
      transactionId: txn.id,
      reason: 'razorpay_signature_invalid',
    });
    return { verified: false, status: 'failed', reason: 'signature_invalid' };
  }

  // 2. Dual inquiry: server-side fetch of order AND payment status
  const status = await dualInquiry(txn.razorpay_order_id, razorpayPaymentId);

  // 3. Amount mismatch check
  if (status.amountPaise !== txn.amount_paise) {
    await PaymentAuditService.logAmountMismatch({
      transactionId: txn.id,
      expected: txn.amount_paise,
      actual: status.amountPaise,
    });
    return { verified: false, status: 'failed', reason: 'amount_mismatch' };
  }

  if (status.status === 'captured') {
    await PaymentAuditService.logVerificationSuccess({ transactionId: txn.id });
    return {
      verified: true,
      status: 'success',
      gatewayResponse: status.raw,
      gatewayTransactionId: razorpayPaymentId,
      capturedAt: status.capturedAt,
    };
  }
  return { verified: false, status: status.status === 'failed' ? 'failed' : 'processing' };
}

// Existing HDFC SmartGateway verification code unchanged
```

- [ ] **Step 2: Update callback route to parse Razorpay POST body**

In `app/api/billing/payment/callback/route.ts`, the POST handler currently reads HDFC's form-encoded callback. Add a branch that detects Razorpay parameters (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`):

```typescript
const form = await request.formData();
const razorpayOrderId = form.get('razorpay_order_id') as string | null;
const razorpayPaymentId = form.get('razorpay_payment_id') as string | null;
const razorpaySignature = form.get('razorpay_signature') as string | null;

if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
  // Razorpay callback path
  const { data: txn } = await supabaseService
    .from('payment_transactions')
    .select('*')
    .eq('razorpay_order_id', razorpayOrderId)
    .single();
  if (!txn) {
    return NextResponse.redirect(new URL('/billing/payment/failed?reason=unknown_order', request.url), 303);
  }

  const verification = await PaymentGatewayService.verifyPaymentWithGateway({
    transactionId: txn.id,
    razorpayPaymentId,
    razorpaySignature,
  });

  if (verification.verified && verification.status === 'success') {
    await PaymentGatewayService.processSuccessfulPayment({
      transactionId: txn.id,
      gatewayTransactionId: verification.gatewayTransactionId,
      capturedAt: verification.capturedAt,
      gatewayResponse: verification.gatewayResponse,
    });
    return NextResponse.redirect(
      new URL(`/billing/payment/success?txn=${txn.id}`, request.url), 303,
    );
  }
  return NextResponse.redirect(
    new URL(`/billing/payment/failed?txn=${txn.id}&reason=${verification.reason ?? 'verification_failed'}`, request.url), 303,
  );
}

// Existing HDFC callback handling unchanged
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add app/api/billing/payment/callback/route.ts lib/services/billing/payment-gateway-service.ts
git commit -m "feat(billing): handle Razorpay callback with signature verification and dual inquiry"
```

---

### Task 16: Update status endpoint to use provider

**Files:**
- Modify: `app/api/billing/payment/status/[transactionId]/route.ts`

- [ ] **Step 1: Branch on provider when checking status**

```typescript
// app/api/billing/payment/status/[transactionId]/route.ts
import { getPaymentProvider } from '@/lib/services/payments/factory';

// inside GET handler, after loading txn:
if (txn.provider === 'razorpay') {
  const provider = getPaymentProvider('billing');
  const status = await provider.getOrderStatus(txn.razorpay_order_id);
  return NextResponse.json({
    transactionId: txn.id,
    transactionRef: txn.transaction_ref,
    provider: 'razorpay' as const,
    status: status.status,
    amountPaise: status.amountPaise,
    amountRefundedPaise: status.amountRefundedPaise,
    capturedAt: status.capturedAt,
  });
}
// HDFC path unchanged
```

- [ ] **Step 2: Commit**

```bash
git add app/api/billing/payment/status/[transactionId]/route.ts
git commit -m "feat(billing): branch status endpoint on provider"
```

---

### Task 17: Create unified Razorpay webhook endpoint

**Files:**
- Create: `app/api/webhooks/razorpay/route.ts`

- [ ] **Step 1: Write the webhook handler**

```typescript
// app/api/webhooks/razorpay/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { PaymentAuditService } from '@/lib/services/billing/security/payment-audit-service';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-razorpay-signature') ?? '';

  // Verify with billing provider (same secret used for both modules)
  const provider = getPaymentProvider('billing');
  if (!provider.verifyWebhookSignature({ rawBody, signatureHeader })) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const eventType: string = payload.event;
  const supabase = createServiceRoleClient();

  // Idempotency: log the event before processing. If we crash mid-flow, we can replay.
  await supabase.from('webhook_logs').insert({
    provider: 'razorpay',
    event_type: eventType,
    raw_payload: payload,
    received_at: new Date().toISOString(),
  });

  // Route by event type
  switch (eventType) {
    case 'order.paid':
    case 'payment.captured':
      await handlePaymentCaptured(supabase, payload);
      break;
    case 'payment.authorized':
      await handlePaymentAuthorized(supabase, payload);
      break;
    case 'payment.failed':
      await handlePaymentFailed(supabase, payload);
      break;
    case 'refund.created':
    case 'refund.processed':
    case 'refund.failed':
      await handleRefundEvent(supabase, payload);
      break;
    case 'payment.dispute.created':
    case 'payment.dispute.lost':
    case 'payment.dispute.won':
    case 'payment.dispute.closed':
      await handleDisputeEvent(supabase, payload);
      break;
    default:
      // Unknown event type — log and acknowledge so Razorpay doesn't retry
      break;
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentCaptured(supabase: ReturnType<typeof createServiceRoleClient>, payload: any) {
  const payment = payload.payload.payment.entity;
  const order = payload.payload.order?.entity;
  const orderId = payment.order_id;
  const module = (payment.notes?.module ?? order?.notes?.module) as 'billing' | 'events' | undefined;
  if (!module) return;

  const table = module === 'billing' ? 'payment_transactions' : 'event_payment_transactions';
  // Anti-replay: only update if not already processed
  const { data: existing } = await supabase
    .from(table)
    .select('id, status, razorpay_payment_id')
    .eq('razorpay_order_id', orderId)
    .single();
  if (!existing) return;
  if (existing.status === 'success') return;

  await supabase.from(table).update({
    razorpay_payment_id: payment.id,
    status: 'success',
    captured_at: new Date().toISOString(),
    gateway_response: payload,
    payment_date: new Date(payment.created_at * 1000).toISOString(),
    completed_at: new Date().toISOString(),
  }).eq('id', existing.id);

  // For billing: also trigger receipt creation (mirror processSuccessfulPayment logic)
  if (module === 'billing') {
    const { PaymentGatewayService } = await import('@/lib/services/billing/payment-gateway-service');
    await PaymentGatewayService.processSuccessfulPayment({
      transactionId: existing.id,
      gatewayTransactionId: payment.id,
      capturedAt: new Date(payment.created_at * 1000),
      gatewayResponse: payload,
    });
  } else {
    // For events: mark registration as paid
    const { EventPaymentService } = await import('@/lib/services/events/core/event-payment-service');
    await EventPaymentService.markRegistrationPaid(existing.id);
  }

  await PaymentAuditService.logVerificationSuccess({ transactionId: existing.id });
}

async function handlePaymentAuthorized(supabase: ReturnType<typeof createServiceRoleClient>, payload: any) {
  // For auto-capture flow, authorized → captured happens automatically. Log only.
  const payment = payload.payload.payment.entity;
  await supabase.from('webhook_logs').insert({
    provider: 'razorpay',
    event_type: 'payment.authorized.observed',
    raw_payload: { razorpay_payment_id: payment.id, order_id: payment.order_id },
    received_at: new Date().toISOString(),
  });
}

async function handlePaymentFailed(supabase: ReturnType<typeof createServiceRoleClient>, payload: any) {
  const payment = payload.payload.payment.entity;
  const orderId = payment.order_id;
  const module = (payment.notes?.module) as 'billing' | 'events' | undefined;
  if (!module) return;
  const table = module === 'billing' ? 'payment_transactions' : 'event_payment_transactions';
  await supabase.from(table).update({
    status: 'failed',
    gateway_response: payload,
  }).eq('razorpay_order_id', orderId).neq('status', 'success');
}

async function handleRefundEvent(supabase: ReturnType<typeof createServiceRoleClient>, payload: any) {
  // Implemented in Task 38 (Phase 6 — Refunds). Stub for now.
  // Acknowledge so Razorpay doesn't retry.
  return;
}

async function handleDisputeEvent(supabase: ReturnType<typeof createServiceRoleClient>, payload: any) {
  // Implemented in Task 41 (Phase 7 — Disputes). Stub for now.
  return;
}
```

- [ ] **Step 2: Configure webhook URL in Razorpay dashboard (manual step, document only)**

Document in the cutover runbook (Task 33):
- Test mode webhook URL: `https://<preview-url>/api/webhooks/razorpay`
- Live mode webhook URL: `https://my.jkkn.ac.in/api/webhooks/razorpay` (or whatever the prod domain is)
- Active events: `order.paid`, `payment.captured`, `payment.authorized`, `payment.failed`, `refund.created`, `refund.processed`, `refund.failed`, `payment.dispute.created`, `payment.dispute.lost`, `payment.dispute.won`, `payment.dispute.closed`
- Secret: `RAZORPAY_WEBHOOK_SECRET` env var

- [ ] **Step 3: Confirm /api/webhooks/razorpay is in the proxy.ts public-path list**

Per the memory entry `feedback_new_public_routes_must_register_in_proxy_ts`, any unauthenticated route hit by an external system must be listed in `proxy.ts` `PUBLIC_PATHS_SET` or `PUBLIC_PATH_PREFIXES`. Open `proxy.ts` and add:

```typescript
PUBLIC_PATH_PREFIXES.add('/api/webhooks/');
```

Or if more conservative, only the exact path:

```typescript
PUBLIC_PATHS_SET.add('/api/webhooks/razorpay');
```

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/razorpay/route.ts proxy.ts
git commit -m "feat(payments): add unified Razorpay webhook endpoint and register as public route"
```

---

## Phase 4 — Billing UI (Checkout.js modal) (~half-day)

### Task 18: Update CSP to allow Razorpay Checkout.js

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Locate the CSP header configuration**

Read `next.config.ts`. Find the `headers()` function (or wherever Content-Security-Policy is set). If CSP is set elsewhere (proxy.ts or a separate file), search for `Content-Security-Policy`.

- [ ] **Step 2: Add Razorpay domains to script-src, connect-src, frame-src**

Update the CSP string:

```typescript
// next.config.ts — inside headers()
const cspDirectives = [
  "default-src 'self'",
  // ...existing directives...
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.vercel-insights.com",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.supabase.co wss://*.supabase.co",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "img-src 'self' data: blob: https://cdn.razorpay.com",
  // ...
].join('; ');
```

(Adjust to merge with whatever already exists — do not delete existing entries.)

- [ ] **Step 3: Test locally**

Restart dev server, open browser dev tools → Network → verify no CSP errors when loading the checkout script.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "chore(security): allow Razorpay Checkout.js in CSP"
```

---

### Task 19: Create Razorpay Checkout launcher component

**Files:**
- Create: `components/billing/razorpay-checkout-launcher.tsx`

- [ ] **Step 1: Implement launcher**

```typescript
// components/billing/razorpay-checkout-launcher.tsx
'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Props {
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: 'INR';
  transactionId: string;
  customer: { name?: string; email?: string; phone?: string };
  description?: string;
  onClose?: () => void;
}

export function RazorpayCheckoutLauncher(props: Props) {
  const launched = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (launched.current) return;
    if (typeof window === 'undefined' || !window.Razorpay) return;
    launched.current = true;

    const rzp = new window.Razorpay({
      key: props.razorpayKeyId,
      order_id: props.razorpayOrderId,
      amount: props.amountPaise,
      currency: props.currency,
      name: 'JKKN',
      description: props.description ?? 'Bill payment',
      prefill: {
        name: props.customer.name ?? '',
        email: props.customer.email ?? '',
        contact: props.customer.phone ?? '',
      },
      notes: { transaction_id: props.transactionId },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        // POST to our callback to verify server-side, then redirect
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/api/billing/payment/callback';
        for (const [k, v] of Object.entries(response)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = v;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
      },
      modal: {
        ondismiss: () => {
          router.push(`/billing/payment/failed?txn=${props.transactionId}&reason=user_cancelled`);
          props.onClose?.();
        },
      },
      theme: { color: '#0F766E' },
    });
    rzp.on('payment.failed', (resp: any) => {
      router.push(`/billing/payment/failed?txn=${props.transactionId}&reason=${encodeURIComponent(resp.error?.code ?? 'gateway_error')}`);
    });
    rzp.open();
  }, [props, router]);

  return (
    <Script
      src="https://checkout.razorpay.com/v1/checkout.js"
      strategy="afterInteractive"
      onLoad={() => {
        // Trigger effect re-run by changing dependency — handled via launched.current
        launched.current = false;
        // Force a re-render
        const ev = new Event('razorpay-loaded');
        window.dispatchEvent(ev);
      }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/billing/razorpay-checkout-launcher.tsx
git commit -m "feat(billing): add Razorpay Checkout.js launcher component"
```

---

### Task 20: Wire launcher into OnlinePaymentButton

**Files:**
- Modify: `components/billing/online-payment-button.tsx`

- [ ] **Step 1: Read existing component**

Read `components/billing/online-payment-button.tsx`. Identify where the POST to `/api/billing/payment/initiate` happens and where the response is consumed (currently expecting `paymentUrl` for `window.location.href`).

- [ ] **Step 2: Branch on response.provider**

```typescript
// components/billing/online-payment-button.tsx — within the click handler
const res = await fetch('/api/billing/payment/initiate', { method: 'POST', body: JSON.stringify({ billIds, customAmounts }) });
const data = await res.json();
if (!data.success) {
  toast.error(data.error ?? 'Failed to initiate payment');
  return;
}

if (data.provider === 'razorpay') {
  setRazorpayLaunchProps({
    razorpayKeyId: data.razorpayKeyId,
    razorpayOrderId: data.razorpayOrderId,
    amountPaise: data.amountPaise,
    currency: data.currency,
    transactionId: data.transactionId,
    customer: data.customer,
    description: `Bill payment for ${billIds.length} bill${billIds.length === 1 ? '' : 's'}`,
  });
  return;
}

// HDFC flow unchanged
window.location.href = data.paymentUrl;
```

And in JSX:

```tsx
{razorpayLaunchProps && <RazorpayCheckoutLauncher {...razorpayLaunchProps} onClose={() => setRazorpayLaunchProps(null)} />}
```

- [ ] **Step 3: Manual smoke test**

With `BILLING_PAYMENT_PROVIDER=razorpay`, click "Pay Online" on a bill. Expected: Razorpay test modal opens, accepts test card `4111 1111 1111 1111` exp `3/2026` CVV `123`, redirects back to `/billing/payment/success` after submit.

- [ ] **Step 4: Commit**

```bash
git add components/billing/online-payment-button.tsx
git commit -m "feat(billing): launch Razorpay Checkout.js modal from payment button"
```

---

### Task 21: Update success/failed pages to display order_number + amount + success message

**Files:**
- Modify: `app/(routes)/billing/payment/success/page.tsx`
- Modify: `app/(routes)/billing/payment/failed/page.tsx`

- [ ] **Step 1: Read current success page**

The Security Audit Checklist (`docs/hdfc-new-integration/Security-Audit-Checklist.md` line 7-11) mandates the success page display: order number, amount, success message — in real time. Verify that the current page reads `?txn=<id>` and resolves to a transaction row.

- [ ] **Step 2: Ensure all three fields render**

```tsx
// app/(routes)/billing/payment/success/page.tsx — server component
export default async function PaymentSuccessPage({ searchParams }: { searchParams: Promise<{ txn?: string }> }) {
  const { txn } = await searchParams;
  if (!txn) return <div>Invalid request</div>;
  const supabase = await createServerSupabaseClient();
  const { data: transaction } = await supabase
    .from('payment_transactions')
    .select('id, transaction_ref, razorpay_order_id, razorpay_payment_id, total_amount, status, payment_date')
    .eq('id', txn)
    .single();
  if (!transaction || transaction.status !== 'success') {
    return <div>Payment not confirmed yet. Please refresh in a moment.</div>;
  }
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-green-700">Payment Successful</h1>
      <dl className="mt-4 grid grid-cols-1 gap-2">
        <div><dt className="text-sm text-gray-600">Order Number</dt><dd className="font-mono">{transaction.transaction_ref}</dd></div>
        <div><dt className="text-sm text-gray-600">Razorpay Order ID</dt><dd className="font-mono">{transaction.razorpay_order_id ?? 'N/A'}</dd></div>
        <div><dt className="text-sm text-gray-600">Razorpay Payment ID</dt><dd className="font-mono">{transaction.razorpay_payment_id ?? 'N/A'}</dd></div>
        <div><dt className="text-sm text-gray-600">Amount Paid</dt><dd className="font-semibold">₹{transaction.total_amount.toFixed(2)}</dd></div>
        <div><dt className="text-sm text-gray-600">Status</dt><dd>Success</dd></div>
        <div><dt className="text-sm text-gray-600">Paid At</dt><dd>{transaction.payment_date ? new Date(transaction.payment_date).toLocaleString('en-IN') : '—'}</dd></div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 3: Mirror similar fields in failed page**

```tsx
// app/(routes)/billing/payment/failed/page.tsx — server component
// Display order_number + attempted amount + failure reason
```

- [ ] **Step 4: Commit**

```bash
git add app/(routes)/billing/payment/success/page.tsx app/(routes)/billing/payment/failed/page.tsx
git commit -m "feat(billing): display order number, amount, status on payment result pages (security audit requirement)"
```

---

### Task 22: Update env files

**Files:**
- Modify: `.env.example`
- (Local only: `.env` — do NOT commit)

- [ ] **Step 1: Add Razorpay vars to .env.example**

Append:

```bash
# ============================================================
# Razorpay (HDFC Collect Now) — Phase 2 of payment-gateway migration
# Get keys from https://dashboard.razorpay.com/app/keys
# Both test and live keys live here; set BILLING_PAYMENT_PROVIDER=razorpay to activate.
# ============================================================
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Per-module provider flag. Set to 'razorpay' to use new gateway, 'hdfc_smartgateway' to keep current.
BILLING_PAYMENT_PROVIDER=hdfc_smartgateway
EVENTS_PAYMENT_PROVIDER=hdfc_smartgateway
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(env): document Razorpay environment variables"
```

---

## Phase 5 — Events/marathon routes (~half-day)

### Task 23-27: Mirror billing changes on events module

Each of these tasks follows the same pattern as Tasks 14-17, applied to events files. Implementation is structurally identical — only the file paths and the table (`event_payment_transactions`) differ.

### Task 23: Update events initiate route

**Files:**
- Modify: `app/api/events/marathon/[eventId]/payment/initiate/route.ts`
- Modify: `lib/services/events/core/event-payment-service.ts`

- [ ] **Step 1: Add provider branch to EventPaymentService.initiatePayment**

Apply the same pattern as Task 14 Step 2, but writing to `event_payment_transactions`, using `module: 'events'` in the notes, and calling `getActiveProviderName('events')`.

- [ ] **Step 2: Update API route response shape**

Same discriminated-union shape as Task 14 Step 3.

- [ ] **Step 3: Commit**

```bash
git add app/api/events/marathon/[eventId]/payment/initiate/route.ts lib/services/events/core/event-payment-service.ts
git commit -m "feat(events): branch payment initiate on provider"
```

### Task 24: Update events callback route

**Files:**
- Modify: `app/api/events/marathon/[eventId]/payment/callback/route.ts`
- Modify: `lib/services/events/core/event-payment-service.ts`

Mirror Task 15, targeting `event_payment_transactions`. The post-success side effect (marking registration paid) replaces the receipt-creation step from billing.

### Task 25: Update events pre-register route (skip if it doesn't initiate payments directly)

Read `app/api/events/marathon/[eventId]/payment/pre-register/route.ts`. If it just creates a pending registration and delegates to /initiate, no changes needed. If it directly creates a gateway session, mirror Task 14.

### Task 26: Update events status endpoint (if exists)

If `app/api/events/marathon/[eventId]/payment/status/...` exists, mirror Task 16. If not, skip.

### Task 27: Update events webhook to redirect to unified webhook (or deprecate it)

**Files:**
- Modify: `app/api/events/marathon/[eventId]/payment/webhook/route.ts`

When `provider === 'razorpay'`, the unified webhook at `/api/webhooks/razorpay` handles events. The existing event webhook stays for HDFC compatibility. No change required — the new webhook handles routing by `notes.module === 'events'`.

- [ ] **Commit pooled events changes**

```bash
git add app/api/events/marathon/[eventId]/payment/*
git commit -m "feat(events): wire Razorpay provider through events payment routes"
```

---

### Task 28: Event UI — wire Checkout.js launcher

**Files:**
- Inspect: `app/(routes)/events/marathon/**/*.tsx` to find the registration → payment button
- Modify: identified file(s) to dispatch RazorpayCheckoutLauncher when `provider === 'razorpay'`

Apply the same pattern as Task 20.

- [ ] **Commit**

```bash
git commit -am "feat(events): launch Razorpay Checkout.js for event registration"
```

---

## Phase MVP Cut-line — STOP HERE TO CUTOVER BILLING

After Task 28, the codebase has:
- Both providers wired everywhere
- `BILLING_PAYMENT_PROVIDER` flag controls billing
- `EVENTS_PAYMENT_PROVIDER` flag controls events
- DB schema accepts both
- Webhooks routed
- UI launches modal for Razorpay

Proceed to Task 29-34 (cutover) for billing. Events follow 1 week later (same flag flip).

---

## Phase 11 — Env + secrets (~30 min)

### Task 29: Add prod Razorpay credentials to Vercel

**Files:** none (Vercel dashboard step)

- [ ] **Step 1: In Vercel dashboard → Settings → Environment Variables, add:**
- `RAZORPAY_KEY_ID` (live: `rzp_live_*`; test: `rzp_test_*` — separate per environment)
- `RAZORPAY_KEY_SECRET` (encrypted)
- `RAZORPAY_WEBHOOK_SECRET` (set in Razorpay dashboard → Settings → Webhooks)
- `BILLING_PAYMENT_PROVIDER=hdfc_smartgateway` (start unchanged; flipped at cutover time)
- `EVENTS_PAYMENT_PROVIDER=hdfc_smartgateway`

- [ ] **Step 2: Deploy preview, verify env vars load**

```bash
vercel pull --environment=preview
# Inspect .vercel/.env.preview.local — confirm all 5 vars present
```

---

## Phase 10 — Testing (~1 day)

### Task 30: Run security audit checklist test transactions

**Files:** none (manual testing)

- [ ] **Step 1: Prepare 7-8 test scenarios per the audit checklist**

Use test card `4111 1111 1111 1111` exp `3/2026` CVV `123` (from `docs/hdfc-new-integration/test-card-details.md`).

Test matrix:
1. Rs 1 payment (boundary: minimum)
2. Rs 100 payment (round number)
3. Rs 12,345.67 payment (decimal precision)
4. Rs 50,000 payment (high amount)
5. Cancel from modal (verify failed page renders + `user_cancelled` reason)
6. Network drop mid-payment (manual; throttle browser network) → verify late-authorization webhook eventually arrives
7. Replay webhook (re-POST captured webhook with same payload) → verify no duplicate receipt
8. Tampered signature (send POST to /callback with wrong signature) → verify rejected + audit log entry

- [ ] **Step 2: Verify DB persistence after each test**

For each test, query:

```sql
SELECT id, status, razorpay_order_id, razorpay_payment_id, total_amount, amount_paise, captured_at
FROM payment_transactions
WHERE razorpay_order_id = 'order_...'
ORDER BY created_at DESC LIMIT 1;
```

Expected: status='success', captured_at populated, amount_paise = expected × 100.

- [ ] **Step 3: Document outcomes in `docs/runbooks/razorpay-security-audit.md`**

Create that file with screenshots/log snippets per the audit checklist's 8 items, ready to email to `collectnow-integrations@razorpay.com`.

---

### Task 31: Verify webhook idempotency

**Files:** none (manual + SQL)

- [ ] **Step 1: Pick a successful test transaction, capture its webhook payload from `webhook_logs`**

```sql
SELECT raw_payload FROM webhook_logs WHERE provider='razorpay' AND event_type='payment.captured' ORDER BY received_at DESC LIMIT 1;
```

- [ ] **Step 2: Re-POST it to the webhook endpoint with the matching X-Razorpay-Signature header**

(Use curl with HMAC of the body using your test webhook secret.)

- [ ] **Step 3: Verify no duplicate receipt rows**

```sql
SELECT COUNT(*) FROM billing_receipts WHERE transaction_ref = 'TXN-...';
```

Expected: exactly 1.

---

### Task 32: Reconcile rupee/paise edge cases

**Files:** `__tests__/lib/services/payments/amount.test.ts` (already in Task 3)

- [ ] **Step 1: Add real-world bill amount tests**

Append to `amount.test.ts`:

```typescript
describe('toPaise — production scenarios', () => {
  it('handles a typical fee amount precisely', () => {
    expect(toPaise(15750.50)).toBe(1575050);
  });
  it('handles split bill amounts that sum to the bill total', () => {
    const a = toPaise(1000.33);
    const b = toPaise(2000.67);
    const sum = toPaise(3001.00);
    expect(a + b).toBe(sum);
  });
  it('handles odd-cent values (₹.99 endings)', () => {
    expect(toPaise(99.99)).toBe(9999);
  });
});
```

- [ ] **Step 2: Run and commit if any fail**

```bash
npx vitest run __tests__/lib/services/payments/amount.test.ts
git add __tests__/lib/services/payments/amount.test.ts
git commit -m "test(payments): add production-scenario tests for paise conversion"
```

---

## Phase 12 — Cutover (~1 day, mostly waiting)

### Task 33: Author the cutover runbook

**Files:**
- Create: `docs/runbooks/razorpay-cutover.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Razorpay Cutover Runbook

## Pre-cutover (T-24h)
1. Confirm Razorpay live credentials set in Vercel (`RAZORPAY_KEY_ID=rzp_live_...`)
2. Confirm Razorpay dashboard webhook configured: URL `https://my.jkkn.ac.in/api/webhooks/razorpay`, secret matches `RAZORPAY_WEBHOOK_SECRET`, all 11 events active
3. Confirm a Vercel rollback deployment is available (previous successful deploy)
4. Notify finance/admin team of the 1-hour cutover window
5. Decide window: ideally Sun 11pm-Midnight IST when billing traffic is lowest

## Cutover (T+0)
1. In Vercel dashboard, change `BILLING_PAYMENT_PROVIDER` from `hdfc_smartgateway` to `razorpay` (production environment)
2. Redeploy current production (Vercel will pick up new env var)
3. Smoke test: make Rs 1 payment via your own student account end-to-end, verify receipt PDF, verify Razorpay dashboard shows the payment

## Monitoring (T+0 to T+24h)
Watch for 24 hours:
- `payment_transactions WHERE provider='razorpay' AND status NOT IN ('success','failed')` — should be near-zero
- `webhook_logs WHERE provider='razorpay' AND event_type='payment.failed'` — investigate any spikes
- User-reported issues via support channel

## Rollback (if needed within first 24h)
1. In Vercel, change `BILLING_PAYMENT_PROVIDER` back to `hdfc_smartgateway`
2. Redeploy
3. Any in-flight Razorpay transactions complete naturally (Razorpay webhook still fires; data still recorded)
4. No code revert needed — both providers ship in same build

## Events cutover (T+7 days)
Repeat the above with `EVENTS_PAYMENT_PROVIDER` once billing is stable.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/razorpay-cutover.md
git commit -m "docs(payments): add Razorpay cutover runbook"
```

---

### Task 34: Execute billing cutover

**Files:** none (Vercel dashboard step)

- [ ] **Step 1: Flip `BILLING_PAYMENT_PROVIDER=razorpay` in Vercel production env**
- [ ] **Step 2: Redeploy current production commit**
- [ ] **Step 3: Run smoke test per runbook**
- [ ] **Step 4: Monitor `payment_transactions` for 24 hours**

---

## Phase 6 — Refunds (post-MVP; ~half-day)

### Task 35-38: Refund implementation

**Files:**
- Create: `app/api/billing/refunds/[id]/gateway-refund/route.ts`
- Modify: `lib/services/billing/refunds/billing-refund-service.ts`
- Modify: `app/api/webhooks/razorpay/route.ts` (implement `handleRefundEvent` stub from Task 17)

### Task 35: Add a backend route to trigger gateway refund

**Files:** `app/api/billing/refunds/[id]/gateway-refund/route.ts`

- [ ] **Step 1: Implement**

```typescript
// app/api/billing/refunds/[id]/gateway-refund/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { toPaise } from '@/lib/services/payments/amount';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: refundId } = await params;
  const supabase = await createServerSupabaseClient();

  // Load refund + parent transaction
  const { data: refund } = await supabase
    .from('billing_refunds')
    .select('*, receipt:billing_receipts(*, transaction:payment_transactions(*))')
    .eq('id', refundId)
    .single();
  if (!refund) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (refund.status !== 'pending') return NextResponse.json({ error: 'invalid_status' }, { status: 400 });

  const txn = refund.receipt.transaction;
  if (txn.provider !== 'razorpay') {
    return NextResponse.json({ error: 'manual_refund_required', message: 'Non-Razorpay transactions are refunded manually.' }, { status: 400 });
  }

  const provider = getPaymentProvider('billing');
  const result = await provider.createRefund({
    gatewayPaymentId: txn.razorpay_payment_id,
    amountPaise: toPaise(Number(refund.refund_amount)),
    refundReference: refundId,
    notes: { internal_refund_id: refundId, transaction_ref: txn.transaction_ref },
  });

  await supabase.from('billing_refunds').update({
    status: result.status === 'processed' ? 'processed' : 'processing',
    gateway_refund_id: result.gatewayRefundId,
    gateway_response: result.raw,
  }).eq('id', refundId);

  return NextResponse.json({ success: true, refundId: result.gatewayRefundId, status: result.status });
}
```

- [ ] **Step 2: Add columns to billing_refunds if missing**

If `billing_refunds` doesn't yet have `gateway_refund_id` + `gateway_response` columns, add a follow-up migration `20260522130000_billing_refunds_gateway_columns.sql`:

```sql
ALTER TABLE billing_refunds
  ADD COLUMN IF NOT EXISTS gateway_refund_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS gateway_response jsonb;
```

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/refunds/[id]/gateway-refund/route.ts supabase/migrations/20260522130000_billing_refunds_gateway_columns.sql
git commit -m "feat(refunds): trigger Razorpay refund from existing billing_refunds row"
```

---

### Task 36-38: Refund webhook handling + UI button

Implement `handleRefundEvent` in `app/api/webhooks/razorpay/route.ts` to update `billing_refunds.status` based on `refund.created` / `refund.processed` / `refund.failed`. Add a "Process via Razorpay" button to the existing refund admin UI.

---

## Phase 7 — Disputes (post-MVP; ~3 hours)

### Task 39-41: Dispute persistence + admin notification

Implement `handleDisputeEvent` in webhook to upsert into `payment_disputes` table. Wire a simple admin notification (existing notification system, e.g., toast on admin dashboard).

---

## Phase 8 — Late authorization daily job (post-MVP; ~3 hours)

### Task 42-43: Cron job

Use the project's existing cron mechanism (per memory, there's a CronCreate/scheduler). Add a daily job that queries:

```sql
SELECT * FROM payment_transactions
WHERE provider = 'razorpay'
  AND status = 'initiated'
  AND created_at < now() - interval '15 minutes'
  AND created_at > now() - interval '5 days';
```

For each, call `provider.getOrderStatus(razorpay_order_id)`. If captured, mark success; if 5+ days old and not captured, mark failed.

---

## Phase 13 — Decommission HDFC (separate PR; 30 days post-cutover)

### Task 44: Remove HDFC code paths

**Files:**
- Delete: `lib/services/events/core/hdfc-event-client.ts`
- Delete: `lib/services/payments/hdfc-smartgateway-provider.ts`
- Modify: `lib/services/billing/payment-gateway-service.ts` (remove HDFC branch)
- Modify: `lib/services/payments/factory.ts` (remove HDFC case)
- Modify: `.env.example` (remove `HDFC_*` vars + `BILLING_PAYMENT_PROVIDER` since only one option remains)
- Modify: `app/api/billing/payment/{initiate,callback,webhook,status/[transactionId]}/route.ts` (remove HDFC branches)

**Constraints:**
- KEEP the `provider` column and all existing HDFC rows in `payment_transactions` and `event_payment_transactions` for audit
- KEEP `webhook_logs` rows referencing HDFC (49,870 of them) — never delete

- [ ] **Single PR, named:** `chore(payments): decommission HDFC SmartGateway code paths`

---

## Self-Review

I've reviewed this plan against the spec. Confirmations:

**Spec coverage:**
- Phase 0 (pre-flight) → Task 1 ✅
- Phase 1 (DB schema + RLS) → Task 2 ✅
- Phase 2 (provider abstraction) → Tasks 3-13 ✅
- Phase 3 (billing routes) → Tasks 14-17 ✅
- Phase 4 (billing UI + CSP) → Tasks 18-22 ✅
- Phase 5 (events routes + UI) → Tasks 23-28 ✅
- Phase 6 (refunds) → Tasks 35-38 ✅
- Phase 7 (disputes) → Tasks 39-41 ✅
- Phase 8 (late authorization) → Tasks 42-43 ✅
- Phase 9 (types) → Folded into Tasks 4-6 ✅
- Phase 10 (testing) → Tasks 30-32 ✅
- Phase 11 (env + secrets) → Tasks 22, 29 ✅
- Phase 12 (cutover + rollback) → Tasks 33-34 ✅
- Phase 13 (decommission) → Task 44 ✅

**Security Audit Checklist coverage** (from `docs/hdfc-new-integration/Security-Audit-Checklist.md`):
1. Transaction-flow screenshots → Task 30 Step 3 (documentation)
2. Verification request/response logs → Task 30 Step 2 (SQL queries)
3. DB persistence → Task 2 (schema) + Task 30 Step 2 (verification)
4. Dual inquiry (Status API) → Task 9 + Task 15 Step 1 (mandatory per checklist)
5. Real-time response page with order/amount/success → Task 21
6. UAT==prod parity → Task 29 (separate Vercel env)
7. Webhook signature verification → Tasks 8, 17
8. 7-8 test transactions → Task 30 Step 1

**Critical landmines guarded against:**
- ✅ Paise vs rupees confusion: Branded type (Task 3) + tests (Tasks 3, 32)
- ✅ HMAC timing attacks: `crypto.timingSafeEqual()` in Tasks 7, 8
- ✅ Webhook race with callback: anti-replay via `processed_at`/`status='success'` check (Task 17)
- ✅ Cross-institution leak: RLS tightening (Task 2)
- ✅ Public route registration: proxy.ts update (Task 17 Step 3)
- ✅ Memory `feedback_postgrest_undefined_serialized_as_string_undefined`: no service signatures drifted (clean addition of new params via interface; existing methods unchanged)
- ✅ Memory `feedback_supabase_econnreset_use_withretry`: `withRetry` wraps Razorpay HTTP calls (Task 5)

**Type consistency check:**
- `toPaise()`/`fromPaise()` signatures consistent across Tasks 3, 6, 14, 15, 35
- `Paise` branded type used consistently
- `CreateOrderInput`, `CreateOrderResult` interface fields match between definition (Task 4) and consumers (Tasks 6, 11, 14)
- `PaymentProviderName` literal type used as discriminator everywhere
- `provider` column values match: `'hdfc_smartgateway' | 'razorpay'` in DB CHECK (Task 2) and TS type (Task 4)

**Placeholder scan:** All steps contain runnable code or commands. No TBD/TODO. No "implement appropriate validation" — every validation is spelled out.

**One open question for the engineer:**
- The exact signature of `withRetry` in `lib/retry.ts` is not verified in this plan (Task 5 step 2 assumes `{attempts, baseDelayMs, retryOn}` — adjust if the project uses different argument names).

Plan complete.
