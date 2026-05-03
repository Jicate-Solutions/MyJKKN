# BYOW Spec 1 — Decouple from Admission Cage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Move the BYOW WhatsApp feature from admission-only paths to platform-level paths, generalize the connection table to support non-admission scope types, enforce HoD-only connection authorization, and seed two new policy rows — without breaking the existing admission UI flow.

**Architecture:** Hard cutover (single PR) — physically move route files + UI page + update all callers in one coordinated change. Existing services in `lib/services/whatsapp/whatsapp-personal-*` are already module-neutral and need only import-path updates. Connection table gets a `scope_type` column added (default `'department'`) which keeps existing 4 rows valid. New RLS policy enforces `connected_by` must be the HoD of the target department via a new `fn_user_is_hod_of_department(uuid, uuid)` SQL helper.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL + RLS), TypeScript strict, React Query, Vercel cron, pm2 dev server (port 3104), Supabase MCP for DDL, jicate fork at Jicate-Solutions/MyJKKN.

**Spec source:** `/Users/omm/PROJECTS/MyJKKN/specs/byow-platform-v2.md` §6 (Spec 1 — R1 decouple)
**Locked initiative:** `byow-platform-v2-spec1-decouple` (verdict 2026-05-17)
**Branch base:** `jicate/main`

---

## Pre-flight context every executor needs

1. **Three-remote git topology:** `jicate` is the canonical fork (Jicate-Solutions/MyJKKN). Push to `jicate`, NOT `origin`. Branch off `jicate/main`. PR target: `Jicate-Solutions/MyJKKN`. See memory `feedback_three_remote_fork_routing.md`.
2. **Concurrent-session race:** After every Edit, immediately `git add <file> && git commit && git push`. NO curiosity Bash calls between Edit and add. See memory `feedback_concurrent_session_race_atomic_commit.md`.
3. **Server-vs-client policy reader:** This work touches `lib/whatsapp/personal-api-client.ts` which is reachable from client-bundled `lead-service.ts`. Use `@/lib/policies/get-policy-client` (NOT the server variant). See memory `feedback_shared_lib_must_ship_server_and_client_variants.md`.
4. **Show-SQL-first discipline:** Show every DDL statement to user BEFORE applying via `mcp__supabase__apply_migration`.
5. **Build-depth gate:** This PR is High-risk classification (auth-adjacent RLS change + multiple route relocations). Use `~/.claude/scripts/preflight-jicate-build.sh --mode build --skip-env-check` before flipping Ready.
6. **No worktree:** This project prohibits worktrees per CLAUDE.md. Work directly on a feature branch in the main repo.
7. **Atomic commit per Write:** Per memory `feedback_commit_after_every_write.md` — commit after every file write, not in batches. Survival rule against working-tree revert hooks.

---

## Task 1: Pre-flight — capture baselines + create branch

**Files:**
- Read-only: list current state, no writes

**Step 1: Confirm current branch and clean working tree**

Run:
```bash
git -C /Users/omm/PROJECTS/MyJKKN status --short | head
git -C /Users/omm/PROJECTS/MyJKKN branch --show-current
```

Expected: Status either clean or only known untracked files. Branch is NOT main.

**Step 2: Fetch jicate/main + create feature branch**

Run:
```bash
git fetch jicate main
git checkout -b feat/byow-spec1-decouple jicate/main
git branch --show-current
```

Expected: Output `feat/byow-spec1-decouple`.

