# Razorpay CollectNow — Reply Email (Hosted Checkout Compliance Confirmation)

> **Reply to:** the Razorpay/CollectNow partner email claiming the integration uses Standard Checkout instead of Hosted Checkout.
> **Related thread:** Ticket #19383043 (security audit) — referenced so both threads stay linked.
> **Attach:** the Hosted Checkout screenshots you captured (bill selection → Razorpay hosted page showing `api.razorpay.com` in the address bar → success page), ideally as one consolidated PDF.
> All transaction data below is real, pulled from the production database (hosted-flow test runs on 10-Jun-2026). Replace only the `«FILL: …»` placeholders before sending.

---

**Subject:** Re: CollectNow Integration — Hosted Checkout already implemented (verification transactions enclosed) — JKKN (MyJKKN) — MID «FILL: Razorpay MID» / Ticket #19383043

---

Dear Razorpay CollectNow Team,

Greetings, and thank you for reaching out regarding the checkout type used in our integration.

We would like to clarify that our platform has **already migrated from Standard Checkout to the Hosted Checkout**, exactly as per the integration steps in the documentation you referenced:

https://hdfcbank-collectnow-docs.razorpay.com/payments/payment-gateway/web-integration/hosted/integration-steps/

The earlier Standard Checkout (`checkout.razorpay.com/v1/checkout.js` modal) implementation has been **completely removed** from our application. To demonstrate this, we completed fresh test transactions through the live Hosted Checkout flow on **10-Jun-2026** — details, audit logs, and screenshots are enclosed below. We suspect the observation in your email may be based on a review performed before our migrated build went live, and request your team to kindly **re-verify against our current production environment** (https://www.jkkn.ai).

## 1. Verification transactions through the Hosted Checkout (10-Jun-2026)

All transactions were performed end-to-end on the Razorpay **hosted payment page** (`https://api.razorpay.com/v1/checkout/embedded`) — screenshots attached show the browser fully redirected to the Razorpay-hosted page (no on-page modal).

| | Transaction A (Success — latest) | Transaction B (Success) | Transaction C (Failed) |
| --- | --- | --- | --- |
| Customer | BOOBAL A (Roll No 87596328) | BOOBAL A (Roll No 87596328) | BOOBAL A (Roll No 87596328) |
| Amount | ₹10,000.00 | ₹40,000.00 | ₹40,000.00 |
| Status | Success (captured) | Success (captured) | Failed (declined by bank) |
| Payment method | Net Banking (Bank of Baroda) | Net Banking (Bank of Baroda) | Net Banking |
| Razorpay Order ID | order_Szs9J7WllC09l5 | order_SzrjFzHoqM8ML0 | order_SzcBjzwltgoEBf |
| Razorpay Payment ID | pay_Szs9V7daP7ju56 | pay_SzrkBkoGDHn2tF | pay_SzcBxkdWrGVJha |
| Bank Transaction ID | 8894158 | 6068652 | — |
| Our Transaction Ref | P202606100904255KCKB | P202606100839456VEAT | P20260609172737MMU6L |
| Receipt Number | RCP-2026-002266 | RCP-2026-002265 | — (no receipt for failed) |
| Date (IST) | 10-Jun-2026 02:34 PM | 10-Jun-2026 02:09 PM | 09-Jun-2026 10:57 PM |
| Razorpay Account | acc_SnzjAmEWfFjEpG | acc_SnzjAmEWfFjEpG | acc_SnzjAmEWfFjEpG |

## 2. Audit trail for the latest transaction (Transaction A — P202606100904255KCKB)

Complete server-side audit trail as recorded in our production database (all timestamps IST):

| # | Time (IST) | Event | Detail |
| --- | --- | --- | --- |
| 1 | 02:34:25 PM | Order created & transaction initiated | Server created Razorpay Order `order_Szs9J7WllC09l5` via `POST /v1/orders` (₹10,000.00 = 1,000,000 paise); transaction `P202606100904255KCKB` stored with status `initiated` |
| 2 | 02:34 PM | Hosted Checkout redirect | Browser redirected via form POST to `https://api.razorpay.com/v1/checkout/embedded` (`key_id`, `order_id`, `callback_url`, `cancel_url`, prefill fields) |
| 3 | 02:34 PM | Payment completed on Razorpay-hosted page | Net Banking — Bank of Baroda; bank txn ID `8894158` |
| 4 | 02:34:41 PM | Webhook: `payment.authorized` | Received at our signed webhook endpoint; signature verified; payload stored |
| 5 | 02:34:42 PM | Webhook: `payment.captured` | `pay_Szs9V7daP7ju56`, status `captured`, amount 1,000,000 paise |
| 6 | 02:34:42 PM | Webhook: `order.paid` | `order_Szs9J7WllC09l5`, `amount_paid` = 1,000,000 paise, `amount_due` = 0 |
| 7 | 02:34:43 PM | Callback received & verified | Razorpay POSTed `razorpay_order_id` / `razorpay_payment_id` / `razorpay_signature` to our `callback_url`; server validated the **HMAC-SHA256 signature**, then performed the **dual inquiry** — `GET /v1/orders/order_Szs9J7WllC09l5` and `GET /v1/payments/pay_Szs9V7daP7ju56` — and confirmed the amount to the paise |
| 8 | 02:34:44 PM | Transaction marked `success` & receipt generated | Database status updated from server-verified result only; receipt **RCP-2026-002266** issued |
| 9 | 02:34 PM | Customer response page | Success page rendered from the verified **database** status, displaying Order number, Amount (₹10,000.00) and success message |

The stored gateway response for this payment (excerpt from our database):

```json
{
  "event": "payment.captured",
  "payload": { "payment": { "entity": {
    "id": "pay_Szs9V7daP7ju56",
    "order_id": "order_Szs9J7WllC09l5",
    "amount": 1000000,
    "currency": "INR",
    "method": "netbanking",
    "bank": "BARB_R",
    "status": "captured",
    "captured": true,
    "acquirer_data": { "bank_transaction_id": "8894158" },
    "error_code": null
  }}}
}
```

**Failed transactions are stored too** — Transaction C is persisted with the full gateway error response:

```json
{
  "error_code": "BAD_REQUEST_ERROR",
  "error_step": "payment_authorization",
  "error_source": "bank",
  "error_reason": "payment_failed",
  "error_description": "Your payment didn't go through as it was declined by the bank. Try another payment method or contact your bank."
}
```

## 3. Current implementation (per the hosted-integration documentation)

1. **Order creation (server-side):** every payment first creates a Razorpay Order via `POST /v1/orders`; the transaction is stored in our database before checkout begins.
2. **Pay form (Section 1.2.1 — "Code to add Pay button"):** we render a Pay form that submits via `POST` to `https://api.razorpay.com/v1/checkout/embedded` with the documented fields — `key_id`, `order_id`, `amount`, `currency`, `name`, `description`, `prefill[name]`, `prefill[email]`, `prefill[contact]`, `notes[...]`, `callback_url` (`https://www.jkkn.ai/api/billing/payment/callback`) and `cancel_url`.
3. **Full browser redirect (Non-Seamless):** the customer is fully redirected to the Razorpay-hosted payment page; **no `checkout.js` script is loaded anywhere** on our site and all payment data is captured entirely on Razorpay's page.
4. **Signature verification:** on callback, our server validates the HMAC-SHA256 `razorpay_signature` (`order_id|payment_id` with the key secret) exactly as documented.
5. **Dual inquiry (Status API):** after signature validation our server independently calls **both** `GET /v1/orders/{order_id}` and `GET /v1/payments/{payment_id}`, verifies the amount to the paise, and only then marks the transaction successful. The customer-facing result page is driven by this verified database status — never by client/redirect parameters.
6. **Webhooks:** received at a signed endpoint, signature-verified, stored (`payment.authorized`, `payment.captured`, `order.paid`, `payment.failed` — see the trail above), and reconciled against the stored transaction.

## 4. How to verify on your side

A test transaction on https://www.jkkn.ai will show a **top-level navigation to `api.razorpay.com/v1/checkout/embedded`** in the browser address bar (as captured in the attached screenshots) rather than a `checkout.js` script load — confirming the hosted flow. The transactions in Section 1 are also visible against our account (`acc_SnzjAmEWfFjEpG`) on your dashboard for cross-verification.

If your team still observes Standard Checkout behaviour after re-testing, kindly share the URL, date/time (IST) and a screenshot or network capture of the observation so we can investigate immediately.

Thank you, and please let us know if any further information is required to confirm compliance under the CollectNow program.

Best regards,

«FILL: your name»
«FILL: designation / team»
JKKN — MyJKKN Platform (https://www.jkkn.ai)
«FILL: phone» · aidental@jkkn.ac.in

---

> **Internal note (do not send to Razorpay):**
> - All IDs/amounts/timestamps above were pulled from the production database on 10-Jun-2026 — cross-check they match the screenshots you attach; remove any row you did not screenshot.
> - Transaction A receipt: RCP-2026-002266; Transaction B receipt: RCP-2026-002265 (both `payment_mode: online`).
> - Webhook rows live in `razorpay_webhook_events` (6 events across the two successes); transaction rows in `payment_transactions`; receipts in `billing_receipts` — keep these records until the thread closes.
> - The env-level Razorpay account is in use (`razorpay_accounts` table empty) — take the MID from Razorpay's credential email, account `acc_SnzjAmEWfFjEpG`.
