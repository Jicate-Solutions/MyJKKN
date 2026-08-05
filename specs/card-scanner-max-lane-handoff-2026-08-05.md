# Business-card scanner → ₹0 Max lane

**Date:** 2026-08-05 · **Decided by:** Director interview (19 decisions, 2026-08-01/02) · **Status:** spec locked; MyJKKN code ships as DRAFT until the box runner is proven

## Why this shape

The scanner's whole job is to fill a hole the data already shows: Networker holds **118 real
contacts** (RISET Foundation, M.S. Swaminathan Research Foundation, Medhavi Skills University …)
of which **only 8 have an email and 7 have a phone**. They came from conference delegate lists —
name + organisation + sector, nobody reachable. Cards carry exactly the missing fields.

Director instruction (2026-08-05): **OCR runs on the ₹0 Max lane like every other AI feature** —
no paid Anthropic call, no `CLAUDE_API_KEY` path.

## The mechanism (proven by the procurement-PDF spec, 2026-07-28)

The Max lane *can* read files — but **the file goes on DISK and the prompt names the path; it never
rides in the message payload**:

```
MyJKKN                                   Windows box runner
──────                                   ──────────────────
photo → private bucket card-scans        fn_ai_claim('max-cards', runner, true)
fn_ai_enqueue('contacts.card_extract',   download storage_path → SANDBOX/card.jpg
  {storage_path, sha256, scanned_by})    claude -p --allowedTools Read  (Max subscription, ₹0)
return { job_id } immediately            fn_ai_complete(job_id, {extracted JSON})
poll → review queue                      fn_ai_fail(job_id, error) on failure
```

## Non-negotiables carried from the existing lane docs

| Rule | Source | Applied here |
|---|---|---|
| **Box runner must be live and proven claiming jobs BEFORE MyJKKN enqueues.** Ship MyJKKN as DRAFT PRs. "A queue with no consumer is worse than the current synchronous call." | `ai-max-lane-move-live-features-handoff-2026-07-28.md` | This PR stays DRAFT until §3 passes |
| **`interactive: true` or it is useless.** Measured over 14 days: interactive jobs are claimed in **8 s avg**; batch jobs in **8,209 s (2.3 h)**. | `ai_jobs` × `ai_job_types`, live query 2026-08-05 | Registry row sets `interactive: true` |
| **₹0 recipe: leave `provider`/`model_id` NULL** → runner uses the Max-subscription Claude CLI. The `max-` lane prefix auto-applies the Anthropic-only lock + ⚡ badge. | handoff spec §18/§21 | `lane: 'max-cards'`, provider/model NULL |
| A dedicated `max-*` sub-lane is unreachable by other runners (`fn_ai_claim` filters on lane, **no job_type filter**). | handoff spec §18 | Cards cannot starve the chat lane, and vice-versa |

> **Cautionary precedent, live in the DB today:** `procurement.quotation_extract` and
> `procurement.invoice_extract` are `enabled: true` but `interactive: false`, and **zero jobs have
> ever run**. Its spec said they "MUST be flipped to `interactive: true`" — that never happened and
> no runner ever claimed one. Registered ≠ running. Do not repeat it: §3 below is the gate.

## 1. Storage

Private bucket **`card-scans`**, path `{institution_id}/{yyyy-mm}/{sha256}.jpg`.
Private because a business card is personal data (Director decision 11: the photo is kept as
provenance, and must be deletable on request).

## 2. Registry row

```sql
INSERT INTO ai_job_types (job_type, title, description, lane, interactive, enabled,
                          provider, model_id, expected_seconds, max_inflight)
VALUES ('contacts.card_extract', 'Business-card extract',
        'Reads a scanned visiting card and returns structured contact fields.',
        'max-cards', true, true,
        NULL, NULL,   -- ₹0: Max-subscription CLI
        20, 4);
```

## 3. Box runner — THE GATE (out-of-repo: `~/jkkn-max-lane/`)

`card-extract.mjs`, launched with `LANE=max-cards`. Proven when: a test job enqueued by hand is
claimed within ~30 s, completes, and writes parseable JSON into `ai_jobs.result`.

```js
// ~/jkkn-max-lane/card-extract.mjs — drain for lane 'max-cards'
// Mirrors the procurement-PDF recipe: file to disk, prompt names the path.
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LANE = process.env.LANE || 'max-cards';
const RUNNER = process.env.RUNNER || 'windows-cards';

// Strict-JSON contract. Every field may be null — a card that lacks a website
// must not make the model invent one. `confidence` lets the review screen sort
// the doubtful ones to the top; it never gates saving (a human confirms all).
const PROMPT = (file) => `Read the business card image at ./${file}.
Return ONLY valid JSON, no markdown fence, no commentary, matching exactly:
{"name":null,"role":null,"organization":null,"email":null,"phone":null,"mobile":null,
 "website":null,"linkedin":null,"address":null,"city":null,"handwritten_note":null,
 "languages_seen":[],"confidence":"high|medium|low"}
