# AI Assistant — Artifacts Generation Spec

**Date:** 2026-07-13
**Status:** Approved (interview complete) — NOT yet built. Pick this up cleanly; do NOT re-interview.
**Owner decisions by:** Director (director@jkkn.ac.in)
**Companion:** Windows-drain handoff at `~/.claude/maxlane-handoffs/HANDOFF-ai-query-artifacts-2026-07-13.md`

---

## 1. What this is

Give the MyJKKN AI Assistant (the Max-lane chat at `/ai-query`) the ability to
**generate artifacts** — charts, reports, spreadsheets, and slides — that render
in an **in-chat side panel** (Claude-style), are **downloadable** and **saved/
reopenable**, and can be **refined** ("make the chart blue", "add last year").

The assistant today answers via the **Windows Max drain** (a Claude CLI session
that answers AS the requesting user, per-user scoped, returning markdown in
`ai_jobs.result.answer`). Artifacts extend this: the drain must additionally
**emit structured artifact content**, which is stored and rendered.

---

## 2. Locked decisions (from the interview — build against these, do NOT re-ask)

| # | Decision | Choice |
|---|----------|--------|
| A1 | **Delivery** | In-chat **side panel** with a preview + download button (not just a file, not just inline). |
| A2 | **Types** | **All four**: charts/graphs, reports/documents, spreadsheets/tables, slides/decks. |
| A3 | **Downloads** | **Allowed + audit log** — record who downloaded what (and when/format). |
| A4 | **Persistence** | **Saved + reopenable** — artifacts appear in history like past chats. |
| A5 | **Who can generate** | **Anyone with assistant access** (same gate as chat: `permission:ai_query.view`). |
| A6 | **Editing** | **Iterative** — user can ask for changes and the panel updates (versioned). |
| A7 | **Sensitive data** | **Warn before generating** artifacts that draw on salary/fee data ("this contains salary/fee data — continue?"). |
| A8 | **Big requests** | **Build the whole thing** (no cap/sampling) — accept the timeout risk on very large ones. |

**Inherited constraints (from the chat cutover — still apply):**
- **Per-user scoping is the boundary.** Artifacts contain only data the requester
  can already see (own-college, or all-college for the cross-college grantees:
  ceo@, coo@, eao@, registrar@). The drain answers as the user via a session-
  minted **anon-key** client (client B), never the service key. An artifact must
  never contain data outside the requester's scope.
- **No hallucination / cite-source / bilingual (Tamil↔English)** — same as chat.
- **Max-only lane**, no paid fallback.

---

## 3. Architecture — three layers (one is on the Windows box)

```
User asks: "make me a chart of this term's fee collection by category"
        │
        ▼
[ /api/ai-query POST ]  enqueues ai_query.chat job (unchanged)
        │
        ▼
[ WINDOWS MAX DRAIN ]  answers AS the user (client B, anon key, RLS)
        │   ── produces the text answer  AND  one or more ARTIFACTS ──
        ▼
[ ai_jobs.result ]  { answer, artifacts: [ {id/type/title/content/is_sensitive} ] }
        │   drain also INSERTs each artifact row (see §5)
        ▼
[ /api/ai-query poll → route returns answer + artifact refs ]
        │
        ▼
[ CHAT UI ]  renders the answer bubble + an ARTIFACT CARD → opens the SIDE PANEL
             (chart / report / spreadsheet / slides) with Download + Refine
```

| Layer | Work | Where | Who builds |
|---|---|---|---|
| **Max brain** | Emit structured artifacts (a chart spec, a report doc, spreadsheet rows, slide content) in the agreed contract; insert artifact rows | **Windows box** | Windows session (via handoff) |
| **Database** | `ai_artifacts` + `ai_artifact_downloads` + auth.uid()-scoped RPCs | Supabase (prod `kvizhngldtiuufknvehv`) | Mac session |
| **Chat UI** | Artifact card + side panel renderer (4 types), download (PDF/Excel/PPTX/PNG), reopen-from-history, refine loop, sensitive-data warning | `components/ai-query/*`, `hooks/use-ai-query.ts`, `app/(routes)/ai-query/*` | Mac session |

