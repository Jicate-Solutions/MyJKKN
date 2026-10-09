# Procurement Invoice Extraction → ₹0 Max Lane

Follow-on to `specs/procurement-pdf-max-lane-2026-07-28.md` (quotations). That spec's
"Out of scope" line said invoices follow the same pattern once quotations are proven; the
Director chose on 2026-10-09 to design invoices **alongside** the quotation runner instead.

**Status:** design only. Nothing here is built. Never merge or deploy — Director owns both.

## Where things stand (verified live 2026-10-09)

| Fact | Value |
|---|---|
| Invoice AI today | **None.** `POST /api/procurement/grn/extract-invoice` validates the upload then tells the person to type the invoice in. It never enqueues a job. |
| `procurement.invoice_extract` job type | `enabled = true`, lane `max-pdf`, empty `prompt_template` — but nothing enqueues it, so nothing waits on it. |
| Windows `max-pdf` runner | **Never built** (confirmed by the Windows box, 2026-10-09). Quotation runner build approved the same day. |
| Volume | 8 purchase orders, 2 GRNs in the module's life. Low volume; correctness matters more than throughput. |
| Paid route | Removed for invoices already. Quotations keep a paid fallback until the free lane is proven (Director, 2026-10-09). |

The receiving record already has every field invoice extraction needs — **no new
extraction columns**:
`procurement_grn`: `invoice_number`, `invoice_date`, `invoice_amount`, `supplier_id`, `invoice_document_url`.
`procurement_grn_items`: `invoice_quantity`, `invoice_unit_price`, `batch_number`, `expiry_date`, `manufacturing_date`, `is_chemical`.

## Decisions

### Carried over from the quotation spec (unchanged)

| # | Decision |
|---|---|
| 1 | Notify when ready — upload, leave, get notified. |
| 2 | Windows off / nothing claims in the window → tell them and let them type it in. |
| 3 | AI-filled numbers highlighted (`AI` tag) until a person confirms. Never auto-posted. |
| 4 | No paid route for invoices. |
| 5 | Unmatched vendor line names → AI best guess, marked uncertain. |
| 6 | Scanned PDFs → accept and warn to double-check every number. |
| 8 | Same PDF twice → detect by sha256 and reuse the first result. |
| 9 | Only the uploader is notified. |

### New for invoices (Director interview, 2026-10-09)

| # | Situation | Decision |
|---|---|---|
| I1 | Same invoice number from the same supplier as one already recorded | **Stop and show the earlier one side by side.** Only the receipt verifier — never the receiver alone — may confirm it is genuinely different and save. |
| I2 | Goods already expired, or expiring soon | **Block already-expired lines. Warn when close to expiry.** |
| I3 | A line that was never on the purchase order | **Show it, clearly marked "not ordered". Never add it automatically.** |
| I4 | Invoice older than the receiver's limit | **Warn and require a typed reason.** |

**Every one of I1–I4 is enforced APP-SIDE, deterministically** — the same principle as
`lib/services/procurement/three-way-match.ts`, whose header says "the model is never the
enforcer". The model only reads the PDF. It never decides whether something is allowed.

## Result contract (what the runner MUST return)

```json
{
  "from_scan": false,
  "invoice": {
    "invoice_number": "INV-2041",
    "invoice_date": "2026-10-02",
    "invoice_amount": 48210.00,
    "supplier_name_on_invoice": "<vendor's text>"
  },
  "lines": [
    {
      "po_item_id": "<uuid|null>",
      "item_name": "<vendor's text>",
      "uncertain": false,
      "not_on_po": false,
      "invoice_quantity": 10,
      "invoice_unit_price": 412.50,
      "batch_number": "B2391",
      "expiry_date": "2027-03-31",
      "manufacturing_date": "2025-04-01"
    }
  ],
  "unmatched_note": "<optional short text>"
}
```

- `po_item_id` null + `not_on_po: true` = the model believes the line was never ordered (I3).
  The app still re-derives this; the flag is a hint, not a verdict.
- Dates ISO `YYYY-MM-DD` or null. **Never guess a date** — null when not printed.
- Prompt carries the request's `expectations` verbatim: `watch_for` as reviewer intent;
  `require_batch_expiry` as "hunt harder for per-line batch/expiry". `tolerance_pct` and
  `max_invoice_age_days` are NOT given to the model as rules — the app enforces them.

## App-side checks (run after the result lands, before anything is saved)

| Check | Rule | Outcome |
|---|---|---|
| I1 duplicate | Another `procurement_grn` with the same `supplier_id` and normalised `invoice_number` (trimmed, case-folded, spaces/dashes removed) | Blocking dialog showing the earlier GRN; save only after an explicit "this is a different invoice" confirm, recorded with who and when |
| I2 expired | Any line with `expiry_date < today` | Blocking error on that line |
| I2 near expiry | `expiry_date` within the near-expiry window | Non-blocking warning |
| I3 not ordered | Line has no `po_item_id` after the person's review | Shown under "Not ordered"; never added to accepted quantities automatically |
| I4 old invoice | `today - invoice_date > max_invoice_age_days` | Warning + required reason text before save |

**Near-expiry window:** stored as a setting, not hard-coded —
`platform_policies` key `procurement.invoice.near_expiry_days`, default **30** (Director, 2026-10-09). One global value; changeable without new code.

I1 is checked in the app, not by a unique index: the Director chose "confirm and allow"
for honest resends, which a unique constraint would forbid.

**Small schema additions needed (for the audit trail, not for extraction):**
- `procurement_grn.duplicate_confirmed_by uuid`, `duplicate_confirmed_at timestamptz` (I1)
- `procurement_grn.late_invoice_reason text` (I4)

## Runner (Windows, `max-pdf` lane)

Same shape as the approved quotation runner, as a **second job_type arm**, not a second
script: the job_type guard accepts `procurement.quotation_extract` and
`procurement.invoice_extract` and rejects everything else. Per-job sandbox, Read tool only,
`{job,spec}` claim unwrap, `ai_model_usage` ledger row, notification = the two-write
fan-out in the quotation spec (`notifications` + `user_notifications`), uploader only,
`idempotency_key` `procurement.invoice_extract:<job_id>`, category `procurement:invoice`,
url `/procurement/grn/<grn_id>`. A notification failure never fails the job.

## Build order

1. Quotation runner proven on Windows with one real quote (approved 2026-10-09).
2. Route: `extract-invoice` enqueues `procurement.invoice_extract` instead of returning
   "type it in", with the same unclaimed-window fallback to manual entry (decision 2).
3. App-side checks I1–I4 + the two schema additions (migration with explicit
   `REVOKE ... FROM anon, PUBLIC` on anything SECURITY DEFINER).
4. Windows adds the invoice arm.
5. One real invoice through end to end, notification suppressed for the test.

## Settled before build (Director, 2026-10-09)

- Near-expiry window: **30 days**, global setting.
- I1 duplicate override: **only the person who verifies receipts** (the GRN verifier), never the receiver alone. The receiver sees the stop and the earlier invoice but cannot save past it; `duplicate_confirmed_by` must be a user with verify rights on that GRN, and must not be `received_by`.

## DO NOT

- Never let the model decide whether a line is allowed. It reads; the app rules.
- Never notify anyone but the uploader. Never notify on a test.
- Never auto-add a "not ordered" line to accepted quantities.
- Never merge or deploy.
