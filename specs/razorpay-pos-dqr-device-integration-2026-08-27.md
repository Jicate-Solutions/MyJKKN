# Razorpay POS — DQR Device Integration

**Status:** Draft specification, not yet implemented
**Date:** 2026-08-27
**Source document:** `RazorpayPOS_p2p-dqr-sdk compressed.pdf` (Razorpay POS Integration Solution Doc),
transcribed to Markdown at
[`docs/razorpay-pos/RazorpayPOS-P2P-DQR-API-Documentation.md`](../docs/razorpay-pos/RazorpayPOS-P2P-DQR-API-Documentation.md)
— cite that file for the vendor contract; this file is the design.
**Reference implementation:** `lib/services/payments/razorpay/**` + `lib/services/ims/gateway-payment-service.ts`

---

## 0. Naming — read this first

`DQR` is **already an acronym in this codebase**: `lib/services/admission/dqr-service.ts` is the
admission **Data Quality Report**. Do not create `lib/services/**/dqr-*.ts`, a `dqr_*` table, or a
`DqrService` class — every grep for the payments work would return admission hits and vice versa.

Everything in this spec uses one of two names instead:

| Concept | Name to use | Why |
|---|---|---|
| The vendor API (`*.ezetap.com/api/3.0/p2padapter/*`) | `ezetap` | It is literally Ezetap's host and path; Razorpay POS is the Ezetap acquisition. |
| The physical terminal | `pos_device` / `PosDevice` | Distinguishes hardware from the software `payment_accounts`. |
| The payment method as the cashier sees it | `pos_dqr` | Only ever a *value*, never a filename or symbol. |

---

## 1. What is being built

Today a counter sale at a JKKN store is collected one of two ways
(`components/ims/payment-modal.tsx`):

- **Cash / card** — the cashier asserts it happened. Nothing is verified.
- **Gateway (`upi_qr` tab, Razorpay)** — the cashier's browser is redirected to Razorpay's
  hosted page; the customer scans the QR that page renders. Razorpay confirms the credit.
  This is `ImsGatewayPaymentService` and it works, but it **takes the cashier's screen away**
  and the customer must aim their phone at the till's monitor.

DQR adds a third: a **customer-facing Razorpay POS soundbox/terminal** sitting on the counter.
The server pushes the amount to that specific device by serial number; the device displays a
dynamic QR (or accepts a card tap, depending on `mode`); the customer pays on the device; our
server polls until the gateway says `AUTHORIZED`.

The cashier's screen never leaves the POS. That is the entire point.

```
 POS screen (cashier)        MyJKKN server              Ezetap/Razorpay          DQR device
 ────────────────────        ─────────────              ───────────────          ──────────
  "Pay on device"  ──POST──▶ price cart server-side
                             INSERT payment row
                             POST /p2padapter/pay ─────▶  push notification ────▶ shows QR
                             ◀── { p2pRequestId } ──────                          ↑ customer
   poll every 2s   ──GET──▶  POST /p2padapter/status ──▶                          │ scans/taps
                             ◀── { messageCode, status }                          │
                             …until status=AUTHORIZED ◀───────────────────────────┘
                             book the sale (cashier's session)
   sale number     ◀────────
```

---

## 2. The vendor contract (extracted from the PDF)

All three endpoints are `POST`, `Content-Type: application/json`.

| Purpose | Demo | Production |
|---|---|---|
| Push a payment | `https://demo.ezetap.com/api/3.0/p2padapter/pay` | `https://www.ezetap.com/api/3.0/p2padapter/pay` |
| Poll status | `https://demo.ezetap.com/api/3.0/p2padapter/status` | `https://www.ezetap.com/api/3.0/p2padapter/status` |
| Cancel a push | `https://demo.ezetap.com/api/3.0/p2padapter/cancel` | `https://www.ezetap.com/api/3.0/p2padapter/cancel` |

### 2.1 Pay request

| Field | Type | Req. | Notes |
|---|---|---|---|
| `appKey` | String(50) | ✅ | Secret, issued by Razorpay. **Encrypt at rest.** |
| `username` | String(20) | ✅ | Merchant username. |
| `amount` | BigDecimal | ✅ | **Unit is NOT stated in the doc — see §3.1. Treat as rupees, verify in UAT.** |
| `externalRefNumber` | String | ✅ | Our bill reference. Must be unique; empty ⇒ `EZETAP_0000387`. |
| `pushTo` | JSON | ✅ | `{"deviceId": "<serial>\|razorpay_pos_soundbox"}` for DQR; `…\|ezetap_android` for a handheld POS. |
| `mode` | String | ✅ | `ALL` \| `CARD` \| `CASH` \| `UPI` \| `BHARATQR`. DQR uses `UPI`. |
| `accountLabel` | String | ➖ | Selects the TID when one device settles to several MIDs/TIDs. |
| `customerName` / `customerMobileNumber` / `customerEmail` | String | ➖ | |
| `description` | String(50) | ➖ | |
| `externalRefNumber2..5`, `additionalData`, `orgCode`, `paymentBy` | String | ➖ | |

Response: `{ success, messageCode, message, errorCode, errorMessage, p2pRequestId }`.
`p2pRequestId` is the handle for status and cancel.

### 2.2 Status request

`{ username, appKey, origP2pRequestId }` → a large payment object. The fields that matter:

| Field | Meaning |
|---|---|
| `status` | **May be absent.** When present: `AUTHORIZED` \| `FAILED` \| `EXPIRED` \| `VOIDED` \| `REFUNDED`. |
| `messageCode` | Always present. The lifecycle marker (table below). |
| `txnId` | Ezetap's transaction id — store it, it is the reconciliation key. |
| `amount`, `totalAmount` | What was actually collected. |
| `payerName`, `userMobile`, `formattedPan`, `cardLastFourDigit`, `paymentCardBrand`, `authCode`, `rrNumber` | Payer details for the receipt. |
| `settlementStatus` | `PENDING` / `FAILED` — settlement, not authorisation. Ignore for "did they pay". |

### 2.3 Message codes → what we do