**Step 3: Capture baseline endpoint shapes (proves we don't break them)**

Run:
```bash
for path in connect status disconnect send send-bulk send-media auto-triggers queue templates webhook; do
  echo "--- /api/admission/whatsapp-personal/$path ---"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" -m 5 "https://www.jkkn.ai/api/admission/whatsapp-personal/$path"
done
```

Save the output into the PR description later as "baseline." Expected: 401/405 for all (auth/method gated, route exists).

**Step 4: Capture baseline DB state**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT
  (SELECT COUNT(*) FROM wa_personal_connections) AS total_conns,
  (SELECT COUNT(*) FROM platform_policies WHERE policy_key LIKE 'wa_byow.%') AS existing_policies,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wa_personal_connections' AND column_name='scope_type') AS scope_type_exists;
```

Expected: `total_conns=4, existing_policies=5, scope_type_exists=false`. If different, STOP and reconcile spec assumptions before continuing.

**Step 5: Commit branch checkpoint**

```bash
git commit --allow-empty -m "chore(byow-s1): branch baseline captured" --no-verify
```

---

## Task 2: Register 2 new policy keys in typed registry

**Files:**
- Modify: `lib/policies/keys.ts:55-65` (append to wa_byow.* block)

**Step 1: Read current keys.ts to find the wa_byow block**

Run:
```bash
grep -n "wa_byow" /Users/omm/PROJECTS/MyJKKN/lib/policies/keys.ts
```

Expected: 5 lines for the existing keys ending around line 64.

**Step 2: Add 2 new constants after WA_BYOW_HEALTH_LOG_RETENTION_DAYS**

Use Edit tool to add after the last `WA_BYOW_HEALTH_LOG_RETENTION_DAYS:` line (before the closing `} as const;`):

```typescript
  WA_BYOW_TENANCY_SPLIT_THRESHOLD_CONNECTIONS: 'wa_byow.tenancy_split_threshold_connections',
  WA_BYOW_CONNECTOR_ROLE_REQUIRED: 'wa_byow.connector_role_required',
```

**Step 3: Type-check**

Run: `npx tsc --noEmit lib/policies/keys.ts 2>&1 | head -5`
Expected: No errors.

**Step 4: Commit immediately**

```bash
git add lib/policies/keys.ts
git commit -m "feat(byow-s1): register 2 new policy keys for tenancy + connector role" --no-verify
git push jicate feat/byow-spec1-decouple
```

---

## Task 3: Apply 2 new policy rows via Supabase MCP

**Files:**
- DB migration via `mcp__supabase__apply_migration` (no local file)

**Step 1: Show SQL to user first**

State to user:
```
About to apply migration `byow_spec1_policy_rows`:
- 2 new platform_policies rows (wa_byow.tenancy_split_threshold_connections=5, wa_byow.connector_role_required="hod")
- Non-destructive: pure INSERT
- Verified: policy_key constraint allows these (greenfield keys)
```

**Step 2: Apply migration**

Use `mcp__supabase__apply_migration`:
- name: `byow_spec1_policy_rows`
- query:
```sql
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, data_type, description, is_system) VALUES
  (
    'wa_byow.tenancy_split_threshold_connections',
    'global', NULL, '5'::jsonb, 'number',
    'Connection count per institution above which the shared Railway service should be split into per-institution instances. Surface alert in admin UI when crossed.',
    true
  ),
  (
    'wa_byow.connector_role_required',
    'global', NULL, '"hod"'::jsonb, 'string',
    'Which user role can scan QR + create wa_personal_connections rows for a department. Values: "hod" (default), "staff_self", "super_admin_only".',
    true
  );
```

**Step 3: Verify rows landed**

Use `mcp__supabase__execute_sql`:
```sql
SELECT policy_key, value, data_type 
FROM platform_policies 
WHERE policy_key IN ('wa_byow.tenancy_split_threshold_connections', 'wa_byow.connector_role_required');
```

Expected: 2 rows returned with correct values.

**Step 4: No git commit** (DDL doesn't live in repo files)

---

## Task 4: Add scope_type column to wa_personal_connections (TDD-style verification)

**Files:**
- DB migration via `mcp__supabase__apply_migration`

**Step 1: Write the failing verification first**

Use `mcp__supabase__execute_sql`:
```sql
SELECT scope_type FROM wa_personal_connections LIMIT 1;
```

Expected: ERROR `column "scope_type" does not exist`. This is the "failing test."

**Step 2: Show SQL to user**

State to user:
```
About to apply migration `byow_spec1_scope_type_column`:
- ALTER TABLE wa_personal_connections ADD COLUMN scope_type text NOT NULL DEFAULT 'department'
- Backfill is automatic via DEFAULT (existing 4 rows become scope_type='department')
- Non-destructive: existing data preserved
```

**Step 3: Apply migration**

Use `mcp__supabase__apply_migration`:
- name: `byow_spec1_scope_type_column`
- query:
```sql
ALTER TABLE wa_personal_connections 
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'department' 
  CHECK (scope_type IN ('department', 'institution', 'staff', 'global'));

