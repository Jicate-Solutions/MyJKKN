# CONTINUATION BRIEF — AI Pulse: unlock starters, go live, quiz

TASK (single start-here): **Fire the programme-level starter-unlock batch** — the session ended mid-fire on exactly this. Then, ranked by the Director: **(1) fire batch → (2) go live tonight's cycle → (3) post-session quiz from recording → (4) reconcile the "400+ prompts" number.** Carry all; drop nothing. Graduation "usage"-axis decision also still open (carried).

PROJECT: /Users/omm/PROJECTS/MyJKKN (jkkn.ai, multi-tenant; omm-dev checkout is SHARED — work in worktrees off jicate/main, never `git add -A`). Prod Supabase ref `kvizhngldtiuufknvehv`, Mgmt token `~/.supabase/access-token` (non-default UA). CFT browser: connect via `list_connected_browsers` → the browser named **"23jul"** (logged in on prod jkkn.ai). The automation Chrome is a SANDBOXED profile — the user's normal login does NOT reach it; use switch_browser/select_browser to the logged-in one.

READ FIRST: memory `project_aipulse_prompt_engineering_learning_loop.md` (now marked LIVE) + `reference_nattraja_vidhyalaya_rcltp_english_only.md`. Spec `specs/ai-pulse-prompt-engineering-learning-loop-2026-07-22.md`.

---

## WHAT HAPPENED THIS SESSION (all verified)