| `messageCode` | `status` | Meaning | Our action |
|---|---|---|---|
| `P2P_STATUS_QUEUED` | absent | Queued on Ezetap's server | keep polling |
| `P2P_DEVICE_SENT` | absent | Delivered to device | keep polling |
| `P2P_DEVICE_RECEIVED` | absent | Device showed it | keep polling |
| `P2P_DEVICE_TXN_DONE` | `AUTHORIZED` | **Money collected** | mark paid, book sale |
| `P2P_DEVICE_TXN_DONE` | `FAILED` | Declined | mark failed |
| `P2P_DEVICE_TXN_DONE` | `EXPIRED` | Notification expired | mark expired |
| `P2P_DEVICE_CANCELED` | absent | Cancelled *on the device* | mark cancelled |
| `P2P_STATUS_IN_CANCELED_FROM_EXTERNAL_SYSTEM` | absent | Cancelled by *our* cancel API | mark cancelled |
| `P2P_STATUS_IN_EXPIRED` | absent | Expired | mark expired |
| `P2P_STATUS_UNKNOWN` | absent | Ezetap does not know | keep polling; at deadline → `needs_review`, never `failed` |
| — | — | `errorCode = EZETAP_0000383` (notification not found for this ref) | treat as unknown, not failed |

### 2.4 Error codes on `pay`

| Code | Meaning | Handling |
|---|---|---|
| `EZETAP_0000382` | Device not found — wrong serial | Config error. Mark the device row unhealthy, tell the cashier to use another tender. |
| `EZETAP_0000385` | Device not on the network | Actionable by a human: "device is offline, check its WiFi/SIM". |
| `EZETAP_0000381` / `0000384` | FCM token missing / Firebase error | Same as offline. |
| `EZETAP_0000623` | **Device busy with a pending notification** | See §5.3 — we prevent this locally rather than discovering it here. |
| `EZETAP_0000387` | `externalRefNumber` empty | Programming error; must be impossible. |
| `EZETAP_0000039` / `0000050` / `0000162` | Amount unsupported / above / below limit | Bounds check before pushing. |
| `EZETAP_6000001` | No such payment mode | `mode` not provisioned for this merchant. |
| `EZETAP_0000148` | Device does not belong to the org | Config error. |

### 2.5 Demo-environment error simulation

Passing these amounts on the **demo** host triggers specific failures: `408` (PG takes 3 min),
`410` timeout, `501` call issuer, `505` do-not-honor, `513` invalid amount, `531` declined,
`533` expired card, `542` timeout, `591` host unavailable, `666` (PG takes 1.5 min). Razorpay
asks for ≥50% of these to be exercised before go-live. These become the UAT matrix in §11.

---

## 3. Where this differs from the existing Razorpay integration

This is the section to read before writing any code. The existing `razorpay/**` client cannot be
reused as-is — almost every axis differs.

| Axis | Razorpay REST (existing, `lib/services/payments/razorpay/client.ts`) | Ezetap p2padapter (new) |
|---|---|---|
| Host / version | `api.razorpay.com/v1` | `{demo\|www}.ezetap.com/api/3.0` |
| Auth | HTTP Basic `keyId:keySecret` header | `appKey` + `username` **inside the JSON body** |
| Amount unit | **paise**, integer (`Paise` branded type) | **rupees, decimal** — see §3.1 |
| Confirmation | webhook (HMAC-signed) **+** pull inquiry | **pull only. There is no webhook and no signature.** |
| Success signal | `payment.status === 'captured'` | `status === 'AUTHORIZED'` — see §3.2 |
| Target | the customer's own phone/browser | one specific physical device, by serial |
| Concurrency | many orders at once | **one pending push per device** (`EZETAP_0000623`) |
| Cancel | close the QR | `POST /cancel`, refused once the customer has submitted (`P2P_PAYMENT_INITIATED`) |
| Refund | `POST /refunds` (implemented) | **no refund endpoint in this API** — see §10 |
| Idempotency | `order_id` | `externalRefNumber` (must be unique) + `p2pRequestId` |

### 3.1 ⚠️ The amount unit is unverified and is a 100× risk

The PDF never states the unit for `amount`. Evidence in both directions:

- p.15/p.38 sample requests send `"amount":"2100"` — an integer, which *could* be paise (₹21).
- p.22's failure response carries `"amount": 531.00`, `"amountOriginal": 531.00`,
  `"amountCashBack": 0.00` — **two decimal places, which paise never have.**

The decimals are strong evidence for rupees, and the datatype is declared `BigDecimal` (paise
would be a long). **Treat as rupees, and make it impossible to be wrong twice:**

1. Exactly one function converts — `toEzetapAmount(paise: Paise): string` in
   `lib/services/payments/ezetap/amount.ts`. Nothing else touches the unit.
2. Its inverse `fromEzetapAmount(value: string | number): Paise` parses the status response.
3. **UAT gate (blocking):** a real ₹1.00 transaction on the demo host must show `1.00` on the
   device and `1.00` in the status response before any production key is issued. If the device
   shows ₹0.01, flip the two functions and re-run. Record the result in this file.

Every internal figure stays `Paise` (`lib/services/payments/amount.ts`), exactly as the rest of
the payments stack does. The rupee representation exists only on the wire.

### 3.2 `success: true` does not mean paid

p.22 of the PDF shows a **declined** card whose status response begins:

```json
{ "success": true, "messageCode": "P2P_DEVICE_TXN_DONE",
  "errorCode": "EZETAP_1000003", "errorMessage": "Card Declined…",
  "status": "FAILED", "settlementStatus": "FAILED" }
```

`success` describes *whether the status lookup worked*, not whether money moved. The PDF says it
twice (p.23, p.43): **"If the Status = AUTHORIZED only then the payment is considered as
successful."**

This must be enforced by types, not by discipline — see the `DqrOutcome` union in §6.3. There is
no code path in which a boolean from the response body can reach a "paid" write.

### 3.3 No signature, no webhook — and what replaces them

