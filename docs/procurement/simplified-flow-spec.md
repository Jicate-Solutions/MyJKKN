# Procurement — Simplified Flow Spec

**Status:** Approved — ready for Phase 1 · **Date:** 2026-09-25 · **Owner:** IMS / Procurement

## 1. Why

The current chain asks non-technical staff to understand 6 documents (Indent, PR, RFQ,
Quotation, PO, GRN), approve the same items up to 6 times, and re-type items when an
indent can't be served from stock (indent and PR are not linked at all).

Live data (2026-09-25): 17 RFQs sitting in `draft` for ~44 days on average; 26 PRs
`converted` but only 8 POs exist — people drop off in the middle of the chain.

**Goal:** one request, one tracking number, two approvals, three working tabs.

## 2. Target flow

```
1. REQUESTER     Search store catalogue (or add "New item") → Raise request
2. NEED APPROVAL Existing main approval flow (HOD for department users → Store admin)
3. STORE         For each line: In stock → "Issue"   |   Not in stock → "Buy"
4a. ISSUE path   Super Admin approves → Store keeper issues → Requester confirms receipt
4b. BUY path     Store keeper uploads quotations → AI compares → chooses vendor
                 → "Send to Super Admin"
5. FINAL         Super Admin checks comparison + chosen vendor → Approve
                 → PO created automatically (approved, PDF ready to send)
6. RECEIVE       (unchanged) Invoice → GRN → Verify → stock posted to inventory
                 → requester's request moves to "Ready to collect / Issued"
```

**Super Admin is always the final approver.** No amount-based routing.

Reorder (`/ims/stock/reorder` → "Send to Procurement") creates the same kind of request
but enters directly at step 4b — low stock already justifies the need.

## 3. What is merged / removed

| Today | New |
|---|---|
| Indent + separate PR, items typed twice | **One request.** PR is created automatically behind the scenes, linked to the indent, never shown to users |
| PR approval (`procurement.request_approve`) | **Removed** — covered by step 2 |
| RFQ create dialog, add vendors, Submit for review, RFQ approval, Mark sent | **Removed as separate steps.** RFQ is auto-created when a line goes to "Buy"; vendors are added inside the Purchase screen |
| Quotation entry page, comparison page, award, Generate POs | **Merged into one Purchase screen** per request |
| PO Submit for approval → PO approval → Send to vendor | **Replaced by one Super Admin approval** of the award; POs are generated already `approved` |
| Separate PO list | Shown inside the Purchase tab as "Orders" |
| GRN / invoice / verify / post to inventory | **Unchanged** |
| AI PDF reader, Ask-AI comparison chat, reorder suggestions | **Kept**, relocated into the Purchase screen |

## 4. Screens

### Requester
- `/ims/indents/new` → **"Raise request"**: one search box over the store catalogue +
  "Can't find it? Add new item" (name, spec, reason — same fields as today's PR
  `new_item` line). Shows available stock next to each result.
- **My Requests**: status tracker per request —
  `Requested → Approved → Buying → Ordered → Arrived → Received`.
  Users never see the words PR / RFQ / PO.

### Procurement module — tabs go from 5 to 3

| Tab | Who | Contents |
|---|---|---|
| **Requests** | Store admin / keeper | Approved requests; per line choose Issue or Buy; reorder entry point |
| **Purchase** | Store keeper → Super Admin | Per request: vendors, upload quotation PDFs (AI reader), comparison matrix + Ask AI, choose vendor per line, "Send to Super Admin". Super Admin sees the same screen read-only with Approve / Send back / Reject. After approval: generated POs, format, PDF download |
| **Receive** | Receiver / verifier | Today's GRN screens, unchanged |

### Super Admin approval card (the one screen that matters)
Request no. + requester + department · items and quantities · every quotation side by
side with the chosen one highlighted · AI summary (cheapest, suspicious prices) ·
total amount · **Approve** / **Send back with note** / **Reject**.

## 5. Status model (user-facing ↔ internal)

| User sees | Internal |
|---|---|
| Requested | indent `pending_local_approval` / `pending_approval` |
| Approved | indent `approved` |
| Waiting for Super Admin | indent line `issue` awaiting final, or RFQ `pending_award_approval` |
| Buying | RFQ `draft` / `sent` / `quotations_received` |
| Ordered | PO `approved` / `sent` |
| Arrived | GRN `pending_verification` |
| Received | GRN `completed` → indent `issued` / `delivered` |

## 6. Database changes

1. `procurement_purchase_requests.source_indent_id uuid null references ims_indent_requests(id)`;
   `procurement_purchase_request_items.source_indent_item_id uuid null`.
