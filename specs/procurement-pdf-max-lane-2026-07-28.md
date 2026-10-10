# Procurement PDF Extraction → ₹0 Max Lane

**Date:** 2026-07-28 · **Decided by:** Director interview (this session) · **Status:** spec locked, build starting

> **Updated 2026-10-09.** The "Job result contract" section below was written against
> the July format and is now rewritten to match result **version 9**
> (`EXTRACT_RESULT_VERSION = 9` in `lib/procurement/quotation-extract-core.ts`). What changed:
> the result now carries a `version` number, a quotation header (vendor, quote number,
> dates, delivery, payment terms, warranty, printed total, GST flag) and `read_notes`;
> each line gained `pack`, `gst_percent`, `hsn`, `quantity`, `line_total`, `list_price`
> and `discount_percent`; `unit_price` is now the NET rate after the line discount;
> `unmatched_note` is always present (string or null). `from_scan` was specified for
> the runner and is not produced by the app. A new "Current state" section records what
> is live as of 2026-10-09.
>
> **Source of truth:** the `DirectExtractResult` type and `normalizeExtraction()` in
> `lib/procurement/quotation-extract-core.ts`. If this spec and that file disagree,
> the file wins. Other sections of this spec are unchanged from July and were not
> re-checked in this update.

## Current state (2026-10-09)

Facts checked against the live database and the code on 2026-10-09:

- The `ai_job_types` row `procurement.quotation_extract` exists with `lane = 'max-pdf'`,
  `enabled = false`, `interactive = true`, `tool_set = 'all'` and an empty
  `prompt_template`. The empty prompt is by design. (UNVERIFIED: the reason. The paid
  path builds its prompt in code with `buildExtractPrompt()`; no runner exists to show
  what the row's template would be used for.)
- Only one `max-pdf` job has ever run: requested 16 Sep 2026, status `done`. Its
  `claimed_by` is `api-direct`, which is the paid takeover in
  `/api/procurement/quotations/extract-pdf/direct`, not a Max-lane runner. Its result
  has no `version` field, so the route will not reuse it.
  No Max-lane runner has ever produced a quotation result.
- The Windows `max-pdf` runner (`procurement-pdf-extract.mjs` in the Architecture
  section) was never built.
- The paid fallback is `procurement.quotation_extract_api`: an `ai_model_config` row
  (Anthropic, `claude-haiku-4-5`, active), called from `lib/procurement/quotation-pdf-direct.ts`.
  It is used in two places: (1) `POST /api/procurement/quotations/extract-pdf` reads the
  PDF directly in the request whenever `procurement.quotation_extract` is disabled (as it
  is today) and an API key is configured; (2) `/extract-pdf/direct` takes over a queued job that no runner claimed within
  10 s. Both produce the same v9 result, but only (2) stores it, in `ai_jobs.result`.
  Path (1) returns `{ direct: true, result }` to the page and saves nothing: no storage
  upload, no `ai_jobs` row. So the same-PDF reuse [dec 8] never fires for today's
  in-request reads, and uploading the same PDF again reads and pays again.

## Why

`procurement.quotation_extract` / `procurement.invoice_extract` are the LAST features still able to
call the PAID Anthropic API. Everything else migrated to the ₹0 Max lane on 2026-07-15.
AI Query was already Max-only since PR #1996 (verified in code: `app/api/ai-query/route.ts`
enqueues `ai_query.chat`, no paid fallback).

**Feasibility PROVEN 2026-07-28:** headless `claude -p --model sonnet --output-format json
--allowedTools Read`, cwd = empty sandbox, stdin prompt, reading a staged 1.2 MB / 42-page PDF
returned clean parseable JSON first try (`is_error:false`). The Max lane CAN read PDFs — the file
goes on DISK and the prompt names the path; it never rides in the message payload.

**Speed evidence:** `interactive:true` jobs are claimed in ~25 s avg / 92 s p95 / 117 s max
(`ai_query.chat`, 14 d). Batch jobs wait hours — so the procurement job types MUST be flipped to
`interactive: true` (currently false).

## Locked decisions (Director interview)

