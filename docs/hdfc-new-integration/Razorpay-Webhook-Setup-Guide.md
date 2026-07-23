# Razorpay Webhook Setup — Per-Account Guide

**Audience:** whoever configures each JKKN merchant account in the Razorpay dashboard.
**Applies to:** the institution × fee-head accounts managed at `/billing/payment-accounts`.
**Date:** 2026-06-13

---

## 1. The model (read this first)

JKKN has one Razorpay account **per MID** (per college, and per fee head for bus /
university / establishment). **Each account needs its own webhook**, configured in
*that account's* Razorpay dashboard, pointing at a **unique URL** that ends in the
account's `webhookRef`:

```
https://www.jkkn.ai/api/webhooks/razorpay/<webhookRef>
```

- `<webhookRef>` is an opaque token generated **when you activate** the account in
  MyJKKN (it does not exist while the account is a draft).
- MyJKKN looks up the account by that `webhookRef`, then verifies the request's
  `X-Razorpay-Signature` using **that account's webhook secret** — the exact string
  you type into both the MyJKKN "Webhook Secret" field and the Razorpay webhook
  "Secret" field. **They must match.**
- Institutions with **no** active account fall back to the **common** webhook
  `https://www.jkkn.ai/api/webhooks/razorpay` (verified with the env
  `RAZORPAY_WEBHOOK_SECRET`). You do not configure that one per account.

> Replace `https://www.jkkn.ai` with your actual app URL if different (it must match
> `NEXT_PUBLIC_APP_URL`). The path is always `/api/webhooks/razorpay/<webhookRef>`.

---

## 2. Prerequisites

1. `RAZORPAY_CREDENTIALS_MASTER_SECRET` is set in the environment (needed to activate
   accounts — it encrypts the keys/secret).
2. The account is **activated** in `/billing/payment-accounts` (Draft → **Activate** →
   enter Key ID / Key Secret / Webhook Secret). Activation is what generates the
   `webhookRef` and therefore the webhook URL.

---

## 3. Where to find each account's webhook URL

Any of these:

- **On activation:** the success toast shows the full URL — copy it then.
- **Anytime:** the account row → **Copy URL** button, or click the **institution name**
  → details modal → **Webhook URL → Copy**.
- **Bulk (CLI):** `npm run list:razorpay` prints every account's webhook URL (no secrets).

---

## 4. Configure the webhook in the Razorpay dashboard (per account)

Switch to the **correct merchant account** in Razorpay (the one whose MID matches the
row), then:

1. **Settings → Webhooks → + Add New Webhook.**
2. **Webhook URL:** paste the account's `…/api/webhooks/razorpay/<webhookRef>` URL.
3. **Secret:** paste the **same** Webhook Secret you entered for this account in MyJKKN.
4. **Alert Email:** (optional) an ops email for delivery failures.
5. **Active Events:** tick exactly the events in §5.
6. **Create Webhook.** Razorpay sends a test ping — a `2xx` means the URL is reachable.

Repeat for every account (use the per-account checklist in §8).

---

## 5. Events to enable (tick exactly these)

MyJKKN handles these event types; enabling others is harmless (they're logged and
ignored), but **these are the ones that drive state**:

| Razorpay event | What MyJKKN does |
|---|---|
| `order.paid` | Marks the order paid (same handler as capture). |
| `payment.captured` | Confirms a successful payment → reconciliation/receipt path. |
| `payment.authorized` | Records an authorized-but-not-captured payment. |
| `payment.failed` | Marks the transaction failed. |
| `refund.created` | Records a refund initiated. |
| `refund.processed` | Marks the refund completed. |
| `refund.failed` | Marks the refund failed. |
| `payment.dispute.created` | Records a new dispute/chargeback. |
| `payment.dispute.won` | Updates dispute outcome (won). |
| `payment.dispute.lost` | Updates dispute outcome (lost). |
| `payment.dispute.closed` | Closes the dispute record. |

**Quick copy list:**

```
order.paid
payment.captured
payment.authorized
payment.failed
refund.created
refund.processed
refund.failed
payment.dispute.created
payment.dispute.won
payment.dispute.lost
payment.dispute.closed
```

> Minimum to go live: `payment.captured` + `order.paid` + `payment.failed`. Add the
> refund + dispute events so refunds and chargebacks reconcile automatically.