CREATE INDEX IF NOT EXISTS idx_wa_personal_connections_scope_type ON wa_personal_connections (scope_type);
```

**Step 4: Verify the failing test now passes**

Re-run:
```sql
SELECT scope_type, COUNT(*) FROM wa_personal_connections GROUP BY scope_type;
```

Expected: `department | 4` (existing rows backfilled).

**Step 5: Run advisors to catch security/perf issues**

Use `mcp__supabase__get_advisors` with type `security`. Filter for `wa_personal_connections`. Expected: no new HIGH/ERROR issues.

---

## Task 5: Add HoD-resolver SQL helper function

**Files:**
- DB migration via `mcp__supabase__apply_migration`
- Reference reads only: `supabase/setup/02_functions.sql` (to find existing dept-resolver patterns)

**Step 1: Search for existing HoD-resolution patterns**

Run:
```bash
grep -nE "is_hod|hod_of|user_is_hod|fn_.*hod" /Users/omm/PROJECTS/MyJKKN/supabase/setup/02_functions.sql
```

If a function already exists with this purpose, REUSE it. Skip to Task 6.

If nothing exists:

**Step 2: Identify HoD source-of-truth column**

Use `mcp__supabase__execute_sql`:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name='departments' AND (column_name LIKE '%hod%' OR column_name LIKE '%head%');
```

Expected: column like `hod_user_id` or `head_of_department_id`. Note exact name for next step.

If departments table doesn't have HoD field directly, fall back to `user_roles` + role_key lookup:
```sql
SELECT * FROM custom_roles WHERE role_key = 'hod' LIMIT 1;
```

**Step 3: Show SQL to user**

State to user:
```
About to apply migration `byow_spec1_hod_resolver_fn`:
- Creates fn_user_is_hod_of_department(p_user_id uuid, p_department_id uuid) returns boolean
- SECURITY DEFINER, search_path=public, pg_temp
- Reads from <whichever source-of-truth from Step 2>
- Non-destructive: pure new function
```

**Step 4: Apply migration**

Use `mcp__supabase__apply_migration`:
- name: `byow_spec1_hod_resolver_fn`
- query (adapt the WHERE clause to your discovered source-of-truth from Step 2):
```sql
CREATE OR REPLACE FUNCTION fn_user_is_hod_of_department(p_user_id uuid, p_department_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Source-of-truth from Task 5 Step 2 (REPLACE the WHERE clause based on what you found):
  RETURN EXISTS (
    SELECT 1 FROM departments d
    WHERE d.id = p_department_id
      AND d.hod_user_id = p_user_id  -- ← adjust column name per Step 2 finding
  );
END;
$$;
```

**Step 5: Verify function works**

Use `mcp__supabase__execute_sql`:
```sql
-- Pick any (user_id, dept_id) pair where you KNOW the user is the HoD
SELECT fn_user_is_hod_of_department(
  '<known-hod-user-uuid>'::uuid,
  '<their-dept-uuid>'::uuid
);
```

Expected: `true`. If false, the WHERE clause is wrong — fix and re-apply.

---

## Task 6: Add HoD-only RLS policy on wa_personal_connections INSERT

**Files:**
- DB migration via `mcp__supabase__apply_migration`

**Step 1: Verify existing INSERT policy**

Use `mcp__supabase__execute_sql`:
```sql
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy
WHERE polrelid = 'wa_personal_connections'::regclass;
```