| # | Question | Decision |
|---|---|---|
| 1 | Waiting experience | **Notify when ready** — upload, leave the page, get notified. NOT wait-on-screen. |
| 2 | Windows box off/restarting | **Tell them + let them type prices manually.** Detect by "not claimed within the window". |
| 3 | Money safety | **Highlight AI-filled prices** (distinct colour + `AI` tag) until a human confirms. |
| 4 | Old paid code | **Delete it.** No paid route may remain. |
| 5 | Unmatched vendor line names | **AI best guess, clearly marked uncertain** for human confirm/correct. |
| 6 | Scanned / photo PDFs | **Accept + warn** "came from a scan — double-check every price". |
| 7 | Odd prices (e.g. Total row read as a line) | **Flag out-of-line prices** for review. |
| 8 | Same PDF uploaded twice | **Detect repeat + reuse the first result.** |
| 9 | Who is notified | **Only the uploader.** |

## Architecture

```
UI upload
  └─> POST /api/procurement/quotations/extract-pdf   (route: enqueue, do NOT block)
        1. validate (PDF only, <=15 MB — unchanged)
        2. sha256(bytes) -> dedupe key
        3. if a completed job exists for (sha256, rfq_id) -> RETURN that result  [dec 8]
        4. upload to private bucket procurement-quotation-pdfs
             path: {institution_id}/{rfq_id}/{sha256}.pdf
        5. fn_ai_enqueue('procurement.quotation_extract',
             {storage_path, sha256, rfq_id, rfq_items})
           NOTE: rfq_id is EXPLICIT in the payload and is contract, not optional —
           the notification's deep link needs it. Do NOT derive it from the storage
           path: the layout is {rfq_id}/{sha256}.pdf today, and a layout change
           would silently kill the link.
        6. return { job_id } immediately                                         [dec 1]

Windows Max-lane runner  (procurement-pdf-extract.mjs, out-of-repo)
        1. claim job (interactive -> ~25 s)
        2. download PDF from storage (service-role) -> SANDBOX/quotation.pdf
        3. detect text layer; no text => from_scan: true                         [dec 6]
        4. claude -p --model sonnet --output-format json --allowedTools Read
           (prompt names ./quotation.pdf + the RFQ item list; asks for strict JSON)
        5. parse (engine already does tolerant extraction + adaptive nudge retry)
        6. write job.result

UI (polling / notification)
        - not claimed within UNCLAIMED_DEADLINE -> "AI reading unavailable,
          please enter prices manually"                                          [dec 2]
        - done -> notify UPLOADER only                                           [dec 9]
        - render: AI-filled prices highlighted + AI tag                          [dec 3]
                  uncertain matches marked                                       [dec 5]
                  scan warning banner                                            [dec 6]
                  outlier prices flagged                                         [dec 7]
```

### Job result contract — version 9 (updated 2026-10-09)

This is the shape every reading path produces (and the shape stored in
`ai_jobs.result` when the reading belongs to a queued job). It
mirrors `DirectExtractResult` / `DirectExtractedLine` / `DirectExtractedVendor` in
`lib/procurement/quotation-extract-core.ts`, as produced by `normalizeExtraction()`.

```json
{
  "version": 9,
  "lines": [
    { "rfq_item_id": "<uuid|null>", "item_name": "<vendor's text>",
      "unit_price": 134.55, "pack": "500 ml", "uncertain": false,
      "manufacturer": null, "quality_grade": null,
      "concentration": null, "other_specs": null,
      "gst_percent": 18, "hsn": "2815",
      "quantity": 2, "line_total": 269.10,
      "list_price": 299, "discount_percent": 55 }
  ],
  "unmatched_note": null,
  "vendor": { "name": "Example Chemicals", "gstin": null, "phone": null,
              "email": null, "address": null, "contact_person": null },
  "quote_number": null,
  "quote_date": "2026-10-01",
  "validity_date": "2026-10-31",
  "delivery_days": 14,
  "payment_terms": null,
  "warranty": null,
  "stated_total": 317.54,
  "total_includes_gst": true,
  "read_notes": []
}
```

