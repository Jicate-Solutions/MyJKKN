# Reply — SHA-256 Hash Values of Payment Source Files (Stage 4, Ticket #19383043)

> Send from an OFFICIAL `@jkkn.ac.in` developer email. Complete the **«FILL»** fields before sending.

**To:** CYRAACS Agent (audit team)
**Cc:** santhanagopalan.achuthan; purusharth.sharma; ranjith; director; hemasalini.k; vasu.munuswamy; dhanashekar.t
**Subject:** RE: Stage 4 – Hash Values Collection — SHA-256 of payment request/response code files (Ticket #19383043)

---

Dear Team,

As requested, please find below the **SHA-256 hash values** of the source-code files directly responsible for the request and response logic of the two payment-gateway URLs. Hashes were generated using the prescribed method — Windows PowerShell `Get-FileHash -Algorithm SHA256 "<file path>"` — on the files as committed in our application repository. The same command on the same files will reproduce these values for your verification.

**Stack note:** the application is built on **Next.js 16 (App Router) + TypeScript**, so every file is a TypeScript module (**`.ts`**). In the App Router, each HTTP handler file is named `route.ts` and the URL is defined by its folder path; the full path is given below to uniquely identify each file.

---

### 1. Request Web URL — `https://www.jkkn.ai/api/billing/payment/initiate`

| # | File Name | File Path | Ext | Size (bytes) | SHA-256 (Get-FileHash) |
|--:|-----------|-----------|:---:|-------------:|------------------------|
| 1 | route.ts | app/api/billing/payment/initiate/route.ts | .ts | 4460 | `E70DDA8EEACC8745FFEF350B89BD198E6DC0E8EFD1872015AA5971AD3A3F3725` |
| 2 | payment-gateway-service.ts | lib/services/billing/payment-gateway-service.ts | .ts | 57773 | `648D896132564CF48E36776CC7C242265805331D1A0693FECD73F9574F755499` |
| 3 | razorpay-provider.ts | lib/services/payments/razorpay/razorpay-provider.ts | .ts | 2908 | `012C1A686F242B0B2DE66A7D5BF88A558844C55E9326E17626736FF1888F870C` |
| 4 | create-order.ts | lib/services/payments/razorpay/create-order.ts | .ts | 1076 | `667E14F56BFE6E2C98D8500E14D48CB9E3C3C3C12B24EF53BEDC742DD556540B` |
| 5 | client.ts | lib/services/payments/razorpay/client.ts | .ts | 3288 | `65F6493031D16617CD1F56FCDE7C770595BE9DBB48479B414DD7CD72B43EB648` |

*Request flow:* `initiate/route.ts` (handler) → `payment-gateway-service.ts` `createPaymentSession()` (service) → `razorpay-provider.ts` `createOrder()` → `create-order.ts` (builds & sends `POST /v1/orders`) → `client.ts` (HTTPS transport to Razorpay).

### 2. Response Web URL — `https://www.jkkn.ai/api/billing/payment/callback`

| # | File Name | File Path | Ext | Size (bytes) | SHA-256 (Get-FileHash) |
|--:|-----------|-----------|:---:|-------------:|------------------------|
| 1 | route.ts | app/api/billing/payment/callback/route.ts | .ts | 18250 | `88DB603C3F1B1353515CE8B1742DD1016F44E8F2CFCA6520F3EECDE205CD12AD` |
| 2 | payment-gateway-service.ts | lib/services/billing/payment-gateway-service.ts | .ts | 57773 | `648D896132564CF48E36776CC7C242265805331D1A0693FECD73F9574F755499` |
| 3 | razorpay-provider.ts | lib/services/payments/razorpay/razorpay-provider.ts | .ts | 2908 | `012C1A686F242B0B2DE66A7D5BF88A558844C55E9326E17626736FF1888F870C` |
| 4 | get-status.ts | lib/services/payments/razorpay/get-status.ts | .ts | 2341 | `BF5584EA6CF47BF58C0D41F21F199F6CF834AE214F1E75747A6A73B3239B58AA` |
| 5 | verify-signature.ts | lib/services/payments/razorpay/verify-signature.ts | .ts | 715 | `52A1C18131AFC8C0489BF1BFF8F77696126322F2974EC166FCAB4E0228DB5528` |
| 6 | client.ts | lib/services/payments/razorpay/client.ts | .ts | 3288 | `65F6493031D16617CD1F56FCDE7C770595BE9DBB48479B414DD7CD72B43EB648` |

*Response flow:* `callback/route.ts` (handler) → `payment-gateway-service.ts` `verifyPaymentWithGateway()` + `processVerifiedPayment()` (service) → `razorpay-provider.ts` → `verify-signature.ts` (HMAC `razorpay_signature` check) and `get-status.ts` (mandatory dual inquiry: `GET /v1/orders/{id}` + `GET /v1/payments/{id}`) → `client.ts` (HTTPS transport).

**Note on shared files:** `payment-gateway-service.ts`, `razorpay-provider.ts`, and `client.ts` are common to both the request and response paths, so the same file and hash appear in both tables (rows 2, 3 and the last row). There are **8 distinct files** in total.

All eight files are committed in our source repository and deployed unchanged to production. Please let us know if you also require a checksum (`.sha256`) file, the hashes of the supporting credential-resolution modules, or any additional file.

Status: **Stage 4 – Hash Values Collection — details provided above.**

Thank you,

«FILL: name»
«FILL: designation», MyJKKN Platform — JKKN
«FILL: official @jkkn.ac.in email» · «FILL: phone»
