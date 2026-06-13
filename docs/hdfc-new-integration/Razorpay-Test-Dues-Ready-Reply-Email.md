# Razorpay CollectNow — Reply Email (Test Dues Created — Ready for Continued Testing)

> **Reply to:** the ongoing Razorpay/CollectNow thread (Hosted Checkout verification / security audit).
> **Related thread:** Ticket #19383043 — reference it so both threads stay linked.
> All dues data below is real — 20 unpaid test bills created in the production database on 11-Jun-2026 against the dedicated test learner in JKKN Testing Institution. Replace only the `«FILL: …»` placeholders before sending.

---

**Subject:** Re: CollectNow Integration — Test dues created, ready for continued payment testing — JKKN (MyJKKN) — MID «FILL: Razorpay MID» / Ticket #19383043

---

Dear Razorpay CollectNow Team,

Greetings.

Further to our earlier mails on the Hosted Checkout verification, we have now **created a fresh set of 20 pending dues** against our dedicated test student account so that your team can continue end-to-end payment testing without interruption. The earlier dues on this account had been almost fully settled during the previous test runs, which is why fresh dues were required.

## 1. Test account details

| Field | Value |
| --- | --- |
| Student Name | BOOBAL A |
| Roll Number | 87596328 |
| Institution | JKKN Testing Institution |
| Platform URL | https://www.jkkn.ai |
| Razorpay Account | acc_SnzjAmEWfFjEpG |
| Login credentials | «FILL: test login email / how access is shared» |

## 2. Pending dues created for testing (11-Jun-2026)

All 20 dues are **unpaid**, due on **30-Jun-2026**, and span varied amounts (₹100 – ₹5,000) and fee categories so that small, medium and repeat payments can all be exercised through the Hosted Checkout flow:

| # | Bill Description | Amount (₹) |
| --- | --- | --- |
| 1 | 1 Year Tuition Fee - Razorpay Test Due 01 | 100.00 |
| 2 | 2 Year Tuition Fee - Razorpay Test Due 02 | 250.00 |
| 3 | 3 Year Tuition Fee - Razorpay Test Due 03 | 500.00 |
| 4 | 4 Year Tuition Fee - Razorpay Test Due 04 | 750.00 |
| 5 | Exam Fee - Razorpay Test Due 05 | 1,000.00 |
| 6 | Hostel Fee - Razorpay Test Due 06 | 1,500.00 |
| 7 | Application Fee - Razorpay Test Due 07 | 2,000.00 |
| 8 | Alumni Fee - Razorpay Test Due 08 | 2,500.00 |
| 9 | 1 Year Tuition Fee - Razorpay Test Due 09 | 3,000.00 |
| 10 | 2 Year Tuition Fee - Razorpay Test Due 10 | 5,000.00 |
| 11 | 3 Year Tuition Fee - Razorpay Test Due 11 | 100.00 |
| 12 | 4 Year Tuition Fee - Razorpay Test Due 12 | 250.00 |
| 13 | Exam Fee - Razorpay Test Due 13 | 500.00 |
| 14 | Hostel Fee - Razorpay Test Due 14 | 750.00 |
| 15 | Application Fee - Razorpay Test Due 15 | 1,000.00 |
| 16 | Alumni Fee - Razorpay Test Due 16 | 1,500.00 |
| 17 | 1 Year Tuition Fee - Razorpay Test Due 17 | 2,000.00 |
| 18 | 2 Year Tuition Fee - Razorpay Test Due 18 | 2,500.00 |
| 19 | 3 Year Tuition Fee - Razorpay Test Due 19 | 3,000.00 |
| 20 | 4 Year Tuition Fee - Razorpay Test Due 20 | 5,000.00 |

**Total pending dues available for testing: ₹33,200.00** (in addition to an existing partially-paid bill with a balance of ₹25,974.00).

## 3. Testing flow (as before)

1. Log in and open the student's pending dues / payment page.
2. Select one or more dues and proceed to pay — the browser performs a **full redirect to the Razorpay hosted page** (`https://api.razorpay.com/v1/checkout/embedded`).
3. On completion, our server verifies the callback signature, performs the dual inquiry (Order + Payment Status APIs), marks the transaction, and issues a receipt.
4. Each transaction will be visible against account `acc_SnzjAmEwfFjEpG` on your dashboard for cross-verification.

Kindly proceed with your testing at your convenience. If your team needs the dues topped up again, additional amounts, a specific amount/category combination, or anything else to complete the verification, please let us know and we will arrange it the same day.

Thank you for your continued support.

Best regards,

«FILL: your name»
«FILL: designation / team»
JKKN — MyJKKN Platform (https://www.jkkn.ai)
«FILL: phone» · aidental@jkkn.ac.in

---

> **Internal note (do not send to Razorpay):**
> - The 20 dues were inserted on 11-Jun-2026 into `billing_student_bills` (`student_id = bc69b960-5912-45de-a971-390f86c8005a`, institution `183847c5-be1b-4903-86eb-bbc20c213071`, AY `f88b7054-f52a-4940-9a41-4e0682f13ac7`), all `status='unpaid'`, `fee_source='academic'`, remarks tagged "Razorpay payment-gateway testing (2026-06-11)".
> - Cleanup after the thread closes: delete only the rows still `unpaid` with that remarks tag — keep/cancel any they actually paid (receipts will reference them).
> - Account `acc_SnzjAmEWfFjEpG` is the env-level account (`razorpay_accounts` table is empty).
