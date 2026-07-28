# Procurement PDF Extraction → ₹0 Max Lane

**Date:** 2026-07-28 · **Decided by:** Director interview (this session) · **Status:** spec locked, build starting

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

### Job result contract (what the runner MUST return)

```json
{
  "from_scan": false,
  "lines": [
    { "rfq_item_id": "<uuid|null>", "item_name": "<vendor's text>",
      "unit_price": 123.45, "uncertain": false,
      "manufacturer": null, "quality_grade": null,
      "concentration": null, "other_specs": null }
  ],
  "unmatched_note": "<optional short text>"
}
```
- `rfq_item_id` = null when the AI cannot guess at all; `uncertain: true` when it guessed. [dec 5]
- Outlier flagging is computed APP-SIDE from `lines` (not trusted to the model). [dec 7]

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
