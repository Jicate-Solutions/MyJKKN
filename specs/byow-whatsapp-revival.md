# BYOW WhatsApp Revival — Locked Spec v3

**Author:** Claude (orchestrating /myjkkn-chain → /assumption-thrash)
**Date locked:** 2026-05-03
**Status:** Decisions locked. Ready for /myjkkn-api build.
**Owner account:** aiengineering@jkkn.ac.in (Railway Pro + Vercel + Supabase)
**Estimated effort:** 7–9 hr active work + 1-day soak window
**Recurring cost:** $20/mo (Railway Pro tier — already activated)

---

## §1 Outcome metric (locked, also registered via /lock-initiative)

```yaml
outcome_metric:
  metric_name: byow_messages_sent_per_week
  baseline_value:
    value: 0
    measured_at: 2026-05-03
    note: "Last successful message 2026-03-24, broken since 2026-04-21"
  threshold_90d:
    primary: 200_messages_per_week_4wk_sustained
    secondary: 3_active_counselor_connections
    verdict_date: 2026-08-03
  kill_criterion:
    trigger: "msgs/week < 50 OR active_connections < 2 at verdict_date"
    consequence: |
      Archive BYOW entirely:
      - DROP TABLE wa_personal_connections, wa_personal_message_logs, wa_byow_health_log
      - DELETE FROM platform_policies WHERE policy_key LIKE 'wa_byow.%'
      - Delete 5 services + 10 routes + UI tab + types/whatsapp-personal.ts
      - vercel env rm WHATSAPP_PERSONAL_SERVICE_URL/API_KEY production
      - Decommission Railway service via aiengineering@jkkn.ac.in account
      - Update reference_whatsapp_api.md to confirm WABA-only as official transport
```

---

## §2 Forensic context (why this revival exists)