The existing integration has two independent proofs that money moved: an HMAC-signed webhook and
a server-to-server inquiry (`dualInquiry`). The p2padapter API has neither a signature nor a
webhook. This is a genuine reduction in assurance and must be compensated:

- **The browser can never assert payment.** No client route accepts a status, a `p2pRequestId`,
  or an amount. The only thing the POS screen may do is ask "what does the server think?".
- **Only our server talks to Ezetap**, holding the `appKey`. The pull inquiry therefore carries
  the same weight `dualInquiry` does today: it is an authenticated server-to-server question.
- **The `WEBHOOK_MODULES` registry in `webhook-module-registry.ts` is not modified.** DQR has no
  webhook to route. This is worth stating because that registry is deliberately built so a new
  `PaymentModule` cannot compile without declaring its webhook behaviour — and DQR is not a new
  module. It is a new *instrument* inside the existing `ims` module, whose webhook config already
  exists and stays untouched.

---

## 4. Architecture

### 4.1 Layering — mirrors `razorpay/` file for file

```
lib/services/payments/
├── amount.ts                      (existing — Paise branded type, unchanged)
├── provider.ts                    (existing — PaymentProvider, UNCHANGED, see §4.2)
├── factory.ts                     (existing — + getPosDeviceProvider(), see §4.3)
├── razorpay/                      (existing, untouched)
└── ezetap/                        ← NEW
    ├── types.ts                   wire types (EzetapPayResponse, EzetapStatusResponse, …)
    ├── amount.ts                  toEzetapAmount / fromEzetapAmount — the ONLY unit boundary
    ├── credentials.ts             EzetapCredentials { appKey, username, baseUrl, mode, deviceSerial, … }
    ├── client.ts                  ezetapRequest() — mirrors razorpay/client.ts
    ├── device-vault.ts            pgcrypto vault — mirrors razorpay/account-vault.ts
    ├── resolve-credentials.ts     device resolution + fail-closed — mirrors razorpay/resolve-credentials.ts
    ├── push-pay.ts                POST /p2padapter/pay
    ├── get-status.ts              POST /p2padapter/status + normalizeDqrStatus()
    ├── cancel.ts                  POST /p2padapter/cancel
    └── ezetap-pos-provider.ts     class EzetapPosProvider
```

### 4.2 `EzetapPosProvider` deliberately does **not** implement `PaymentProvider`

`lib/services/payments/provider.ts` requires `createOrder`, `verifySignature`,
`verifyWebhookSignature`, `getOrderStatus`, `getPaymentStatus`, `createRefund`. A device push has
none of those: no order entity, no signature scheme, no refund endpoint.

This is not a new judgement call — the codebase already made it. `RazorpayProvider.createQrCode`
and `.dualInquiry` sit outside the interface with this comment:

> *"Deliberately NOT on the PaymentProvider interface. A QR is a Razorpay product; forcing it
> onto the interface would oblige any future provider to pretend it has one."*

`EzetapPosProvider` is a sibling with its own narrow surface:

```ts
export class EzetapPosProvider {
  readonly name = 'ezetap_pos' as const;
  constructor(private readonly creds: EzetapCredentials) {}

  /** Push an amount to the device. Returns the p2pRequestId handle. */
  push(input: PushPayInput): Promise<PushPayResult>;

  /** Ask what happened. Returns a normalized, exhaustive outcome — never a raw boolean. */
  getOutcome(p2pRequestId: string): Promise<DqrOutcome>;

  /** Withdraw a pending push. Idempotent; safe to call on an already-finished push. */
  cancel(p2pRequestId: string): Promise<CancelResult>;
}
```

Keeping the methods on the class (rather than exporting free functions the caller invokes with
credentials) preserves the one invariant the class exists for: **`appKey` never leaves it**. Same
reasoning as the note already in `razorpay-provider.ts`.

`PaymentProviderName` in `provider.ts` gains `'ezetap_pos'` **only** so the union can label a
transaction row's `provider` column. `getActiveProviderName()` — which throws on anything that is
not `'razorpay'` — is untouched, because DQR does not route through the order path.

### 4.3 Factory addition

```ts
// lib/services/payments/factory.ts  (append; nothing existing changes)

export interface PosDeviceContext {
  /** Pinned pos_devices.id from the payment row — rotation-safe (mirrors accountId). */
  deviceId?: string | null;
  /** Resolve the store's active device when no id is pinned. */
  storeId?: string | null;
  institutionId?: string | null;
  /** Set at push time only: rejects demo-mode devices in production. */
  purpose?: 'push-payment';
}

export async function getPosDeviceProvider(ctx: PosDeviceContext): Promise<EzetapPosProvider> {
  const creds = await resolveEzetapCredentials(ctx);
  return new EzetapPosProvider(creds);
}
```

Resolution order mirrors `resolveRazorpayCredentials` exactly:

1. **Pinned `deviceId`** — used at every status/cancel call so an in-flight payment is always
   queried against the device it was pushed to, even after the store's active device changes.
2. **Store's active device** — used at push time.
3. **No env fallback.** There is no "common device": a device is physical and belongs to one
   counter. Absence is a hard, actionable failure (`"No payment terminal is set up for this
   store — take payment by cash or card."`), not a silent redirect to someone else's hardware.

Point 3 is the one deliberate departure from the Razorpay resolver, and it is the safer default.

### 4.4 Fail-closed on demo credentials in production

Directly parallel to `assertUsableForNewOrder` / `sandboxPaymentsAllowed()`:

```ts
// A demo device SIMULATES payment (amount 505 "succeeds" as Do-Not-Honor, etc.).
// A real bill pushed to a demo device books a sale for money that never moved.
if (ctx.purpose === 'push-payment' && creds.mode === 'demo' && !sandboxPaymentsAllowed()) {
  throw new Error(
    'This counter is linked to a DEMO payment terminal, which cannot take real money. ' +
    'Ask an administrator to activate the production terminal in Billing → POS Devices.'
  );
}
```

