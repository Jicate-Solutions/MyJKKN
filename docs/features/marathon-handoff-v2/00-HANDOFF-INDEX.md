# KBM Marathon 2.0 — Developer Handoff v2

> **For any developer (human or AI) picking up this module.**
> **Generated:** April 9, 2026 | **Race Day:** April 12, 2026 | **Event Status:** LIVE

## Quick Context

A dual-platform marathon management system for JKKN Institutions' Kumarapalayam Bypass Marathon. Two codebases, one shared database:

| Platform | Repo | What It Does |
|----------|------|-------------|
| **Internal Module** | `Jicate-Solutions/MyJKKN` (main) | Admin command center — dashboard, registrations, committees, budget, Live Ops, results, certificates |
| **Public Site** | `Ommsharravana/kbm-marathon-public` (main) | Participant-facing PWA — registration, GPS race tracker, results, Tamil/English bilingual |

**This handoff covers the Internal Module only.** The public site has a separate architecture issue (see 05-CRITICAL-FIXES.md).

## Current State (Live Data)

| What | Count | Status |
|------|-------|--------|
| Event | 1 | "Kumarapalayam Bypass Marathon - 2026" — **LIVE**, April 12 |
| Categories | 2 | 10 KM Run (Rs.500), 5 KM Run (Rs.300) |
| Registrations | 2 | Real students, BIBs auto-generated |
| Committees | 6 | Real JKKN faculty leads |
| Tasks | 23 | 4 critical, 14 high — due April 10-12 |
| Budget Items | 10 | Rs.6,19,000 total estimated |
| Checkpoints | 7 | Start to Finish with GPS coordinates |
| Sponsors | 0 | None entered |
| Database Tables | 16 | All exist (13 marathon-specific + 3 shared) |
| Pages | 14 | All deployed, all return HTTP 200 |
| Services | 9 + 2 core | All deployed |
| Hooks | 10 | All deployed |
| API Routes | 17 | All deployed |

## Handoff Files

| # | File | What It Covers |
|---|------|---------------|
| 01 | [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | System design, file map, data flow, tech stack |
| 02 | [02-MOBILE-FIRST-SPECS.md](02-MOBILE-FIRST-SPECS.md) | Per-page mobile redesign specs (the main deliverable) |
| 03 | [03-DATABASE-SCHEMAS.md](03-DATABASE-SCHEMAS.md) | All 16 table schemas — live from DB |
| 04 | [04-OPERATIONAL-DATA.md](04-OPERATIONAL-DATA.md) | Current event data, committees, tasks, budget, checkpoints |
| 05 | [05-CRITICAL-FIXES.md](05-CRITICAL-FIXES.md) | Blockers: public site table mismatch, payment, DNS |
| -- | [HOW-TO-USE.md](HOW-TO-USE.md) | Copy-paste prompts for the project owner |

## Priority Order for Developer

1. **Mobile-first responsive** (02-MOBILE-FIRST-SPECS.md) — 95% of usage is on phones
2. **Fix public site table mismatch** (05-CRITICAL-FIXES.md) — registration is broken
3. **Payment integration** (05-CRITICAL-FIXES.md) — currently "pay at venue" workaround
4. **DNS setup** (05-CRITICAL-FIXES.md) — marathon.jkkn.ac.in not pointed
5. **End-to-end testing** — register, track, finish, result, certificate

## Key IDs

| What | ID |
|------|-----|
| Event | `d5e4698b-79d2-4b4a-8c4e-60af2ff14c83` |
| 10 KM Category | `e15be923-bcc7-4516-bb98-166f71ba42f2` |
| 5 KM Category | `aaf17b95-86fe-40fa-91ea-c2c5ad15914a` |
| Institution | `d857873e-0c3e-4449-865c-d0c19ed38d5d` |
| Supabase Project | `hhprjbgknupaplivtoib` |
| Production URL | `https://jkkn.ai/events/marathon` |
| Public Site URL | `https://kbm-marathon-public.vercel.app` |
