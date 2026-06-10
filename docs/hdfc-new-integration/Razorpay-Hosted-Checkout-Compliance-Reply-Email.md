# Razorpay CollectNow — Reply Email (Hosted Checkout Compliance Confirmation)

> **Reply to:** the Razorpay/CollectNow partner email claiming the integration uses Standard Checkout instead of Hosted Checkout.
> **Related thread:** Ticket #19383043 (security audit) — reference it so both threads stay linked.
> **Send only AFTER** confirming the Hosted Checkout build (commit with `components/billing/razorpay-hosted-redirect.tsx`) is **deployed to production at https://www.jkkn.ai** — if their team re-tests against an old deployment, this reply will look wrong.
> Replace every `«FILL: …»` placeholder before sending.

---

**Subject:** Re: CollectNow Integration — Hosted Checkout already implemented — JKKN (MyJKKN) — MID «FILL: Razorpay MID» / Ticket #19383043

---

Dear Razorpay CollectNow Team,

Greetings, and thank you for reaching out regarding the checkout type used in our integration.

We would like to clarify that our platform has **already migrated from Standard Checkout to the Hosted Checkout**, exactly as per the integration steps in the documentation you referenced:

https://hdfcbank-collectnow-docs.razorpay.com/payments/payment-gateway/web-integration/hosted/integration-steps/

The earlier Standard Checkout (`checkout.razorpay.com/v1/checkout.js` modal) implementation has been **completely removed** from our application. We suspect the observation in your email may be based on a review performed before our migrated build went live; we request your team to kindly **re-verify against our current production environment**.

## Current implementation (per the hosted-integration documentation)

Our live integration follows the documented Hosted Checkout flow point-by-point:

1. **Order creation (server-side):** For every payment, our server creates a Razorpay Order via `POST https://api.razorpay.com/v1/orders` and stores the transaction in our database before checkout begins.

2. **Pay form (Section 1.2.1 of the documentation, "Code to add Pay button"):** We render a Pay form that submits via `POST` to:

   `https://api.razorpay.com/v1/checkout/embedded`

   with the documented fields:

   | Field | Sent |
   | --- | --- |
   | `key_id` | Yes |
   | `order_id` (from Orders API) | Yes |
   | `amount` (in paise) / `currency` (INR) | Yes |
   | `name` / `description` | Yes |
   | `prefill[name]` / `prefill[email]` / `prefill[contact]` | Yes |
   | `notes[...]` | Yes (our internal transaction reference) |
   | `callback_url` | Yes — `https://www.jkkn.ai/api/billing/payment/callback` |
   | `cancel_url` | Yes — failure page on our domain |

3. **Full browser redirect:** The customer's browser is **fully redirected to the Razorpay-hosted payment page** — there is no on-page modal and no `checkout.js` script loaded anywhere on our site. All card/UPI/netbanking data is captured entirely on Razorpay's hosted page (Non-Seamless).

4. **Callback handling & signature verification:** On completion, Razorpay POSTs `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` to our `callback_url`. Our **server** verifies the HMAC-SHA256 signature (`order_id|payment_id` with the key secret) as per the documentation.

5. **Dual inquiry (Status API):** After signature verification, our server independently calls **both** `GET /v1/orders/{order_id}` and `GET /v1/payments/{payment_id}`, verifies the amount to the paise, and only then marks the transaction successful in our database. The result page shown to the customer is driven by this verified database status — never by client/redirect parameters.

6. **Failure handling:** Failed payments (Razorpay's `error[code]` / `error[description]` / `error[metadata]` callback) are also persisted to our database with the full gateway error response, and our signed webhook endpoint independently reconciles outcomes.

## How to verify on your side

A test transaction on our production application (https://www.jkkn.ai) will show a **top-level navigation to `api.razorpay.com/v1/checkout/embedded`** (visible in the browser address bar / network log) rather than a `checkout.js` script load — confirming the hosted flow.

The same hosted implementation, along with sample success and failure transactions and the dual-inquiry logs, was shared in our security-audit response on **Ticket #19383043**. Please treat that submission as reflecting the current hosted integration.

If your team still observes Standard Checkout behaviour after re-testing, kindly share the URL, date/time (IST), and a screenshot or network capture of the observation so we can investigate immediately.

Thank you, and please let us know if any further information is required to confirm compliance under the CollectNow program.

Best regards,

«FILL: your name»
«FILL: designation / team»
JKKN — MyJKKN Platform (https://www.jkkn.ai)
«FILL: phone» · aidental@jkkn.ac.in

---

> **Internal note (do not send to Razorpay):**
> - Verify production deployment FIRST: open https://www.jkkn.ai, run a test payment, and confirm the browser navigates to `api.razorpay.com/v1/checkout/embedded` (not a modal). The code is correct on `main`, but the email is only true if that build is live.
> - Evidence in our codebase: launcher `components/billing/razorpay-hosted-redirect.tsx` (form POST + auto-submit); callback `app/api/billing/payment/callback/route.ts` (signature verify + dual inquiry + failure branch); provider `lib/services/payments/razorpay/` (create-order, verify-signature, get-status dual inquiry, webhook verify).
> - `razorpay_accounts` table is empty → the env-level Razorpay account (`RAZORPAY_KEY_ID`) is the one in use; take the MID from Razorpay's test-credential email.
> - Optionally attach: a short screen recording or 2–3 screenshots of the redirect showing the `api.razorpay.com` address bar — preempts another back-and-forth.