`sandboxPaymentsAllowed()` is reused unchanged from `razorpay/resolve-credentials.ts` — same
`VERCEL_ENV`/`NODE_ENV` split, same `RAZORPAY_ALLOW_TEST_PAYMENTS=true` escape hatch. Reusing it
rather than adding `EZETAP_ALLOW_TEST_PAYMENTS` means there is one switch for "this deployment may
rehearse with fake money", not two that can disagree.

---

## 5. Database

### 5.1 `pos_devices` — new table (device registry + credential vault)

Mirrors `razorpay_accounts` (`20260603130000_razorpay_institution_accounts.sql`) including its
draft → active → inactive lifecycle and its pgcrypto storage pattern.

```sql
-- supabase/migrations/2026XXXXXXXXXX_pos_devices.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- NOTE: on Supabase pgcrypto lives in `extensions`; every SECURITY DEFINER below
-- MUST carry  SET search_path = public, extensions

CREATE TABLE IF NOT EXISTS public.pos_devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  institution_id        uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  -- Which counter this terminal physically sits on. NULL = institution-wide spare.
  store_id              uuid REFERENCES public.ims_stores(id) ON DELETE SET NULL,

  device_label          text NOT NULL,          -- "Dental Store — Counter 1"
  -- Printed on the terminal. Semi-public, so stored plaintext (like key_id).
  device_serial         text NOT NULL,
  device_kind           text NOT NULL DEFAULT 'razorpay_pos_soundbox'
                        CHECK (device_kind IN ('razorpay_pos_soundbox','ezetap_android')),

  username              text,                   -- NULL while draft
  app_key_encrypted     bytea,                  -- pgp_sym_encrypt; NULL while draft
  account_label         text,                   -- Ezetap accountLabel for multi-TID devices
  mid                   text,
  tid                   text,

  mode                  text NOT NULL DEFAULT 'live' CHECK (mode IN ('demo','live')),
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','inactive')),
  is_active             boolean NOT NULL DEFAULT false,

  -- Health, written by the push path. Purely informational: never gates a push,
  -- because a device that was offline a minute ago may be online now.
  last_push_at          timestamptz,
  last_error_code       text,
  last_error_at         timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.profiles(id),
  updated_by            uuid REFERENCES public.profiles(id)
);

-- One active terminal per counter. A second would make "push to this store" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS pos_devices_active_store_uidx
  ON public.pos_devices (store_id) WHERE is_active AND store_id IS NOT NULL;

-- A serial identifies one piece of hardware; two active rows for it would race.
CREATE UNIQUE INDEX IF NOT EXISTS pos_devices_active_serial_uidx
  ON public.pos_devices (device_serial) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_pos_devices_institution ON public.pos_devices (institution_id);

ALTER TABLE public.pos_devices ENABLE ROW LEVEL SECURITY;
-- Secrets live here. Every read goes through a SECURITY DEFINER RPC.
CREATE POLICY "Service role manages pos devices" ON public.pos_devices
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.pos_devices FROM anon, authenticated, PUBLIC;
```

RPCs to add, each `SECURITY DEFINER`, `SET search_path = public, extensions`, `REVOKE`d from
`anon`/`authenticated` and `GRANT`ed to `service_role` only — one-for-one with the Razorpay set:

| RPC | Mirrors |
|---|---|
| `fn_create_pos_device_draft` | `fn_create_razorpay_draft` |
| `fn_activate_pos_device(p_id, p_username, p_app_key, p_master_secret, p_actor)` | `fn_activate_razorpay_account` |
| `fn_get_pos_device_by_id(p_id, p_master_secret)` | `fn_get_razorpay_account_by_id` |
| `fn_get_pos_device_for_store(p_store_id, p_master_secret)` | `fn_get_razorpay_account` |
| `fn_list_pos_devices()` — **no secrets returned** | `fn_list_razorpay_accounts` |
| `fn_update_pos_device_meta` | `fn_update_razorpay_account_meta` |
| `fn_deactivate_pos_device_by_id` | `fn_deactivate_razorpay_account_by_id` |
| `fn_delete_pos_device_by_id` — refuses when payments pin it | `fn_delete_razorpay_account_by_id` |

**Master secret:** reuse `RAZORPAY_CREDENTIALS_MASTER_SECRET`. A second master secret is a second
thing to rotate, back up, and get wrong, for credentials of identical sensitivity issued by the
same vendor. `EzetapDeviceVault.isConfigured()` reads the same env var.

> ⚠️ **Apply-order hazard.** Per project history, hand-applied migrations land *partially* and
> leave "function not found in schema cache". After applying, audit with a `pg_proc` LEFT JOIN over
> the eight `fn_*_pos_device*` names above rather than trusting the absence of an error.
> `supabase db push` does not work in this repo — apply out of band.

### 5.2 `ims_gateway_payments` — additive columns only

The reference table (`20260730160000_ims_gateway_payments.sql`) already carries everything a
counter payment needs: server-priced `cart_snapshot`, the `finalize_claimed_at` lease, `late_credit`,
`finalize_error`, and the `uq_ims_sales_gateway_payment` unique index that makes double-booking
impossible at the database. **Reuse it. Do not create a parallel table.**

