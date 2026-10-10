# Procurement PDF Extraction → ₹0 Max Lane

**Date:** 2026-07-28 · **Decided by:** Director interview (this session) · **Status:** spec locked, build starting

> **Updated 2026-10-09 (v12).** #4306 (merged 16:05 IST, 9 Oct) moved
> `EXTRACT_RESULT_VERSION` to **12**, and the "Job result contract" section below is now
> rewritten to match it. This note supersedes the field list in the v9 note that follows.
> What changed since v9:
> - **v10:** each line carries `role` (`item` | `part` | `option`), so two brands offered
>   for one item are no longer added up as if they were a set.
> - **v11:** a second, text-only look at what the first read left open can mark a line
>   `checked` and give a `reason`.
> - **v12:** each line carries `catalog_code`; the second look can also place the parts of
>   a set. Requested items now go to the model as short refs (`I1`, `I2`…) instead of
>   uuids; the stored result still holds the real `rfq_item_id`.
> - Also new in #4306, not named in the version comments: a top-level `last_serial_no`,
>   and a stricter rule for `uncertain`.
> The route now reuses an earlier read only when `version >= 12`. "Current state" and the
> storage path in "Architecture" were also corrected.
>
> **Updated 2026-10-09 (v9).** The "Job result contract" section below was written against
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

## Current state (2026-10-09, revised for v12)

Facts checked against the live database and the code on 2026-10-09 (database figures are
a snapshot taken when this note was written):

- The `ai_job_types` row `procurement.quotation_extract` now has `enabled = true`, with
  `lane = 'max-pdf'` and `interactive = true`. The row's `updated_at` reads 03:06 UTC,
  9 Oct. UNVERIFIED: the exact minute it was switched on. The first `windows-pdf` job was
  requested at 03:04 UTC, two minutes before that `updated_at`, and `fn_ai_enqueue`
  refuses a disabled job type, so the switch-on was at or before 03:04 and the 03:06
  timestamp may be a later save of the row. The empty `prompt_template` is unchanged;
  UNVERIFIED: why.
- **The Windows `max-pdf` runner went live on 9 Oct.** It is `procurement-pdf-extract.mjs`
  (out of repo), and its jobs show `claimed_by = 'windows-pdf'`. Four such jobs ran on
  9 Oct (requested from 03:04 UTC, last finished 08:51 UTC), all `status = 'done'`.
- **That runner still writes version 9.** All four results carry `"version": 9` and no
  `role` key. What follows:
  - The bulk upload (`components/procurement/bulk-quotation-upload.tsx`) shows such a
    line with `role` defaulting to `'item'` (`line.role ?? 'item'`), and without
    `checked`, `reason` or `catalog_code`. The single "Add quotation" page does not read
    `role` at all.
  - These reads are never reused: the route reuses a stored read only when
    `version >= 12` (`EXTRACT_RESULT_VERSION`). The same PDF uploaded again for the same
    RFQ is queued and read again by the free lane.
  - A re-port of the runner to v12 has been requested. UNVERIFIED: the request is not
    in the code or the database.