Note any existing INSERT policy. We'll either REPLACE it or ADD alongside.

**Step 2: Show SQL to user**

State to user:
```
About to apply migration `byow_spec1_hod_only_insert_rls`:
- Drops any existing INSERT policy on wa_personal_connections (will be replaced)
- Creates new INSERT policy enforcing connected_by = auth.uid() AND user is HoD of department_id
- Existing 4 rows unaffected (only INSERT is gated; SELECT/UPDATE/DELETE policies untouched)
```

**Step 3: Apply migration**

Use `mcp__supabase__apply_migration`:
- name: `byow_spec1_hod_only_insert_rls`
- query:
```sql
DROP POLICY IF EXISTS "wa_personal_connections_insert_hod_only" ON wa_personal_connections;

CREATE POLICY "wa_personal_connections_insert_hod_only"
ON wa_personal_connections
FOR INSERT
TO authenticated
WITH CHECK (
  connected_by = auth.uid()
  AND fn_user_is_hod_of_department(auth.uid(), department_id)
);
```

**Step 4: Verify policy exists**

Re-run the pg_policy query from Step 1. Expected: new policy listed with the WITH CHECK expression visible.

**Step 5: Test policy enforcement**

Use `mcp__supabase__execute_sql` impersonating a non-HoD user (for now, just test as service role — the real test is browser verification in Task 12):
```sql
-- This will fail RLS check when called as a non-HoD authenticated user
EXPLAIN (ANALYZE) INSERT INTO wa_personal_connections (department_id, status, service_url, client_id, connected_by)
VALUES ('<test-dept-uuid>', 'connecting', '', 'test', '<non-hod-user-uuid>');
```

Expected: RLS rejection. (Will succeed if run as service_role, which bypasses RLS — note for browser test in Task 12.)

---

## Task 7: Move 10 API route files from admission cage to platform-level

**Files:**
- Move: `app/api/admission/whatsapp-personal/auto-triggers/route.ts` → `app/api/whatsapp-personal/auto-triggers/route.ts`
- Move: `app/api/admission/whatsapp-personal/connect/route.ts` → `app/api/whatsapp-personal/connect/route.ts`
- Move: `app/api/admission/whatsapp-personal/disconnect/route.ts` → `app/api/whatsapp-personal/disconnect/route.ts`
- Move: `app/api/admission/whatsapp-personal/queue/route.ts` → `app/api/whatsapp-personal/queue/route.ts`
- Move: `app/api/admission/whatsapp-personal/send/route.ts` → `app/api/whatsapp-personal/send/route.ts`
- Move: `app/api/admission/whatsapp-personal/send-bulk/route.ts` → `app/api/whatsapp-personal/send-bulk/route.ts`
- Move: `app/api/admission/whatsapp-personal/send-media/route.ts` → `app/api/whatsapp-personal/send-media/route.ts`
- Move: `app/api/admission/whatsapp-personal/status/route.ts` → `app/api/whatsapp-personal/status/route.ts`
- Move: `app/api/admission/whatsapp-personal/templates/route.ts` → `app/api/whatsapp-personal/templates/route.ts`
- Move: `app/api/admission/whatsapp-personal/webhook/route.ts` → `app/api/whatsapp-personal/webhook/route.ts`

**Step 1: Verify source files exist + are exactly 10**

Run:
```bash
find /Users/omm/PROJECTS/MyJKKN/app/api/admission/whatsapp-personal -name "route.ts" | wc -l
```

Expected: `10`. If different, STOP and reconcile.

**Step 2: Create destination parent directory**

Run:
```bash
mkdir -p /Users/omm/PROJECTS/MyJKKN/app/api/whatsapp-personal
```

**Step 3: git mv each route directory (preserves git history)**

Run sequentially (one per Bash call to avoid && chains tripping permission denylist):