- **The whole AI Pulse build-from-parts loop went LIVE.** All 6 PRs merged + DEPLOYED (prod build `my-jkkn-kr487hs49`). Switches flipped GLOBAL 2026-07-23 ~14:03 IST: `prompt_build_enabled=true`, `domain_starter_autorevert_enabled=true`. `prompt_graduation_enabled` HELD false (0 builds; Director must define the "usage" axis first). Verified card renders (fn returns true) + screenshotted live.
- **Auto-revert (#2295) + graduation (#2297) built + merged this session** (my two Draft PRs → Director merged all four incl. #2291/#2292). #2291 got a terminology fix (student→learner). #2292 had a vercel.json cron conflict I resolved (union of grade+graduate crons).
- **Today's cycle CONFIG set up + saved** (cycle id `d9e6b0d4-4b99-4270-8c40-4be80c214327`, status still **draft**): briefing_topic_text="Gemini 3.6 Flash in Google Canvas — spot the upgrade, then prompt for it"; challenge_text (old-vs-new + four-part prompt build); host_user_id=`b2bcb548-...` (Ommsharravana S = director); featured_tool_id=`3531f40a` (Gemini); meet_url=the standing Teams link `https://teams.microsoft.com/meet/4475235362024?p=TXsoq4ycHmq5g96kox`. you_said_we_changed left blank (no real feedback data).
- **Session content researched** (web): the "new model" = **Gemini 3.6 Flash** (released 21 Jul 2026) — an EFFICIENCY upgrade to the Flash line (better coding/multimodal, ~17% fewer tokens), NOT a Pro/reasoning leap. Reframe for learners: fundamentals don't change; lean into bigger multi-step + multimodal + richer context. Could not confirm consumer-app/Canvas availability.
- **Two-quiz model CONFIRMED (Director was right):** (a) LIVE polls = champion composes+issues polls in real time during the session (`ai_pulse_polls`, champion-polls-control) — nothing to pre-set-up; (b) POST-SESSION quiz = authored/`config.quiz`, shown in the 60-min window after, gates engagement, bilingual EN+TA, AI-suggested FROM THE RECORDING. So neither needs pre-session authoring.

---

## VERIFY CURRENT STATE (read-only — run BEFORE acting)

```bash
# 1. Loop still live + starter count (13 = batch NOT fired; >13 = someone fired it)
#    Mgmt API, ref kvizhngldtiuufknvehv, Bearer ~/.supabase/access-token, non-default UA:
#    select (select value_jsonb from ai_pulse_policies where config_key='prompt_build_enabled') as build_live,
#           (select count(*) from ai_pulse_domain_starters) as starters,
#           (select status from startup_events where id='d9e6b0d4-4b99-4270-8c40-4be80c214327') as cycle_status;
#    Expected as of session end: build_live=true, starters=13, cycle_status=draft
# 2. Any max-lane jobs already queued? (did the batch partly fire?)
#    select count(*) from ai_jobs where job_type='ai_pulse.domain_starter' and status in ('queued','running');
```
As of 2026-07-23 18:47 IST: build_live=true, autorevert=true, **starters=13**, **cycle_status=draft**. Tonight's live session was 18:55 IST — go-live (#2) may already be moot if resuming after; the starter batch (#1) is NOT time-bound.

---

## ① FIRE THE STARTER-UNLOCK BATCH (rank 1 — was mid-fire, INTERACTIVE prod action)

**Goal:** every learner sees a prompt. There are **6,920 learners across 106 programmes**; only **13 programme-level starters exist**. Generate the ~93 missing programmes (programme-level covers everyone; course-level = 3,808 = too heavy/wasteful, the topic query literally timed out — do NOT do course-level).

**Mechanism (all verified this session):**
- Enqueue RPC: `fn_ai_enqueue_system(p_job_type text, p_payload jsonb, p_dedupe_key text)` → returns `{ok, job_id, error}`. (`in_flight` = dedupe hit.)
- Job type `ai_pulse.domain_starter`: enabled=true, lane=`max`, interactive=false ✓.
- Payload shape (from `enqueueJobsLane` in `lib/services/platform/ai-jobs-lane.ts`): `{ "prompt": <FULL assembled prompt>, "_ctx": { cycle_id, topic_type:'programme', topic_id, topic_label, institution_id, learner_count, is_control:false } }`. dedupe_key = `aipulse_ds|<cycle_id>|programme|<topic_id>`.
- **NEXT MICRO-STEP (where I stopped):** get the EXACT prompt to reuse verbatim (don't hand-retype the ~500-word SYSTEM_PROMPT — typo risk). Read one existing completed job: `select payload->>'prompt', payload->'_ctx' from ai_jobs where job_type='ai_pulse.domain_starter' and payload->>'prompt' is not null limit 1;`. buildPrompt for a NEW programme (no prior) = SYSTEM_PROMPT + `\n\nSubject / programme: <label>.\n\nReturn the JSON pack now.` (empty improve-block). Swap only the label per programme.
- Programmes to generate = the ~93 programmes with enrolled learners lacking a starter for this cycle. Get: `select p.id, p.program_name/label, count(lp) as learner_count, <institution_id> from programs p join learners_profiles lp on lp.program_id=p.id where p.id not in (select topic_id from ai_pulse_domain_starters where topic_type='programme' and cycle_id='d9e6b0d4...') group by p.id;` (confirm column names — `programs` table; earlier `programmes`=128 total, 106 have learners).
- Then loop `fn_ai_enqueue_system` per programme. The Windows Max-lane runner drains them; the generation cron's COLLECT step (`fn_ai_pulse_record_domain_starter`) records the packs. English auto-publishes; Tamil lands `ta_review_status='pending'`.
- **Verify after:** watch `ai_pulse_domain_starters` count climb toward ~106 over the next few hours (Monitor or poll). ~93 jobs = hours to drain, NOT minutes.
- **Caveat:** this is a design shift (demand-gated → pre-generated). At programme level it's the right call (near-total coverage, minimal waste) — Director explicitly said "fire it now."

## ② GO LIVE TONIGHT'S CYCLE (rank 2 — TIME-SENSITIVE, likely moot post-18:55)

Cycle `d9e6b0d4` is status `draft`. The admin cycle-detail page had NO explicit publish/go-live button (only Save/Edit-quiz/Cancel). Go-live is via the LIVE session: `/ai-pulse/live/[cycle]` — the champion (Ommsharravana=director) opens the doors / issues polls there (`join_open`, `quiz_open`, champion-polls-control). Was still mapping the exact "open doors" control when /cnext fired. **If resuming after ~19:30 IST tonight, this is moot** — the session window passed; note it and move on.

## ③ POST-SESSION QUIZ (rank 3 — after the session)
Once tonight's session has a recording, generate the bilingual quiz FROM the recording via the "AI-suggest 5 questions" button at `/ai-pulse/admin/quiz/d9e6b0d4-...` (it said "no recording → placeholder" pre-session). Do NOT hand-author Tamil (rule #24). I have 4 English concept questions drafted in the transcript if a manual backup is wanted.

## ④ RECONCILE "400+ PROMPTS" (rank 4)
Director was told "more than 400 prompts" but sees 13. Reality: 13 starters × 6 (EN+TA × build/skill/career) = ~78 prompts; potential = 3,808 courses / 106 programmes. "400" sourced from neither. Open `/ai-pulse/admin` → "Admin · AI Starters" (nav link seen) to find where 400 came from; ask the Director which screen they saw it on.

---

## KEY DECISIONS (rationale — don't relitigate)
- **Programme-level unlock, NOT course-level.** 106 programmes cover all 6,920 learners; 3,808 courses is wasteful + the topic-resolution query timed out. The engine gates on ATTENDANCE (reads `ai_pulse_live_attendance`), so a config threshold change alone won't unlock zero-attendance subjects — you must generate from ENROLLMENT.
- **Reuse the exact existing prompt** for the batch (read an existing job's payload), don't retype the SYSTEM_PROMPT.
- **Graduation held** (`prompt_graduation_enabled=false`): inert (0 builds) + its "usage" axis is undefined (builds have no reuse signal → v1 = checklist-score-only). Director defines "usage" before flipping.
- **Rollback for anything live** = flip the switch false (1 UPDATE, no redeploy).
- **probe_verdict: healthy** — context held a very long multi-thread session (build → merge → deploy → go-live → cycle setup → batch) accurately.

## EXECUTION DIRECTIVE (armed by /cnext — READ THE OVERRIDE)
The autobuild default does NOT cleanly apply here: priorities ①②③④ are **INTERACTIVE PROD ACTIONS** (enqueue prod jobs, flip a live cycle, drive the CFT UI), NOT "build code to a Draft PR." The autobuild's stop-at-Draft-PR / never-touch-prod guard means it will NOT fire the batch or go-live on its own. So on `go`: run VERIFY CURRENT STATE, then proceed INTERACTIVELY with rank ① (fire the batch) — confirming the programme list + reusing the exact prompt — since the Director already said "fire it now." Do NOT wait for a Draft-PR-shaped task that doesn't exist here. If any real code-build surfaces (e.g. a candidate-fn change), THAT part may go to a Draft PR.