| Evidence | State |
|---|---|
| MyJKKN code | DEPLOYED (5 services, 10 routes, UI tab, DB tables) |
| Production Vercel env | NOT WIRED (zero WhatsApp_* env vars in production) |
| Railway service `jkkn-whatsapp-service-production.up.railway.app` | DELETED/PAUSED — Railway edge returns 404 |
| Source code | NOT in MyJKKN repo (lived on Boobalan's personal Railway) |
| Last successful message | 2026-03-24 16:08 UTC (39 days ago) |
| Failed connection attempts | 2026-04-21 (×2), 2026-05-03 03:02 UTC (×1) — all stuck at `connecting` |
| Most likely root cause | Railway free-tier auto-pause after 28 days inactivity (matches timeline) |
| Build path | Skip source recovery; rebuild from `~/.claude/skills/byow-whatsapp/` (clean JKKN ownership) |

---

## §3 Silent Assumption Decisions (from assumption-thrash)

### Round 1 — Structural

| # | Category | Decision | Schema impact |
|---|----------|----------|---------------|
| 1 | Variance | Global + per-department override on kill-switch | Two-tier policy resolution: dept row beats global. Helper `getByowEnabled(deptId)` checks dept first. |
| 2 | Lineage (in-flight) | Drop in-flight when kill-switch trips, log as `failed_service_unavailable` | New `delivery_status` enum value. Send route checks flag BEFORE Railway POST. |
| 3 | Temporal + Delegation | Counter resets after 1 success; Sentry-only alert (no email/SMS) | `wa_byow_health_log` tracks each check. Cron computes consecutive failures since last success. Sentry capture on trip event. |
| 4 | Proxy (sender attribution) | Department-shared sending with full audit trail | NEW column `wa_personal_message_logs.sent_by_user_id` (separate from `wa_personal_connections.connected_by`) |

### Round 2 — Operational edges

| # | Category | Decision | Schema impact |
|---|----------|----------|---------------|
| 5 | Reconnection ritual | Auto-resume on re-enable (trust LocalAuth persistence) | No re-scan trigger. First-send-fail acceptable. |
| 6 | Privacy (phone visibility) | All admission staff in institution see connection + phone | RLS on `wa_personal_connections`: institution-scoped admission staff SELECT. |
| 7 | Lifecycle (counselor leaves) | **REVISED in Round 3** → auto-disconnect on `profiles.is_active=false` | NEW trigger `tr_disconnect_byow_on_user_deactivation`. |
| 8 | Emergency override | Zero counter when flag flips to global=true (paired action) | Trigger on `platform_policies` UPDATE for wa_byow.is_enabled=true global. |

### Round 3 — Confirm + remaining edges

| # | Category | Decision | Schema impact |
|---|----------|----------|---------------|
| 9 | GDPR risk lock | Revised Round 2 #7: auto-disconnect on user deactivation (eliminates ex-employee exposure) | See trigger in #7 above |
| 10 | Mid-send media failure | Mark `failed_network`, expose Retry button in lead UI | NEW `delivery_status` enum value. Lead UI reads payload from `message_content` + `metadata` jsonb to retry. |
| 11 | Cron cadence | Every 15 min (matches existing notification-processor) | `vercel.json` cron entry: `*/15 * * * *` |
| 12 | Health log retention | Keep forever (audit-grade) | No cleanup cron. Index on `(recorded_at DESC)` for counter computation. ~36k rows/year expected. |

---

## §4 Schema (corrected from preflight findings)

### 4a. Two policy rows (canonical pattern: `bug_triage_agent.is_enabled`)

```sql
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, data_type, description, is_system) VALUES
  (
    'wa_byow.is_enabled',
    'global',
    NULL,
    'true'::jsonb,
    'boolean',
    'Master kill-switch for BYOW Personal WhatsApp. Auto-flips to false after wa_byow.health_failure_threshold consecutive Railway health-check failures. Per-department override allowed via scope_type=department rows.',
    true
  ),
  (
    'wa_byow.health_failure_threshold',
    'global',
    NULL,
    '3'::jsonb,
    'number',
    'Consecutive Railway /health failures before auto-disabling BYOW UI. Higher = more tolerant of transient failures.',
    true
  );
```

### 4b. New table: `wa_byow_health_log`

```sql
CREATE TABLE wa_byow_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('ok', 'fail')),
  http_code integer,
  response_time_ms integer,
  error_message text,
  service_url text,                                -- which Railway URL was probed
  triggered_disable boolean NOT NULL DEFAULT false  -- true on the row that caused auto-disable
);

CREATE INDEX idx_wa_byow_health_log_recorded_at_desc ON wa_byow_health_log (recorded_at DESC);
CREATE INDEX idx_wa_byow_health_log_status ON wa_byow_health_log (status);

-- RLS: super_admin only
ALTER TABLE wa_byow_health_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "byow_health_log_super_admin_select" ON wa_byow_health_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

### 4c. New column: `wa_personal_message_logs.sent_by_user_id`

```sql
ALTER TABLE wa_personal_message_logs
  ADD COLUMN sent_by_user_id uuid REFERENCES profiles(id);

-- Backfill historical rows: assume sender = connection.connected_by for old rows
UPDATE wa_personal_message_logs m
SET sent_by_user_id = c.connected_by
FROM wa_personal_connections c
WHERE m.connection_id = c.id  -- (verify FK column name during build)
  AND m.sent_by_user_id IS NULL;

CREATE INDEX idx_wa_personal_message_logs_sent_by ON wa_personal_message_logs (sent_by_user_id);
```

### 4d. Two new enum values for delivery_status

```sql
ALTER TYPE wa_personal_delivery_status ADD VALUE 'failed_service_unavailable';
ALTER TYPE wa_personal_delivery_status ADD VALUE 'failed_network';
-- (verify exact enum name during build via information_schema query)
```

### 4e. Two new triggers

```sql
-- Trigger 1: auto-disconnect BYOW on user deactivation (Round 2/3 #7 revised)
CREATE OR REPLACE FUNCTION tr_disconnect_byow_on_user_deactivation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE wa_personal_connections
    SET status = 'disconnected',
        disconnected_at = now()
    WHERE connected_by = NEW.id
      AND status NOT IN ('disconnected');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_disconnect_byow_on_user_deactivation
  AFTER UPDATE OF is_active ON profiles
  FOR EACH ROW EXECUTE FUNCTION tr_disconnect_byow_on_user_deactivation();

-- Trigger 2: zero counter when wa_byow.is_enabled flips global=true (Round 2 #8)
CREATE OR REPLACE FUNCTION tr_zero_byow_counter_on_reenable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.policy_key = 'wa_byow.is_enabled'
     AND NEW.scope_type = 'global'
     AND NEW.value = 'true'::jsonb
     AND (OLD.value IS DISTINCT FROM NEW.value)
  THEN
    -- Counter is computed by SELECT COUNT(*) FROM wa_byow_health_log WHERE recorded_at > last_success_time;
    -- so "zeroing" = inserting a synthetic 'ok' row that resets the count window.
    INSERT INTO wa_byow_health_log (status, error_message, triggered_disable)
    VALUES ('ok', 'manual_admin_reset', false);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_zero_byow_counter_on_reenable
  AFTER UPDATE ON platform_policies
  FOR EACH ROW EXECUTE FUNCTION tr_zero_byow_counter_on_reenable();
```

---

## §5 New cron route — `app/api/cron/whatsapp-byow-health/route.ts`

Pattern mirrors existing `process-scheduled-whatsapp` (CRON_SECRET auth + getServiceClient):

```typescript
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { getPolicyInt } from '@/lib/policies/get-policy';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceUrl = process.env.WHATSAPP_PERSONAL_SERVICE_URL;
  const apiKey = process.env.WHATSAPP_PERSONAL_API_KEY;
  if (!serviceUrl || !apiKey) {
    return NextResponse.json({ error: 'BYOW not configured' }, { status: 503 });
  }

  const supabase = getServiceClient();
  const start = Date.now();

  // Probe Railway /health
  let status: 'ok' | 'fail' = 'fail';
  let httpCode: number | null = null;
  let errorMsg: string | null = null;

  try {
    const resp = await fetch(`${serviceUrl}/health`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    httpCode = resp.status;
    if (resp.ok) status = 'ok';
    else errorMsg = `HTTP ${resp.status}`;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : 'unknown error';
  }

  const responseTimeMs = Date.now() - start;

  // Compute consecutive failures since last success
  const { data: recent } = await supabase
    .from('wa_byow_health_log')
    .select('status, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(50);

  let consecutiveFails = 0;
  if (status === 'fail') consecutiveFails = 1;
  for (const row of recent ?? []) {
    if (row.status === 'fail') consecutiveFails++;
    else break;  // hit a success — stop counting
  }

  const threshold = await getPolicyInt('wa_byow.health_failure_threshold', { default: 3 });
  const shouldTrip = status === 'fail' && consecutiveFails >= threshold;

  // Insert log row
  await supabase.from('wa_byow_health_log').insert({
    status,
    http_code: httpCode,
    response_time_ms: responseTimeMs,
    error_message: errorMsg,
    service_url: serviceUrl,
    triggered_disable: shouldTrip,
  });

  // Auto-disable if threshold met
  if (shouldTrip) {
    await supabase
      .from('platform_policies')
      .update({ value: false })
      .eq('policy_key', 'wa_byow.is_enabled')
      .eq('scope_type', 'global');

    Sentry.captureMessage(
      `BYOW WhatsApp auto-disabled after ${consecutiveFails} consecutive health failures`,
      { level: 'error', tags: { feature: 'byow', event: 'auto_disable' } }
    );
  }

  return NextResponse.json({
    status,
    consecutive_fails: consecutiveFails,
    triggered_disable: shouldTrip,
    response_time_ms: responseTimeMs,
  });
}
```

`vercel.json` cron entry:
```json
{ "path": "/api/cron/whatsapp-byow-health", "schedule": "*/15 * * * *" }
```

---

## §6 UI changes

### 6a. `personal-connection-tab.tsx` — gate behind policy

Since `personal-connection-tab.tsx` is a client component, read the policy in the parent server component (`whatsapp-numbers/page.tsx`) and pass as prop:

```tsx
// app/(routes)/admission/settings/whatsapp-numbers/page.tsx (server component)
import { getPolicyBool } from '@/lib/policies/get-policy';

export default async function Page({ searchParams }) {
  const departmentId = searchParams.department_id;
  const byowEnabled = await getPolicyBool('wa_byow.is_enabled', {
    default: false,
    scope: { type: 'department', id: departmentId, fallback: 'global' }
  });
  // ... pass byowEnabled to <PersonalConnectionTab />
}
```

```tsx
// personal-connection-tab.tsx (client component)
export function PersonalConnectionTab({ departmentId, byowEnabled }) {
  if (!byowEnabled) {
    return (
      <ServiceUnavailableBanner
        reason="Personal WhatsApp temporarily disabled — service health check failed."
        action="Use Meta Business templates instead, or contact admin if you need this re-enabled."
      />
    );
  }
  // ... existing render
}
```

### 6b. Lead/followup UI — Retry button on `failed_network` rows

In any list that renders `wa_personal_message_logs` rows (likely `app/(routes)/admission/leads/work/_components/timeline-snippet.tsx` and similar), add:

```tsx
{msg.delivery_status === 'failed_network' && (
  <Button onClick={() => retryMessage(msg.id)} size="sm" variant="outline">
    Retry send
  </Button>
)}
```

`retryMessage(id)` calls a new endpoint `POST /api/admission/whatsapp-personal/retry/[id]` that re-runs the original send with stored payload.

### 6c. Super-admin UI — manual override for `wa_byow.is_enabled`

Add row to existing policy editor at `/admin/policies` (assumes one exists; if not, this is its own mini-task). When flipped to `true`, the trigger from §4e fires and zeros the counter.

---

## §7 Phase plan (revised with locked decisions)

### Phase 0 — Skill-based source rebuild (3 hr)
Same as v2 §3 Phase 0. Build Express service from `~/.claude/skills/byow-whatsapp/`. Endpoints derived from `lib/whatsapp/personal-api-client.ts`.

### Phase 1 — Railway deploy (45 min — Pro plan ALREADY ACTIVATED)
```bash
cd whatsapp-byow-service && \
  railway init -n jkkn-whatsapp && \
  railway link --project jkkn-whatsapp && \
  railway up --detach && \
  railway domain
# Pro plan: no auto-pause concerns. Team workspace available for future Boobalan handoff if needed.
```

Set vars (use `printf '%s'`, not `echo`):
```
NODE_ENV=production
API_KEY=<openssl rand -base64 32>
WEBHOOK_URL=https://www.jkkn.ai/api/admission/whatsapp-personal/webhook
WEBHOOK_SECRET=<openssl rand -base64 32>
```

Verify: `curl https://jkkn-whatsapp.up.railway.app/health` → 200.

### Phase 2 — DB migrations + Vercel env wire (1 hr)

```bash
# 1. Apply DB migrations via Supabase MCP (apply-then-PR pattern)
#    - Insert 2 platform_policies rows
#    - CREATE TABLE wa_byow_health_log
#    - ALTER TABLE wa_personal_message_logs ADD COLUMN sent_by_user_id
#    - ALTER TYPE add 2 enum values
#    - CREATE TRIGGER ×2

# 2. Vercel env (printf, not echo)
cd /Users/omm/PROJECTS/MyJKKN
printf '%s' 'https://jkkn-whatsapp.up.railway.app' | \
  vercel env add WHATSAPP_PERSONAL_SERVICE_URL production
printf '%s' "$RAILWAY_API_KEY" | \
  vercel env add WHATSAPP_PERSONAL_API_KEY production

# 3. Update stale DB rows
mcp__supabase__execute_sql:
  UPDATE wa_personal_connections
  SET service_url = 'https://jkkn-whatsapp.up.railway.app',
      status = 'disconnected'
  WHERE service_url IN ('', 'https://jkkn-whatsapp-service-production.up.railway.app');
```

### Phase 3 — Code changes (2.5 hr)
- New cron route at `app/api/cron/whatsapp-byow-health/route.ts`
- `vercel.json` cron schedule entry
- `personal-connection-tab.tsx` policy gate (via parent server component)
- Lead UI Retry button for `failed_network` rows
- Send-route flag pre-check before Railway POST
- Sender attribution: write `sent_by_user_id` from session in send routes
- Sentry instrumentation in `personal-api-client.ts`

### Phase 4 — Counselor onboarding (1.5 hr — required by Q0 metric)
- One-time tooltip on `/admission/leads/work` for first-login counselors
- Connection-success email via Resend
- Add `byow_connections_active` + `byow_messages_last_7d` rows to existing super-admin digest

### Phase 5 — Smoke test (30 min active + 24 hr soak)
Same as v2 §5. 7-step verification before announcing revival.

---

## §8 Compliance notes

**Privacy decision**: Round 2 #6 chose institution-wide visibility of connection phone numbers. Combined with Round 3 #9 (auto-disconnect on user deactivation), the residual exposure is: currently-active admission staff see currently-active connections at their institution. No ex-employee data persists.

**Recommended HR offboarding addition** (out of scope for this PR, separate workflow):
- Add to standard offboarding checklist: "Confirm BYOW WhatsApp connection auto-disconnected after `is_active=false` flip in MyJKKN."
- Verify in `wa_personal_connections` that status='disconnected' for all rows where `connected_by` matches departing user's `profiles.id`.

---

## §9 Cross-domain registration

Run `/lock-initiative` to register this commitment in `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md`:
- Initiative name: BYOW WhatsApp Revival
- Verdict date: 2026-08-03
- Kill criterion: as in §1

---

## §10 What I won't do without explicit go-ahead (per CLAUDE.md confirmation discipline)

- Triggering Vercel production redeploy
- Adding `WHATSAPP_PERSONAL_*` env vars to Vercel production
- Inserting policy rows in `platform_policies`
- Creating `wa_byow_health_log` table
- ALTER TABLE on `wa_personal_message_logs`
- Updating 4 DB rows in `wa_personal_connections` to point at new Railway URL
- Provisioning the new Railway service (even though Pro plan is paid for)

Each requires your explicit "go".

---

→ **Next: `/myjkkn-api`** to break this spec into atomic build tasks for parallel agent execution.