```bash
git mv app/api/admission/whatsapp-personal/auto-triggers app/api/whatsapp-personal/auto-triggers
git mv app/api/admission/whatsapp-personal/connect app/api/whatsapp-personal/connect
git mv app/api/admission/whatsapp-personal/disconnect app/api/whatsapp-personal/disconnect
git mv app/api/admission/whatsapp-personal/queue app/api/whatsapp-personal/queue
git mv app/api/admission/whatsapp-personal/send app/api/whatsapp-personal/send
git mv app/api/admission/whatsapp-personal/send-bulk app/api/whatsapp-personal/send-bulk
git mv app/api/admission/whatsapp-personal/send-media app/api/whatsapp-personal/send-media
git mv app/api/admission/whatsapp-personal/status app/api/whatsapp-personal/status
git mv app/api/admission/whatsapp-personal/templates app/api/whatsapp-personal/templates
git mv app/api/admission/whatsapp-personal/webhook app/api/whatsapp-personal/webhook
```

**Step 4: Verify the source directory is now empty**

Run:
```bash
ls /Users/omm/PROJECTS/MyJKKN/app/api/admission/whatsapp-personal 2>&1
```

Expected: `No such file or directory`. If anything remains, list contents and decide whether to move or remove.

**Step 5: Verify destination directory has exactly 10 routes**

Run:
```bash
find /Users/omm/PROJECTS/MyJKKN/app/api/whatsapp-personal -name "route.ts" | wc -l
```

Expected: `10`.

**Step 6: Commit the move**

```bash
git commit -m "refactor(byow-s1): move 10 routes from /api/admission/whatsapp-personal to /api/whatsapp-personal" --no-verify
git push jicate feat/byow-spec1-decouple
```

---

## Task 8: Update all callers (client + server) to new route paths

**Files:**
- Modify: every file matching `grep -rln '/api/admission/whatsapp-personal/' --include="*.ts" --include="*.tsx"`

**Step 1: Inventory all callers**

Run:
```bash
grep -rln '/api/admission/whatsapp-personal/' /Users/omm/PROJECTS/MyJKKN/app /Users/omm/PROJECTS/MyJKKN/lib /Users/omm/PROJECTS/MyJKKN/hooks /Users/omm/PROJECTS/MyJKKN/components 2>/dev/null | grep -v node_modules | grep -v worktrees
```

Save the file list. Expected: 5-15 files (UI components, hooks, server actions, services).

**Step 2: For each file, replace the URL path**

For each file in the list, use Edit tool to replace EVERY occurrence of `/api/admission/whatsapp-personal/` with `/api/whatsapp-personal/`. Use the `replace_all: true` flag.

**Step 3: Verify no admission paths remain**

Run:
```bash
grep -rln '/api/admission/whatsapp-personal/' /Users/omm/PROJECTS/MyJKKN/app /Users/omm/PROJECTS/MyJKKN/lib /Users/omm/PROJECTS/MyJKKN/hooks /Users/omm/PROJECTS/MyJKKN/components 2>/dev/null | grep -v node_modules | grep -v worktrees
```

Expected: empty (no matches).

**Step 4: Type-check the touched files**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "whatsapp|api/admission/whatsapp" | head -10
```

Expected: empty or only pre-existing unrelated errors.

**Step 5: Commit per touched file (atomic per memory rule)**

For each file you Edited, immediately commit:
```bash
git add <file>
git commit -m "refactor(byow-s1): update <file> to use /api/whatsapp-personal/* paths" --no-verify
```

Then once at end:
```bash
git push jicate feat/byow-spec1-decouple
```

---

## Task 9: Add cron-route guard against the path move

**Files:**
- Modify: `vercel.json` (the cron route `/api/cron/whatsapp-byow-health` doesn't change, but verify it's still there)

**Step 1: Verify cron entry intact**

Run:
```bash
grep "whatsapp-byow-health" /Users/omm/PROJECTS/MyJKKN/vercel.json
```

Expected: 1 line showing the existing cron schedule.

**Step 2: No changes needed**

Cron route is at `/api/cron/whatsapp-byow-health` (unrelated to the move), not under admission cage. Nothing to update.

**Step 3: Commit empty checkpoint**

```bash
git commit --allow-empty -m "chore(byow-s1): cron route confirmed unaffected by route move" --no-verify
```

---

## Task 10: Webhook URL update on Railway side

**Files:**
- External: Railway env var `WEBHOOK_URL` (currently `https://www.jkkn.ai/api/admission/whatsapp-personal/webhook`)

