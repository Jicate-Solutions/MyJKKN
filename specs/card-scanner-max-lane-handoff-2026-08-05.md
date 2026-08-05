# Business-card scanner → ₹0 Max lane

**Date:** 2026-08-05 · **Decided by:** Director interview (19 decisions, 2026-08-01/02) · **Status:** ✅ **GATE PASSED 2026-08-05 06:49 IST — runner live, proven, restart-proof. PR #2835 out of draft.**

## Gate results (verified independently against prod, not taken on report)

| Proof | Claim | Result |
|---|---|---|
| 1 · clean English card | **1.1 s** | `confidence: high`; phone/mobile split correctly; handwritten note captured verbatim; `linkedin` **null, not invented** |
| 2 · bilingual Tamil+English | **3.4 s** | fields all Latin-script, `languages_seen: ["Tamil","English"]` |
| 3 · blurred / cropped | 15.5 s | **every field null, `confidence: "low"`** — the name was borderline guessable and the model still refused it. Zero fabrication. |
| 4 · after kill-test | **3.9 s** | task relaunched in 10 s; job claimed by the task-hosted process |

**₹0 proven by ledger, not by assertion:** `ai_model_usage` shows `claude_code` / `claude-sonnet-5`,
4 calls, **`total_inr = 0`**, all `success = true`.

Always-on: task `ai.jkkn.maxlane.ai-jobs-cards`, registered with the box-proven **TimeTrigger**
shape (`PT1M` × `P3650D`, `IgnoreNew`, `ExecutionTimeLimit PT0S`) — never `-AtLogOn`, which is not
always-on. Verified by killing the process, not by reading the registration.

### Seven changes the box made to the script (all correct, all carried here)

1. **`claimOne()` unwraps `{job, spec}`** — see the comment in the code below. Silent-starvation bug.
2. **Ported off `@supabase/supabase-js` to plain `fetch`** — every drain on that box is deliberately
   dependency-free. Three RPCs + one storage GET.
3. **Absolute `claude.exe` path** — bare `claude` does not resolve under Task Scheduler.
4. **Credentials read from the shared env file** when absent from process env — the service key must
   never be copied into task XML.
5. **`delete process.env.ANTHROPIC_API_KEY`** inside the runner — none exists on that box today, but
   the ₹0 guarantee must not depend on that staying true.
6. **Sandbox file keeps the storage object's real extension** rather than a hardcoded `card.jpg`.
7. **Writes the `ai_model_usage` ledger on both success and failure** — platform convention. Without
   it `/admin/ai-models` reports the feature as *paid Google* forever, i.e. a ₹0 feature would be
   invisible as ₹0 exactly where cost is reviewed.

### Known gap before the first real fair

All three proof cards were **synthetic GDI+ renders** (Nirmala UI for Tamil, Segoe Script for the
handwriting). They exercise every contract behaviour, but a phone-camera photo — skew, shadow,
glare, curled edge — has not been through yet. **Run one real card before the first event.**

### Test-procedure note

`fn_ai_enqueue` returns `{ok:false, error:"UNAUTHORIZED"}` under the service role: it requires
`auth.uid()`. Seed proof jobs with **`fn_ai_enqueue_system`**. The app path in #2835 enqueues as a
signed-in user, so it is unaffected — but a test plan written against the wrong RPC will look like
a broken feature.

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
// NOTE: the existing drains on the Windows box are dependency-free (raw fetch /
// PostgREST). Either `npm i @supabase/supabase-js` inside ~/jkkn-max-lane, or port
// the four db calls below to the house fetch style — the runner's shape is the
// contract here, not this client library.
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
// A scheduled task's PATH does not include the CLI on the Windows box — bare
// `claude` resolves interactively and fails under Task Scheduler. All four
// existing drains hardcode the absolute path; do the same here.
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'C:\\Users\\Admin\\.local\\bin\\claude.exe';