- **The paid fallback** is still `procurement.quotation_extract_api` (an `ai_model_config`
  row) called from `lib/procurement/quotation-pdf-direct.ts`, now with
  `claude-haiku-4-5` as the "steady" model for multi-page PDFs and for re-reading a
  one-page read that does not add up. It is used in two places:
  1. `POST /api/procurement/quotations/extract-pdf` reads in the request when
     `procurement.quotation_extract` is disabled, **or** when the file is a photo or a
     spreadsheet (those are never queued, even with the lane on), and an API key is
     configured. Since #4306 this path **does** store its result: it inserts a finished
     `ai_jobs` row (`status = 'done'`, `claimed_by = 'api-direct'`, payload
     `{ sha256, rfq_id, file_name, direct: true }`), so same-file reuse [dec 8] now covers
     it. It still uploads nothing to storage. With the lane on, a PDF does not take this
     path.
  2. `/extract-pdf/direct` takes over a queued job that no runner has claimed in time.
     The single "Add quotation" page (`app/(routes)/procurement/rfqs/[id]/quotations/new/page.tsx`)
     now waits **30 s** before calling it (`EXTRACT_DIRECT_AFTER_MS = 30_000`, #4293).
     The bulk upload and the renegotiate sheet go through
     `lib/procurement/read-quotation-pdf.ts`, which still waits **10 s**
     (`DIRECT_AFTER_MS = 10_000`).
- **The direct takeover is exactly-once.** `/extract-pdf/direct` moves the job from
  `pending` to `running` with a conditional update (`.eq('status', 'pending')`). If no row
  comes back, a runner got there first and the route answers `{ status: 'claimed' }`
  without reading, so the page keeps polling. A job that is already `claimed`/`running`
  is never read again, and one that is `done` hands back its stored result.

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
             path: {rfq_id}/{sha256}.pdf
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

### Job result contract — version 12 (updated 2026-10-09)

This is the shape every reading path produces (and the shape stored in
`ai_jobs.result` when the reading belongs to a job). It mirrors `DirectExtractResult` /
`DirectExtractedLine` / `DirectExtractedVendor` in
`lib/procurement/quotation-extract-core.ts`, as produced by `normalizeExtraction()` and
then, on the paid path, `applySecondLook()` (both called from
`lib/procurement/quotation-pdf-direct.ts`).

```json
{
  "version": 12,
  "lines": [
    { "rfq_item_id": "<uuid|null>", "item_name": "<vendor's text>",
      "unit_price": 134.55, "pack": "500 ml", "uncertain": false,
      "role": "item", "checked": true, "reason": "NaOH is sodium hydroxide",
      "catalog_code": "1.06498.0500",
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
  "last_serial_no": 1,
  "total_includes_gst": true,
  "read_notes": []
}
```

Every key below is always present in a v12 result, **except `checked` and `reason`**,
which appear only on lines the second look touched (see "Second look" below). "or null"
means the key is there with value `null` when the quotation does not print it.

**Top level**

| Field | Type | Notes |
|---|---|---|
| `version` | number, always `12` | The extract route reuses an earlier read of the same PDF + RFQ only when `version >= 12`; anything lower (or missing) is read again. |
| `lines` | array of line objects | Can be empty. |
| `unmatched_note` | string or null | `"Not matched to any requested item: <names>"`, or null when every line matched. Worked out from the first read only: a line the second look places later is still named here. |
| `vendor` | object or null | The SELLER, never the buying institution. null when none of its six fields was read. |
| `quote_number` | string or null | |
| `quote_date` | string or null | `YYYY-MM-DD`. Anything that is not a real calendar date becomes null. |
| `validity_date` | string or null | `YYYY-MM-DD`. "Valid for N days" is turned into a date from the quote date by the model. |
| `delivery_days` | integer or null | Positive whole days only. |
| `payment_terms` | string or null | As written. |
| `warranty` | string or null | As written ("1 year"). |
| `stated_total` | number or null | The grand total printed on the quotation; positive only. `lib/procurement/quotation-math.ts` uses it to check the lines add up. |
| `last_serial_no` | integer or null | **New since v9.** The S.No of the last item line, when lines are numbered; positive whole number only. `quotation-math.ts` compares it with the number of lines read and warns when lines may be missing (the one check left when no grand total is printed). Optional in the TypeScript type, but `normalizeExtraction()` always sets it. |
| `total_includes_gst` | boolean or null | null = not clear. |
| `read_notes` | array of strings | What the app changed after the model answered, in words; shown to the person. Empty = nothing changed. |

**`vendor` object** (when not null): `name`, `gstin`, `phone`, `email`, `address`,
`contact_person` — each string or null.

**Each line**

| Field | Type | Notes |
|---|---|---|
| `rfq_item_id` | string (uuid) or null | The real id of the requested item. The model answers with a short ref (`I1`, `I2`…) in a field called `item`; `idFromRef()` maps it back by position in the item list sent. A real uuid that was sent is still accepted (older reads, an office runner), and `rfq_item_id` is read if `item` is missing. null when the model graded the match `none` or gave a ref/id that was not sent. [dec 5] |
| `item_name` | string | The line name as printed by the vendor. |
| `unit_price` | number, > 0 | The NET rate for one printed pack: after the line discount, before GST. Lines with no positive price are dropped. |
| `pack` | string or null | The pack/size the price is for, as printed ("100 ml"). |
| `uncertain` | boolean | Set by the app, not trusted from the model. After the first read: true when the line is matched and either the model's grade was not `same` or `namesAgree()` fails (every meaningful word of the requested name must appear in the vendor's name, as a prefix either way; stricter than v9's "shares a word"). Always false when `rfq_item_id` is null. The second look can set it to true (see below). [dec 5] |
| `role` | `"item"`, `"part"` or `"option"` | **New in v10.** `item` = the line is the requested item; `part` = one part of a requested set quoted in pieces (parts add up); `option` = one of several alternatives offered for the same item (only one counts, never the sum). Anything else from the model becomes `item`. |
| `checked` | boolean, only when present | **New in v11.** `true` when the second look agreed with the first read's match (two independent readings agree). Absent otherwise; it is never written as `false`. |
| `reason` | string or null, only when present | **New in v11.** Why the second look paired the line, in a few words ("NaOH is sodium hydroxide"), cut to 120 characters; shown to the person. Can be present without `checked` (when the second look moved the line or placed it as a part). |
| `catalog_code` | string or null | **New in v12.** The vendor's catalogue / product / part / model number for the line ("1.06498.0500"), not the HSN code; cut to 60 characters. Optional in the TypeScript type (older reads lack it), but `normalizeExtraction()` always sets it. |
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

**What the model is sent (v12).** `buildExtractPrompt()` lists each requested item as
`I<n> — name — specification — qty — also called: …`. The refs are positional: `I1` is
the first item in the list sent (for a queued job, the payload's `rfq_items` order).
"Also called" names come from `procurement_item_aliases` (names staff already confirmed
for that item); the route adds them as `aka` before reading or queueing, so a queued
job's `rfq_items` carries `aka` too. The stored result is unchanged by this: it holds
real ids, never refs.

Rules that live in code, not in the model:
- Placeholder text such as "N/A", "none", "not stated" or "-" is turned into null.
- `correctDiscountedPrices()`: when a line's printed amount ÷ quantity shows the model
  returned the list rate, `unit_price` is replaced by the net rate, `list_price` is set
  to the rate the model read, and a sentence is added to `read_notes`.
- The model also returns a `match` grade per line (`same` / `similar` / `none`). It is
  used to work out `rfq_item_id` and `uncertain` and is NOT stored in the result.
- Outlier flagging is computed APP-SIDE from `lines` (`detectPriceOutliers` in the
  new-quotation page), not trusted to the model. [dec 7]

**Second look** (v11/v12: `openForSecondLook()`, `buildSecondLookPrompt()`,
`applySecondLook()`). After the first read, one short text-only call (no PDF) is made
when something is still open: requested items with no sure line, and lines that are
unmatched or uncertain. A matched line already tagged `part` is not reopened, and the
call is skipped unless there is at least one open item and one open line. It answers per
line with a verdict and a reason, and it only ever adds:
- `same` for the item the first read chose → `checked = true`, `reason` set.
- `same` for a different item, or for a line the first read left unmatched →
  `rfq_item_id` set to that item, `uncertain = true`, `reason` set (a person confirms).
- `part` of a requested set → `rfq_item_id` set, `role = 'part'`, `uncertain = true`,
  `reason` set.
- `not`, or a ref/line number that was not sent → nothing changes; the first read's
  guess stays for a person.

It runs only on the paid path (`quotation-pdf-direct.ts`, best-effort: no API key,
nothing open, or a failed call leaves the first read as it is). A Max-lane runner's
result has `checked` / `reason` only if the runner does its own second look.

**`from_scan`** [dec 6]: not part of v12. `normalizeExtraction()` never sets it, so no
result the app writes today carries it. The page and `lib/procurement/read-quotation-pdf.ts`
still accept an optional `from_scan` boolean and show the scan warning when it is true,
so a Max-lane runner may add it on top of the v12 fields.

**For the runner:** its result must carry every v12 field above, including
`version: 12`, or the page will show an empty header and the route will never reuse the
read. The runner went live on 9 Oct writing v9 (see "Current state"). If it sends items
to the model as refs, the refs must follow the payload's `rfq_items` order; if it keeps
sending real uuids, `idFromRef()` still accepts them. UNVERIFIED: how the out-of-repo
`.mjs` runner reproduces `normalizeExtraction()` and the second look (they are
TypeScript, and the runner cannot import TS). Nothing in the repo decides this.

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