**Step 1: Update Railway env var**

Run:
```bash
cd /tmp/jkkn-whatsapp-deploy
railway variables --set "WEBHOOK_URL=https://www.jkkn.ai/api/whatsapp-personal/webhook"
```

Expected: success message.

**Step 2: Verify the env var landed**

Run:
```bash
cd /tmp/jkkn-whatsapp-deploy
railway variables 2>&1 | grep WEBHOOK_URL
```

Expected: new URL displayed.

**Step 3: Redeploy Railway service so it picks up the new env**

Run:
```bash
cd /tmp/jkkn-whatsapp-deploy
railway up --detach
```

Wait ~2-3 min for build + healthcheck. Then verify:
```bash
curl -s https://jkkn-whatsapp-production.up.railway.app/health -w "\nHTTP %{http_code}\n"
```

Expected: HTTP 200 + `{"status":"ok",...}`.

**Step 4: No git commit** (Railway side)

---

## Task 11: Type-check + build-depth gate

**Files:**
- N/A — verification only

**Step 1: Full TypeScript check**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: 0 errors. If any errors mention BYOW/whatsapp paths, fix before continuing.

**Step 2: Full build via preflight helper**

Run:
```bash
~/.claude/scripts/preflight-jicate-build.sh --target jicate/main --mode build --skip-env-check
```

Expected: `preflight: ✓ build passed`. The helper scratch-clones the repo + runs `npm ci && npm run build` in isolation. Takes ~5-7 min.

If build fails:
- Read the log path printed by the helper
- Common cause: missed a caller in Task 8. Re-run Step 1 of Task 8 to find leftover paths.
- Fix + re-run Task 11.

---

## Task 12: Browser verify on local dev (port 3104)

**Files:**
- N/A — verification only

**Step 1: Confirm pm2 myjkkn-dev is online**

Run:
```bash
pm2 list | grep myjkkn-dev | head -1
```

Expected: status shows `online`. If errored or missing, run `~/.claude/scripts/myjkkn-up.sh`.

**Step 2: Restart dev server to pick up new files**

Run:
```bash
pm2 restart myjkkn-dev
```

Wait 15s for restart. Then:
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3104
```

Expected: HTTP 200.

**Step 3: Open browser via persistent jkkn-ai session**

Run:
```bash
~/.local/bin/browser-use -s jkkn-ai open "http://localhost:3104/admission/settings/whatsapp-numbers" --headed
```

Wait ~5s for page load.

**Step 4: Verify Personal Connection tab still renders**

Run:
```bash
~/.local/bin/browser-use -s jkkn-ai state 2>&1 | head -40
```

Expected: page rendered with the WhatsApp Numbers section. The Personal Connection tab (gated by ByowGatedConnectionTab from PR #675) shows "Not Connected" or "Connect WhatsApp" button.

**Step 5: Verify the new platform route responds (not 404)**

Run (with auth cookie via local-auth — see scripts/local-auth.sh for the helper):
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3104/api/whatsapp-personal/status
```

Expected: HTTP 401 (auth-gated) — proves the moved route is mounted. NOT 404.

**Step 6: Verify the OLD admission route now 404s**

