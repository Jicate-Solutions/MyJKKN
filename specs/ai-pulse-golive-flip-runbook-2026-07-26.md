# AI Pulse — Go-Live Flip Runbook (4 dark features)

**Created:** 2026-07-26
**For:** The Director (and any super admin acting on the Director's call)
**Status:** All four features are SHIPPED + deployed to production, running **DARK** (every flag `false`). Turning them on is a config flip — no deploy, no code change, no migration.
**Scope of this doc:** operator runbook only. It changes nothing on its own.

**Source migrations (already on prod):**
- `supabase/migrations/20260723090000_ai_pulse_prompt_graduation.sql` — prompt graduation (checklist)
- `supabase/migrations/20260726090000_ai_pulse_prompt_usage_axis.sql` — graduate-by-usage axis
- `supabase/migrations/20260726120000_ai_pulse_staff_leaderboard.sql` — Senior Learners leaderboard
- `supabase/migrations/20260726120000_ai_pulse_reach_weighted_publish.sql` — reach-weighted publish points

**Companion:** [`specs/ai-pulse-usage-axis-and-graduation-flip-runbook-2026-07-26.md`](./ai-pulse-usage-axis-and-graduation-flip-runbook-2026-07-26.md) is the deep-dive on features 1–2; this doc consolidates all four into one go-live sheet.

Every flag name and default in this runbook was cross-checked against **live production** (`ai_pulse_policies`, project `kvizhngldtiuufknvehv`) on 2026-07-26 — see Appendix A. The flip SQL was validated in a `BEGIN … ROLLBACK` transaction against prod (Section 8); prod state was left untouched (all four flags confirmed `false` afterward).

---

## 0. How to flip a policy — two equivalent paths

Every switch below is one row in the `ai_pulse_policies` config table. There are two ways to change it; pick whichever you prefer. **Both are reversible in seconds and neither needs a deploy.**

### Path A — the admin screen (recommended; no SQL)

1. Sign in as a super admin.
2. Go to **`/ai-pulse/admin/policies`** (AI Pulse → Admin → Policies).
3. Find the row by its **display name** (given in each feature section below).
4. For an on/off switch, click the **toggle** (`true ⇆ false`); for a number, type the new value.
5. Click **Save**.

The editor is super-admin-only (enforced by both the page guard and the table's RLS write policy), so a normal viewer can never flip these.

### Path B — SQL (audit trail / exact equivalent)

Run against the Supabase **SQL editor**, or the management API `database/query` endpoint with a non-default `User-Agent` header:

```bash
curl -s -X POST \
  "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: MyJKKN-AiPulse-Flip/1.0" \
  -d '{"query":"UPDATE ai_pulse_policies SET value_jsonb = '"'"'true'"'"'::jsonb WHERE config_key = '"'"'<flag>'"'"';"}'
```

### When a flip takes effect

| Feature | Reads the flag… | So it goes live… |
|---|---|---|
| Prompt graduation (1) | inside the daily graduate cron `fn_ai_pulse_graduate_prompt_builds` | at the next cron run (**`35 1 * * *` = 01:35 UTC daily**), or immediately if an admin hits `/api/cron/aipulse-prompt-graduate` |
| Usage axis (2) | same daily graduate cron | same daily cron |
| Senior Learners board (3) | server-side, per request, when `/ai-pulse/leaderboard` renders | on the **next page load** |
| Reach-weighted publish (4) | inside the scoring RPC at query time | on the **next leaderboard read** |

No feature requires a redeploy. A flip back to `false` is an equally immediate kill.

---

## 1. The four features at a glance

| # | Feature | Master flag | Prod value (2026-07-26) | Depends on |
|---|---|---|---|---|
| 1 | Prompt graduation (checklist) | `prompt_graduation_enabled` | `false` | `prompt_build_enabled` (already `true`) |
| 2 | Usage axis (graduate-by-reuse) | `prompt_graduation_by_usage_enabled` | `false` | **Feature 1 on first** |
| 3 | Senior Learners leaderboard | `leaderboard_staff_board_enabled` | `false` | `leaderboard_enabled` (already `true`) |
| 4 | Reach-weighted publish points | `leaderboard_publish_reach_enabled` | `false` | `leaderboard_enabled` (already `true`) |

Features 3 and 4 are independent of each other and of graduation — each can be flipped on its own schedule. Features 1 → 2 are ordered (2 needs 1).

---

## 2. Recommended sequence + preconditions

There is no forced order across the two tracks, but this sequence flips the lowest-risk, already-validated switches first:

```
Step 1  leaderboard_staff_board_enabled = true   (Feature 3)
        Lowest risk: the signal already exists, and super admins have
        already been previewing the exact tab. Instant, page-render only.

Step 2  leaderboard_publish_reach_enabled = true  (Feature 4)
        Independent. Flip once the Director accepts the 500-reach-per-point
        / 60-max-bonus tuning. Effect appears on the next board read.

Step 3  prompt_graduation_enabled = true          (Feature 1)
        Graduation runs at the next 01:35 UTC cron. The my-pulse "Prompt
        library" card lights up for a learner once a peer prompt has
        graduated on one of that learner's own topics.

Step 4  prompt_graduation_by_usage_enabled = true (Feature 2)
        ONLY after Feature 1 has run for a cycle or two and real peer
        copies exist — there is nothing to "graduate by usage" until then.
```

Global preconditions (all already satisfied on prod as of 2026-07-26):
- `prompt_build_enabled = true` — the prompt builder is live; **7 graded builds** exist. (Graduation is inert without builds.)
- `leaderboard_enabled = true` — the learner leaderboard is already live to everyone.

---

## 3. Feature 1 — Prompt graduation (checklist)

**Flag:** `prompt_graduation_enabled` — *"AI Pulse: graduate top learner prompts"*
**Tunable:** `prompt_graduation_min_score` (default **80**, 0–100) — *"AI Pulse: graduation checklist score bar"*

### What it does

The prompt builder lets a learner assemble a prompt and get an AI checklist grade. When this flag is on, the daily graduate cron promotes graded builds that clear the score bar into the **shared library**, and three things light up together:

1. The graduate cron (`fn_ai_pulse_graduate_prompt_builds`) stamps `graduated_at` on qualifying builds.
2. The learner-facing **"Prompt library" card** on `/ai-pulse/my-pulse` starts showing the best graduated peer prompts on the learner's own topics (anonymised — prompt + score + how many peers reused it, no author name). The card is data-driven: it appears only once graduated prompts exist for that learner's topics.
3. The **Report control** on each library prompt goes live (a learner flags a bad prompt; a champion later disqualifies it).

A build qualifies only if it is `grade_status = 'graded'`, carries **both** a `topic_type` and a `topic_id`, and scores `>= prompt_graduation_min_score`.

### Preconditions / what to expect on day one

As of the 2026-07-26 survey there are **7 graded builds**; scores span 40–88 (one scores ≥ 80) but **all 7 are topic-less**, so **0 would graduate the moment you flip**. Graduation becomes visibly active as topic-bearing builds accrue. This is expected and safe — flipping the flag early simply arms the pipeline; nothing surfaces until a real qualifying build exists.

### Flip

```sql
UPDATE ai_pulse_policies SET value_jsonb = 'true'::jsonb
WHERE config_key = 'prompt_graduation_enabled';
```

### Rollback (instant kill)

```sql
UPDATE ai_pulse_policies SET value_jsonb = 'false'::jsonb
WHERE config_key = 'prompt_graduation_enabled';
```

Rollback notes:
- The flip-off is a **read-side kill too**: the reuse-record RPC no-ops and the graduate cron becomes a no-op. No redeploy needed.
- `graduated_at` stamps are **durable promotions** — rollback stops *new* graduations but does not un-graduate. To retract one build:
  ```sql
  UPDATE ai_pulse_prompt_builds SET graduated_at = NULL WHERE id = '<build_uuid>';
  ```

### Tune the score bar (optional)

```sql
UPDATE ai_pulse_policies SET value_jsonb = '<0-100>'::jsonb
WHERE config_key = 'prompt_graduation_min_score';
```

### Verify it worked

1. Flag is on:
   ```sql
   SELECT value_jsonb FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_enabled';
   -- expect: true
   ```
2. How many builds are eligible right now (why the count may be 0):
   ```sql
   SELECT count(*) FILTER (
            WHERE COALESCE((grade->>'score')::numeric, 0) >= 80
              AND topic_type IS NOT NULL AND topic_id IS NOT NULL
          ) AS eligible_now
   FROM ai_pulse_prompt_builds WHERE grade_status = 'graded';
   ```
3. After the next 01:35 UTC cron (or a manual cron hit), graduated builds appear:
   ```sql
   SELECT count(*) AS graduated FROM ai_pulse_prompt_builds WHERE graduated_at IS NOT NULL;
   ```
4. Learner-facing: open `/ai-pulse/my-pulse` as a learner who has built a prompt on a topic that now has a graduated peer prompt — the **"Prompt library"** card renders, each item carrying a **Report** button.

---

## 4. Feature 2 — Usage axis (graduate-by-reuse)

**Flag:** `prompt_graduation_by_usage_enabled` — *"AI Pulse: graduate prompts by peer usage"*
**Tunable:** `prompt_graduation_usage_min` (default **3**, the k-threshold) — *"AI Pulse: graduation usage bar (distinct copiers, k)"*

### What it does

Feature 1 graduates on the checklist score alone. With this axis on, a build **also** graduates once at least `prompt_graduation_usage_min` **distinct peer learners** have *copied* it — the compounding half of the moat (the best-*used* prompts rise, not only the best-scored). "Used" = a distinct same-institution peer (never the author) who copied a graduated build; `view` events are recorded for funnel completeness but do not count.

### Preconditions

**Requires Feature 1 on first.** Usage only accrues once peers can see and copy graduated prompts — before Stage 1 there is nothing to reuse (the reuse-record RPC is dark-gated on `prompt_graduation_enabled`). Flip this only after Feature 1 has run for a cycle or two and real copies exist. As of 2026-07-26 the reuse ledger `ai_pulse_prompt_build_uses` is empty (0 rows).

### Flip

```sql
UPDATE ai_pulse_policies SET value_jsonb = 'true'::jsonb
WHERE config_key = 'prompt_graduation_by_usage_enabled';
```

### Rollback (instant kill)

```sql
UPDATE ai_pulse_policies SET value_jsonb = 'false'::jsonb
WHERE config_key = 'prompt_graduation_by_usage_enabled';
```

When off, the graduate predicate reduces to `score >= min` — the graduated set is byte-identical to Feature-1-only. (As with Feature 1, already-graduated builds stay graduated; blank the `graduated_at` to retract one.)

### Tune the k-threshold (optional)

```sql
UPDATE ai_pulse_policies SET value_jsonb = '<k>'::jsonb
WHERE config_key = 'prompt_graduation_usage_min';
```

### Verify it worked

1. Flag is on:
   ```sql
   SELECT value_jsonb FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_by_usage_enabled';
   -- expect: true
   ```
2. Copies are accruing:
   ```sql
   SELECT count(*) AS copies FROM ai_pulse_prompt_build_uses WHERE action = 'copy';
   ```
3. After the next cron, a build below the score bar but at ≥ k distinct copiers graduates by usage:
   ```sql
   SELECT b.id,
          (b.grade->>'score')::numeric AS score,
          (SELECT count(DISTINCT u.profile_id)
             FROM ai_pulse_prompt_build_uses u
            WHERE u.build_id = b.id AND u.action = 'copy') AS distinct_copiers,
          b.graduated_at
   FROM ai_pulse_prompt_builds b
   WHERE b.graduated_at IS NOT NULL
     AND (b.grade->>'score')::numeric < 80;   -- graduated despite score < bar → by usage
   ```

---

## 5. Feature 3 — Senior Learners leaderboard

**Flag:** `leaderboard_staff_board_enabled` — *"Staff leaderboard enabled"*
**Tunables:**
- `leaderboard_staff_pts_attend` (default **5**) — *"Staff points: attend"*
- `leaderboard_staff_pts_quiz` (default **10**) — *"Staff points: quiz"*

### What it does

A separate **"Senior Learners"** tab on `/ai-pulse/leaderboard`, keyed on `profiles.id`, so keen Senior Learners can take part without outranking learners on the main board. It scores two real signals: attending a live AI Pulse session (`leaderboard_staff_pts_attend` points each) and taking the post-session quiz (`leaderboard_staff_pts_quiz` base points plus a relative-quality bonus scored against all takers of that session). Participation and quality split exactly like the learner board, so the two boards feel like one system.

Super admins **already see this tab today as a preview** (with an amber "Preview only" banner). Flipping the flag removes the banner and makes the tab visible to every authenticated Senior Learner.

### Preconditions

- `leaderboard_enabled = true` (already live).
- The signal already exists: **154 Senior-Learner profiles** have attended a live session, and the quiz signal exists too — so the board will show real rows the moment it goes live.

### Open question for the Director (decide before or shortly after go-live)

- **Attend-vs-quiz weighting.** Defaults are 5 (attend) / 10 (quiz). Is "showing up" worth half of "doing the quiz well"? Tune the two point rows to taste.
- **Facilitation is not scored yet.** Champions / facilitators earn nothing for *running* a session — that signal does not exist as data. If the Director wants facilitation to count, that is a follow-up build, not a flip.

### Flip

```sql
UPDATE ai_pulse_policies SET value_jsonb = 'true'::jsonb
WHERE config_key = 'leaderboard_staff_board_enabled';
```

### Rollback (instant kill)

```sql
UPDATE ai_pulse_policies SET value_jsonb = 'false'::jsonb
WHERE config_key = 'leaderboard_staff_board_enabled';
```

The tab reverts to admin-only preview on the next page render. No data is deleted — points recompute live from the same signals whenever the board is next shown.

### Tune the point values (optional)

```sql
UPDATE ai_pulse_policies SET value_jsonb = '<n>'::jsonb WHERE config_key = 'leaderboard_staff_pts_attend';
UPDATE ai_pulse_policies SET value_jsonb = '<n>'::jsonb WHERE config_key = 'leaderboard_staff_pts_quiz';
```

### Verify it worked

1. Flag is on:
   ```sql
   SELECT value_jsonb FROM ai_pulse_policies WHERE config_key = 'leaderboard_staff_board_enabled';
   -- expect: true
   ```
2. The board returns real rows:
   ```sql
   SELECT count(*) AS ranked_seniors FROM fn_ai_pulse_leaderboard_staff(NULL, true, 1000);
   -- expect: a positive number (roughly the count of Senior Learners who attended or quizzed)
   ```
3. UI: open `/ai-pulse/leaderboard` as a Senior Learner (not a super admin) — the **"Senior Learners"** tab is present and the amber "Preview only" banner is **gone**.

---

## 6. Feature 4 — Reach-weighted publish points

**Flag:** `leaderboard_publish_reach_enabled` — *"Reach-weighted publish"*
**Tunables:**
- `leaderboard_publish_reach_per_point` (default **500**) — *"Reach per bonus point"*
- `leaderboard_publish_reach_max_bonus` (default **60**) — *"Max reach bonus per publish"*

### What it does

Today a verified Instagram publication earns a **flat** `leaderboard_pts_publish` (= **30**) points on the learner leaderboard. With this flag on, a verified publish *also* earns a reach bonus **on top of** the flat award:

```
bonus = FLOOR(latest_reach / leaderboard_publish_reach_per_point),  capped at leaderboard_publish_reach_max_bonus
```

The flat base is always earned, so a small-account learner is never punished — reach only *adds*. The cap exists because the largest observed reach in prod is ~1.8M; without a cap one viral reel would dwarf the whole board. This is an **engine-only** change: no new UI, no new tab — publish points on the existing learner board simply increase. Publish points stay entirely in the participation lane; the participation/quality split and tie-break are unchanged.

### Preconditions

- `leaderboard_enabled = true` (already live).
- The reach data exists: the metrics poller has written a time series into `ig_post_metrics` (373k+ snapshots over 707 posts), and a verified publish joins to it by exact canonical permalink. Independent of features 1–3.

### Flip

```sql
UPDATE ai_pulse_policies SET value_jsonb = 'true'::jsonb
WHERE config_key = 'leaderboard_publish_reach_enabled';
```

### Rollback (instant kill)

```sql
UPDATE ai_pulse_policies SET value_jsonb = 'false'::jsonb
WHERE config_key = 'leaderboard_publish_reach_enabled';
```

With the flag off, per-learner publish points equal exactly `COUNT(verified publishes) × 30` — byte-identical to the flat award. Rollback is a pure recompute on the next board read; nothing is stored.

### Tune the reach curve (optional)

```sql
UPDATE ai_pulse_policies SET value_jsonb = '<n>'::jsonb WHERE config_key = 'leaderboard_publish_reach_per_point';  -- reach per +1 point
UPDATE ai_pulse_policies SET value_jsonb = '<n>'::jsonb WHERE config_key = 'leaderboard_publish_reach_max_bonus';  -- cap per publish
```

### Verify it worked

1. Flag is on:
   ```sql
   SELECT value_jsonb FROM ai_pulse_policies WHERE config_key = 'leaderboard_publish_reach_enabled';
   -- expect: true
   ```
2. Baseline before / after (reach only adds, never subtracts):
   ```sql
   -- run BEFORE flipping, note the number:
   SELECT SUM(publish_pts) AS total_publish_pts FROM fn_ai_pulse_scored_learners(NULL, true);
   -- run AFTER flipping: the total should be >= the baseline, and strictly greater
   -- if any publisher's latest reach >= leaderboard_publish_reach_per_point.
   ```
3. Quick "reach is landing" signal — with the flag on, some publishers' points are no longer a clean multiple of 30 (base 30 + a non-multiple bonus):
   ```sql
   SELECT count(*) AS publishers_with_reach_bonus
   FROM fn_ai_pulse_scored_learners(NULL, true)
   WHERE publish_pts > 0 AND (publish_pts % 30) <> 0;
   -- 0 before the flip; > 0 once reach bonuses land.
   ```

---

## 7. Safety properties (verified on prod, 2026-07-26)

- **Anon-locked.** Every RPC touched by these features is `SECURITY DEFINER` and locked to `anon`. Verified via `has_function_privilege` on prod:

  | RPC | anon | authenticated | service_role |
  |---|---|---|---|
  | `fn_ai_pulse_graduate_prompt_builds` (cron-only) | ✗ | ✗ | ✓ |
  | `fn_ai_pulse_record_prompt_build_use` | ✗ | ✓ | ✓ |
  | `fn_ai_pulse_topic_graduated_prompts` | ✗ | ✓ | ✓ |
  | `fn_ai_pulse_scored_learners` | ✗ | ✓ | ✓ |
  | `fn_ai_pulse_scored_staff` | ✗ | ✓ | ✓ |
  | `fn_ai_pulse_leaderboard_staff` | ✗ | ✓ | ✓ |
  | `fn_ai_pulse_my_staff_leaderboard` | ✗ | ✓ | ✓ |

- **Off = byte-identical.** With each flag `false`: graduation and usage produce the checklist-only (or empty) result; the Senior Learners tab is admin-preview-only; publish points equal the flat award. No board or page changes for a normal viewer.
- **Multi-tenant safe.** The graduation read/record RPCs enforce strict same-institution scope and derive the caller from `auth.uid()` (no confused deputy, no self-boost).
- **No deploy, fully reversible.** Every flip and rollback is a single-row config UPDATE that the running app reads live.

---

## 8. Flip-SQL validation (BEGIN … ROLLBACK on prod, 2026-07-26)

All four flip UPDATEs were run inside one transaction and rolled back; prod was left untouched. Result of the in-transaction read (the four rows the four UPDATEs targeted):

| config_key | value in-transaction | expected |
|---|---|---|
| `prompt_graduation_enabled` | `true` | `true` |
| `prompt_graduation_by_usage_enabled` | `true` | `true` |
| `leaderboard_staff_board_enabled` | `true` | `true` |
| `leaderboard_publish_reach_enabled` | `true` | `true` |

Post-rollback read (confirming prod is unchanged): all four `false`. This proves each `WHERE config_key = …` clause hits exactly its intended row and that the flip is a clean, reversible single-row write.

---

## Appendix A — All config rows (live prod values, 2026-07-26)

| config_key | value | type | role |
|---|---|---|---|
| `prompt_graduation_enabled` | `false` | bool | Feature 1 master switch |
| `prompt_graduation_min_score` | `80` | int | Feature 1 score bar |
| `prompt_graduation_by_usage_enabled` | `false` | bool | Feature 2 master switch |
| `prompt_graduation_usage_min` | `3` | int | Feature 2 k-threshold |
| `leaderboard_staff_board_enabled` | `false` | bool | Feature 3 master switch |
| `leaderboard_staff_pts_attend` | `5` | int | Feature 3 attend points |
| `leaderboard_staff_pts_quiz` | `10` | int | Feature 3 quiz base points |
| `leaderboard_publish_reach_enabled` | `false` | bool | Feature 4 master switch |
| `leaderboard_publish_reach_per_point` | `500` | int | Feature 4 reach per +1 point |
| `leaderboard_publish_reach_max_bonus` | `60` | int | Feature 4 bonus cap per publish |
| `leaderboard_pts_publish` | `30` | int | flat publish award (Feature 4 base) |
| `leaderboard_enabled` | `true` | bool | learner board (already live) |
| `prompt_build_enabled` | `true` | bool | prompt builder (already live) |
