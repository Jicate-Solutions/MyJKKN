# Autonomous Bug Triage Agent — Implementation Plan (v2)

**Status:** Locked from interview rounds 1-6 (2026-04-26) + recast for `platform_policies` doctrine (2026-04-29)
**Author:** Claude
**Branch:** `feat/bug-triage-pr1-policy-keys` (off `jicate/main`)

---

## What changed since v1 (2026-04-26)

| v1 design | v2 design (THIS) | Why |
|---|---|---|
| Hardcoded thresholds in TypeScript skill | All thresholds in `platform_policies` rows, read via `fn_get_policy_*` | Director directive 2026-04-29: "every policy decision = config row" (PR-rejection-level rule) |
| Stage A + Stage B split (autonomous repro then human-triggered fix) | **Single autonomous agent** bug → repro → patch → PR | User Round 1 answer overrode the split |
| Build new daemon (Node.js loop) | Claude Code skill invoked via scheduled trigger / `/loop` | Max subscription only — Anthropic API forbidden per memory |
| Verify on Vercel preview | Verify on **localhost in current working tree** with stash/restore | Vercel previews disabled (`git.deploymentEnabled: false`) |
| 100 bugs/day cap | **No daily cap** — process queue until empty | User Round 5 |
| Bug-comment uses storage bucket for screenshots | Same — bucket `bug-repro-screenshots` | Unchanged |
| Human approval gate | **Skip the gate** — PR opens Ready if verify passed, Draft if skipped | User Round 5 + reconfirmed Round 6 |

---

## Locked decisions (24 from interview)

| # | Decision | Source |
|---|---|---|
| 1 | Single autonomous agent (no Stage A/B split) | R1 |
| 2 | Tag allowlist v1: `copy_change`, `dead_button`, `page_404` | R1 |
| 3 | Ship same week as Stage A (no observation window) | R1 |
| 4 | Start PR 1 immediately | R1 |
| 5 | Verify on localhost in current working tree | R2 |
| 6 | Login as reporter, fallback super_admin | R2 |
| 7 | Reproduce against production | R2 |
| 8 | Allowed actions: navigate + click + fill + **submit** | R2 |
| 9 | Submit guard: only routes matching `/draft\|propose\|preview/` | R3 |
| 10 | Bug selection: tagged + new + no prior repro_attempt | R3 |
| 11 | Comment format: structured markdown verdict-first | R3 |
| 12 | Status updates: never — agent only writes metadata | R3 |
| 13 | Localizer: bug-agent's analyst first, then custom grep+LLM | R4 |
| 14 | Confidence threshold: 0.7 | R4 |
| 15 | LLM fallback: Claude Code Task tool only (Max sub) | R4 |
| 16 | Copy-fix safety: git grep, only patch if exactly 1 match | R4 |
| 17 | No daily cap | R5 |
| 18 | Per-bug timeout: 5 minutes | R5 |
| 19 | PR open state: Ready if verify passed, Draft if skipped | R5 |
| 20 | Crash handling: mark `agent_error` + retry once next run | R5 |
| 21 | Skill relation: NEW skill that REUSES `bug-agent` sub-prompts | R6 |
| 22 | Localizer reuse: BOTH (bug-agent analyst → custom fallback) | R6 |
| 23 | Skip the human gate | R6 |
| 24 | Cross-agent lockfile: `.claude/locks/bug-triage.lock` | R6 |

---

## Architecture (recast under config-row doctrine)

```
                        platform_policies (existing)
                                 │
                  ┌──────────────┼─────────────────────┐
                  │ bug_triage_agent.allowlist_tags    │
                  │ bug_triage_agent.confidence_min    │
                  │ bug_triage_agent.timeout_seconds   │
                  │ bug_triage_agent.cron_schedule     │
                  │ bug_triage_agent.submit_url_regex  │
                  │ bug_triage_agent.lock_stale_secs   │
                  │ bug_triage_agent.is_enabled        │
                  └──────────────┬─────────────────────┘
                                 │ fn_get_policy_*()
                                 ▼
   bug_reports_ready_for_repro VIEW ─────────────► /bug-triage skill
            │                                         │
            │                                         ├─► cdp.py (login as reporter)
            │                                         ├─► reproduce against prod
            │                                         ├─► localize via bug-agent analyst
            │                                         ├─► grep suspect file
            │                                         ├─► (allowlist+confidence ok?) Edit + verify on localhost
            │                                         ├─► open PR Ready/Draft
            │                                         └─► write metadata.repro_attempt + bug-message
            │
            └─► Lane 1 routine (existing) writes triage.tag every 6h
```

**Super-admin UI** (future PR after agent ships): `/admin/policies/bug-triage` page lets super-admin tweak any of the 7 keys without a deploy. Pattern matches existing `/admin/notifications/policies` from PR #595.

---

## Three PRs

### PR 1 — Policy keys + view + storage bucket
**Branch:** `feat/bug-triage-pr1-policy-keys` (THIS branch)
**Scope:** ~80 LOC SQL + spec docs

#### 1a. Seed policy rows in `platform_policies`