Every key below is always present in a v9 result. "or null" means the key is there
with value `null` when the quotation does not print it.

**Top level**

| Field | Type | Notes |
|---|---|---|
| `version` | number, always `9` | The extract route reuses an earlier read of the same PDF + RFQ only when `version >= 9`; anything lower (or missing) is read again. |
| `lines` | array of line objects | Can be empty. |
| `unmatched_note` | string or null | `"Not matched to any requested item: <names>"`, or null when every line matched. |
| `vendor` | object or null | The SELLER, never the buying institution. null when none of its six fields was read. |
| `quote_number` | string or null | |
| `quote_date` | string or null | `YYYY-MM-DD`. Anything that is not a real calendar date becomes null. |
| `validity_date` | string or null | `YYYY-MM-DD`. "Valid for N days" is turned into a date from the quote date by the model. |
| `delivery_days` | integer or null | Positive whole days only. |
| `payment_terms` | string or null | As written. |
| `warranty` | string or null | As written ("1 year"). |
| `stated_total` | number or null | The grand total printed on the quotation; positive only. `lib/procurement/quotation-math.ts` uses it to check the lines add up. |
| `total_includes_gst` | boolean or null | null = not clear. |
| `read_notes` | array of strings | What the app changed after the model answered, in words; shown to the person. Empty = nothing changed. |

**`vendor` object** (when not null): `name`, `gstin`, `phone`, `email`, `address`,
`contact_person` — each string or null.

**Each line**

| Field | Type | Notes |
|---|---|---|
| `rfq_item_id` | string (uuid) or null | Only an id that was sent in the request is kept; null when the model graded the match `none` or returned an unknown id. [dec 5] |
| `item_name` | string | The line name as printed by the vendor. |
| `unit_price` | number, > 0 | The NET rate for one printed pack: after the line discount, before GST. Lines with no positive price are dropped. |
| `pack` | string or null | The pack/size the price is for, as printed ("100 ml"). |
| `uncertain` | boolean | Set by the app, not trusted from the model: true when the line is matched but the model's grade was not `same`, or the vendor's name shares no word with the requested item's name. Always false when `rfq_item_id` is null. [dec 5] |
| `manufacturer` | string or null | |
| `quality_grade` | string or null | |
| `concentration` | string or null | |
| `other_specs` | string or null | |
| `gst_percent` | number or null | 0 to 28 only. |
| `hsn` | string or null | HSN/SAC code. |
| `quantity` | number or null | Quantity printed on the line; positive only. |
| `line_total` | number or null | Line amount before GST; positive only. |
| `list_price` | number or null | Rate before the line discount, when one is printed. |
| `discount_percent` | number or null | Between 0 and 100 (exclusive). |

Rules that live in code, not in the model:
- Placeholder text such as "N/A", "none", "not stated" or "-" is turned into null.
- `correctDiscountedPrices()`: when a line's printed amount ÷ quantity shows the model
  returned the list rate, `unit_price` is replaced by the net rate, `list_price` is set
  to the rate the model read, and a sentence is added to `read_notes`.
- The model also returns a `match` grade per line (`same` / `similar` / `none`). It is
  used to work out `rfq_item_id` and `uncertain` and is NOT stored in the result.
- Outlier flagging is computed APP-SIDE from `lines` (`detectPriceOutliers` in the
  new-quotation page), not trusted to the model. [dec 7]

**`from_scan`** [dec 6]: not part of v9. `normalizeExtraction()` never sets it, so no
result the app writes today carries it. The page and `lib/procurement/read-quotation-pdf.ts`
still accept an optional `from_scan` boolean and show the scan warning when it is true,
so a future Max-lane runner may add it on top of the v9 fields.

**For the runner, when it is built:** its result must carry every v9 field above,
including `version: 9`, or the page will show an empty header and the route will
never reuse the read. UNVERIFIED: how an out-of-repo `.mjs` runner would reproduce
`normalizeExtraction()` (it is TypeScript, and the runner cannot import TS). Nothing
in the repo decides this yet.

### Notification (runner-side, on SUCCESS only) [dec 9]