**Cross-machine dependency:** The Mac session can build the DB + full UI + the
contract, but the **brain change is Windows-only**. Ship the Mac side behind the
artifact contract; artifacts light up once the Windows drain emits them.

---

## 4. The artifact contract (BOTH sides must agree — this is the crux)

The drain's model produces its normal markdown answer AND, when it makes an
artifact, emits it in a fenced, typed block the drain can parse out:

~~~
```artifact
{
  "type": "chart" | "report" | "spreadsheet" | "slides",
  "title": "Fee collection by category — Term 1",
  "is_sensitive": true,
  "content": { ...type-specific, see below... }
}
```
~~~

The **drain** (Windows):
1. Extracts each ```artifact ...``` block from the model output.
2. Validates `type` + `content` shape; drops malformed ones (never crash).
3. INSERTs an `ai_artifacts` row per artifact (owner = requester, linked to the
   job + conversation), via `fn_ai_create_artifact` (see §5) using client B (the
   user-scoped session) OR service_role with an explicit `p_owner := requested_by`
   — **owner MUST be the requester, never the runner**.
4. Returns `result = { answer: <markdown, artifact blocks stripped>, artifacts: [ {id, type, title, is_sensitive} ] }`.

**Type-specific `content`:**
- **chart** — a chart spec: `{ chartType: 'bar'|'line'|'pie'|'doughnut', title, xLabel, yLabel, series: [{ label, data:[{x,y}] }] }`. Rendered with the app's chart lib (Recharts) + the **dataviz skill** palette (accessible in both themes).
- **report** — `{ markdown: "# ...", }` (headings, tables, bold, lists — the same subset MessageBubble already renders).
- **spreadsheet** — `{ columns: [{key,label,type}], rows: [ {..} ] }`. Rendered as a table; downloadable as `.xlsx`/`.csv`.
- **slides** — `{ slides: [ { title, bullets:[..], notes? } ] }`. Rendered as a simple deck; downloadable as `.pptx`/`.pdf`.

> Keep the model's artifact JSON **small and structured** — it describes the data,
> the frontend does the rendering. Do NOT have the model emit raw HTML/SVG/PPTX
> binary; that is the frontend's job (safer + smaller).

---

## 5. Database (Mac session builds; apply to prod via Management API, show-SQL-first)

### `ai_artifacts`
```
id            uuid PK default gen_random_uuid()
job_id        uuid REFERENCES ai_jobs(id) ON DELETE SET NULL
conversation_id uuid                       -- groups with the chat thread
owner_id      uuid NOT NULL                -- = requester (auth.uid of the asker)
type          text NOT NULL CHECK (type IN ('chart','report','spreadsheet','slides'))
title         text
content       jsonb NOT NULL               -- type-specific (see §4)
is_sensitive  boolean NOT NULL DEFAULT false
version       int NOT NULL DEFAULT 1       -- bumps on refine (A6)
supersedes_id uuid                          -- previous version, for the refine loop
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
-- RLS ON; REVOKE ALL FROM anon, authenticated (all access via RPC)
```

### `ai_artifact_downloads` (A3 audit)
```
id           uuid PK default gen_random_uuid()
artifact_id  uuid NOT NULL REFERENCES ai_artifacts(id) ON DELETE CASCADE
downloaded_by uuid NOT NULL                 -- auth.uid of the downloader
format       text NOT NULL                  -- 'pdf'|'xlsx'|'csv'|'pptx'|'png'
downloaded_at timestamptz NOT NULL DEFAULT now()
-- RLS ON; REVOKE ALL FROM anon, authenticated
```

### RPCs — ALL `SECURITY DEFINER`, pin `auth.uid()`, filter `owner_id = auth.uid()`, `REVOKE EXECUTE FROM anon, PUBLIC` (see CLAUDE.md anon-lock rule)
| RPC | Purpose | Notes |
|---|---|---|
| `fn_ai_create_artifact(p_owner, p_job_id, p_conversation_id, p_type, p_title, p_content, p_is_sensitive, p_supersedes_id)` | Drain inserts an artifact | Owner-bound: if caller is the user, force `owner := auth.uid()`; if service_role, require explicit `p_owner` and bind everything to it. Bump `version` when `p_supersedes_id` set. |
| `fn_ai_my_artifacts(p_limit)` | List the caller's artifacts (newest first) | `owner_id = auth.uid()` only. |
| `fn_ai_get_artifact(p_id)` | Fetch one artifact's full content | `owner_id = auth.uid()` → IDOR-safe (spoofed id → 0 rows). |
| `fn_ai_log_artifact_download(p_id, p_format)` | Audit a download (A3) | Verifies the artifact is the caller's before logging. |
| `fn_ai_artifact_downloads(p_limit)` *(admin)* | Super-admin read of the download log | `is_super_admin()` gate. |