Insert 7 global rows in `supabase/setup/01_tables.sql` (or a dedicated seed file if convention requires):

```sql
INSERT INTO platform_policies (policy_key, scope_type, value, data_type, description, is_system) VALUES
  ('bug_triage_agent.is_enabled',       'global', 'true'::jsonb,
   'boolean', 'Master kill-switch. Set false to pause autonomous bug triage immediately.', true),

  ('bug_triage_agent.allowlist_tags',   'global', '["copy_change","dead_button","page_404"]'::jsonb,
   'array', 'Lane-1 triage tags the agent will autonomously process. Add tags here to expand scope.', true),

  ('bug_triage_agent.confidence_min',   'global', '0.7'::jsonb,
   'number', 'Minimum localization confidence (0-1) to autonomously open a fix PR.', true),

  ('bug_triage_agent.timeout_seconds',  'global', '300'::jsonb,
   'number', 'Per-bug processing timeout. Beyond this, kill Chrome + write outcome=agent_timeout.', true),

  ('bug_triage_agent.cron_schedule',    'global', '"*/30 * * * *"'::jsonb,
   'string', 'Cron expression for the scheduled trigger (IST). Read at trigger setup, not at runtime.', true),

  ('bug_triage_agent.submit_url_regex', 'global', '"/draft|/propose|/preview"'::jsonb,
   'string', 'Regex of URL paths where the agent is allowed to submit forms (POST/PUT). Anything else: navigate+click+fill only.', true),

  ('bug_triage_agent.lock_stale_secs',  'global', '600'::jsonb,
   'number', 'After this many seconds, .claude/locks/bug-triage.lock is considered stale and can be broken.', true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
```

#### 1b. View — `bug_reports_ready_for_repro`

Append to `supabase/setup/05_views.sql`:

```sql
-- 2026-04-29 — bug-triage-agent: queue of bugs ready for autonomous repro+localize+fix
CREATE OR REPLACE VIEW bug_reports_ready_for_repro AS
SELECT
  br.*,
  br.metadata->'triage'->>'tag' AS triage_tag,
  br.metadata->'triage'->>'cluster_canonical_id' AS cluster_canonical
FROM bug_reports br
WHERE br.status IN ('new', 'seen')
  AND br.metadata ? 'triage'
  AND br.metadata->'triage' ? 'tag'
  AND fn_get_policy_bool('bug_triage_agent.is_enabled', false) = true
  AND (fn_get_policy('bug_triage_agent.allowlist_tags') @> to_jsonb(br.metadata->'triage'->>'tag'))
  AND (br.metadata->'repro_attempt' IS NULL
       OR (br.metadata->'repro_attempt'->>'outcome' = 'agent_error'
           AND (br.metadata->'repro_attempt'->>'attempted_at')::timestamptz < now() - interval '1 hour'))
ORDER BY br.created_at ASC;

GRANT SELECT ON bug_reports_ready_for_repro TO authenticated, service_role;
```

**Notes:**
- Reads `is_enabled` + `allowlist_tags` directly from policy → no skill restart needed when policy changes
- `agent_error` rows get one retry after 1 hour (matches R20 decision)
- Empty result if `is_enabled=false` → instant kill switch

#### 1c. Storage bucket + RLS

Append to `supabase/setup/03_policies.sql`:

```sql
-- 2026-04-29 — bug-triage-agent: screenshot storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bug-repro-screenshots', 'bug-repro-screenshots', false, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "bug-repro-screenshots: super_admin + bug reporter read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'bug-repro-screenshots'
  AND (
    is_super_admin()
    OR (storage.foldername(name))[1] IN (
      SELECT br.id::text FROM bug_reports br WHERE br.user_id = auth.uid()
    )
  )
);

CREATE POLICY "bug-repro-screenshots: service_role write only"
ON storage.objects FOR ALL
USING (bucket_id = 'bug-repro-screenshots' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'bug-repro-screenshots' AND auth.role() = 'service_role');
```

#### 1d. Spec docs

- `specs/bug-triage-agent/PLAN.md` (this file)
- `specs/bug-triage-agent/POLICY-KEYS.md` (operator reference: what each key does, valid ranges, when to change)
- Update `supabase/SQL_FILE_INDEX.md` to note the new view + bucket

#### 1e. metadata.repro_attempt JSON shape (documented, not constrained)

Comment in `01_tables.sql` near `bug_reports`:

```
-- 2026-04-29 — bug-triage-agent writes metadata.repro_attempt with shape:
--   { attempted_at, agent_version, logged_in_as, page_url,
--     outcome: 'reproduced'|'could_not_reproduce'|'page_404'|'auth_failed'|'agent_error'|'agent_timeout'|'no_test_account',
--     console_errors[], network_failures[],
--     screenshot_before, screenshot_after,  -- bug-repro-screenshots bucket paths
--     suspect_files: [{path, confidence, reason}],
--     fix_attempt: { branch, pr_url, verified_locally } | null }
```

---

### PR 2 — `/bug-triage` skill
**Branch:** `feat/bug-triage-pr2-skill` (off `jicate/main`)
**Scope:** medium, new skill at `~/.claude/skills/bug-triage/`

