# Exotel Integration — Developer Quick Start

## What This Is

Complete Exotel telephony (voice calls) and SMS integration for MyJKKN Admission CRM. Code is **already built and tested** on `omm-dev`. Your job is to set it up on production.

## Time Estimate

~1.5 hours total (DB: 15min, Code: 30min, Env: 15min, Exotel Config: 10min, Testing: 15min)

## Pre-requisites

- [ ] Access to Exotel Dashboard (get from admin)
- [ ] Access to Vercel production project (MyJKKN)
- [ ] Access to Supabase production database

## Quick Start

1. **Read** `04-MIGRATION-GUIDE.md` — step-by-step instructions
2. **Run SQL** from `03-DATABASE-SCHEMAS.md` on production DB
3. **Merge code** from `omm-dev` branch
4. **Set env vars** in Vercel (listed in migration guide)
5. **Configure webhooks** in Exotel dashboard
6. **Test** — make a call, send an SMS

## File Inventory

| File | What It Covers |
|------|---------------|
| `00-HANDOFF-INDEX.md` | This file — quick start |
| `01-ARCHITECTURE.md` | How calls/SMS flow through the system |
| `03-DATABASE-SCHEMAS.md` | SQL to run on production |
| `04-MIGRATION-GUIDE.md` | Step-by-step setup with exact commands |
| `../exotel-setup-spec.md` | Master spec with decisions + blockers |

## Key Contacts

| Role | Responsibility |
|------|---------------|
| Omm (Product Owner) | Decisions, scope questions |
| Admin/Operations | Exotel account credentials, DLT compliance |