Rules:
- Copy text EXACTLY as printed. Never guess, complete, or correct a value; use null if absent.
- The card may be bilingual (Tamil + English are common here). Put the LATIN-SCRIPT form in the
  fields. List every script you saw in languages_seen (e.g. ["Tamil","English"]).
- If someone has written on the card by hand, put that text in handwritten_note verbatim.
- Multiple numbers: the mobile goes in "mobile", the landline/office in "phone".
- confidence: "low" if the image is blurred, cropped, or you are unsure of any character.`;

// fn_ai_claim returns a JSONB ENVELOPE, not the job row:
//   { "job": {id, job_type, payload, ...}, "spec": {...} }   — work available
//   { "job": null }                                          — nothing to claim
// Unwrapping this wrongly is a SILENT killer: `data.id` is undefined forever, so
// the drain idle-polls looking perfectly healthy while claiming nothing. Caught
// by the Windows box during the 2026-08-05 pre-flight, before a single job ran.
async function claimOne() {
  const { data, error } = await db.rpc('fn_ai_claim',
    { p_lane: LANE, p_runner: RUNNER, p_interactive: true });
  if (error) throw error;
  return data?.job ?? null;
}

async function handle(job) {
  const dir = await mkdtemp(join(tmpdir(), 'card-'));
  try {
    const path = job.payload?.storage_path;
    if (!path) throw new Error('payload.storage_path missing');

    const { data: blob, error: dlErr } = await db.storage.from('card-scans').download(path);
    if (dlErr) throw new Error(`download failed: ${dlErr.message}`);

    const file = 'card.jpg';
    await writeFile(join(dir, file), Buffer.from(await blob.arrayBuffer()));

    // cwd = the sandbox, so --allowedTools Read can only reach this one card.
    const { stdout } = await run('claude',
      ['-p', '--model', 'sonnet', '--output-format', 'json', '--allowedTools', 'Read'],
      { cwd: dir, input: PROMPT(file), maxBuffer: 8 * 1024 * 1024, timeout: 120_000 });

    const envelope = JSON.parse(stdout);
    if (envelope.is_error) throw new Error(`claude error: ${String(envelope.result).slice(0, 300)}`);

    const text = String(envelope.result ?? '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`no JSON in model output: ${text.slice(0, 200)}`);
    const fields = JSON.parse(m[0]);

    await db.rpc('fn_ai_complete', { p_job_id: job.id, p_result: { fields, raw: text } });
    console.log(`[cards] ${job.id} ok — ${fields.name ?? '(no name)'} (${fields.confidence})`);
  } catch (e) {
    await db.rpc('fn_ai_fail', { p_job_id: job.id, p_error: String(e.message ?? e).slice(0, 500) });
    console.error(`[cards] ${job.id} FAILED — ${e.message ?? e}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

for (;;) {
  try {
    const job = await claimOne();
    if (job?.id) { await handle(job); continue; }   // drain hot while work exists
  } catch (e) { console.error('[cards] claim error', e.message ?? e); }
  await new Promise(r => setTimeout(r, 5000));      // idle poll
}
```

## 4. MyJKKN side (this PR — DRAFT until §3 passes)

- `POST /api/contacts/card-scan` — validate (image, ≤10 MB) → sha256 → dedupe on
  (sha256) → upload to `card-scans` → `fn_ai_enqueue` → return `{ job_id }` immediately.
  **Never blocks**: the fair flow is snap-snap-snap (decision 13).
- `GET /api/contacts/card-scan?job_id=…` — status + extracted fields for the review queue.
- Review screen = the ONE screen that satisfies three decisions at once: confirm-before-save (5),
  duplicate-warn against Networker's 118 via `/api/contacts/search` (6), and the weak-internet
  queue (7). Save calls Networker `POST /api/contacts/ingest` (new) or `PATCH` to enrich a match.
- Routing question "Who is this?" writes the module row too (decisions 17/18).

## 5. Proof required before merge

1. Test job claimed on `max-cards` within ~30 s and completed with parseable JSON.
2. A real bilingual card returns Latin-script fields + `languages_seen`.
3. A deliberately blurred card returns `confidence: "low"` rather than invented text.
4. Enrich path fills an empty email on an existing contact and **refuses** to overwrite a
   non-empty organisation (already proven live on the Networker endpoint, 2026-08-05).
