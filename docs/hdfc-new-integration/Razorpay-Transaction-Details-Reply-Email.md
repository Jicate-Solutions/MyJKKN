# Reply — Transaction Details for Audit Order/Payment IDs (Ticket #19383043)

**To:** CYRAACS Agent (audit team)
**Cc:** santhanagopalan.achuthan; purusharth.sharma; ranjith; director; hemasalini.k; vasu.munuswamy; dhanashekar.t
**Subject:** RE: Razorpay CollectNow Audit — Transaction details for the requested Order/Payment IDs (Ticket #19383043)
**Attachment:** `JKKN-Razorpay-Transaction-Details-Ticket-19383043.xlsx`

---

Dear Team,

Please find attached the requested transaction details for the Order/Payment IDs listed in your mail, in the spreadsheet format provided. All values are pulled directly from our production database (`payment_transactions`, reconciled against the student bills). Timestamps are in **IST (UTC +5:30)**.

**Summary of the 7 IDs (1 successful, 6 failed):**

| # | Order ID | Payment ID | Status | Amount | DB Rows | Timestamp (IST) | Product (Fee) | Product Type |
|---|----------|------------|--------|--------|---------|-----------------|---------------|--------------|
| 1 | order_T0JMesiC9AAwk5 | **pay_T0JNMHuscjv13z** | Success (captured) | ₹250.00 | 1 | 11-Jun-2026 17:11:47 | 4 Year Tuition Fee – Razorpay Test Due 12 | Tuition Fee (Academic) |
| 2 | order_T0JSBR6QkPPT8h | pay_T0JSufYHUjUfZ1 | Failed | ₹25,974.00 | 1 | 11-Jun-2026 17:17:01 | 3 Year Tuition Fee | Tuition Fee (Academic) |
| 3 | order_T0JXFiyMfTVWYR | pay_T0JXN30ZTP2WGG | Failed | ₹25,974.00 | 1 | 11-Jun-2026 17:21:49 | 3 Year Tuition Fee | Tuition Fee (Academic) |
| 4 | order_T0JbKasUYbKtxz | pay_T0Jby4cHJCgeJY | Failed | ₹3,000.00 | 1 | 11-Jun-2026 17:25:41 | 1 Year Tuition Fee – Razorpay Test Due 09 | Tuition Fee (Academic) |
| 5 | order_T0JfsXn7SvYuB3 | pay_T0JgaHH2P3BUKL | Failed | ₹3,000.00 | 1 | 11-Jun-2026 17:29:59 | 1 Year Tuition Fee – Razorpay Test Due 09 | Tuition Fee (Academic) |
| 6 | order_T0Jkq4Y8ZYPtkp | — (not issued) | Failed | ₹3,000.00 | 1 | 11-Jun-2026 17:34:41 | 1 Year Tuition Fee – Razorpay Test Due 09 | Tuition Fee (Academic) |
| 7 | order_T0JosvZsSsK4ZL | — (not issued) | Failed | ₹3,000.00 | 1 | 11-Jun-2026 17:38:30 | 1 Year Tuition Fee – Razorpay Test Due 09 | Tuition Fee (Academic) |

All transactions were performed by the same audit test customer — **BOOBAL A (Roll No 87596328, Reg No A123654789), JKKN Testing Institution**.

**Point-by-point against your request:**

1. **Transaction status** — Provided per ID (1 captured success, 6 failed). Failed attempts are stored exactly as required; the last two failed orders (#6, #7) have no Payment ID because the customer abandoned the attempt before Razorpay issued a payment handle.
2. **Transaction amounts** — Provided in both INR and paise. The stored paise value equals the rupee value × 100 for every row (amount integrity verified to the paise during server-side verification).
3. **Number of times each Order ID is stored** — **Exactly 1 for every Order ID** (no duplicates). This is enforced structurally by a unique index on `razorpay_order_id`, so a duplicate insert is not possible.
4. **Timestamp of each transaction** — Provided in IST; for the successful payment we also include the capture time (17:12:27) and the receipt time.
5. **Product details (Name / Type)** — Each transaction maps to the specific student fee bill being paid; product name = the bill description, product type = the fee category (all Tuition Fee, Academic).

**Note on the one successful payment (pay_T0JNMHuscjv13z):** it was confirmed only after server-side HMAC signature validation and the mandatory dual inquiry (`GET /v1/orders/{order_id}` + `GET /v1/payments/{payment_id}`), with the amount matched to the paise. Only then was the database marked `success` and **Receipt RCP-2026-002321** issued. The customer's success/receipt is always sourced from this verified database status, never from the redirect parameters.

Please let us know if you require any additional fields, the raw gateway response logs, or screenshots for any of these IDs.

Thank you,

«Your name / designation»
MyJKKN Platform — JKKN
aidental@jkkn.ac.in · «phone»
