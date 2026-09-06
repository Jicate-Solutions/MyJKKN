# Reply — Transaction Details for Audit Order IDs (Batch 2, Ticket #19383043)

**To:** CYRAACS Agent (audit team)
**Cc:** santhanagopalan.achuthan; purusharth.sharma; ranjith; director; hemasalini.k; vasu.munuswamy; dhanashekar.t
**Subject:** RE: Razorpay CollectNow Audit — Transaction details for the requested Order IDs (Ticket #19383043)
**Attachment:** `JKKN-Razorpay-Transaction-Details-Ticket-19383043-batch2.xlsx`

---

Dear Team,

Please find attached the requested transaction details for the next set of Order IDs, in the spreadsheet format provided. All values are pulled directly from our production database and reconciled against the student bills. Timestamps are in **IST (UTC +5:30)**.

**Summary of the 5 IDs (3 successful, 2 failed):**

| # | Order ID | Payment ID | Status | Amount | DB Rows | Timestamp (IST) | Product (Fee) | Product Type |
|---|----------|------------|--------|--------|---------|-----------------|---------------|--------------|
| 1 | order_T0K0oVr2QwO1nj | pay_T0K16BOUKeWnSZ | Success (captured) | ₹2,500.00 | 1 | 11-Jun-2026 17:49:48 | Alumni Fee – Razorpay Test Due 08 | Alumni Fee |
| 2 | order_T0K4ZSVlQjYowz | pay_T0K4pD3w5rd7vs | Failed | ₹3,000.00 | 1 | 11-Jun-2026 17:53:21 | 1 Year Tuition Fee – Razorpay Test Due 09 | Tuition Fee |
| 3 | order_T0cGxEbXA3WlOn | pay_T0cHTaTxW26a4Z | Failed | ₹5,000.00 | 1 | 12-Jun-2026 11:41:34 | 2 Year Tuition Fee – Razorpay Test Due 10 | Tuition Fee |
| 4 | order_T0cMgQU296FEP5 | pay_T0cN4cDH6XruYD | Success (captured) | ₹2,000.00 | 1 | 12-Jun-2026 11:46:59 | Application Fee – Razorpay Test Due 07 | Application Fee |
| 5 | order_T0cpdDHt9GO2tO | pay_T0cqVC272c9Xf4 | Success (captured) | ₹2,000.00 | 1 | 12-Jun-2026 12:14:23 | Application Fee – Razorpay Test Due 07 | Application Fee |

All transactions were performed by the same audit test customer — **BOOBAL A (Roll No 87596328, Reg No A123654789), JKKN Testing Institution**.

**Point-by-point against your request:**

1. **Transaction status** — Provided per ID (3 captured successes, 2 failed). Failed attempts are stored exactly as required.
2. **Transaction amounts** — Provided in both INR and paise. The stored paise value equals the rupee value × 100 for every row (amount integrity verified to the paise during server-side verification).
3. **Number of times each Order ID is stored** — **Exactly 1 for every Order ID** (no duplicates). This is enforced structurally by a unique index on `razorpay_order_id`, so a duplicate insert is not possible.
4. **Timestamp of each transaction** — Provided in IST; for the successful payments we also include the capture time.
5. **Product details (Name / Type)** — Each transaction maps to the specific student fee bill being paid; product name = the bill description, product type = the fee category (Alumni Fee, Tuition Fee, Application Fee).

Successful payments are confirmed only after server-side HMAC signature validation and the mandatory dual inquiry (`GET /v1/orders/{order_id}` + `GET /v1/payments/{payment_id}`), with the amount matched to the paise, before the database is marked `success` and the corresponding receipt is issued (e.g. RCP-2026-002323, RCP-2026-002332). The success/receipt shown to the customer is always sourced from this verified database status, never from the redirect parameters.

Please let us know if you require any additional fields, the raw gateway response logs, or screenshots for any of these IDs.

Thank you,

«Your name / designation»
MyJKKN Platform — JKKN
aidental@jkkn.ac.in · «phone»
