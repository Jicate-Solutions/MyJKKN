# MyJKKN Product Overview

> **What:** AI-Agentic ERP platform for JKKN Institutions
> **Philosophy:** "Humans as Principals, AI as Agents"
> **Source of Truth:** See `JKKN-Institutions-Process-Map.md` in JKKNKB vault

---

## What is MyJKKN?

MyJKKN is the software implementation of JKKN's institutional processes. It serves 9 institutions, 10,000+ learners, and 1,000+ staff across the JKKN ecosystem.

**This is NOT a generic ERP.** It embeds JKKN's unique philosophy where learners are active principals who direct AI agents, not passive users who follow instructions.

---

## User Personas

| Persona | JKKN Term | Primary Actions |
|---------|-----------|-----------------|
| Student | **Learner** | View attendance, pay fees, submit applications |
| Faculty | **Senior Learner** | Mark attendance, manage timetables, view learner data |
| Parent | Guardian | Track learner progress, pay fees |
| Admin | Operations | Configure systems, manage users, generate reports |
| Super Admin | Institution Head | Cross-institution oversight, quality metrics |

---

## Module → Process Map Reference

### Core Modules

| MyJKKN Module | Process Map Section | What It Implements |
|---------------|--------------------|--------------------|
| `/admission` | Section 8.2 (Admissions) | Lead to enrollment pipeline |
| `/academic` | Section 6 (Learning Studio) | Timetables, attendance, periods, regulations |
| `/learners` | Section 2.2 (Agency Index) | Learner profiles, documents, analytics |
| `/staff` | Section 9 (Cross-Institution) | Faculty management, allocations |
| `/billing` | Section 8.2 (Finance) | Fees, invoices, receipts, refunds |
| `/grievance` | Section 3.2 (Learners Council) | Issue tracking, resolution workflows |

### Strategic & Quality Modules

| MyJKKN Module | Process Map Section | What It Implements |
|---------------|--------------------|--------------------|
| `/okr` | Section 10 (JKKN100) | Objectives, key results, institutional goals |
| `/process-excellence` | Section 10 (Quality Framework) | TQM, audits, continuous improvement |
| `/maturity-assessment` | Section 10 (JKKN100) | Capability maturity evaluation |
| `/stakeholder-nps` | Section 10.3 (Feedback Ecosystem) | Stakeholder satisfaction tracking |

### Solutions & Innovation Modules

| MyJKKN Module | Process Map Section | What It Implements |
|---------------|--------------------|--------------------|
| `/solutions` | Section 4 (AI Production House) | JKKN Solution Studio offerings |
| `/consultant-portal` | Section 7 (NIF) | External consultant access |
| `/industry` | Section 7.2 (Bioconvergence) | Industry partnership management |
| `/talent` | Section 4.3 (AI Production House) | Learner talent marketplace |

### Portal & Self-Service Modules

| MyJKKN Module | Process Map Section | What It Implements |
|---------------|--------------------|--------------------|
| `/portal/client` | Section 3 (Learners Council) | Learner self-service portal |
| `/parent-portal` | Section 8.4 (Integration) | Parent visibility into learner progress |
| `/application-hub` | Section 8.2 (Applications) | Centralized application management |

### Support Modules

| MyJKKN Module | Purpose |
|---------------|---------|
| `/competency-catalog` | Skills and competency framework |
| `/vac` | Value-Added Courses management |
| `/audit-trail` | System activity logging |
| `/notifications` | Communication center |
| `/users` | User management |
| `/organizations` | Institution hierarchy management |

---

## AI-Agentic Features (Current)

| Feature | Implementation |
|---------|----------------|
| `/ai-query` | Natural language database queries |
| Bug Reporter | AI-assisted issue capture with console/network logs |
| Smart Search | Context-aware search across modules |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React, Tailwind, shadcn/ui |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Deployment | Vercel |
| AI | Claude API for agentic features |

---

## Key Databases

| Database | Purpose | Project ID |
|----------|---------|------------|
| **Production** | Live data (READ ONLY for dev) | `kvizhngldtiuufknvehv` |
| **Staging** | Development and testing | `hhprjbgknupaplivtoib` |

---

## Related Documentation

| Document | Location |
|----------|----------|
| **Technical Setup** | `CLAUDE.md` (project root) |
| **Institutional Context** | `~/Vaults/JKKNKB/JICATE-Solutions/JKKN-Institutions-Process-Map.md` |
| **TQM Specs** | `docs/MyJKKN-TQM-Specs/` |
| **Security Audit** | `docs/security/` |

---

*Created: 2026-02-05*
*Last Updated: 2026-02-05*