Files:
```
~/.claude/skills/bug-triage/
├── SKILL.md                  # Orchestrator (reads platform_policies, loops, dispatches)
├── lockfile.md               # Lock acquire/release pattern via .claude/locks/bug-triage.lock
├── repro.md                  # cdp.py + scripts/local-auth.sh recipe per bug
├── localize.md               # Step 1: invoke bug-agent's codebase-analyst sub-prompt
                              # Step 2: stack-trace grep + page_url match
                              # Step 3: LLM fallback via Claude Code Task tool
├── fix-copy-change.md        # git grep '<exact text>' → 1 match → Edit
├── fix-dead-button.md        # locate handler → suggest patch (heuristic)
├── fix-page-404.md           # locate route registration → patch
├── verify-localhost.md       # stash → checkout → npm run dev :3304 → cdp.py repro → restore
├── post-comment.md           # POST /api/bug-reports/[id]/messages with formatted markdown
└── README.md                 # How to invoke manually + how it's auto-triggered
```

Key behaviors (all read from `platform_policies` at start of each invocation):
1. Acquire lock → if held, exit. If stale (>`lock_stale_secs`), break.
2. Query `bug_reports_ready_for_repro` view → process oldest first
3. Per bug: 5-min budget (configurable via `timeout_seconds` policy)
4. Login as reporter → repro on prod → if fail, login super_admin → repro again
5. Localize via bug-agent's `codebase-analyst-prompt.md` → fall back to custom grep
6. If `triage.tag IN allowlist_tags` AND confidence >= `confidence_min`:
   - Create branch `auto/bug-triage/<display_id>` off `jicate/main`
   - Apply patch (per fix-{tag}.md recipe)
   - **Verify on localhost** (stash → checkout → dev :3304 → repro → restore)
   - Push + open PR (Ready if verified, Draft if not)
7. Write `metadata.repro_attempt` + post bug comment
8. Release lock

### PR 3 — Scheduled trigger setup
**Branch:** `feat/bug-triage-pr3-trigger`
**Scope:** tiny — adds the schedule via Claude Code `/schedule` skill (NOT a code commit)

Sets up a recurring `/bug-triage` invocation every 30min IST (matches `cron_schedule` policy default). User runs this manually after PR 2 ships.

---

## Why this is config-row-doctrine compliant

Every tunable above is a row in `platform_policies`. Super-admin can:
- Pause the agent: flip `is_enabled` to false → next view query returns 0 rows → agent goes idle without code change
- Add `page_500` to allowlist: append to `allowlist_tags` array → next run picks it up
- Tighten confidence: change `0.7` → `0.85` → next run uses new threshold
- Change cron: change `"*/30 * * * *"` → `"*/15 * * * *"` → next trigger reschedule (one-time op)
- Loosen submit guard: change regex → next run uses new pattern

**Anti-pattern grep before opening PR 1:**
```bash
grep -rE "if.*[<>=]\s*0\.[0-9]" specs/bug-triage-agent/  # no hardcoded thresholds in skill
grep -rE "['\"](copy_change|dead_button|page_404)['\"]" specs/bug-triage-agent/SKILL.md  # tags only in policy seed
```

Both should return zero matches in PR 2's skill code (only the SQL seed file references these literally, by design).

---

## Risk register (updated)

| Risk | Mitigation |
|---|---|
| Stage A / B split removed → autonomous fix-PR risk per memory | Verify gate (localhost repro before Ready) + tight allowlist + 0.7 confidence + lockfile |
| Form submit in prod creates real records | `submit_url_regex` policy restricts to `/draft\|/propose\|/preview/` only; agent prefixes input values with `AUTO-REPRO-<bug_id>-` for any cleanup |
| Localhost verify interrupts active session | Lockfile + stash; if working tree dirty beyond stashable, skip verify → PR opens Draft (R19 fallback) |
| Fixes patch wrong file | confidence ≥ 0.7 + git-grep-must-be-1 for copy_change |
| Cluster duplicates wasted | `auto_close_cluster_duplicates_trg` already handles this; agent processes canonical only via existing trigger |
| Agent crashes mid-bug | Mark `agent_error`; view re-includes after 1h; one retry max (R20) |
| Director wants to disable instantly | `UPDATE platform_policies SET value='false'::jsonb WHERE policy_key='bug_triage_agent.is_enabled'` — takes effect on next view query |

---

## Approval gate before applying SQL

Per CLAUDE.md "executing actions with care" — `apply_migration` is high-blast-radius (modifies prod schema). PR 1 SQL ships as a migration file but **applies via Supabase MCP only after user confirms** the policy values + view shape look right.

**The user is asked to confirm:**
1. Policy values in section 1a (defaults match interview decisions)
2. View shape in 1b (1-hour retry window for `agent_error`, kill-switch via `is_enabled`)
3. Storage bucket + RLS in 1c (private, super_admin + reporter read, service_role write)
4. JSON shape doc in 1e

After OK → I run `mcp__supabase__apply_migration` with the SQL, verify rows appear, push the branch, open PR.
