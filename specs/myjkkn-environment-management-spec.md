# MyJKKN Environment Management — Specification

> Generated from /interview on 2026-04-06
> Updated: 2026-04-06 — Revised after reviewing updated ship-myjkkn skill (3-mode: Ship/Sync/DB Sync)
> Problem discovered: pushed migrations to staging DB while production code queried production DB → "column does not exist" for hours

---

## Problem Statement

MyJKKN has two Supabase databases but no systematic way to tell them apart. The local env file named `.env.production.local` points to **staging**. The Vercel production deploy uses a **different** database. When Claude (or any developer) runs migrations, they hit the wrong database. Code deploys to production, queries columns that don't exist there, and the app breaks silently.

**Root cause:** There is no single source of truth for "which database am I talking to?" The `ship-myjkkn` skill's Ship mode handles code but has zero awareness of database changes. Its DB Sync mode (Mode 3) syncs production→staging but doesn't handle the reverse (migrating new schema TO production). Migrations are ad-hoc.

**Impact tonight:** 3+ hours debugging "column does not exist" errors. Multiple PRs, multiple deploys, all targeting the wrong database.

---

## Environment Map

| Environment | Supabase Project Ref | URL | Purpose | Who Uses It |
|-------------|---------------------|-----|---------|-------------|
| **Production** | `kvizhngldtiuufknvehv` | `https://kvizhngldtiuufknvehv.supabase.co` | Live app at jkkn.ai | Vercel production deploys |
| **Staging** | `hhprjbgknupaplivtoib` | `https://hhprjbgknupaplivtoib.supabase.co` | Local dev, testing | `npm run dev`, Claude local, developers |

### Current Confusion Points

| File | Points To | Developer Assumption | Reality |
|------|-----------|---------------------|---------|
| `.env.production.local` | Staging | "production" in the name → must be production | WRONG — it's staging |
| `.env.vercel` | Staging | Pulled from Vercel → must be production | WRONG — pulled from "development" env |
| Vercel production env vars | Production | N/A (never checked locally) | This is the REAL production config |
| `supabase link --project-ref` | Staging | "linked project" = production | WRONG — linked to staging |

---

## What Already Exists (ship-myjkkn skill, updated)

The skill already has:
- **Mode 3 (DB Sync)** with correct project refs (production=`kvizhngldtiuufknvehv`, staging=`hhprjbgknupaplivtoib`)
- Schema extraction from production via Supabase MCP
- Migration generation and application to staging via Management API
- Verification queries after sync

**Gaps in the current skill:**
1. Ship mode has no migration step — ships code without database changes
2. No PostgREST cache reload (`pg_notify`) after any DB operation
3. No `.database.env` file — refs are hardcoded in SKILL.md only
4. No dry-run→production workflow for NEW migrations (DB Sync only goes production→staging, not the other way)

---

## Deliverables

### 1. `.database.env` — Single Source of Truth

Create `/Users/omm/PROJECTS/MyJKKN/.database.env`:

```env
# ============================================================
# MyJKKN Database Environments
# ============================================================
# Production = live app at jkkn.ai (real data, real users)
# Staging = local dev and testing (safe to experiment)
# ============================================================

PRODUCTION_SUPABASE_URL="https://kvizhngldtiuufknvehv.supabase.co"
PRODUCTION_SUPABASE_PROJECT_REF="kvizhngldtiuufknvehv"

STAGING_SUPABASE_URL="https://hhprjbgknupaplivtoib.supabase.co"
STAGING_SUPABASE_PROJECT_REF="hhprjbgknupaplivtoib"
```

Add to `.gitignore` if not already there.

### 2. Fix `.env.production.local` — Add Warning

Prepend warning comment to the existing file:

```env
# ⚠️  WARNING: Despite the filename, this points to STAGING (not production)
# Production env vars are on Vercel only — use `vercel env pull --environment production`
# See .database.env for the authoritative environment map
```

### 3. Extend ship-myjkkn Skill — Add Migration to Ship Mode

Add **Step 2.5: Database Migration** to Ship mode, between Step 2 (Compare) and Step 3 (Translation Check):

```markdown
### 2.5 Database Migration (if applicable)

IF migration files exist for the module being shipped:

**Step 1: Detect migrations**
```bash
# Find new/modified SQL files
git diff --name-only jicate/main -- 'supabase/migrations/' | grep -i '[module]'
# Also check for new migration files not on production
comm -23 <(git ls-files -- 'supabase/migrations/' | sort) \
         <(git ls-tree -r --name-only jicate/main -- 'supabase/migrations/' | sort)
