# Config-Table Pattern — MyJKKN's Zero-Deploy Tunables Standard

**Locked:** 2026-04-29 by Director directive after Spec #537 (counselor rules-engine) demonstrated the model end-to-end on prod.

**Authority:** This file is the team-visible, version-controlled snapshot of the standing architectural rule. The editable source-of-truth lives in the chain-orchestrator skill at `~/.claude/skills/myjkkn-chain/references/config-table-pattern.md` (Director's local Claude Code config); when that source updates, this snapshot is re-copied via PR. Read this file when designing any threshold, mapping, flag, schedule, or routing rule for a new module.

---

## The directive in one sentence

Every threshold, mapping, flag, schedule, or routing rule that a super-admin might tweak — even once — gets a **database row**, a **SQL function that reads it at runtime**, and a **super-admin UI to edit it**. Zero deploys, zero PRs, zero developer round-trips for tweaks.

---

## When the pattern applies (DOES go in config tables)

| Item | Example |
|------|---------|
| Thresholds | "stale lead = >30 days no contact" |
| Mappings | "category 'urgent' → digest section 'priority'" |
| Schedules | cron expression for a triage routine |
| Feature flags | "enable real-time attendance dashboard" |
| Routing rules | "leads from program X auto-assign to counselor Y" |
| Notification rules | "fire digest when stale-lead-count > N" |
| Display preferences | "Director's digest shows top 5 vs top 10" |
| Permission overrides for non-developer roles | "block module X for role Y" |
| Retention windows | "auto-archive duty_log rows older than 90 days" |

## When the pattern does NOT apply (hardcode is correct)

| Item | Why hardcode |
|------|--------------|
| Database schema (DDL) | Structural, not policy |
| Algorithm logic / control flow | Code, not data |
| API route shapes / response envelopes | Contract, not policy |
| Authentication mechanism | Security boundary, not tunable |
| Hard-coded UUIDs of system rows | Foreign keys, not config |
| Magic constants in pure-math functions | E.g., π, e — they don't change |

---

## Hybrid table strategy

Each module gets its **own typed config table** (so columns can be FKs, integers, enums) — but **all config tables inherit a shared mixin** so the audit log, RLS, UI generator, and rollback story are consistent across modules.

### Shared mixin (paste into every config table verbatim)

```sql
-- Common columns (paste verbatim into every per-module config table)
id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
config_key    TEXT NOT NULL,                  -- machine-readable key (e.g. 'stale_lead_days')
display_name  TEXT NOT NULL,                  -- shown in super-admin UI
description   TEXT,                            -- tooltip beside the field
is_active     BOOLEAN NOT NULL DEFAULT true,  -- soft-disable without deletion
created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_by    UUID REFERENCES profiles(id),
change_reason TEXT                              -- super-admin types why (audit trail)
```

### Per-module typed columns (the part that varies)

```sql
-- Example: counselor_rules (Spec #537 — the canonical implementation)
threshold_minutes  INTEGER NOT NULL,
target_role        TEXT NOT NULL,
applies_to_program UUID REFERENCES programs(id),  -- typed FKs, not stringly-typed JSON!
priority           INTEGER NOT NULL DEFAULT 0,
```

### Required indices

```sql
-- One active row per (key, scope) at a time; history rows kept with is_active=false
CREATE UNIQUE INDEX <module>_config_active_unique
  ON <module>_config(config_key /*, scope_cols */)
  WHERE is_active = true;
```

### Required RLS

```sql
ALTER TABLE <module>_config ENABLE ROW LEVEL SECURITY;

-- READ: any authenticated user (so service-layer SELECTs work for evaluators)
CREATE POLICY "<module>_config_read" ON <module>_config
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- WRITE: super_admin only (uses the canonical helper from 02_functions.sql)
CREATE POLICY "<module>_config_write" ON <module>_config
  FOR ALL USING (is_super_admin())
  WITH CHECK (is_super_admin());
```

For finer-grained access (e.g., "module owner can edit their own module's config"), use `user_has_permission('system.config.<module>.edit')` in addition to or instead of `is_super_admin()`.

### Required audit log (one row per change, separate table)

```sql
CREATE TABLE <module>_config_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     UUID NOT NULL REFERENCES <module>_config(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by    UUID REFERENCES profiles(id),
  old_value     JSONB,                  -- whole row snapshot before
  new_value     JSONB,                  -- whole row snapshot after
  change_reason TEXT
);

CREATE OR REPLACE FUNCTION fn_<module>_config_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO <module>_config_audit (config_id, changed_by, old_value, new_value, change_reason)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.change_reason);
  RETURN NEW;
END $$;

CREATE TRIGGER <module>_config_audit_trg
  AFTER UPDATE ON <module>_config
  FOR EACH ROW EXECUTE FUNCTION fn_<module>_config_audit();
```

### Required cache invalidation

For **hot-read** configs (queried on every request / notification / cron tick):

```sql
-- After UPDATE, NOTIFY listeners
CREATE OR REPLACE FUNCTION fn_<module>_config_notify() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('<module>_config_changed', NEW.config_key);
  RETURN NEW;
END $$;

CREATE TRIGGER <module>_config_notify_trg
  AFTER INSERT OR UPDATE ON <module>_config
  FOR EACH ROW EXECUTE FUNCTION fn_<module>_config_notify();
```

The Next.js service layer subscribes via Supabase Realtime; React Query invalidates on receipt. For **warm-read** configs (read once per page load), `STABLE_DATA` cache (5 min) is fine without pg_notify. For **cold-read** configs (read at job-start only), no cache layer needed.

---

## SQL evaluator pattern (functions read config at runtime)

```sql
CREATE OR REPLACE FUNCTION fn_<module>_evaluate(input_args)
RETURNS <result>
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold INTEGER;
BEGIN
  -- READ config at runtime — NOT a hardcoded constant
  SELECT (SELECT threshold_minutes FROM <module>_config
          WHERE config_key = 'staleness_threshold' AND is_active = true)
    INTO v_threshold;

  -- Defensive default if config row is missing/disabled
  IF v_threshold IS NULL THEN
    RAISE WARNING 'Missing config: staleness_threshold (table: <module>_config)';
    v_threshold := 30; -- documented fallback; surfaces config gap to logs
  END IF;

  -- Use it
  IF input_age > v_threshold THEN
    RETURN 'stale';
  END IF;
  RETURN 'fresh';
END;
$$;
```

**Key rule:** SQL functions never embed the threshold value as a literal. Even the seed migration that inserts the default value is allowed to repeat the literal — but the function reads it from the table.

---

## Service-layer accessor pattern

```typescript
// lib/services/<module>/<module>-config-service.ts

export async function getModuleConfig<T = Record<string, unknown>>(
  key: string
): Promise<T> {
  const { data, error } = await supabase
    .from('<module>_config')
    .select('*')
    .eq('config_key', key)
    .eq('is_active', true)
    .single();
  if (error) throw error;
  return data as T;
}

// React Query hook with realtime invalidation
export function useModuleConfig<T = Record<string, unknown>>(key: string) {
  const queryClient = useQueryClient();

  // Subscribe to pg_notify channel for hot-read configs
  useEffect(() => {
    const channel = supabase.channel('<module>_config_changed')
      .on('broadcast', { event: 'config_changed' }, (payload) => {
        if (payload.config_key === key) {
          queryClient.invalidateQueries({ queryKey: ['<module>-config', key] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [key, queryClient]);

  return useQuery({
    queryKey: ['<module>-config', key],
    queryFn: () => getModuleConfig<T>(key),
    ...QUERY_CONFIG.STABLE_DATA, // 5 min cache; pg_notify forces earlier invalidation
  });
}
```

---

## Super-admin UI scaffolding

For each per-module config table, generate a route at:

```
app/(routes)/admin/config/<module>/page.tsx
```

Render rows from the table using a shared component (built once, reused everywhere):

```
components/admin/config-row-editor.tsx
```

This component renders:
- `display_name` (read-only label)
- `description` (info-icon tooltip)
- Typed editable fields per row (auto-derived from column types)
- Save button that **prompts for `change_reason`** before writing
- "View history" link to the audit-log row stream

Permission gate: the route is gated by `system.config.<module>.edit` (added to PERMISSION_CATEGORIES) plus `is_super_admin()` at the RLS layer.

---

## Default-seeding rule

Every config table migration MUST seed default rows in the same migration:

```sql
INSERT INTO <module>_config (config_key, display_name, description, threshold_minutes, change_reason)
VALUES
  ('staleness_threshold', 'Staleness threshold (minutes)',
   'Lead is marked stale after this many minutes of no contact.',
   30, 'Initial seed from Spec #537'),
  ...
ON CONFLICT (config_key) WHERE is_active = true DO NOTHING;
```

If the seed is missing, the SQL evaluator function falls back to its documented default and emits a `RAISE WARNING` — visible in Postgres logs and Supabase advisors. That's the canary signal a config gap was shipped.

---

## Canonical implementation: Spec #537 counselor rules-engine

(2026-04-28, prod, attribution running). Use these as the template — don't reinvent:

| Layer | File |
|-------|------|
| DDL | `supabase/setup/01_tables.sql` — search for `counselor_rules` |
| Audit | `supabase/setup/01_tables.sql` — search for `counselor_rules_audit` |
| Functions | `supabase/setup/02_functions.sql` — search for `fn_counselor_evaluate` |
| RLS | `supabase/setup/03_policies.sql` — search for `counselor_rules` |
| Triggers | `supabase/setup/04_triggers.sql` — search for `counselor_rules_*_trg` |
| Service | `lib/services/counselor/counselor-rules-service.ts` |
| Hook | `hooks/counselor/use-counselor-rules.ts` |
| UI route | `app/(routes)/admin/counselor/rules/page.tsx` |
| UI components | `components/admin/counselor-rule-editor.tsx` (or shared `config-row-editor.tsx` if extracted) |

**If you're building a new module that needs the config-table pattern, copy from these files first, then adapt.**

---

## Anti-patterns (what to grep for during code review)

These are the smells that say "this should be in a config table":

```bash
# Hardcoded thresholds in TypeScript services
grep -rE "(if|while|for).*[<>=]\s*\d{2,}" --include="*.ts" lib/services/ | grep -v "test\|spec"

# Hardcoded thresholds in SQL functions
grep -rE "[<>]\s*[0-9]+\s*(minutes|days|hours|seconds|months)" supabase/setup/02_functions.sql

# Hardcoded role lists in services (should reference custom_roles + user_has_permission)
grep -rE "role\s*===\s*'(super_admin|admin|admission|counselor|hod|faculty)'" --include="*.ts" lib/

# Magic numbers for cron-like schedules
grep -rE "every \d+ (hour|day|minute)|0 \d+ \* \* \*" --include="*.ts" --include="*.sql"

# Cluster category mappings hardcoded in TS
grep -rE "if\s*\(.*category\s*===\s*'.*'\)\s*\{.*=" --include="*.ts" lib/
```

A cleanly-built module passes all these greps with zero non-test matches.

---

## Migration path for existing hardcoded values

When a module ships, retroactively migrating a hardcoded value to config-table is a 1-PR job:

1. Create the per-module config table + audit + RLS + trigger + UI route
2. Insert the current hardcoded value as the seed
3. Update the SQL function / service to read from the table
4. Remove the literal from code
5. Verify via the anti-pattern greps

A "this should have been config" finding from `silent-failure-auditor` triggers this PR. Don't bundle it with feature work — keep it isolated for clean rollback.
