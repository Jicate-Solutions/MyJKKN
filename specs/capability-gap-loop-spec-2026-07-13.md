# AI Assistant — Capability-Gap Loop Spec

**Date:** 2026-07-13
**Status:** Design spec — NOT built. Read-only DB mining done; no migration applied. **Director interview complete (8 decisions locked 2026-07-13 — see §2 G9–G15).**
**Owner decisions by:** Director (director@jkkn.ac.in)
**Sibling specs:** `specs/ai-query-artifacts-spec-2026-07-13.md` (same two-machine split, format template)
**Companion (future):** a Windows-drain handoff for the "expose approved tool" step (see §11).

---

## 1. What this is

A **"Capability Gaps"** tab on the AI-Query Tools page (`/ai-query/admin`) that turns
the assistant into a system that **measurably gets better at what it can answer over
time** — a verified self-improving loop, not a dashboard.

The assistant already logs every Q&A in `ai_jobs` (`job_type='ai_query.chat'`,
`payload->>'message'` = question, `result->>'answer'` = answer). This feature:

1. **Mines its own chat log** for moments the model said *"I can't access X"* / *"I
   couldn't find that"* — the model-flagged capability-gap signal.
2. **Clusters** them by the missing capability (fees, hostel capacity, participation…).
3. **Triages each cluster into a gap-class** by cross-referencing what actually exists
   in the DB (does an `ai_rpc_*` tool exist? does the underlying data exist? is the
   tool actually reachable by the model?).
4. **Human-gated closes the gap** with the *cheapest correct* fix for its class — and
5. **Measures** whether the cluster's refusal-frequency **drops next cycle**. If it
   doesn't drop after exposing/adding a tool, that measurement *re-classifies* the gap
   (proving the loop reads its own outcomes, not just its own noise).

**Why this is not "saw can't-access → build a tool":** the loudest refusals are almost
always **false gaps**. In the live corpus (§3) **0 of 7 refusals** actually needed a new
tool; **6 of 7** were the assistant refusing on data whose tool *already exists in the
DB but is not exposed to the model*. A naive loop would have built **three duplicate
tools that already exist** (`ai_rpc_fee_defaulters`, `ai_rpc_fees_revenue`,
`ai_rpc_hostel_occupancy`). The triage is the entire value.

---

## 2. Locked design decisions (defaults — change only with Director sign-off in §12)

| # | Decision | Choice |
|---|----------|--------|
| G1 | **Signal source** | Model-emitted refusal phrases in `ai_jobs.result->>'answer'` (the assistant confessing a limit). |
| G2 | **Never auto-wire** | The loop **DRAFTS** and **surfaces**; a **human approves** every tool exposure / creation. It never self-grants a read surface. (See §8 security constraint.) |
| G3 | **Cheapest-correct fix per class** | 1a → tool-description edit; 1b → expose existing tool (leak-tested); 2 → draft new SECDEF tool (leak-tested); 3 → log as data gap. |
| G4 | **Verified loop, not echo** | Each cluster carries a refusal-frequency baseline; a fix is only "confirmed" when the cluster's frequency **drops** next scan (§9). |
| G5 | **Mandatory leak-test gate** | Any tool that becomes newly reachable (1b expose OR 2 new) runs the two-college + cross-college id-spoof leak test **before** it goes live. No self-reported PASS is trusted. |
| G6 | **Who sees the tab** | Super-admin only (same gate as the rest of `/ai-query/admin`, `SuperAdminOnly`). |
| G7 | **Composes with #2006 registry** | New/exposed tools register via the existing `ai_job_types` / tool-registry mechanism; the tab does not duplicate it. |
| G8 | **Filter non-gap refusals** | Legitimate "that's a policy/judgment call" refusals (e.g. *"which should we admit more of"*) are **not** capability gaps and must be filtered out of the queue, not tooled. |

**Director interview 2026-07-13 (locked — these override any assumed default above):**