```sql
-- supabase/migrations/2026XXXXXXXXXX_ims_gateway_payments_pos_dqr.sql

ALTER TABLE public.ims_gateway_payments
  ADD COLUMN IF NOT EXISTS pos_device_id   uuid REFERENCES public.pos_devices(id),
  -- Ezetap's handle for the push. Unique: it is our idempotency key for status/cancel.
  ADD COLUMN IF NOT EXISTS p2p_request_id  text,
  -- Ezetap's own transaction id, from the status response. The reconciliation key
  -- against the Razorpay POS dashboard.
  ADD COLUMN IF NOT EXISTS ezetap_txn_id   text,
  -- Denormalised for reporting: pos_devices is service_role-only under RLS, so a
  -- report in the cashier's session cannot join to it. Same reasoning as the
  -- existing razorpay_key_id column.
  ADD COLUMN IF NOT EXISTS device_serial   text,
  ADD COLUMN IF NOT EXISTS device_label    text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_gwpay_p2p_request
  ON public.ims_gateway_payments (p2p_request_id) WHERE p2p_request_id IS NOT NULL;

-- ⚠️ ENUM DRIFT: the TS union and this CHECK must be widened in the same deploy.
-- Widening the union alone yields an opaque 500 on the first DQR sale.
ALTER TABLE public.ims_gateway_payments
  DROP CONSTRAINT IF EXISTS ims_gateway_payments_method_check;
ALTER TABLE public.ims_gateway_payments
  ADD  CONSTRAINT ims_gateway_payments_method_check
       CHECK (method IN ('upi_qr','pos_dqr'));

-- 'needs_review' is new: P2P_STATUS_UNKNOWN at the deadline is neither paid nor
-- failed, and calling it 'failed' would tell a cashier to collect money that may
-- already have moved. See §6.4.
ALTER TABLE public.ims_gateway_payments
  DROP CONSTRAINT IF EXISTS ims_gateway_payments_status_check;
ALTER TABLE public.ims_gateway_payments
  ADD  CONSTRAINT ims_gateway_payments_status_check
       CHECK (status IN ('initiated','paid','failed','expired','cancelled',
                         'amount_mismatch','needs_review'));
```

**`ims_sales.payment_method` is NOT changed.** The existing migration is explicit that the gateway
leg tenders through the existing `upi_qr` fields and that what marks a sale gateway-verified is the
`gateway_payment_id` FK — "a stronger claim than an enum value: it points at the confirmed payment
row itself." DQR inherits that unchanged, so `ims_pos_checkout` needs no modification and the
`ims_sales_payment_method_check` constraint is left alone.

### 5.3 The device-busy invariant

`EZETAP_0000623` — *"Device is busy with pending notification"* — is the failure mode most likely to
bite a real counter: a cashier starts a sale, the customer wanders off, the cashier starts the next
sale, and the push is refused because the first notification is still on the screen.

Make it impossible locally rather than discovering it at the gateway:

```sql
-- At most one in-flight push per device, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_device_inflight
  ON public.ims_gateway_payments (pos_device_id)
  WHERE pos_device_id IS NOT NULL AND status = 'initiated';
```

The insert-before-push ordering (§6.1) means this index fires **before** any Ezetap call. A `23505`
on it is caught and turned into an actionable message that offers the remedy:

> *"Counter 1's terminal is still waiting on a payment of ₹450 started 40 seconds ago.
> Cancel that first, or wait for it to finish."* — with a **Cancel it** button that calls the
> cancel route for the blocking payment.

---

## 6. Service layer — `lib/services/ims/pos-device-payment-service.ts`

Modelled on `ImsGatewayPaymentService`, reusing its private helpers' shape and its rules. The two
services sit side by side and share the table; extracting their common parts is explicitly **not**
part of this work (see §12).

### 6.1 `pushToDevice(input, userId)`

Order of operations is load-bearing and is copied from `createPaymentSession`:

1. **`assertStoreAccess`** — reuse verbatim, including its two pre-flight checks
   (`is_pos_store`, `ims.sales.create`). The reason those exist applies identically here: a
   condition that will refuse the *sale* afterwards must refuse the *payment* first, or the money
   is taken and the cashier watches a spinner forever.
2. **`priceServerSide`** — reuse verbatim. The route accepts `lines`, never an amount.
3. **Bounds** — `MIN_AMOUNT_PAISE` / `MAX_AMOUNT_PAISE`, so `EZETAP_0000039/50/162` cannot happen.
4. **Resolve the device** with `purpose: 'push-payment'` (fails closed on demo mode in prod).
5. **INSERT the row first**, `status='initiated'`, `method='pos_dqr'`, `pos_device_id` set,
   `expires_at = now() + 150s`. If the unique index in §5.3 rejects it, the device is busy — stop
   here, before any push. *"If the API succeeds and our write then fails, the reverse order would
   leave a live [push] the customer can pay into with nothing tracking it."*
6. **`POST /p2padapter/pay`** with `externalRefNumber = transaction_ref`.
7. **Write `p2p_request_id`**, guarded, error surfaced — never dropped.
8. **On any throw after step 6**: mark the row failed **and attempt `POST /cancel`**. This is the
   one step with no Razorpay analogue: a push that landed but whose id we failed to record leaves
   a live notification blocking the terminal. Best-effort cancel; the §8 sweep is the backstop.

`transaction_ref` keeps the existing generator but a distinct prefix — `IMSDQR-…` — so the two
instruments are distinguishable in the Razorpay POS dashboard at a glance.

### 6.2 `getStatus(paymentId, userId)`

Same three-act shape as the existing `getStatus`, and the same reasoning applies to each act:

1. **Ask Ezetap** if the row is still open and the cooldown has elapsed. Pin `pos_device_id` — do
   not re-resolve by store, or a device swap mid-payment queries the wrong terminal.
2. **Book the sale** if paid and `sale_id IS NULL`, via `ims_gateway_finalize_sale` in the
   **cashier's session** (its `auth.uid()` guard needs no service-role bypass). Reuse the existing
   `FATAL_FINALIZE_CODES` set and the `finalize_fatal` flag unchanged.
3. **Report.** `sale_id`, not `paid`, is the terminal state the UI waits on.

Two DQR-specific additions:

- **Deadline enforcement.** If `now() > expires_at` and the outcome is still pending, call
  `/cancel`, then write `expired` (or `cancelled` if Ezetap confirms the cancel). Doing this
  inside the poll — not only in the sweep — means the common case is resolved while the cashier is
  still looking at the screen.
- **`late_credit` still applies.** If a cancel races a payment and Ezetap later reports
  `AUTHORIZED`, take the money and flag it. The existing rule holds: *"NEVER REFUSE MONEY WE
  RECEIVED."*

### 6.3 The status normalizer — one function, one exhaustive union

