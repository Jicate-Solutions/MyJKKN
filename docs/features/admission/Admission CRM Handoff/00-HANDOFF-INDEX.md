# Admission CRM — Developer Handoff (AI Agent)

> **Generated**: 2026-03-27 | **Branch**: `omm-dev` | **Primary Task**: B2A Migration
> **Target**: AI Coding Agent (Claude Code / Cursor)

## Quick Start

```bash
git checkout omm-dev
npm install
npm run dev  # http://localhost:3000
# Login: test-superadmin@jkkn.local / SuperAdmin@123
# Navigate: /admission/dashboard
```

## START HERE

**Read this file FIRST:** [`../admission-crm-b2a-migration-spec.md`](../admission-crm-b2a-migration-spec.md) — Complete spec with all decisions, blockers, and execution order.

## Handoff Files

| File | What It Contains | Read When |
|------|-----------------|-----------|
| [../admission-crm-b2a-migration-spec.md](../admission-crm-b2a-migration-spec.md) | **MASTER SPEC** — decisions, 35 missing tables, execution phases, templates | **READ FIRST** |
| [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) | Current vs Target architecture, auth patterns, file conventions | **Understand the system** |
| [02-SUBMODULE-SPECS.md](./02-SUBMODULE-SPECS.md) | All 42 sub-modules: flow, status, files, what to build | **Before working on any module** |
| [03-DATABASE-SCHEMAS.md](./03-DATABASE-SCHEMAS.md) | Live schemas from staging DB (32 tables, 574 cols, 73 FKs) | **When writing services or API routes** |
| [04-B2A-MIGRATION-GUIDE.md](./04-B2A-MIGRATION-GUIDE.md) | Step-by-step migration per module with code templates | **THE MAIN TASK — follow this** |
| [05-MODULE-CONNECTIONS.md](./05-MODULE-CONNECTIONS.md) | Table relationships, shared services, cross-module deps | **When a change might affect other modules** |

## CRITICAL BLOCKER: 35 Missing DB Tables

Services reference 35 tables that DON'T EXIST in staging. **Create these BEFORE migrating the corresponding modules.** Full list in the master spec.

## Current State Summary

| Metric | Count |
|--------|-------|
| Sub-modules | 42 |
| Pages | 97 |
| Services | 49 |
| Hooks | 64 |
| API Routes (existing) | 59 |
| API Routes (needed) | ~28 new route files |
| DB Tables | 32 |
| DB Columns | 574 |
| Foreign Keys | 73 |

## Architecture Gap (Why This Work Exists)

```
CURRENT (most modules):
  Page → Hook → Service.method() → Supabase
  ❌ No auth middleware, no API boundary, not B2A-ready

TARGET (B2A Pattern A):
  Page → Hook → fetch('/api/admission/...') → withAuth() → Service → Supabase (RLS)
  ✅ Auth enforced, API boundary, external consumers ready
```

**Zero admission routes currently use `withAuth`**. They use the older `getAuthUser` pattern.

## Priority Order

1. **P0** — Dashboard, Leads, Applications, Counselors (core CRM)
2. **P1** — Workflows, Assignment Rules, Scoring Rules, Templates, Analytics, Apply
3. **P2** — Everything else (data quality, enrollment, settings, selection)
4. **P3** — AI features (chatbot, insights, voice, remarketing)

## Environment

| Key | Value |
|-----|-------|
| Supabase Project | `hhprjbgknupaplivtoib` (STAGING) |
| Supabase URL | `https://hhprjbgknupaplivtoib.supabase.co` |
| Branch | `omm-dev` |
| Test User | `test-superadmin@jkkn.local` / `SuperAdmin@123` |
| Test Institution | `a1111111-1111-1111-1111-111111111111` |
| Node | 18+ |
| Framework | Next.js 15 (App Router) |

## Rules

1. **NEVER create SQL files** — tables already exist in staging DB
2. **NEVER use Supabase MCP `execute_sql`** — it targets production, not staging
3. **Use `withAuth` pattern** from Solutions Hub (not `getAuthUser`)
4. **Use `lib/api/response.ts` helpers** for consistent response envelopes
5. **Use `lib/api/client.ts`** when updating hooks to call API routes
6. **Add `OPTIONS` handler** to every new route (CORS)
7. **Test with both session and super_admin** — super_admin passes `undefined` institutionId
8. **One module at a time** — complete the full vertical (route → hook update → test)
