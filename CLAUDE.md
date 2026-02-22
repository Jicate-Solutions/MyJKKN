# MyJKKN OMM — Claude Code Instructions

This file is read automatically by Claude Code at the start of every session on any machine.
Keep it updated as architectural decisions are made.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS, shadcn/ui |
| Database | Supabase (PostgreSQL) with RLS |
| Data fetching | TanStack React Query v5 |
| Package manager | Bun |
| Language | TypeScript |

---

## Project Structure

```
app/(routes)/<module>/     — Page routes per module
components/                — Shared UI components
hooks/<module>/            — React Query hooks per module
lib/services/<module>/     — Static class services (Supabase calls)
lib/supabase/              — Supabase client setup
types/                     — TypeScript types (database.types.ts is generated)
supabase/migrations/       — DB migration files
```

---

## Architecture Patterns

### Data Fetching
- **Hooks pattern**: React Query hooks live in `hooks/<module>/index.ts` and call Supabase directly — no separate service layer for leads
- **Service pattern**: Some modules (admissions, students) use static class services in `lib/services/<module>/`
- Always use `useQuery` / `useMutation` from `@tanstack/react-query` — never fetch in components directly

### Supabase Client
- Browser-side: `createClientSupabaseClient()` from `@/lib/supabase/client`
- Cast as `(supabase as any).from('table')` when TypeScript types don't cover the table
- `types/database.types.ts` is generated and may not include all tables — cast when missing

### Components
- Use shadcn/ui primitives (`Card`, `Dialog`, `Select`, `Button`, etc.)
- `react-hot-toast` for success/error notifications
- Never use `alert()` or browser dialogs — use toast or Dialog components

---

## RLS / Security Architecture (CRITICAL)

### Golden Rule: `user_institution_access` is BILLING-ONLY

> **NEVER** reference `user_institution_access` in RLS policies outside of `billing_*` tables.
> This table has very few rows — it will silently block most users if used elsewhere.

### Standard Institution Check for RLS

Always use **one of these two patterns**:

```sql
-- Option A: Helper function (preferred for readability)
USING (institution_id = auth_institution_id())

-- Option B: Inline subquery
USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()))
```

### `auth_institution_id()` DB Function

Exists in the database as a `STABLE SECURITY INVOKER` SQL function:
```sql
CREATE OR REPLACE FUNCTION auth_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT institution_id FROM profiles WHERE id = auth.uid() LIMIT 1
$$;
```
Use this in all new RLS policies.

### New Table RLS Template

```sql
-- SELECT / INSERT / UPDATE / DELETE — all use auth_institution_id()
CREATE POLICY "institution_access" ON your_table
  FOR ALL
  USING (institution_id = auth_institution_id())
  WITH CHECK (institution_id = auth_institution_id());
```

### Billing Tables (DO NOT CHANGE)
These may still reference `user_institution_access` — leave them alone:
- `billing_copq_incidents`
- `billing_invoices`
- `billing_receipts`
- `billing_student_bills`

---

## Admission Module

### Key Tables

| Table | Purpose |
|---|---|
| `admission_leads` | Main leads table with RLS |
| `admission_lead_activities` | Timeline/activity log per lead |
| `admission_lead_stage_history` | Stage change audit trail |
| `admission_workflow_configs` | Institution workflow configurations |
| `admission_sms_logs` | SMS send history |
| `admission_whatsapp_logs` | WhatsApp send history |

### Column Mapping (admission_leads)
- DB `source` → UI `first_touch_source`
- DB `funnel_stage` (text, flexible) → UI `stage` — use `funnel_stage`, not `stage` (enum)
- `score_category`: auto-computed by DB trigger — **do not set manually**

### Score Category (auto-computed by DB trigger)
The trigger `sync_lead_score_category` fires on `score` or `is_hot_lead` changes:
- `is_hot_lead = true` → always `'hot'` (overrides score)
- `score >= 70` → `'hot'`
- `score >= 40` → `'warm'`
- `score >= 1` → `'cold'`
- `score = 0` or `null` → `null`

### admission_lead_activities Schema Constraints
- `title`: NOT NULL — always provide a string, never `null`
- `metadata`: NOT NULL — always pass `{}`, never `null` (even if no metadata)

### RLS INSERT Policy (admission_leads)
Allows: `admin`, `super_admin`, `staff`, `institution_admin`, `administrator` roles + active education consultants

### Placeholder Hooks
Many hooks are TODO stubs — check before using:
- `hooks/admission/` — applications, communication, analytics, dashboard hooks may be placeholders

---

## Known Pre-existing Build Errors

Do not attempt to fix these unless explicitly asked — they pre-exist and are tracked:

- `app/api/stakeholder-nps/surveys/route.ts`: Import name mismatch
  - `createNPSSurveySchema` should be `createSurveySchema`
  - `npsSurveyFiltersSchema` should be `surveyFiltersSchema`

---

## Coding Conventions

- TypeScript strict mode — avoid `any` except for Supabase cast workarounds
- Prefer editing existing files over creating new ones
- Keep components focused — extract to `_components/` subfolder within the route
- Never commit secrets or `.env` values
- Use `bun` for package management, not `npm` or `yarn`
- Format: 2-space indent, single quotes, no semicolons optional (follow existing file style)