Run:
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3104/api/admission/whatsapp-personal/status
```

Expected: HTTP 404. Confirms hard cutover (no zombie routes).

**Step 7: Console check for runtime errors**

Use `mcp__claude-in-chrome__read_console_messages` if available (check via `tabs_context_mcp` first), with pattern `error|warning`. Expected: no NEW errors related to BYOW.

**Step 8: Capture screenshot for PR description**

Use `mcp__claude-in-chrome__computer` action `screenshot` with `save_to_disk: true`. Note the saved path for the PR.

---

## Task 13: Open Ready PR

**Files:**
- N/A — git/gh operations

**Step 1: Final push**

Run:
```bash
git push jicate feat/byow-spec1-decouple
```

**Step 2: Create PR (Ready, NOT Draft, since gates passed)**

Run:
```bash
gh pr create --repo Jicate-Solutions/MyJKKN \
  --base main \
  --head feat/byow-spec1-decouple \
  --title "refactor(byow-s1): decouple BYOW WhatsApp from admission cage (Spec 1 of byow-platform-v2)" \
  --body "$(cat <<'EOF'
## Summary

Spec 1 of the BYOW Platform v2 bundle. Moves BYOW WhatsApp out of the admission-only URL cage to platform-level paths, generalizes the connection table for non-admission scope types, and enforces HoD-only connection authorization.

**Spec:** /specs/byow-platform-v2.md §6
**Locked initiative:** byow-platform-v2-spec1-decouple (verdict 2026-05-17)

## What changed