```ts
// lib/services/payments/ezetap/get-status.ts

export type DqrOutcome =
  | { kind: 'pending';   messageCode: string }
  | { kind: 'paid';      txnId: string; amountPaise: Paise; payer: PayerDetails; authCode: string | null }
  | { kind: 'failed';    reason: string; errorCode: string | null }
  | { kind: 'expired' }
  | { kind: 'cancelled'; by: 'device' | 'external_system' }
  | { kind: 'unknown';   messageCode: string };

export function normalizeDqrStatus(res: EzetapStatusResponse): DqrOutcome {
  // `status` is the only word that means money moved. `success` is about the
  // LOOKUP, not the payment — p.22 shows success:true on a declined card.
  if (res.status === 'AUTHORIZED') return { kind: 'paid', /* … */ };
  if (res.status === 'FAILED')     return { kind: 'failed', /* … */ };
  if (res.status === 'EXPIRED')    return { kind: 'expired' };

  switch (res.messageCode) {
    case 'P2P_STATUS_QUEUED':
    case 'P2P_DEVICE_SENT':
    case 'P2P_DEVICE_RECEIVED':                       return { kind: 'pending', /* … */ };
    case 'P2P_DEVICE_CANCELED':                       return { kind: 'cancelled', by: 'device' };
    case 'P2P_STATUS_IN_CANCELED_FROM_EXTERNAL_SYSTEM':
                                                      return { kind: 'cancelled', by: 'external_system' };
    case 'P2P_STATUS_IN_EXPIRED':                     return { kind: 'expired' };
    default:                                          return { kind: 'unknown', /* … */ };
  }
}
```

`res.success` is not read anywhere in this function, and a unit test should assert that
`'success'` never appears in a conditional in `lib/services/payments/ezetap/**`.

### 6.4 `needs_review` — why a seventh status exists

`P2P_STATUS_UNKNOWN` at the 150-second deadline means Ezetap cannot say whether money moved. Both
available words are wrong:

- `failed` tells the cashier to collect again — and if the payment *did* land, the customer is
  charged twice.
- `expired` implies nothing happened, and the row stops being looked at.

`needs_review` is terminal for the *cashier* (stop polling, tender another way or hold the goods)
and non-terminal for *operations*: the sweep in §8 keeps asking, and the Razorpay POS dashboard is
reconciled against `ezetap_txn_id`. It is added to `terminalStatuses` nowhere — it is not a webhook
concern — but the poll and the cancel path both treat it as "do not overwrite".

### 6.5 Amount check — unchanged rule, new unit

```ts
const capturedPaise = fromEzetapAmount(res.amount);      // the ONLY unit boundary
if (capturedPaise !== Number(row.amount_paise)) {
  // Same verdict the webhook, the callback and the poll already reach for Razorpay.
  await writeRow(service, row.id, { status: 'amount_mismatch', /* … */ });
}
```

`payerDetailsFrom` is **not** reusable — it reads Razorpay's payment shape. Add
`ezetapPayerDetailsFrom(res)` mapping `payerName → payer_name`, `userMobile → payer_contact`,
`cardLastFourDigit → payer_card_last4`, `paymentCardBrand → payer_card_network`, `vpa`/UPI handle
where present. It writes **the same columns** as the Razorpay extractor, so a receipt renders
identically regardless of instrument — the property the existing code calls out as mattering
because "which one wins is a race the user cannot see, so it must not change the answer to 'who
paid?'".

---

## 7. API routes