| # | Decision | Choice |
|---|----------|--------|
| G9 | **Human approves every fix** | The system auto-drafts + leak-tests each fix, but **nothing goes live until a super-admin/Director clicks approve** — no auto-apply, even for "safe" 1b exposures. (Resolves D1: auto-draft yes, auto-apply no.) |
| G10 | **No special money-data gate** | Tools touching **fees / salary go through the SAME leak-test + approval as any other tool** — no extra per-tool money sign-off. The leak-test (cross-college isolation) is the safety mechanism; money is not a separate tier. (Resolves D2.) |
| G11 | **Privacy-wall disposition** | A permanent `privacy_wall` status for gaps whose data **exists but must not be shared** (e.g. one staffer's salary shown to another). Marked once by a human → **never re-surfaces and is never re-suggested for tooling.** |
| G12 | **Only surface repeated gaps** | A cluster becomes **actionable/visible only after it recurs** — `occurrence_count > 1` **OR** `distinct_users > 1`. One-offs stay latent (this is also how a genuine *"there are none"* answer, refused once, avoids being mistaken for a missing skill). |
| G13 | **Auto-retest + proof after a fix** | When a fix goes live, the system **re-runs the cluster's sample questions and shows the new working answer as proof** — the visible half of the §9 measurement (not just a frequency number). |
| G14 | **Passive tab, no alerts (Phase 1)** | Gaps quietly collect on the tab; the Director checks when they want. **No proactive email/notification in Phase 1.** ("Ping me for important ones" is a later opt-in toggle, not built now.) |
| G15 | **Dismissed = remembered** | A dismissed gap is marked `dismissed` and **does not re-surface on recurrence** (findable later if reconsidered) — it does not re-nag. |

---

## 3. Evidence base (read-only production mining, prod `kvizhngldtiuufknvehv`, 2026-07-13)

Corpus: **21** `ai_query.chat` jobs (window 2026-07-12 → 2026-07-13); **19** had answers.

**Refusal moments: 7 of 19 answered chats (≈37%), from 3 distinct users.** Detected with
`ILIKE` over `%don't have%`, `%cannot access%`, `%outside the data%`, `%couldn't find%`,
`%no access%`, etc. against `result->>'answer'`.

**Clusters + gap-class (the crux):**

| Cluster | Hits | Distinct users | Matching `ai_rpc_*` exists? | Underlying data exists? | In inferred-exposed set? | **Gap-class** |
|---|---|---|---|---|---|---|
| **Fee defaulters / billing** ("List fee defaulters in current semester" → *"I couldn't find that"*) | 2 | 2 | ✅ `ai_rpc_fee_defaulters`, `ai_rpc_fees_revenue`, `ai_rpc_billing_categories`, `ai_rpc_student_bills` | ✅ 16 `billing_*` tables | ❌ (never cited) | **1b** — exists, not exposed |
| **Hostel capacity / economics** ("which is better for management — day scholars or hostelites" → *"…hostel-capacity … outside the data I can access"*) | 4 | 1 | ✅ `ai_rpc_hostel_occupancy`, `ai_rpc_hostel_allocations` | ✅ 73 `hostel_*` tables | ❌ (never cited) | **1b** — exists, not exposed (+ a judgment sliver, see below) |
| **Participation < 75%** ("Show learners with participation below 75%" → *"I couldn't find that"*) | 1 | 1 | ✅ `ai_rpc_attendance`, `ai_rpc_attendance_summary`, `ai_rpc_students_summary` | ✅ | ✅ likely (`students_summary` cited) | **1a** — exists + exposed, discoverability/query-shape |

**Gap-class breakdown of the 7 refusals:** **1a ≈ 14% (1), 1b ≈ 86% (6), class-2 (need
new tool) = 0%, class-3 (data truly missing) = 0.** The "which should we admit more of"
portion is a **non-gap** (a management judgment, correctly refused) — G8 filters it.

**The inference that pins class-1b (and its limitation):** across all 19 answers, only
**5 distinct tools are ever cited** — `ai_rpc_admission_statistics`, `ai_rpc_departments`,
`ai_rpc_kpi_summary`, `ai_rpc_students_by_department`, `ai_rpc_students_summary`. **None**
of the fee/hostel/billing tools appear, despite questions that demand them. The DB says
the `ai_query.chat` job type is `tool_set='all'`, but the **live Windows drain exposes a
curated `READ_TOOLS` subset** (the Windows session confirmed *"READ_TOOLS has no billing
tool"*). We **cannot read the Windows READ_TOOLS list from the Mac side**, so "exposed" is
**inferred** from which tools actually appear in successful answers. The spec treats this
inference as a first-class, revisable field (`gap_class` is a human-confirmable
disposition, not an oracle) and the measurement loop (§9) is what confirms or corrects it.

**Sibling signal (for context):** `ai_query_feedback` (id, job_id, flagged_by, note,
created_at) + `fn_ai_flag_answer` + `fn_ai_feedback_list` — the "Looks wrong?" loop —
carries **3 rows**. That is the **user-flagged wrong-answer** signal (the answer came back
but was wrong). This capability-gap loop is the **model-flagged no-answer** signal (no
answer came back at all). They are complementary and should eventually share the tab's
"answer quality" surface, but they are distinct tables and distinct fixes.

---

## 4. Architecture — three layers (one is on the Windows box)

```
                 ┌──────────────── ai_jobs (job_type='ai_query.chat') ────────────────┐
                 │  payload->>'message' = question   result->>'answer' = answer         │
                 └───────────────────────────────┬──────────────────────────────────────┘
                                                 │
   [ DETECTION CRON (Mac / loops harness) ]  scan new answered chats for refusal phrases
                                                 │  extract missing-capability phrase, cluster
                                                 ▼
                       [ capability_gaps ]  one row per cluster (occurrence_count, baseline, gap_class, status)
                                                 │
                                                 ▼
   [ "Capability Gaps" TAB  /ai-query/admin ]  ranked clusters → super-admin triages & dispositions
                                                 │
              ┌──────────────────────┬───────────┴───────────┬─────────────────────────┐
              ▼                      ▼                        ▼                         ▼
        class 1a               class 1b                  class 2                    class 3
   edit tool description   expose existing tool      draft NEW SECDEF tool       log data gap
   (Mac, tool-config)      → LEAK-TEST → approve      → LEAK-TEST → approve       (no fix, tracked)
                            → Windows adds to          → register (#2006)
                              READ_TOOLS                → Windows adds to READ_TOOLS
                                                 │
                                                 ▼
   [ NEXT DETECTION CYCLE ]  re-measure the cluster's refusal frequency → DID IT DROP? (§9)
                                                 │
                          drop → confirm class + resolve   ·   no drop → re-classify (1b→1a) + re-queue
```

| Layer | Work | Where | Who builds |
|---|---|---|---|
| **Detection** | Scan `ai_jobs`, flag refusals, extract + cluster missing capability, upsert `capability_gaps`, re-measure baselines | Mac (loops/cron harness) | Mac session |
| **Database** | `capability_gaps` (+ optional `capability_gap_events`) + super-admin SECDEF RPCs | Supabase (prod) | Mac session |
| **Triage UI** | The "Capability Gaps" tab: ranked clusters, class, suggested fix, sample Qs, disposition controls, draft-tool + leak-test runner | `app/(routes)/ai-query/admin/*` | Mac session |
| **Tool draft + leak-test** | Generate a candidate SECDEF `ai_rpc_*` spec (class 2); run two-college + id-spoof leak test on any newly-reachable tool | Mac session | Mac session |
| **Expose to model** | Add an approved tool to the drain's `READ_TOOLS` so the model can actually reach it | **Windows box** | Windows session (handoff) |

**Cross-machine dependency (same split as artifacts):** the Mac session builds the DB +
tab + detection + drafting + leak-test end-to-end. The single Windows-only step is
**making an approved tool reachable** (editing `READ_TOOLS` in the drain). Class-1a fixes
(tool-description edits) and class-3 (data gaps) need **no** Windows change at all.

---

## 5. The gap-class triage (the core mechanism)

For each cluster, two boolean cross-references decide the class:

| | **Underlying data/table exists?** | | |
|---|---|---|---|
| **Tool (`ai_rpc_*`) exists?** | **Yes** | **No** | |
| **Yes, and reachable by model (inferred exposed)** | **1a** — discoverability: model didn't reach for it / wrong query shape → *fix = better tool description/examples* | (n/a) | |
| **Yes, but NOT exposed to the drain** | **1b** — reachability: exists but the model can't call it → *fix = expose the existing tool (leak-test, no new code)* | (n/a) | |
| **No** | **2** — no tool for data that exists → *fix = DRAFT a new SECDEF, auth.uid()-scoped, anon-locked `ai_rpc_*`* | **3** — data doesn't exist anywhere → *flag as genuine data gap; cannot fix by tooling* | |

**Class detection is semi-automatic, human-confirmed.** The detector proposes a class by:
- **tool exists?** → `pg_proc` name match against `ai_rpc_%` for the cluster's keywords.
- **exposed?** → the tool appears in the inferred-exposed set (cited in past successful
  answers) — a heuristic, flagged as such (§3 limitation). Human can override.
- **data exists?** → `information_schema.tables` match for the cluster's domain prefix.

The **suggested fix** shown in the tab is a direct function of the proposed class (G3).
The human confirms/overrides the class before any fix is dispatched.

---

## 6. Database (Mac session; SQL shown, **NOT applied** — apply later via Management API, show-SQL-first)

### `capability_gaps`
```sql
-- One row per capability cluster the assistant has refused on.
CREATE TABLE public.capability_gaps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key       text NOT NULL UNIQUE,          -- normalized topic, e.g. 'billing.fee_defaulters'
  title             text NOT NULL,                 -- human label, e.g. 'Fee defaulters this semester'
  sample_questions  jsonb NOT NULL DEFAULT '[]',   -- up to N verbatim questions that triggered it
  sample_job_ids    jsonb NOT NULL DEFAULT '[]',   -- ai_jobs.id refs for provenance
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  occurrence_count  int NOT NULL DEFAULT 1,        -- total refusals mapped to this cluster
  distinct_users    int NOT NULL DEFAULT 1,        -- distinct requested_by (cross-user demand signal)
  -- triage
  gap_class         text CHECK (gap_class IN ('1a','1b','2','3','non_gap')),  -- null = untriaged
  gap_class_source  text CHECK (gap_class_source IN ('auto','human')) DEFAULT 'auto',
  suggested_fix     text,                          -- rendered from class (G3)
  candidate_tool    text,                          -- proposed/linked ai_rpc_* name
  -- disposition
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','triaged','fix_drafted','leak_testing',
                                        'awaiting_approval','fix_live','resolved','dismissed',
                                        'data_gap','privacy_wall')),   -- privacy_wall = permanent never-build (G11)
  actionable        boolean NOT NULL DEFAULT false,  -- G12: true only once occurrence_count>1 OR distinct_users>1
  retest_answer     text,                            -- G13: the new working answer captured after a fix (proof)
  retest_at         timestamptz,
  linked_tool_id    text,                          -- the ai_rpc_* / ai_job_types key once fixed
  -- measurement (§9)
  baseline_freq     numeric,                       -- refusals-per-window at time of fix
  post_fix_freq     numeric,                       -- refusals-per-window in the cycle AFTER the fix
  freq_dropped      boolean,                        -- did it drop? (confirms/rejects the class)
  -- audit
  disposed_by       uuid,
  disposed_reason   text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.capability_gaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capability_gaps FROM anon, authenticated;   -- all access via SECDEF RPC
```

### `capability_gap_events` (optional, Phase 3 — per-refusal audit for exact frequency math)
```sql
CREATE TABLE public.capability_gap_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id        uuid NOT NULL REFERENCES public.capability_gaps(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL,                    -- ai_jobs.id of the refusing answer
  requested_by  uuid,
  matched_phrase text,
  observed_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.capability_gap_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capability_gap_events FROM anon, authenticated;
```

### RPCs — ALL `SECURITY DEFINER`, `SET search_path=public`, `is_super_admin()`-gated, `REVOKE EXECUTE FROM anon, PUBLIC` (CLAUDE.md anon-lock rule)
| RPC | Purpose | Gate |
|---|---|---|
| `fn_capgap_scan()` | The detection pass: read new answered `ai_query.chat` jobs since last scan, match refusal phrases, cluster, upsert `capability_gaps`, bump `occurrence_count`/`last_seen`/`distinct_users`. Idempotent per job. | `is_super_admin()` (called by cron/service-role) |
| `fn_capgap_list(p_status, p_limit)` | Ranked clusters (by `occurrence_count * distinct_users` desc) for the tab. | `is_super_admin()` |
| `fn_capgap_triage(p_id, p_gap_class, p_candidate_tool, p_reason)` | Human sets/overrides the class + suggested fix; stamps `gap_class_source='human'`, `disposed_by=auth.uid()`. | `is_super_admin()` |
| `fn_capgap_set_status(p_id, p_status, p_linked_tool_id, p_reason)` | Move through the workflow (triaged → fix_drafted → … → resolved/dismissed/data_gap). | `is_super_admin()` |
| `fn_capgap_measure(p_id)` | Re-measure the cluster's refusal frequency for the window AFTER the fix; write `post_fix_freq`, `freq_dropped`; on "no drop" flip `1b→1a` and re-open (§9). | `is_super_admin()` |

> **Note:** these RPCs never touch per-user institutional data — they read the *chat log
> metadata* (questions/answers already produced) and the *catalog* (`pg_proc`,
> `information_schema`). They are super-admin-only analytics, not a new per-user read
> surface. The *tools they help create* are the per-user surfaces, and those are gated by
> §8 (leak-test + human approval), never by these RPCs.

---

## 7. The "Capability Gaps" tab (`app/(routes)/ai-query/admin/`)

Slots into the existing `<Tabs>` on the Tools page (today: "By Category" / "All Tools";
add "Capability Gaps"). Same `SuperAdminOnly` gate. Client calls the new RPCs via
`(supabase as any).rpc('fn_capgap_*', {...})` on `createClientSupabaseClient()` (fns won't
be in generated types) — the repo's standard pattern.

**Layout:**
- **Header stats** (mirror `ToolsOverview` card style): open gaps, refusals-this-week,
  gap-class mix (1a/1b/2/3), gaps resolved + % refusal-rate trend.
- **Ranked cluster list** — each row:
  - Title + `cluster_key`; **occurrence_count** and **distinct_users** (cross-user demand);
    first/last seen; a **gap-class badge** (1a/1b/2/3/non-gap) with the auto/human source.
  - **Sample questions** (verbatim, expandable) with links to the `ai_jobs` rows.
  - **Suggested fix** (rendered from class) + the matching/candidate `ai_rpc_*`.
  - **Disposition controls:** `Confirm class` · `Change class` · `Draft tool` (class 2) ·
    `Expose tool` (class 1b) · `Edit description` (class 1a) · `Mark data gap` (class 3) ·
    `Mark privacy wall` (permanent never-build, G11) · `Dismiss` (non-gap / noise, remembered per G15).
  - **After a fix:** a **before → after** proof panel (the old refusal beside the auto-retest
    answer, G13).
- **Default view shows only actionable clusters** (`occurrence_count>1` OR `distinct_users>1`,
  G12); a toggle reveals the latent one-offs. Every frequency shows its **sample size** so a
  human never over-reads a 1-of-2 (§9).
- **Fix drawer** — per class:
  - **1a:** inline editor for the tool's `description`/`examples` in
    `lib/config/ai-query-tools-config.ts` (the static registry) → PR.
  - **1b:** a **read-only preview** of the existing tool + a **"Run leak-test"** button
    (§8) → on PASS, a **"Request Windows exposure"** action that writes a handoff record
    (status → `awaiting_approval` → Director → Windows adds to `READ_TOOLS`).
  - **2:** a generated **candidate SECDEF tool spec** (name, args = filters only,
    `auth.uid()`-scoped body, anon-REVOKE template) → **"Run leak-test"** → approve →
    register via #2006 (`ai_job_types` / tool registry) → Windows exposure.
  - **3:** a note field; row parks in `data_gap` for roadmap visibility.

The tab is **insight + drafting only** — it renders "here is what the assistant keeps
failing on, here is the cheapest correct fix, and here is the proof it worked." The
irreversible steps (creating/exposing a tool) always route through the leak-test gate and
a human.

---

## 8. The human-gated fix workflow + the hard security constraint

**Non-negotiable (G2/G5):** every path that makes a tool **newly reachable by the model**
is a new per-user read surface. Auto-granting is exactly the confused-deputy leak just
closed in **PR #1995** (a non-super student pulled 4,486 other learners). So:

> **The loop DRAFTS and SURFACES. It never self-grants data access.** Every 1b-expose and
> every 2-new-tool passes an **automatic leak-test**, then a **human approves**, before it
> can go live.

**The mandatory leak-test (auto-run, no self-reported PASS trusted):** for the candidate
tool, in one rolled-back Management-API batch, impersonate:
1. **College A** user → assert rows are A-scoped only.
2. **College B** user → assert rows are B-scoped only, disjoint from A.
3. **Cross-college id-spoof** — a College A user passing a College B id/param → assert **0
   rows** (IDOR-safe; `auth.uid()` pin holds, per `feedback_ai_rpc_confused_deputy_p_user_id`).

Only a 3/3 PASS advances the row to `awaiting_approval`. Fail → row parks with the failing
case shown; the draft is revised, never shipped.

**Per class:**
- **1a (edit description):** lowest risk — no new reachability. Edit the registry
  description/examples → PR → deploy. No leak-test needed (the tool was already reachable).
- **1b (expose existing):** the tool already enforces `auth.uid()`, but exposing it makes
  it reachable → **leak-test required** (it becomes newly callable in a new context) →
  human approve → Windows adds to `READ_TOOLS`.
- **2 (new tool):** generate candidate SECDEF spec (args are **filters only**, never raw
  SQL text — `feedback_secdef_rpc_taking_sql_text_is_arbitrary_read_primitive`; body binds
  `auth.uid()`; `REVOKE EXECUTE FROM anon, PUBLIC`) → **leak-test** → human approve →
  register (#2006) → Windows adds to `READ_TOOLS`.
- **3 (data gap):** no tooling can fix; log for roadmap.

---

## 9. Measurement loop + moat verification (the 2-cycle proof)

The loop is a **verified moat** only if the **next action changes because the prior
outcome was measured against a baseline** — not merely because a refusal was seen.

**Metric:** per cluster, **refusal-frequency = (refusals mapped to the cluster) / (chat
questions in that cluster's topic) per scan window.** `baseline_freq` is captured at the
moment a fix is dispatched; `post_fix_freq` is measured in the **next** window.

### Worked example — the `billing.fee_defaulters` cluster (real data)

**Cycle 1 (detect + fix):**
- Detection scan finds cluster `billing.fee_defaulters`: `occurrence_count=2`,
  `distinct_users=2` (two different users asked "List fee defaulters" and both got *"I
  couldn't find that"*). `baseline_freq = 2/2 = 1.0` (100% of fee-defaulter questions
  refused).
- Auto-triage: `ai_rpc_fee_defaulters` **exists** (`pg_proc`), billing data **exists** (16
  `billing_*` tables), but the tool is **not in the inferred-exposed set** → proposes
  **class 1b**. Human confirms.
- Fix = **expose existing tool.** Auto leak-test on `ai_rpc_fee_defaulters` (College A /
  College B / id-spoof) → **3/3 PASS.** Director approves. Windows adds it to `READ_TOOLS`.
  Row → `fix_live`, `linked_tool_id='ai_rpc_fee_defaulters'`, `baseline_freq=1.0`.

**Cycle 2 (measure → the next action is determined by the outcome):**
- Next scan window re-measures `billing.fee_defaulters`.
- **Branch A — it dropped** (`post_fix_freq → 0`, the same question now returns real
  defaulter rows): `freq_dropped=true` → row → **`resolved`**. The measurement *confirms*
  class-1b was correct. **The loop's next action (resolve + stop) happens because the drop
  was measured.**
- **Branch B — it did NOT drop** (`post_fix_freq` still high — the tool is now reachable
  but the model still isn't reaching for it): `freq_dropped=false` → the loop
  **re-classifies 1b → 1a** and re-opens with `suggested_fix='edit tool description'`. **The
  next action changed — from "done" to "now fix discoverability" — purely because the
  outcome was measured against the baseline.**

Branch B is what makes this a **loop, not an echo**: a fix that doesn't move the metric
*teaches the system it mis-diagnosed the class*, and the next cycle's action is different
because of that measured outcome. Without the drop-check, the system would "close" gaps it
never actually fixed.

### Auto-retest — the immediate proof (G13, Director-chosen)

The frequency-drop above needs a *next window of real user traffic* to confirm. The
Director also wants **immediate** proof, so the moment a fix goes live the system runs an
**auto-retest**: it re-enqueues the cluster's stored `sample_questions` as fresh
`ai_query.chat` jobs **as the original asker** (owner-scoped, the same per-user path — never
service-role), waits for the answers, and checks them for the refusal phrase.
- **Now answered** (no refusal phrase + real rows) → capture the new answer into
  `retest_answer` + `retest_at`; the tab shows a **"before → after"**: the old *"I couldn't
  find that"* beside the new working answer. This is the human-visible proof the fix helped,
  available in minutes rather than waiting a scan window.
- **Still refused** → the exposure didn't take (wrong tool, still-narrow description); the
  row stays `fix_live` but flags `retest_failed`, feeding the same 1b→1a re-classification
  as Branch B — without waiting for organic traffic.

Auto-retest reuses the artifacts/chat plumbing exactly (enqueue → drain answers as the
user → read `result`), so it inherits the per-user scoping guarantee for free. It runs
only on the cluster's own sample questions (bounded, no fan-out).

**Guardrails on the measurement (moat discipline):**
- Only count windows with ≥ a floor of topic-questions (avoid declaring victory on n=1).
- Keep the cluster key stable across cycles (don't let a superlative/`ORDER BY count`
  redefine the cluster mid-measurement — `feedback_control_defined_by_superlative...`).
- Corpus is currently tiny (21 chats); the metric is **directional** until volume grows,
  and the tab must show the sample size next to every frequency so a human never
  over-reads a 1-of-2.

---

## 10. Phasing

- **Phase 1 — detect + cluster + surface (read-only insight, zero risk).**
  `capability_gaps` table + `fn_capgap_scan`/`fn_capgap_list`; the detection cron; the
  Capability Gaps tab rendering ranked clusters, class (auto-proposed), sample questions,
  and suggested fix. **No fixes dispatched** — pure visibility. Proves the evidence base
  live and is safe to ship immediately (no new per-user surface, no Windows change).
- **Phase 2 — triage + class-1a/1b fixes (leak-tested).** Disposition controls;
  `fn_capgap_triage`/`fn_capgap_set_status`; the 1a description-edit path (no Windows) and
  the 1b expose-existing path **behind the mandatory leak-test gate** + Director approval +
  a Windows `READ_TOOLS` handoff. This closes the 86% majority (all class-1b) cheaply.
- **Phase 3 — draft-new-tool (class 2) + the measured self-improving loop.** Candidate
  SECDEF tool generation + auto leak-test + #2006 registration; `capability_gap_events` +
  `fn_capgap_measure` + the drop-check / re-classification (§9); the non-gap filter (G8);
  fold in the `ai_query_feedback` sibling signal onto the same "answer quality" surface.

---

## 11. Ship discipline (unchanged from this project)

- **Mac-side** (DB, tab, detection cron, tool-draft + leak-test): ship from a
  `jicate/main` worktree; one PR to the `jicate` remote; apply migrations to prod via the
  Management API (deploy ships code, not migrations); UI PRs hit the **Visual Proof Gate**.
- **Windows-side** (exposing an approved tool to the model): a separate handoff in
  `~/.claude/maxlane-handoffs/` — the Windows session edits the drain's `READ_TOOLS` and
  confirms the previously-refused question now answers. The Mac PR ships **inert** until
  that handoff lands (same pattern as the artifacts feature).
- **New SECDEF RPCs:** `REVOKE EXECUTE FROM anon, PUBLIC` + `GRANT TO authenticated`
  (or super-admin-only) — CLAUDE.md anon-lock rule; the leak-test is the gate for anything
  newly reachable by the model.
- **Verify live as a real user** after any exposure (authed render + row-path), on a fresh
  browser context (PWA cache) — never a self-reported PASS.

---

## 12. Decisions — resolved by Director interview (2026-07-13) + still-open

**Resolved in the interview (now locked in §2 G9–G15):**

| # | Question | Director's answer |
|---|----------|-------------------|
| D1 | How aggressive is auto-drafting / auto-applying? | **Draft + leak-test automatically, but a human approves each fix — no auto-apply** (G9). |
| D2 | Does class-1b / money-tool exposure need a special extra sign-off? | **No special money gate** — fees/salary use the same leak-test + approval as any tool (G10). (Per-fix human approval still applies via G9.) |
| D3 | Retention of dismissed rows? | **Remember them** — `dismissed` persists and doesn't re-nag (G15). |
| D4 | Threshold before a cluster is actionable? | **Only repeated gaps** — `occurrence_count>1` OR `distinct_users>1` (G12). |
| — | Sensitive data that exists but must not be shared? | **New `privacy_wall` permanent disposition** (G11). |
| — | How does the Director hear about new gaps? | **Passive tab, no alerts in Phase 1** (G14). |
| — | Proof a fix worked? | **Auto-retest the sample questions + show before→after** (G13, §9). |

**Still open (safe to decide at build time or defer to Phase 3):**

| # | Question | Why it can wait |
|---|----------|-----------------|
| D5 | Should the sibling `ai_query_feedback` (wrong-answer) signal share this tab as a unified "answer quality" surface, or stay separate? | Phase-3 scope; both signals are small today. Default: keep separate, revisit when volume grows. |
| D6 | Exact scan cadence for the detection cron (hourly / daily)? | Craft default: **daily** (the corpus grows slowly; daily is ample and cheap). Change if traffic spikes. |

---

## Appendix A — reproducible detection query (read-only; the Phase-1 scan in one statement)

```sql
-- Refusal moments in the chat log (the raw signal the cron clusters).
select id, requested_by,
       left(payload->>'message',160)  as question,
       left(result->>'answer',300)    as answer
from ai_jobs
where job_type='ai_query.chat'
  and result->>'answer' is not null
  and lower(result->>'answer') ~~ any (array[
      '%don''t have%','%do not have%','%can''t access%','%cannot access%',
      '%outside the data%','%couldn''t find%','%not available to me%',
      '%don''t have access%','%no access%','%not able to access%'])
order by requested_at;
-- 2026-07-13: 7 rows / 19 answered chats / 3 distinct users.
```

## Appendix B — the "does the fix already exist?" cross-reference (why 86% is class-1b)

```sql
-- Tools that EXIST for the domains the assistant refused on:
--   ai_rpc_fee_defaulters, ai_rpc_fees_revenue, ai_rpc_billing_categories,
--   ai_rpc_student_bills, ai_rpc_hostel_occupancy, ai_rpc_hostel_allocations,
--   ai_rpc_attendance, ai_rpc_attendance_summary   → all present in pg_proc.
-- Tools ACTUALLY cited in successful answers (inferred exposed set):
--   ai_rpc_admission_statistics, ai_rpc_departments, ai_rpc_kpi_summary,
--   ai_rpc_students_by_department, ai_rpc_students_summary   → 5 only; no money/hostel tool.
-- ⇒ the fee/hostel tools exist but are not reachable ⇒ class-1b, not class-2.
-- LIMITATION: "exposed" is inferred (cannot read Windows READ_TOOLS from Mac); §9 confirms.
```