2. `ims_indent_request_items.fulfilment text check (fulfilment in ('issue','buy'))` — set in step 3.
3. `ims_indent_request_items.final_approved_by / final_approved_at` — Super Admin approval of issue lines.
4. `procurement_rfqs.status` CHECK: add `pending_award_approval`; add
   `award_approved_by`, `award_approved_at`, `award_rejection_reason`.
   (New value, not reuse of `pending_review` — reusing a status with a new meaning is how
   the warehouse-distribution columns ended up inverted.)
5. New RPC `procurement_start_purchase(indent_id)` — atomically creates PR (status
   `converted`) + RFQ (status `draft`) from the indent's `buy` lines. Replaces the
   client-side PR → RFQ snapshot.
6. New RPC `procurement_approve_award(rfq_id)` — Super Admin only; generates one PO per
   awarded vendor directly in `approved`, sets RFQ `awarded`. Wraps today's
   `generateFromRfq` logic server-side so it's atomic.
7. `fn_procurement_guard_approval`: award approval and issue final approval require role
   `super_admin` (check via `user_has_permission()` / role, not `check_permission()`).
8. After GRN verify posts stock, lines with `source_indent_item_id` flip the indent line to
   ready-to-issue so the store keeper sees it in the issue queue.

No tables are dropped. PR, RFQ, PO keep existing so reports, PO formats, three-way match
and NAAC library evidence continue to work.

## 7. Code changes (by area)

- `lib/services/ims/indent-service.ts` — `approveIndent` stays (need approval); add
  `setLineFulfilment`, `finalApproveIssue`; `issueItem` requires final approval for `issue` lines.
- `lib/services/procurement/purchase-request-service.ts` — `approvePurchaseRequest` /
  `approveWithModifications` no longer used in the main path.
- `lib/services/procurement/rfq-service.ts` — drop `submitForReview`, `approveRfq`,
  `rejectRfq`, `markSent` from UI; add `sendForAwardApproval`, `approveAward`, `sendBack`.
- `lib/services/procurement/purchase-order-service.ts` — `submitForApproval` / `approve`
  removed from the main path; `generateFromRfq` moves into the RPC.
- `app/(routes)/procurement/nav-config.ts` — 3 tabs.
- New `app/(routes)/procurement/purchase/[id]` merging `rfqs/[id]` + `rfqs/[id]/quotations`.
  Old routes redirect.
- `/procurement/requests/new` becomes a redirect to `/ims/indents/new`.

## 8. Rollout

| Phase | Scope | Ships alone? |
|---|---|---|
| 1 | Remove extra steps: RFQ review/approval, Mark sent, PR approval, PO submit/approve; add Super Admin award approval that generates approved POs | Yes |
| 2 | Link indent → purchase (`source_indent_id`, Issue/Buy per line, `procurement_start_purchase`) | Yes |
| 3 | Merge screens into 3 tabs + Purchase workspace; requester tracker | Yes |
| 4 | Plain-language labels, redirects from old routes, guide content (`lib/ims/guide/content.ts`) | Yes |

In-flight documents: existing PRs/RFQs/POs finish on the old statuses; the new path only
applies to requests raised after deploy.

## 9. Acceptance criteria

- A requester raises one request and never types the same item twice.
- An out-of-stock purchase has exactly **2 approvals**: need approval, Super Admin final.
- An in-stock issue has need approval + Super Admin final, then issue.
- Only `super_admin` can approve an award or final-approve an issue (enforced in DB, not only UI).
- Super Admin approval creates the PO(s) in one step; no one clicks "Mark sent" or "Submit PO".
- AI quotation reader and Ask-AI comparison work inside the Purchase screen.
- GRN verify still posts stock, batches, and financial transactions exactly as today.
- Requester's tracker updates from Requested to Received without manual steps.
- Procurement nav shows 3 tabs.

## 10. Decisions (confirmed 2026-09-25)

1. **Super Admin is the single final approver for every request, no amount limits** —
   including in-stock issues. Safeguard: the issue-line check reads a system flag
   (default OFF = Super Admin required). If in-stock volume ever bottlenecks, turning it ON
   lets need approval be final for `issue` lines — no schema change.
2. **Mixed requests are split.** Store keeper marks each line `issue` / `buy`. Issue lines
   go to Super Admin immediately; buy lines go through `procurement_start_purchase`.
   Neither path blocks the other.
3. **Send back** returns the RFQ to `draft` and records `award_rejection_reason`. The
   store keeper edits vendors / quotes on the same `/procurement/purchase/[id]` screen and
   resends via `sendForAwardApproval` — same RFQ record, no new document.