> ⚠️ **CORRECTED 2026-07-28 — this is TWO writes, not one.** The first draft of this
> contract specified only the `notifications` row. That insert SUCCEEDS, the log says
> "notified", and the uploader is never told — because there is **no DB trigger that
> fans out**. `lib/services/_shared/notifications/notify.ts` states it in its own
> header, and memory `feedback_notification_delivery_needs_user_notifications_fanout`
> records the same failure. In-repo callers must use that helper; the out-of-repo
> runner cannot import TS, so it mirrors `fanoutNotification` + `ensureLinks` exactly:
>
> 1. pre-check `notifications?idempotency_key=eq.<key>` (UNIQUE partial index)
> 2. `POST /rest/v1/notifications` (the row below; a 23505 race re-reads)
> 3. `POST /rest/v1/user_notifications?on_conflict=notification_id,user_id`
>    with `Prefer: resolution=ignore-duplicates` — **this is the write that makes
>    the bell show it**
>
> First-live-job check: if the `notifications` row exists but the bell is empty,
> write 3 is what failed.

The uploader has left the page, so the RUNNER writes the following after
`job.result` lands:

| column | value |
|---|---|
| `title` | `Quotation prices ready` |
| `body` | short review prompt (mention double-checking when `from_scan`) |
| `url` | `/procurement/rfqs/<rfq_id>/quotations` |
| `created_by` | the job's `requested_by` |
| `targeting` | `{"type":"user","user_ids":["<requested_by>"]}` |
| `kind` | `work_item` |
| `category` | `procurement:quotation` |
| `idempotency_key` | `procurement.quotation_extract:<job_id>` |

A notification failure must NEVER fail the job — log and swallow. Never notify
anyone but the uploader.

## Lane isolation — DECIDED 2026-07-28 (load-bearing)

`procurement.quotation_extract` runs on **`lane='max-pdf'`**, NOT `lane='max'`.

`fn_ai_claim(p_lane, p_runner, p_interactive)` selects on
`(p_lane IS NULL OR j2.lane = p_lane) AND t2.interactive = p_interactive` with
**no job_type predicate** — a runner claims whatever is pending on its
(lane, interactive) pair. The only other interactive `lane='max'` types are
`ai_query.chat` and `ai_pulse.anomaly_detection`, both enabled. A PDF runner on
`lane='max'` + `interactive=true` would therefore claim a live AI Query question
and **could not give it back**: `fn_ai_requeue_stale` explicitly skips
interactive job types, so the row sits in `claimed` forever.

**A CHECK constraint alone is NOT enough.** `fn_ai_job_type_upsert` — the RPC
behind `/admin/ai-models` → job-type edit — carries its own vocabulary gate and
**silently coerces** an unrecognised lane:

```sql
IF v_lane NOT IN ('max', 'api', 'either') THEN
  v_lane := 'max';        -- no error raised
END IF;
```

So the first person to open the procurement job type and press **Save** would
have `lane` quietly rewritten to `'max'` while `interactive` stayed true —
re-arming the exact collision. The migration therefore also replaces that
function (live body + one vocabulary entry, section 4).

Consequences captured in the migration:
- `ai_job_types_lane_chk` widened (widen-only) to admit `'max-pdf'` — the CHECK
  previously allowed only `max|api|either`, so the first dry-run failed outright.
- The `max-` prefix is deliberate: the `/admin/ai-models` D3 guard (Max lane ⇒
  Anthropic-only, ₹0) and the ⚡ badge now test the prefix, not the literal
  `'max'`. **Renaming this lane to anything not starting with `max-` would
  silently allow a PAID provider to be configured on it.**
- The runner additionally guards its own end (fails any unexpected job_type),
  but the lane split is what makes the collision impossible.

## Out of scope / follow-ups
- `procurement.invoice_extract` (GRN side) follows the SAME pattern once quotation is proven.
- Storing the vendor PDF is a side-benefit (audit trail); retention policy not decided.

## DO NOT
- Never merge or deploy — Director owns both.
- Every new SECDEF RPC needs explicit `REVOKE EXECUTE ... FROM anon, PUBLIC`.
- Terminology: "learner" not "student"; CI terminology gate is broad.
