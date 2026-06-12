# Reply — Replica URL Confirmation for Live Kit Release (Ticket #19383043)

> **Send from an OFFICIAL `@jkkn.ac.in` developer email** (e.g. aiahs@jkkn.ac.in / aidental@jkkn.ac.in).
> Per the HDFC note, confirmation from gmail/yahoo/rediffmail **cannot be accepted**.
> Complete every **«FILL»** field before sending.

**To:** HDFC / Razorpay CollectNow — Live Kit team
**Cc:** CYRAACS Agent; santhanagopalan.achuthan; purusharth.sharma; ranjith; director; hemasalini.k; vasu.munuswamy; dhanashekar.t
**Subject:** Replica URL Confirmation for Live Kit Release — JKKN (Ticket #19383043)

---

Dear Sir,

As discussed, please find below the Replica URL confirmation in the prescribed format for release of the Live Kit.

**Important context (point 3):** The MyJKKN platform is a **single, multi-tenant web application served from one URL — `https://www.jkkn.ai`**. All JKKN institutions operate inside this same application; the institution is only a data scope within the platform, not a separate website, domain, or codebase. The fee-payment flow (Razorpay Hosted Checkout) is identical for every institution and runs entirely on `https://www.jkkn.ai`. The audit was performed on this same production application, so the **Audited URL and the Live URL are identical**.

| SR No | Content | Details |
|------:|---------|---------|
| 1 | **Audited URL** | `https://www.jkkn.ai` — MyJKKN application. Payment is initiated under `https://www.jkkn.ai/billing/...`; server callback at `https://www.jkkn.ai/api/billing/payment/callback`; response pages `https://www.jkkn.ai/billing/payment/success` and `https://www.jkkn.ai/billing/payment/failed`. |
| 2 | **Audit completion date** | «FILL: audit completion / sign-off date — test transactions were performed 11–12 Jun 2026» |
| 3 | **Live URL as shared in live MIQ** | `https://www.jkkn.ai` — single URL for **all** institutions (see institution list below). There is no per-institution payment URL. |
| 4 | **Merchant confirming that Audited URL (`https://www.jkkn.ai`) is exact replica of Live URL (`https://www.jkkn.ai`)** | **YES — confirmed.** The audited environment is the production application itself; the Audited URL and the Live URL are the same `https://www.jkkn.ai`, with identical code, infrastructure and transaction flow. |
| 5 | Is there any code level changes | **NO** |
| 6 | Is there any technology level change | **NO** |
| 7 | Is the transaction flow same for audited URL and Live URL | **YES** |
| 8 | Name of Person from Merchant end sharing the replica confirmation | «FILL: full name» |
| 9 | Designation of the person from Merchant organization | «FILL: e.g. Lead Developer / Technical Head» |
| 10 | Date of replica confirmation | «FILL: date of this email» |
| 11 | Live kit will be issued with provided live URL basis this replica URL confirmation by ME Developer/Merchant and any deviation from the same will make the approval null and void. | **Agreed** |
| 12 | Merchant needs to pre-inform HDFC team before performing any changes, updates in the in-scope URL or underlying supporting infrastructure. | **Agreed** |

**Institutions served under the single live URL `https://www.jkkn.ai` (point 3 — all institutions):**

| # | Institution | Live Payment URL |
|--:|-------------|------------------|
| 1 | JKKN Dental College and Hospital | https://www.jkkn.ai |
| 2 | JKKN College of Pharmacy | https://www.jkkn.ai |
| 3 | JKKN College of Engineering and Technology | https://www.jkkn.ai |
| 4 | JKKN College of Nursing and Research | https://www.jkkn.ai |
| 5 | JKKN College of Allied Health Sciences | https://www.jkkn.ai |
| 6 | JKKN College of Arts and Science (Aided) | https://www.jkkn.ai |
| 7 | JKKN College of Arts and Science (Self) | https://www.jkkn.ai |
| 8 | JKKN College of Education | https://www.jkkn.ai |
| 9 | JKKN Matric Higher Secondary School | https://www.jkkn.ai |
| 10 | Nattraja Vidhyalya (CBSE) | https://www.jkkn.ai |
| 11 | JKKN Main Office | https://www.jkkn.ai |

*Note: the institutions' public websites (e.g. jkkn.ac.in, edu.jkkn.ac.in, school.jkkn.ac.in) are informational/marketing sites only — they do not process payments. All fee payments for every institution above are processed exclusively on `https://www.jkkn.ai`.*

We confirm the above details are true and that the audited environment is an exact match of the live environment.

Name: «FILL: full name»
Designation: «FILL: designation»
Company: «FILL: registered merchant/company name exactly as per the Razorpay MID — e.g. J.K.K. Nattraja Educational Institutions»

Thank you,

«FILL: name»
«FILL: designation», MyJKKN Platform — JKKN
«FILL: official @jkkn.ac.in email» · «FILL: phone»