All under `app/api/ims/payment/pos-device/`, mirroring the shape of
`app/api/ims/payment/gateway/`.

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/ims/payment/pos-device/push` | POST | `{ storeId, lines, additionalDiscount, customerType, customerName, customerPhone }` → opens the payment and pushes. **Never accepts an amount.** | session; `ims.sales.create` via `assertStoreAccess` |
| `/api/ims/payment/pos-device/[id]/status` | GET | The poll. Inquires upstream, books the sale, reports. | session; RLS scopes the row |
| `/api/ims/payment/pos-device/[id]/cancel` | POST | Cashier withdrew the push. | session; RLS scopes the row |
| `/api/billing/pos-devices/**` | GET/POST | Admin CRUD, mirroring `app/api/billing/payment-accounts/**` (`route`, `draft`, `activate`, `deactivate`, `update`, `delete`, `test`). | `billing.pos_devices.*` |

`/test` pushes ₹1.00 to the device and immediately cancels — the fastest way to prove a serial and
an `appKey` are right, and the direct analogue of the existing account `/test` action.

Error mapping follows the existing `create/route.ts` convention: configuration and cart problems
are 400 with the counter-facing message intact; `Store not found` 404; access 403; everything else
500.

---

## 8. The reconciliation sweep — `app/api/cron/ims-pos-device-sweep`

**This is not optional, and it is the largest operational difference from the Razorpay flow.**

The existing gateway payment survives an abandoned browser: Razorpay's webhook still arrives, and
the order simply expires. A DQR push does not. If the cashier closes the tab, the poll stops, and:

- the terminal keeps displaying a live payment request,
- the customer may still pay it, with nothing recording that,
- and the next sale at that counter is refused with `EZETAP_0000623`.

The sweep runs every minute and, for every `method='pos_dqr'` row:

| Condition | Action |
|---|---|
| `status='initiated'` and `expires_at < now()` | `POST /cancel`; re-inquire once; write `cancelled` / `expired` / — if it turns out `AUTHORIZED` — `paid` with `late_credit=true`. |
| `status='paid'` and `sale_id IS NULL` and `finalize_error IS NOT NULL` and not fatal | Retry `ims_gateway_finalize_sale`. Money is ours; the sale must exist. |
| `status='needs_review'` older than 15 min | Re-inquire. `P2P_STATUS_UNKNOWN` frequently resolves once Ezetap reconciles with the acquirer. |

Registered in `vercel.json` alongside the existing crons, with the same `?secret=${CRON_SECRET}`
guard. The finalize retry runs **service-role**, which is the one place `ims_gateway_finalize_sale`
is called without a cashier session — note that `20260804160000_ims_gateway_finalize_keeps_cashier.sql`
already ensures the sale keeps the original cashier, so the sweep does not rewrite attribution.

---

## 9. UI

### 9.1 POS — `components/ims/pos-device-payment.tsx`

`components/ims/payment-modal.tsx` gains a tab. The current `PaymentTab` union is
`'cash' | 'card' | 'gpay' | 'upi_qr' | 'upi_verified' | 'mixed'`; add `'pos_dqr'`, labelled
**"Pay on Terminal"**, shown only when the store has an active `pos_devices` row *and*
`NEXT_PUBLIC_IMS_POS_DQR_ENABLED` is on.

Unlike `GatewayPaymentLauncher`, there is **no redirect and no second component** — the browser
never leaves, which removes the whole `?gp=<id>` return-path problem the redirect flow needs
`GatewayPaymentReturn` for. One component, four states:

```
┌─ Pay on Terminal ──────────────────────────────────┐
│  Amount        ₹ 1,240.00                          │
│  Terminal      Dental Store — Counter 1  ● online  │
│                                                    │
│  ▸ pushing    "Sending to the terminal…"           │
│  ▸ waiting    "Ask the customer to scan / tap."    │
│                 ⏱ 2:07 remaining   [ Cancel ]      │
│  ▸ paid       "Payment received — booking sale…"   │
│  ▸ done       "Sale INV-00412"                     │
└────────────────────────────────────────────────────┘
```

The three rules the existing component documents carry over verbatim, and the third is the one
that matters most here:

- **It never calls `onCreateSale`.** The server books from the cart it priced.
- **`paid` is not the finish line** — `sale_id` is.
- **Once the money is in, never ask for it again.** Every post-`paid` failure offers *"keep
  trying"*, never *"collect payment"*.

Poll cadence: **2s** browser → our `/status`. Upstream cooldown is server-side (§9.3), so a second
tab or a manual refresh cannot multiply calls to Ezetap.

The countdown is cosmetic. **The deadline is enforced server-side**, in the poll and in the sweep —
a closed laptop must not leave a terminal armed.

### 9.2 Admin — `/billing/pos-devices`

A sibling of `/billing/payment-accounts`, reusing `PaymentAccountsManager`'s structure: a table of
devices, the same draft → activate → rotate → deactivate → delete lifecycle, and the same
write-only secret handling (the `appKey` is never returned after saving; the list RPC does not
select it).

Placed under `/billing` rather than `/ims` deliberately: it is a credential-vault screen with the
same audience, the same secret-handling affordances, and the same auditing as the Razorpay account
screen — and putting the two merchant-credential screens in one place is worth more than filing the
device next to the store it sits on. Cross-link from IMS store settings.

New permission keys in `lib/constants/permissions.ts`, alongside `billing.payment_accounts.*`:
`billing.pos_devices.view` / `.manage`. Gate the page with
`<PermissionGuard module='billing.pos_devices' action='view'>` and register the route in
`MENU_PERMISSIONS` — per project history that is the single gate for both nav and search, so a
route missing from it is reachable but invisible.

### 9.3 Timing constants

Razorpay's suggested cadence (p.27–28) is *"start at 30s, poll every 10s until 150s"* and the PDF
states these are *"suggested best practices … and are configurable."* Thirty seconds of a blank
screen is not acceptable at a till, so the values below are tuned for the counter and every one is
env-overridable.

```ts
const DQR_FIRST_INQUIRY_MS    = 8_000;   // EZETAP_DQR_FIRST_INQUIRY_MS
const DQR_INQUIRY_COOLDOWN_MS = 6_000;   // EZETAP_DQR_INQUIRY_COOLDOWN_MS (cf. Razorpay's 5_000)
const DQR_DEADLINE_MS         = 150_000; // EZETAP_DQR_DEADLINE_MS — the vendor's own ceiling
const DQR_BROWSER_POLL_MS     = 2_000;   // screen freshness only; does not reach Ezetap
```

Worst case ≈ 24 upstream calls per sale. If Razorpay reports rate-limiting during UAT, raise
`DQR_INQUIRY_COOLDOWN_MS` — no code change.

---

## 10. Scope boundaries

| Item | In / Out | Reason |
|---|---|---|
| DQR collection at the IMS counter | **In** | The counter is the only place a customer-facing terminal exists. |
| POS Bridge (`ezetap_android` handheld) | **Out (designed for)** | Same three endpoints; only `pushTo` and `mode` differ. `device_kind` exists so adding it later is configuration, not code. |
| Razorpay POS **Android SDK** (PDF §3) | **Out** | Requires shipping an Android app. MyJKKN is a web app; the p2padapter API is precisely the server-to-server alternative. |
| **Refunds / voids on a DQR sale** | **Out** | *The p2padapter API has no refund endpoint.* The SDK's Void Payment API is same-day only and needs the Android app. Refunds are performed in the Razorpay POS dashboard and reconciled against `ezetap_txn_id`. **The POS UI must not offer a refund button for a `pos_dqr` sale.** |
| Billing (student fee) collection via DQR | **Out of this phase** | Would need `payment_transactions` columns and a receipt path. The device layer is module-agnostic (`push()` takes any ref), so this is additive later. Note the standing constraint: shared billing tables take additive nullable columns only. |
| Settlement reconciliation reports | **Out** | `settlementStatus` is captured in `gateway_response`; reporting is a follow-up. |
| Cash / cheque via `mode` | **Out** | A cash button on a terminal records a payment the gateway did not take. `mode` is fixed to `UPI` (or `ALL` once card is provisioned). |

---

## 11. Testing

### 11.1 Unit — `__tests__/lib/services/payments/ezetap/`

Mirrors the existing `__tests__/lib/services/payments/razorpay/` suite.

| File | Asserts |
|---|---|
| `amount.test.ts` | `toEzetapAmount(toPaise(1240.5)) === '1240.50'`; round-trips; rejects negative/non-finite. |
| `normalize-status.test.ts` | Every row of the §2.3 table. **Includes p.22's declined card verbatim** — `success: true`, `status: 'FAILED'` — asserting `kind === 'failed'`. |
| `normalize-status.test.ts` | `success` appears in no conditional in `ezetap/**` (source scan). |
| `push-pay.test.ts` | Body carries `appKey`/`username`; `pushTo.deviceId` is `"<serial>\|razorpay_pos_soundbox"`; `externalRefNumber` non-empty. |
| `client.test.ts` | Retries 502/503/504 only; a 4xx surfaces immediately (same policy as `razorpay/client.ts`). |
| `resolve-credentials.test.ts` | Pinned `deviceId` wins; no env fallback; demo-in-production throws. |
| `device-busy.test.ts` | A second push while one is `initiated` is refused with the actionable message, and **no Ezetap call is made**. |

### 11.2 Integration — demo host

Using the §2.5 simulation amounts, ≥50% per Razorpay's UAT bar:

| Amount | Expect |
|---|---|
| ₹1.00 | **Unit verification (§3.1) — blocking.** Device must show ₹1.00. |
| ₹2.00 | Happy path → `AUTHORIZED` → sale booked → sale number shown. |
| 505 | Do-not-honor → `failed`; cart intact; cashier can retender. |
| 531 | Declined → `failed`. |
| 410 / 542 | Timeout → still pending at deadline → cancel → `expired`. |
| 408 | PG takes 3 min — **exceeds our 150s deadline.** Verify we cancel, and that the late `AUTHORIZED` is honoured with `late_credit=true` rather than refused. |
| 666 | PG takes 1.5 min — resolves *inside* the window. Verify the poll survives 90s of pending. |
| 513 | Invalid amount → `failed` with the vendor message surfaced. |

### 11.3 Scenarios not covered by simulation amounts

| Scenario | How | Expect |
|---|---|---|
| Device unplugged | Power the terminal off | `EZETAP_0000385` at push; row `failed`; message names the terminal. |
| Wrong serial | Break `device_serial` | `EZETAP_0000382`; `last_error_code` recorded; other tenders still work. |
| Device busy | Start a push, do not pay, start another | Second refused **locally** by `uq_pos_device_inflight`; no Ezetap call; **Cancel it** button clears the first. |
| Cashier closes the tab | Push, then close | Sweep cancels within 1 min; the next sale at that counter succeeds. |
| Customer pays during cancel | Pay as Cancel is pressed | Money honoured, `late_credit=true`, sale booked. Never a paid customer with no sale. |
| Two tabs polling | Open `/status` in two tabs | One sale (`uq_ims_sales_gateway_payment` + the finalize lease). |
| Amount mismatch | Force a differing capture | `amount_mismatch`; no sale; human review. |
| Device swapped mid-payment | Deactivate the device after push | Status still resolves — pinned `pos_device_id`. |

---

## 12. What this work must not touch

- **`PaymentProvider` (`provider.ts`)** — no new members. §4.2.
- **`WEBHOOK_MODULES` (`webhook-module-registry.ts`)** — DQR has no webhook. §3.3.
- **`ims_pos_checkout`** — DQR tenders through the existing `upi_qr` fields; the FK is what marks
  it verified. §5.2.
- **`ImsGatewayPaymentService`** — the Razorpay counter flow is live. Do **not** refactor the two
  services into a shared base "while we're here." They share a table and a set of rules, not an
  implementation, and the pressure to unify them should be resisted until a third instrument
  exists to show where the seam actually is. Importing `assertStoreAccess` and `priceServerSide`
  (rather than copying their bodies) is the correct amount of sharing today.
- **`payment_transactions` / any billing table** — out of scope this phase. §10.

---

## 13. Open questions — resolve before implementation

1. **Amount unit (§3.1).** Blocking. Resolve with a ₹1.00 demo transaction; record the answer here.
2. **`mode` provisioning.** Is `UPI` alone enough, or should `ALL` be pushed so the customer may
   tap a card on the same terminal? `ALL` broadens acceptance but means the amount can be collected
   by an instrument our reporting labels as UPI. Recommend starting `UPI`, adding `ALL` once card
   settlement reporting is understood.
3. **One `appKey` per institution, or one per device?** The vault schema stores it per device,
   which is strictly more general — but if Razorpay issues one key per merchant, the same value is
   duplicated across rows and rotation must touch each. Confirm with `pos-integrations@razorpay.com`.
4. **Device procurement and SIM ownership** (PDF p.33). Who buys the terminals and the SIMs, and
   which stores get them first? Needs a shipment address list per counter.
5. **`accountLabel` / multi-TID.** Do JKKN's institutions settle to separate TIDs on one device? If
   so, `account_label` on `pos_devices` must be populated and passed on every push; if not, leave
   it NULL.
6. **Production allow-list.** Razorpay may require our egress IPs to be allow-listed for
   `www.ezetap.com`. Vercel egress is not static — confirm whether this is needed before go-live.

---

## 14. Implementation order

Each step is independently shippable and leaves the system working.

| # | Step | Verified by |
|---|---|---|
| 1 | `pos_devices` table + 8 RPCs; `EzetapDeviceVault` | `pg_proc` audit; vault unit tests |
| 2 | `ezetap/` client, types, amount, normalizer | §11.1 — **all offline** |
| 3 | `EzetapPosProvider` + `getPosDeviceProvider` | resolver tests; demo `/test` push |
| 4 | `/billing/pos-devices` admin UI + permissions | register a demo device end to end |
| 5 | `ims_gateway_payments` columns + CHECK widening + busy index | migration audit; `device-busy.test.ts` |
| 6 | `pos-device-payment-service` push + status | §11.2 demo matrix |
| 7 | API routes | route-level error-mapping tests |
| 8 | POS UI tab + `pos-device-payment.tsx` | §11.3 counter scenarios |
| 9 | Sweep cron + `vercel.json` | close the tab, watch it recover |
| 10 | UAT (§11.2 ≥50%) → Razorpay sign-off → production `appKey` → `mode='live'` | Re.1 live transaction per PDF p.63 |

Steps 1–4 ship behind no flag and change no existing behaviour: until a store has an active device
*and* `NEXT_PUBLIC_IMS_POS_DQR_ENABLED` is set, the POS is byte-for-byte what it is today.