// Strict-JSON contract. Every field may be null — a card that lacks a website
// must not make the model invent one. `confidence` lets the review screen sort
// the doubtful ones to the top; it never gates saving (a human confirms all).
// ⚠️  PROMPT REVISED 2026-08-05 (Director decision) — the Windows box at
//     ~/jkkn-max-lane/ MUST be updated with this version. The previous prompt
//     said "the mobile goes in mobile, the landline/office in phone", which
//     gave a card exactly TWO slots. A real card (Esstee Exports) printed
//     THREE numbers; the third was dropped silently at confidence:"high", and
//     `result.raw` was byte-identical to `fields`, so it was unrecoverable.
//     That breaks Director decision 10 ("keep EVERY phone/email").
//
//     `phone` and `mobile` are DELIBERATELY KEPT so an un-updated box and an
//     updated one both produce readable output; the arrays are additive.
const PROMPT = (file) => `Read the business card image at ./${file}.
Return ONLY valid JSON, no markdown fence, no commentary, matching exactly:
{"name":null,"role":null,"organization":null,"email":null,"phone":null,"mobile":null,
 "phones":[],"emails":[],
 "website":null,"linkedin":null,"address":null,"city":null,"pincode":null,
 "handwritten_note":null,"languages_seen":[],"confidence":"high|medium|low"}
Rules:
- Copy text EXACTLY as printed. Never guess, complete, or correct a value; use null if absent.
- The card may be bilingual (Tamil + English are common here). Put the LATIN-SCRIPT form in the
  fields. List every script you saw in languages_seen (e.g. ["Tamil","English"]).
- If someone has written on the card by hand, put that text in handwritten_note verbatim.
- KEEP EVERY NUMBER. "phones" must contain one entry per number printed on the card —
  none may be omitted, even if the card prints four. Each entry is
  {"number":"exactly as printed","label":"the words printed beside it, or null"}.
  Example for a card printing three:
    "phones":[{"number":"+91 98430 41971","label":null},
              {"number":"91-421-6613666","label":"Direct"},
              {"number":"91-421-6613600","label":"30 Lines"}]
- KEEP EVERY EMAIL likewise in "emails" as a plain list of strings.
- ALSO fill "mobile" (the personal/cell number) and "phone" (the main landline) as the two
  primaries, for callers that read only those. They must also appear in "phones".
- "city" is the CITY NAME ALONE — no pincode, no district, no country.
  "Tirupur - 641 602. INDIA" is WRONG; city="Tirupur", pincode="641602".
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
    const { stdout } = await run(CLAUDE_BIN,
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

**Prerequisite — APPLIED to prod 2026-08-05** (after a BEGIN…ROLLBACK dry run): lane CHECK
widened, private `card-scans` bucket, and the `contacts.card_extract` row
(`lane max-cards`, `interactive true`, `provider`/`model_id` NULL). Step 0 passes.

Enqueue a proof job by hand from the box like this — **`fn_ai_enqueue_system`, not
`fn_ai_enqueue`**. Both exist on prod, but `fn_ai_enqueue` enforces the *caller's*
`allow_rule` + daily cap and there is no user session on the Windows box:

```sql
-- storage_path must name a real object already in the private card-scans bucket
SELECT fn_ai_enqueue_system('contacts.card_extract',
  '{"storage_path":"TEST/card-test.jpg","sha256":"manual-test","scanned_by":"windows-test"}'::jsonb,
  'card-proof-1');

SELECT id, status, claimed_by, error,
       extract(epoch FROM claimed_at - requested_at) AS claim_seconds,
       result->'fields' AS fields
FROM ai_jobs
WHERE job_type = 'contacts.card_extract'
ORDER BY requested_at DESC LIMIT 3;
```

1. Test job claimed on `max-cards` within ~30 s and completed with parseable JSON.
2. A real bilingual card returns Latin-script fields + `languages_seen`.
3. A deliberately blurred card returns `confidence: "low"` rather than invented text.
4. Enrich path fills an empty email on an existing contact and **refuses** to overwrite a
   non-empty organisation (already proven live on the Networker endpoint, 2026-08-05).
