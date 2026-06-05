# Razorpay Security Audit — Email Template

> Send to: **collectnow-integrations@razorpay.com**
> Attach: transaction-flow screenshots (success + failure) and the verification request/response logs.
> Replace every `«FILL: …»` placeholder before sending. Everything else is pre-filled from the live MyJKKN codebase.

---

**Subject:** Security Audit Details & Checklist — JKKN (MyJKKN) — MID «FILL: Razorpay MID from test-credential email»

---

Dear Razorpay Security Audit Team,

We have completed the Razorpay payment integration for our application (**MyJKKN**, the JKKN group's institutional platform) and are ready to initiate the security audit. Please find below all required information, the requested confirmations, and the completed audit checklist. The transaction-flow screenshots and verification request/response logs are attached.

## 1. Transaction-flow screenshots (attached)

The attached screenshots capture the complete flow — from selecting the bill/fee through to the final payment response page. The **response page displays, in real time**:

- **Order number** (Razorpay Order ID + our transaction reference)
- **Amount** (₹, prominently displayed)
- **Success message** ("Payment Successful!")

Both a **successful** transaction and a **failed/cancelled** transaction are included.

## 2. Verification request and response logs (attached)

Attached are the server-side **dual-inquiry** logs for a sample transaction:

- Request/response for `GET https://api.razorpay.com/v1/orders/{order_id}`
- Request/response for `GET https://api.razorpay.com/v1/payments/{payment_id}`
- The webhook payload received at our per-institution webhook endpoint and its signature-verification result.

All payment confirmation is performed **server-side** on the basis of these responses (and the resulting database status), never on client/redirect parameters.

**Sample successful transactions (already completed in the application):**

| | Transaction A | Transaction B |
| --- | --- | --- |
| Customer | BOOBAL A (Roll No 87596328) | BOOBAL A (Roll No 87596328) |
| Amount | ₹8,000.00 | ₹40,000.00 |
| Status | Success | Success |
| Razorpay Order ID | order_SxoqlFzKmXoJpk | order_SxekFtco1d3uKR |
| Razorpay Payment ID | pay_SxorGNudveoT5I | pay_Sxekm1MBVWkcHv |
| Our Transaction Ref | P20260605043246F7ZT4 | P20260604183942L7V56 |
| Receipt Number | RCP-2026-002112 | RCP-2026-002111 |
| Date (IST) | 05-Jun-2026 10:03 AM | 05-Jun-2026 00:10 AM |

Response page for Transaction A: `https://www.jkkn.ai/billing/payment/success?transaction_id=6f0599ce-8a44-43e8-b1f9-b77396ec89a5&receipt_id=e19130a7-036b-4250-a79b-512d814b5d35&amount=8000&razorpay_order_id=order_SxoqlFzKmXoJpk&razorpay_payment_id=pay_SxorGNudveoT5I&provider=razorpay`

## 3. Pre-audit confirmations

| # | Requirement | Confirmation |
|---|-------------|--------------|
| 1 | Maintain database to store the transaction details / status | **YES** |
| 2 | Services / payment confirmation to customer provided on the basis of database status | **YES** |
| 3 | 7–8 transactions will be performed during the audit; amounts/options/links/records prepared | **YES** |
| 4 | Login credentials available till audit completion | **YES** |
| 5 | Database records will not be cleared till audit completion | **YES** |
| 6 | UAT setup is identical to the production setup | **YES** |
| 7 | Implementation of dual inquiry, i.e. "Status API", in response (Mandatory) | **YES** |
| 8 | Audit checklist implemented for integration and security-audit process | **YES** |

**On point 7 (dual inquiry / Status API):** On every payment callback our server independently calls **both** Razorpay endpoints — `GET /v1/orders/{order_id}` **and** `GET /v1/payments/{payment_id}` — after validating the HMAC signature, and confirms the amount matches to the paise before marking the transaction successful. The payment success page additionally re-reads the verified status from our database before showing a success result.

## 4. Audit Checklist

| Field | Value |
| ----- | ----- |
| MERCHANT NAME | «FILL: registered merchant name, e.g. J.K.K. Nattraja Educational Institutions» |
| TID / ACCOUNT ID | «FILL: Razorpay MID from the test-credential email» |
| URL | https://www.jkkn.ai/auth/audit-login |
| TRANSACTION URL is publicly accessible | **Yes** — the application is reachable over the public internet; payment initiation requires login (test credentials provided below). |
| LOGIN ID | test.admin@jkkn.ac.in |
| LOGIN PWD | RzpAudit#2026!Jkkn |
| RESPONSE URL | https://www.jkkn.ai/billing/payment/success (failure: https://www.jkkn.ai/billing/payment/failed) |
| DEVELOPER CONTACT NO | «FILL: developer phone number» |
| DEVELOPER EMAIL ID | «FILL: developer email, e.g. aidental@jkkn.ac.in» |
| TYPE | VAS |
| Programming Language | TypeScript / Node.js (Next.js 16 App Router, React 19) |
| Seamless / Non-Seamless Integration | **Non-Seamless** (Razorpay Standard Checkout — hosted `checkout.js` modal) |
| Plugin Name and version (If Any) | No third-party plugin — custom integration. Razorpay Standard Checkout (`checkout.js` v1) + Razorpay REST API (`/v1/orders`, `/v1/payments`) |
| Transaction Flow verified | **Yes** |
| Multiple Amount Values (If Applicable) | ₹8,000.00 and ₹40,000.00 (both successful — sample transactions in section 2) |
| Transactions response is being stored in the database (including Failed) | **Yes** |

## 5. Transaction flow summary (for reference)

1. The student selects the bill(s) to pay and initiates payment.
2. Our server creates a Razorpay **Order** (`/v1/orders`) and stores an `initiated` transaction record (Order ID + amount in paise) in our database.
3. The Razorpay **Standard Checkout** hosted modal (`checkout.js`) is opened for the customer to pay (Non-Seamless — card/UPI/netbanking data is handled entirely by Razorpay).
4. On payment, the response (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) is posted to our callback endpoint.
5. The **server** verifies the HMAC signature, performs the **dual inquiry** (`GET /orders` + `GET /payments`), verifies the amount to the paise, and **writes the verified status to the database** — successes **and** failures are persisted.
6. The customer is redirected to the response page, which displays the Order number, Amount, and Success/Failure message sourced from the verified database status.
7. Razorpay **webhooks** are received at a per-institution signed endpoint, signature-verified, logged, and reconciled against the stored transaction.

We have kept the UAT environment identical to production and will retain all transaction records and login credentials until the audit is complete. Please let us know if any additional information or access is required.

Thank you,

«FILL: your name»
«FILL: designation / team»
JKKN — MyJKKN Platform
«FILL: phone» · «FILL: email»

---

> **Internal note (do not send to Razorpay):** The audit login `test.admin@jkkn.ac.in` is scoped via the
> `payment_audit_admin` role (`institution_scope='own'`) to **JKKN Testing Institution only** — it cannot see any
> other institution's data. After the audit completes, rotate the password and disable the account
> (`UPDATE profiles SET is_active=false, is_login_disabled=true WHERE id='64f47a29-8f71-4f0a-9340-9884b6295f93';`).
> Avoid committing this file to git with the live password.