**Follow the `feedback_secdef_rpc_taking_sql_text_is_arbitrary_read_primitive` +
`feedback_ai_rpc_confused_deputy_p_user_id` lessons:** never trust a caller-
supplied owner except from service_role; always bind reads to `auth.uid()`.

---

## 6. Frontend (Mac session)

- **Artifact card** in `MessageBubble` — when a message has linked artifacts,
  show a compact card (icon by type + title). Click → open the **side panel**.
- **Side panel** (`components/ai-query/ArtifactPanel.tsx`, new) — a resizable
  right panel (Sheet or a split pane) that renders by `type`:
  - chart → Recharts + dataviz palette (theme-aware).
  - report → the existing ReactMarkdown renderer (reuse MessageBubble's map).
  - spreadsheet → a scrollable table (reuse `QueryResultTable` where possible).
  - slides → a simple slide viewer (prev/next).
- **Download button** — per type: report→PDF, spreadsheet→`.xlsx`+`.csv`
  (repo has xlsx tooling), slides→`.pptx`/`.pdf`, chart→PNG (canvas export).
  Each download first calls `fn_ai_log_artifact_download` (A3).
- **Reopen from history** (A4) — extend the "Your past chats" panel: a chat that
  produced artifacts shows an artifact badge; reopening the thread reattaches its
  artifacts. Or a dedicated "Your artifacts" tab via `fn_ai_my_artifacts`.
- **Refine loop** (A6) — a "Refine" affordance on the panel that sends a follow-up
  ("change X") in the same conversation; the drain emits a NEW artifact version
  (`supersedes_id` = current), the panel swaps to the new version.
- **Sensitive warning** (A7) — when the model marks `is_sensitive: true` (salary/
  fee data), the UI shows a one-time "This artifact contains salary/fee data —
  continue?" confirm before rendering/downloading. (The model flags it; the UI
  gates it.)

Client calls the new RPCs via `createClientSupabaseClient()` +
`(supabase as any).rpc(...)` (fns won't be in generated types yet) — same pattern
as the history feature.

---

## 7. Phasing (recommended)

- **Phase 1 — foundation + charts + reports.** DB tables + RPCs; the artifact
  contract; the side panel rendering **charts + reports**; download (PDF/PNG) +
  save + reopen. Windows handoff so the drain emits these two types. This proves
  the whole architecture end-to-end.
- **Phase 2 — spreadsheets + slides.** Add the two remaining renderers + Excel/
  PPTX downloads. Drain emits the two new types.
- **Phase 3 — refine loop + sensitive-data warning + audit polish.** Versioning
  (A6), the salary/fee confirm (A7), the admin download-log view.

---

## 8. Ship discipline (unchanged from this project)

- New SECDEF RPCs: `REVOKE EXECUTE FROM anon, PUBLIC` (CLAUDE.md).
- Apply migrations to prod via Management API (deploy ships code, not migrations).
- Ship from a `jicate/main` worktree; push to the `jicate` remote; one PR.
- Leak-test every new RPC by impersonating two colleges + a cross-college id-spoof
  BEFORE calling it done (never trust a self-reported PASS).
- UI PRs hit the **Visual Proof Gate** — Director-only `visual-proof-skip` or a
  real screenshot; verify the authed render on prod after deploy (PWA cache: use a
  fresh browser context / the persona harness, not the cached persistent session).

## 9. Open craft decisions (safe to decide at build time — NOT user intent)

- Chart lib: confirm Recharts is already a dep; else pick one. Use dataviz palette.
- PDF/PPTX generation: client-side lib vs a server route — pick per bundle size.
- Panel layout: overlay Sheet vs split-pane (Sheet is simplest for Phase 1).
- Artifact retention: keep all versions vs prune old versions (start: keep all).
