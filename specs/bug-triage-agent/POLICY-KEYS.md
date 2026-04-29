# Bug Triage Agent — Policy Keys Reference

Operator reference for the 8 `platform_policies` rows that control the autonomous bug triage agent. All keys are `scope_type='global'` (no per-institution variation expected).

**Edit via:** SQL `UPDATE platform_policies SET value=... WHERE policy_key='bug_triage_agent.X'` OR (future) the `/admin/policies/bug-triage` UI.

**Effect timing:** All keys are read at the start of every `/bug-triage` invocation, except `cron_schedule` (read once when scheduled trigger is set up).

---

## Quick reference

| Key | Type | Default | Effect |
|---|---|---|---|
| `bug_triage_agent.is_enabled` | boolean | `true` | Master kill switch |
| `bug_triage_agent.allowlist_tags` | array | `["copy_change","dead_button","page_404"]` | Triage tags the agent fixes |
| `bug_triage_agent.confidence_min` | number | `0.7` | Min localization confidence to open PR |
| `bug_triage_agent.timeout_seconds` | number | `300` | Per-bug budget |
| `bug_triage_agent.cron_schedule` | string | `"*/30 * * * *"` | Trigger cadence (IST) |
| `bug_triage_agent.submit_url_regex` | string | `"/draft\|/propose\|/preview"` | Where forms can be submitted |
| `bug_triage_agent.lock_stale_secs` | number | `600` | Lockfile threshold (v2 cron only) |
| `bug_triage_agent.draft_pr_reviewer` | string | `""` | GitHub handle auto-assigned to every Draft PR |

---

## `is_enabled` (boolean)

Master kill switch. When `false`, the `bug_reports_ready_for_repro` view returns zero rows → agent goes idle on next invocation without code changes or trigger pauses.

**When to flip false:**
- Agent is misbehaving (false-positive PRs, wrong file patches)
- Production incident — focus humans, not autonomous fixes
- Major refactor in progress where localization will be wrong

**Instant pause:**
```sql
UPDATE platform_policies SET value='false'::jsonb, updated_at=now()
WHERE policy_key='bug_triage_agent.is_enabled';
```

---

## `allowlist_tags` (array of strings)

The Lane-1 triage tags the agent will autonomously process.

**Default v1:** `["copy_change", "dead_button", "page_404"]`

**Reasons NOT in default set:**
- `page_500` — server errors usually need RLS/data context the agent lacks
- `rls_or_perms` — needs role-staging the agent can't safely test
- `data_specific` — needs the reporter's exact data
- `email_failed` / `payment_failed` — async / financial, never autonomous

**Expand carefully:**
```sql
-- Add page_500 once accuracy is proven for the v1 set:
UPDATE platform_policies
SET value = value || '["page_500"]'::jsonb, updated_at=now()
WHERE policy_key='bug_triage_agent.allowlist_tags';
```

---

## `confidence_min` (number 0-1)

Minimum localization confidence required to open a fix PR. Below this threshold, agent only posts a comment (no PR opened).

| Value | Behavior |
|---|---|
| `0.5` | Aggressive — page_url match alone is enough |
| `0.7` (default) | Direct stack-trace file match OR function-name + module match |
| `0.9` | Conservative — only literal stack-trace file paths |
| `1.0` | Effectively disables fix attempts (only comments) |

**Tune up after first false-positive PR**, tune down once you trust the localizer.

---

## `timeout_seconds` (number)

Per-bug budget covering: login + page load + repro + grep + (if applicable) localhost verify + push.

| Value | Use case |
|---|---|
| `120` | Tight — only single-page bugs with fast repro |
| `300` (default) | Comfortable for most cases including localhost verify |
| `600` | Loose — risks one stuck Chrome blocking the queue |

After timeout, agent kills the Chrome session and writes `outcome='agent_timeout'` to bug metadata.

---

## `cron_schedule` (string, cron expression IST)

Trigger cadence. **Read once when the scheduled trigger is set up** — changing this value alone does NOT reschedule the existing trigger; you must re-create it.

| Value | Effect |
|---|---|
| `"*/15 * * * *"` | Every 15 min — high responsiveness, more cost |
| `"*/30 * * * *"` (default) | Every 30 min |
| `"0 * * * *"` | Hourly on the hour |
| `"0 9-18 * * 1-5"` | Business hours only (9am-6pm IST, Mon-Fri) |

---

## `submit_url_regex` (string, Postgres regex syntax)

URL path patterns where the agent is allowed to submit forms (POST/PUT). Anywhere else: navigate + click + fill, but no submit.

**Default:** `"/draft|/propose|/preview"` — covers `/events/propose`, `/admission/leads/draft`, `/preview/*`.

**Tighten:**
```sql
UPDATE platform_policies
SET value = '"/draft$"'::jsonb
WHERE policy_key='bug_triage_agent.submit_url_regex';
-- Now only routes ending in /draft can be submitted to.
```

**Loosen (DANGEROUS):** Don't add admin/billing/payments/payroll routes here — these create real records.

---

## `draft_pr_reviewer` (string, GitHub handle)

GitHub username (no `@`) auto-assigned as reviewer on every Draft PR the agent opens. Empty string disables auto-assignment.

**Default:** `""` (set this before enabling the agent — otherwise the main dev won't be notified).

**Set:**
```sql
UPDATE platform_policies
SET value = '"main-developer-handle"'::jsonb, updated_at=now()
WHERE policy_key='bug_triage_agent.draft_pr_reviewer';
```

**Effect:** On `gh pr create --draft`, the agent passes `--reviewer <handle>`. Draft PRs go to that user's review queue, not the merge queue. Main dev verifies → flips Ready → merges.

---

## `lock_stale_secs` (number — v2 cron mode only)

The agent uses a lockfile at `.claude/locks/bug-triage.lock` to prevent collision with parallel invocations or your active session. After this many seconds without update, the lock is considered stale and the next invocation breaks it.

**v1 note:** Manual invocation (current) does not use the lockfile. Reserved for v2 (autonomous cron mode).

| Value | Use case |
|---|---|
| `300` | 5min — only safe if `timeout_seconds` < 300 |
| `600` (default) | 10min — accommodates 5-min `timeout_seconds` + npm install |
| `1800` | 30min — for slow CI environments |

**If lock collisions are a problem**, increase `timeout_seconds` BEFORE increasing `lock_stale_secs`.

---

## Audit trail

All edits to `platform_policies` set `updated_at` and `updated_by` (via the existing trigger on the table). Query the history with:

```sql
SELECT policy_key, value, updated_at, updated_by
FROM platform_policies
WHERE policy_key LIKE 'bug_triage_agent.%'
ORDER BY updated_at DESC;
```
