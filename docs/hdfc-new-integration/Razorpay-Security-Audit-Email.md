# Razorpay Security Audit — Reply Email (Hosted Checkout)

> **Reply to:** the Razorpay/CollectNow thread — **Ticket #19383043** (To: collectnow-integrations@razorpay.com)
> **Attach (single consolidated PDF or DOCX):** transaction-flow screenshots (success + failure) **+** the verification request/response logs.
> **Send only AFTER** the Hosted Checkout build is deployed to production AND you have re-run the sample transactions through the hosted flow (so the screenshots show Razorpay's hosted page, not the old modal).
> Replace every `«FILL: …»` placeholder before sending. Everything else is pre-filled from the live MyJKKN codebase + database.

---

**Subject:** Re: Ticket #19383043 — Security Audit Details & Checklist — JKKN (MyJKKN) — MID «FILL: Razorpay MID from test-credential email»

---

Dear Razorpay CollectNow Team,

Thank you for the detailed feedback on Ticket #19383043.

**On the checkout type:** We have **migrated our integration from Standard Checkout to the Hosted Checkout** as required under the CollectNow program, following the integration steps you shared. Our application now redirects the customer to Razorpay's hosted payment page (`https://api.razorpay.com/v1/checkout/embedded`) via a server-rendered Pay form (`order_id` + `callback_url` + `cancel_url`), and the customer completes payment on the Razorpay-hosted page rather than in an on-page modal.

Please find below all the required information, the requested Yes/No confirmations, and the completed audit checklist. The transaction-flow screenshots and the verification request/response logs are attached as a single consolidated document.

## 1. Transaction-flow screenshots (attached)

The attached screenshots capture the complete flow — from selecting the bill/fee, to the **Razorpay hosted payment page**, through to the final response page. The **response page displays, in real time**:

- **Order number** (Razorpay Order ID + our transaction reference)
- **Amount** (₹, prominently displayed)
- **Success message** ("Payment Successful!")

Both a **successful** transaction and a **failed/cancelled** transaction are included.

## 2. Verification request and response logs (attached)

Attached are the server-side **dual-inquiry** logs for a sample transaction:

- Request/response for `GET https://api.razorpay.com/v1/orders/{order_id}`
- Request/response for `GET https://api.razorpay.com/v1/payments/{payment_id}`
- The webhook payload received at our signed webhook endpoint and its signature-verification result.

All payment confirmation is performed **server-side**: on Razorpay's callback to our `callback_url`, our server validates the HMAC `razorpay_signature`, then independently calls **both** Razorpay endpoints above, verifies the amount matches **to the paise**, and writes the verified status to our database. The success/failure shown to the user is sourced from that verified database status — never from client/redirect parameters. **Failed transactions are recorded too** — the gateway error response (code, description, source, step, reason) is stored against the transaction, and our signed webhook independently reconciles the outcome.

**Sample transactions completed through the Hosted Checkout (all on JKKN Testing Institution):**

| | Transaction A (Success) | Transaction B (Success) | Transaction C (Failed) |
| --- | --- | --- | --- |
| Customer | BOOBAL A (Roll No 87596328) | BOOBAL A (Roll No 87596328) | BOOBAL A (Roll No 87596328) |
| Amount | ₹10,000.00 | ₹10,000.00 | ₹40,000.00 |
| Status | Success (captured) | Success (captured) | Failed (declined by bank) |
| Payment method | Net Banking | Net Banking | Net Banking |
| Razorpay Order ID | order_SzbYQVTlHod5Ky | order_Szb5iN604GYw8R | order_SzcBjzwltgoEBf |
| Razorpay Payment ID | pay_SzbYePz4WwJKfX | pay_Szb6fu0RqQzUQJ | pay_SzcBxkdWrGVJha |
| Our Transaction Ref | P20260609165024F1XGK | P20260609162313M7LQL | P20260609172737MMU6L |
| Date (IST) | 09-Jun-2026 10:20 PM | 09-Jun-2026 09:54 PM | 09-Jun-2026 10:57 PM |

The failed transaction (C) was stored with the gateway error response: `error_code: BAD_REQUEST_ERROR`, `error_step: payment_authorization`, `error_source: bank`, `error_reason: payment_failed`, `error_description: "Your payment didn't go through as it was declined by the bank…"`.

> Note: ensure the order/payment IDs above match the IDs visible in your attached screenshots; remove any row you did not screenshot.

## 3. Pre-audit confirmations

| # | Requirement | Confirmation |
|---|-------------|--------------|
| 1 | Maintain database to store the transaction details / status | **YES** |
| 2 | Services / payment confirmation to customer provided on the basis of database status | **YES** |
| 3 | 7–8 transactions will be performed during the audit; amounts/options/links/records prepared | **YES** |
| 4 | Login credentials available till audit completion | **YES** (payment initiation requires login; test credentials below) |
| 5 | Database records will not be cleared till audit completion | **YES** |
| 6 | UAT setup is identical to the production setup | **YES** |
| 7 | Implementation of dual inquiry, i.e. "Status API", in response (Mandatory) | **YES** |
| 8 | Audit checklist implemented for integration and security-audit process | **YES** |

**On point 7 (dual inquiry / Status API):** On every payment callback our server independently calls **both** Razorpay endpoints — `GET /v1/orders/{order_id}` **and** `GET /v1/payments/{payment_id}` — after validating the HMAC signature, and confirms the amount matches to the paise before marking the transaction successful. The response page additionally re-reads the verified status from our database before showing a success result.

## 4. Audit Checklist

| Field | Value |
| ----- | ----- |
| MERCHANT NAME | «FILL: registered merchant name, e.g. J.K.K. Nattraja Educational Institutions» |
| TID / ACCOUNT ID | «FILL: Razorpay MID from the test-credential email» |
| URL | https://www.jkkn.ai/auth/audit-login |
| TRANSACTION URL is publicly accessible | **Yes** — reachable over the public internet; payment initiation requires login (test credentials below). |
| LOGIN ID | «FILL: test.admin@jkkn.ac.in (confirm this account is active)» |
| LOGIN PWD | «FILL: audit password» |
| RESPONSE URL | https://www.jkkn.ai/billing/payment/success (failure: https://www.jkkn.ai/billing/payment/failed) |
| DEVELOPER CONTACT NO | «FILL: developer phone number» |
| DEVELOPER EMAIL ID | aidental@jkkn.ac.in |
| TYPE | VAS |
| Programming Language | TypeScript / Node.js (Next.js 16 App Router, React 19); Supabase (PostgreSQL) backend |
| Seamless / Non-Seamless Integration | **Non-Seamless — Razorpay Hosted Checkout** (server-rendered form POST to `api.razorpay.com/v1/checkout/embedded`; customer redirected to the Razorpay-hosted page) |
| Plugin Name and version (If Any) | No third-party plugin — custom integration. Razorpay Hosted Checkout (`/v1/checkout/embedded`) + Razorpay REST API (`/v1/orders`, `/v1/payments`) |
| Web / Mobile / Both | **Web** (responsive web application; also installable PWA). App/Domain: https://www.jkkn.ai |
| Transaction Flow verified | **Yes** |
| Multiple Amount Values (If Applicable) | ₹10,000.00 (success) and ₹40,000.00 (failed attempt) — see section 2 |
| Transactions response is being stored in the database (including Failed) | **Yes** — both a successful (`P20260609165024F1XGK`) and a failed (`P20260609172737MMU6L`) transaction are stored with their full gateway responses |

## 5. Transaction flow summary (for reference)

1. The student selects the bill(s) to pay and initiates payment.
2. Our server creates a Razorpay **Order** (`POST /v1/orders`) and stores an `initiated` transaction record (Order ID + amount in paise) in our database.
3. We render a **Hosted Checkout** Pay form that POSTs `order_id`, `callback_url` and `cancel_url` to `https://api.razorpay.com/v1/checkout/embedded` — the browser is **fully redirected to Razorpay's hosted payment page** (Non-Seamless: all card/UPI/netbanking data is handled entirely by Razorpay).
4. On payment, Razorpay POSTs `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` to our `callback_url`.
5. Our **server** verifies the HMAC signature, performs the **dual inquiry** (`GET /orders` + `GET /payments`), verifies the amount to the paise, and **writes the verified status to the database** — successes **and** failures are persisted.
6. The customer is redirected to the response page, which displays the Order number, Amount, and Success/Failure message sourced from the verified database status.
7. Razorpay **webhooks** are received at a signed endpoint, signature-verified, logged, and reconciled against the stored transaction.

We have kept the UAT environment identical to production and will retain all transaction records and login credentials until the audit is complete. Please let us know if any additional information or access is required.

Thank you,

«FILL: your name»
«FILL: designation / team»
JKKN — MyJKKN Platform
«FILL: phone» · aidental@jkkn.ac.in

---

> **Internal note (do not send to Razorpay):**
> - **Send only after the Hosted Checkout build is deployed to production** and you have re-run the sample transactions through the hosted flow. The 3 transactions in the table above were created on the old modal flow; replace them with hosted-flow runs whose screenshots you attach.
> - The integration uses the **common env Razorpay account** (`RAZORPAY_KEY_ID/_KEY_SECRET/_WEBHOOK_SECRET`) — `razorpay_accounts` is empty. The MID for the checklist comes from Razorpay's test-credential email, not our DB.
> - The audit login is scoped to **JKKN Testing Institution only**. After the audit, rotate the password and disable the account.
> - Do not commit this file to git with a live password.