---

## 6. Test vs Live mode

Razorpay keeps **Test** and **Live** completely separate (different keys, dashboards,
and webhooks). If you onboard an account in **test** mode first:

- Generate **test** keys, set the MyJKKN account `mode = test`, and add the webhook
  under the Razorpay **Test Mode** dashboard with the test webhook secret.
- When going live, **Rotate** the account in MyJKKN to the **live** keys (mode = live)
  and add a webhook under the **Live Mode** dashboard (it gets a new `webhookRef`).

One webhook secret per (account, mode). The secret in Razorpay must always equal the
one stored for that account in MyJKKN.

---

## 7. Verify it works

1. In MyJKKN, run **Test** on the account row → expects "Connection OK · institution
   account · live/test".
2. Make a small real payment for a learner in that institution → the
   `payment_transactions` row should carry that account's `razorpay_account_id` and
   reach `success`.
3. In Razorpay → Webhooks → the webhook's **recent deliveries** should show `2xx`.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **401 invalid_signature** | The Razorpay webhook **Secret** ≠ the MyJKKN account's Webhook Secret. Re-enter so they match (Rotate the account if you no longer know it). |
| **404 unknown_webhook_ref** | URL has a wrong/old `webhookRef`. Copy the current URL from the account row. |
| **500 misconfigured** (only on the common URL `…/razorpay`) | `RAZORPAY_WEBHOOK_SECRET` env var is unset. |
| Delivery shows `2xx` but nothing updated | Normal for unrelated events; the route returns **200 even when a handler errors** (to stop Razorpay retry storms). Check `razorpay_webhook_events` + app logs for the real outcome. |
| Payments work but webhooks 401 | You're verifying against the wrong account — confirm you added the webhook in the **same merchant account** whose keys you activated. |

---

## 8. Per-account checklist (14 accounts)

Activate each in MyJKKN to get its `webhookRef`, then add the webhook in that account's
Razorpay dashboard with the events from §5.

| Institution | Fee head | MID | Webhook URL (after activation) | Done? |
|---|---|---|---|---|
| Arts & Science (Self) | Default | SnzjAmEWfFjEpG | `…/api/webhooks/razorpay/<ref>` | ☐ |
| Arts & Science (Self) | Transport / Bus | T0iE28PvbVFtnj | `…/<ref>` | ☐ |
| Pharmacy | Default | T0iCX5lDTjrZgl | `…/<ref>` | ☐ |
| Nursing & Research | Default | T0iCi9WHmycSXF | `…/<ref>` | ☐ |
| Nursing & Research | University Fee | T0iEV1qA7sBZp9 | `…/<ref>` | ☐ |
| Dental | Default | T0iCruBUUsTT1q | `…/<ref>` | ☐ |
| Dental | University Fee | T0iELW5GyxikQf | `…/<ref>` | ☐ |
| Dental | Establishment | T0iEeTnTGx8pYe | `…/<ref>` | ☐ |
| Engineering & Technology | Default | T0iD1OQ5bUsesl | `…/<ref>` | ☐ |
| Engineering & Technology | University Fee | T0iEBcF4dUim9F | `…/<ref>` | ☐ |
| College of Education | Default | T0iDBT3lucxfkC | `…/<ref>` | ☐ |
| Matric Hr Sec School | Default | T0iDM4tijFESV5 | `…/<ref>` | ☐ |
| Nattraja Vidhyalya CBSE | Default | T0iDVnArzlIPKo | `…/<ref>` | ☐ |
| Allied Health Sciences | Default | T0iDhK9sudh6Xl | `…/<ref>` | ☐ |

(Trust MID `T0iDsMKMVPPCcX` intentionally not onboarded.)

---

## 9. Security notes

- The webhook secret is stored **encrypted** in MyJKKN (pgcrypto) and is never shown
  again after you save it — keep a copy in your password manager.
- Every webhook is **HMAC-verified** before processing; an invalid signature is rejected
  (401) and logged to the payment audit trail.
- Events are de-duplicated/audited via `razorpay_webhook_events`; the handler is
  idempotent on terminal transaction states.
- The route resolves the account by `webhookRef` **ignoring active/inactive**, so a
  rotated-out account's in-flight webhooks still verify until it drains. After it
  drains, remove its webhook from the Razorpay dashboard.