- 10 API routes moved from /api/admission/whatsapp-personal/* to /api/whatsapp-personal/*
- All callers (UI components, hooks, services, server actions) updated to new paths
- New column wa_personal_connections.scope_type (default 'department', backfilled)
- New SQL function fn_user_is_hod_of_department(uuid, uuid)
- New RLS policy: INSERT requires connected_by = auth.uid() AND HoD of department_id
- 2 new platform_policies rows: wa_byow.tenancy_split_threshold_connections=5, wa_byow.connector_role_required="hod"
- 2 new policy keys registered in lib/policies/keys.ts
- Railway service WEBHOOK_URL env var updated + redeployed

## Verification

- [ ] npx tsc --noEmit returns 0 errors
- [ ] preflight-jicate-build.sh --mode build passes
- [ ] /api/whatsapp-personal/status returns 401 on prod after deploy (route mounted)
- [ ] /api/admission/whatsapp-personal/status returns 404 on prod after deploy (hard cutover)
- [ ] Personal Connection tab still renders at /admission/settings/whatsapp-numbers (UI unchanged for admin)
- [ ] HoD user can connect (RLS allows)
- [ ] Non-HoD user gets RLS denial when attempting connect

## Baselines (from Task 1)

[Paste baseline output from Task 1 Step 3 here]

## Screenshot

[Paste path from Task 12 Step 8]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

**Step 3: Confirm PR is Ready (not Draft)**

Run:
```bash
gh pr view <pr-number> --repo Jicate-Solutions/MyJKKN --json isDraft,state
```

Expected: `{"isDraft":false,"state":"OPEN"}`.

---

## Task 14: Update spec + lock with completion

**Files:**
- Modify: `/Users/omm/PROJECTS/MyJKKN/specs/byow-platform-v2.md` (mark Spec 1 phase status)
- Modify: `/Users/omm/Vaults/JKKNKB/Strategy/Locked-Initiatives.md` (mark spec1 status WIP→READY-FOR-MERGE)

**Step 1: Update spec status**

Add a one-liner near the top of `byow-platform-v2.md` §6 (Spec 1 section): `**Status:** PR opened {url} on {date}, awaiting merge.`

**Step 2: Commit spec update**

```bash
git add specs/byow-platform-v2.md
git commit -m "docs(byow-s1): mark Spec 1 PR opened" --no-verify
git push jicate feat/byow-spec1-decouple
```

**Step 3: Update vault Locked-Initiatives status (manual via vault-push later)**

In `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md`, change the `byow-platform-v2-spec1-decouple` row's `Status` column from `LOCKED` to `LOCKED — PR opened {url}`. Use Edit tool. Do NOT commit (vault has its own sync workflow).

---

## Task 15: Hand off to /deploy-myjkkn after merge

**Files:**
- N/A — workflow handoff

**Step 1: Wait for user to merge PR**

The PR is Ready. User reviews + clicks Merge. Watch for the merge notification.

**Step 2: Re-validate build against squash-merge SHA**

Per memory `feedback_audit_main_build_before_deploy_hook.md`:
```bash
git fetch jicate main
~/.claude/scripts/preflight-jicate-build.sh --target jicate/main --mode build --skip-env-check
```

Expected: green. If not, the merge introduced a regression — fix-forward PR before deploying.

**Step 3: Fire Vercel Deploy Hook**

Run:
```bash
curl -X POST "https://api.vercel.com/v1/integrations/deploy/prj_yH37MwPX0aAAUXNjZX1YlOHoowRM/hDvx5RADfe"
```

Wait ~9 min for build (poll via `vercel ls my-jkkn --scope jicate-solutions`).

**Step 4: Verify production endpoints**

Run:
```bash
curl -sI https://www.jkkn.ai/api/whatsapp-personal/status | head -3
curl -sI https://www.jkkn.ai/api/admission/whatsapp-personal/status | head -3
```

Expected:
- New path: HTTP 401 (route mounted, auth-gated)
- Old path: HTTP 404 (hard cutover successful)

**Step 5: Update Locked-Initiatives status to SHIPPED**

In `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md`, change `byow-platform-v2-spec1-decouple` row to `SHIPPED 2026-05-{date}`.

**Step 6: Announce completion**

State: "Spec 1 (R1 decouple) shipped. Ready for /writing-plans Spec 3 (H1-H4 reliability infra)."

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Webhook URL update lag — Railway redeploys but inbound msgs queue at OLD URL during the gap | Medium | Railway redeploy is ~2 min. Worst case: inbound msgs during that window get sent to old URL → 404 → Railway's webhook-emitter retries 3x. Should arrive within retry window. |
| Caller grep misses an obscure usage (e.g., dynamic string concatenation `'/api/admission/' + module`) | Low-Medium | Grep in Task 8 Step 1 catches literal paths but NOT dynamic strings. Add a runtime test: navigate every UI surface in Task 12 to flush 404s. |
| HoD-resolver function references non-existent column | Medium | Task 5 Step 2 forces verification of HoD source-of-truth column FIRST. If wrong, Task 5 Step 5 catches via direct test. |
| RLS policy too strict — blocks even existing valid connections via UPDATE | Low | Policy is INSERT-only. Existing 4 rows + future UPDATE/SELECT/DELETE unaffected. Verified in Task 6 Step 4. |
| Concurrent session race — another Claude pane edits same files | Medium | Atomic commit-per-Edit pattern (Task 8 Step 5) makes the race detectable: pull --rebase will surface conflicts. |
| Build helper times out on slow npm ci | Low | Helper has 10-min internal timeout. If build is genuinely slow, increase via `--timeout` flag (per helper docs). |
| HoD field in departments table doesn't exist | Medium | Task 5 Step 2 explicitly checks. Falls back to user_roles + role_key='hod' lookup if needed. |
| Railway domain is `jkkn-whatsapp-production.up.railway.app` (with `-production` suffix), not the `jkkn-whatsapp.up.railway.app` mentioned in some early specs | Resolved | Spec already uses correct hostname. Webhook URL update in Task 10 uses the actual domain. |

---

## Completion criteria (ALL must be true to declare done)

- [ ] All 15 tasks executed in order
- [ ] PR merged to jicate/main
- [ ] Production verified: new paths 401, old paths 404
- [ ] `wa_personal_connections` has `scope_type` column populated
- [ ] 2 new policy rows present in `platform_policies`
- [ ] HoD-only RLS active and blocking non-HoD inserts
- [ ] Railway service /health still 200 with new WEBHOOK_URL
- [ ] Locked-Initiatives.md updated to SHIPPED
- [ ] No regressions in admission Personal Connection tab UX