```

**Step 2: Dry-run on staging**
```bash
source .database.env
TOKEN=$(cat ~/.supabase/access-token)
curl -s -X POST "https://api.supabase.com/v1/projects/$STAGING_SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --rawfile sql MIGRATION_FILE '{query: $sql}')"
```
If error → STOP. Show error. Do NOT touch production.

**Step 3: Backup production tables**
For each table being ALTERed or CREATEd, snapshot:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$PRODUCTION_SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT table_name, (SELECT count(*) FROM [table]) as rows FROM information_schema.tables WHERE table_name IN ([affected_tables])"}'
```
Save output to `/tmp/myjkkn-migration-backup-$(date +%s).json`.

**Step 4: Apply to production + reload PostgREST**
```bash
# Apply migration
curl -s -X POST "https://api.supabase.com/v1/projects/$PRODUCTION_SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --rawfile sql MIGRATION_FILE '{query: $sql}')"

# CRITICAL: Reload PostgREST schema cache
curl -s -X POST "https://api.supabase.com/v1/projects/$PRODUCTION_SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT pg_notify('"'"'pgrst'"'"', '"'"'reload schema'"'"')"}'
```

**Step 5: Verify via PostgREST (NOT just SQL)**
```bash
# Test that PostgREST can see the new columns
curl -s "https://kvizhngldtiuufknvehv.supabase.co/rest/v1/[table]?select=[new_column]&limit=1" \
  -H "apikey: SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer SERVICE_ROLE_KEY"
```
If PostgREST returns error → reload schema again, wait 5s, retry once.

**Step 6: Proceed to code shipping (existing Step 3)**

IF no migration files → skip directly to Step 3.
```

**Order rule:** DB migrates first, code ships second. Never the other way around.

### 4. Add PostgREST Reload to DB Sync Mode

In Mode 3 (DB Sync), Step 3 (Apply to Staging), add after each batch:

```sql
SELECT pg_notify('pgrst', 'reload schema')
```

And in Step 4 (Verify), query via PostgREST endpoint (not just `information_schema`) to confirm API visibility.

### 5. Update Project CLAUDE.md

Add a `## Database Environments` section:

```markdown
## Database Environments

| | Production | Staging |
|---|---|---|
| **Ref** | `kvizhngldtiuufknvehv` | `hhprjbgknupaplivtoib` |
| **Used by** | Vercel production (jkkn.ai) | Local dev |

**⚠️ `.env.production.local` points to STAGING despite the name.**

**Rules:**
1. Migrations go to PRODUCTION first (via ship-myjkkn Step 2.5)
2. Always reload PostgREST after migration: `pg_notify('pgrst', 'reload schema')`
3. Source of truth: `.database.env` in project root
4. Type generation: `~/bin/supabase gen types typescript --project-id kvizhngldtiuufknvehv > lib/types/database.ts 2>/dev/null`
```

### 6. Migration Safety: DROP/TRUNCATE Detection

When scanning migration files, check for destructive operations:

```bash
grep -iE "DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM" MIGRATION_FILE
```

If found → STOP and warn: "This migration contains destructive operations. Confirm before proceeding."

---

## Edge Cases

| Scenario | What Happens | Handled By |
|----------|-------------|------------|
| Migration has DROP COLUMN | Skill warns, requires confirmation | Deliverable 6 |
| Migration fails on staging | Skill stops, shows error, doesn't touch production | Step 2.5.2 |
| PostgREST cache doesn't reload | Verification step catches it, retries once | Step 2.5.5 |
| No migration files in module | Ship mode skips Step 2.5 entirely | Detection step |
| `supabase gen types` appends CLI noise | `2>/dev/null` suppresses it | Deliverable 5 |

---

## Out of Scope

- Automated rollback (migrations are additive — ADD COLUMN IF NOT EXISTS)
- CI/CD pipeline (no CI exists for MyJKKN)
- Database branching (Supabase feature, not needed at this team size)
- Data migration (only schema changes, not row copying)

---

## Success Criteria

1. No developer (human or Claude) can accidentally push a migration to the wrong database
2. `ship-myjkkn` Ship mode handles both code AND database changes in one workflow
3. Every migration push is verified via PostgREST (not just SQL)
4. Environment map documented in 4 places: `.database.env`, CLAUDE.md, ship-myjkkn skill, memory
