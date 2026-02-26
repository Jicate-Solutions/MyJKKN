---
description: Create an IMS-specific agent team. Pass a module name or scenario.
argument-hint: [module-name|review|debug|<describe the IMS task>]
---

You are coordinating an agent team for the **IMS (Inventory Management System)** module of the MyJKKN project.

The user's request is: $ARGUMENTS

## IMS Project Context (share with all teammates)

When spawning teammates, include this context in each teammate's spawn prompt:

```
This is the IMS (Inventory Management System) module of MyJKKN.
Key architecture facts:
- Multi-store model: all IMS tables have store_id (except ims_units which is global)
- Service layer: lib/services/ims/ (11 service files)
- Hooks: hooks/ims/ (10 hook files)
- Types: types/ims/ (9 type files)
- Cart state: Zustand store at lib/stores/ims-cart-store.ts (persisted to localStorage)
- Active store: persisted via Zustand key 'jkkn-ims-active-store'
- Payment methods: cash, gpay, card, upi_qr, mixed
- Receipt channels: Print, PDF (jsPDF), WhatsApp (wa.me), Email (mailto:)
- Sale number format: PREFIX-YYMMDD-XXXX
- Branch: roja (current working branch)
- Tech: Next.js App Router, TypeScript, Supabase, Shadcn/UI, React Query
```

---

## IMS Team Templates

### New IMS Module (e.g., shifts, indents, financial reports)

Spawn 3 teammates:
- **Teammate 1 (Database)**: Migration SQL in `supabase/migrations/`, update `supabase/setup/01_tables.sql`, RLS policies, add to service layer in `lib/services/ims/`
- **Teammate 2 (UI)**: Pages in `app/(routes)/ims/[module]/`, use existing Shadcn/UI patterns from other IMS pages
- **Teammate 3 (Types & Hooks)**: Types in `types/ims/`, React Query hooks in `hooks/ims/`, update `types/ims/index.ts` barrel file

Teammate 1 must define the TypeScript interfaces first and share them via the task list so Teammates 2 and 3 can import them.

### IMS Bug Investigation

Spawn 3–5 investigators, each assigned a hypothesis:
- Common IMS bug areas: Zustand cart state, store_id scoping, stock validation race conditions, React Query cache invalidation, payment modal state
- Have teammates debate and disprove each other's theories
- Check `lib/services/ims/` service files and `hooks/ims/` hook files as primary investigation targets

### IMS Code Review

Spawn 3 reviewers:
- **Security**: RLS policy bypass, store_id injection, payment data exposure
- **Performance**: N+1 queries in service layer, unnecessary cart re-renders, missing React Query staleTime config
- **UX/Edge Cases**: Empty stock handling, mixed payment rounding, receipt generation failures

---

## Instructions

1. Pick the right template based on `$ARGUMENTS`
2. Include the IMS project context block in EVERY teammate's spawn prompt
3. Set up the task list before spawning teammates
4. Remind the user to use **Shift+Down** to cycle between teammates
5. For new modules, always check existing patterns in `app/(routes)/ims/` before implementing

If no argument was given, ask: "Which IMS feature or scenario are you working on?"
