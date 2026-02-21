# Solutions Hub: Pipeline ↔ Client Improvements Spec

**Source:** FST Analysis — Pipeline vs Clients (2026-02-21)
**Status:** Draft
**Priority Order:** P0 (quick wins) → P1 (high leverage) → P2 (structural) → P3 (future)

---

## Overview

The FST analysis revealed 8 concrete improvements across the Pipeline↔Client lifecycle. This spec defines each one with acceptance criteria, implementation details, and estimated scope.

**Current state summary:**
- Pipeline has 10 components, full Kanban board, analytics page, activity timeline, overdue detection
- Client detail page shows contact info, partner details, and linked solutions
- DB trigger auto-creates client on prospect won, links via `converted_client_id`
- NO prospect history visible on client page
- NO re-engagement system for lost/dormant prospects
- NO "Opportunities" concept for repeat business from existing clients
- Overdue follow-up detection EXISTS but has no notification/automation layer

---

## P0: Quick Wins (UI-only, no backend changes)

### P0-1: Show Prospect Origin on Client Detail Page

**Problem:** When a client was auto-created from a won prospect, the client detail page shows no history of the sales journey. Users lose context about deal size, how long the sales cycle was, and who managed it.

**What to build:**
- On `/solutions/clients/[id]/page.tsx`, add a "Prospect Origin" banner/card
- Query: reverse-lookup `sh_prospects` where `converted_client_id = client.id`
- If a matching prospect exists, show:
  - Prospect code (linked to `/solutions/pipeline/[prospect_id]`)
  - Date entered pipeline (`created_at`)
  - Date converted (`updated_at` when stage became 'won')
  - Days in pipeline (calculated)
  - Original expected deal size
  - Solution type of interest
  - Source type
  - Assigned sales person

**Where to implement:**
- New component: `components/solutions/clients/prospect-origin-card.tsx`
- New service method: `prospects-service.ts` → `getProspectByClientId(clientId: string)`
  - Query: `sh_prospects.select('*').eq('converted_client_id', clientId).single()`
- Add to client detail page: `app/(routes)/solutions/clients/[id]/page.tsx` after the Contact Information card (around line 232)

**Acceptance criteria:**
- [ ] Client converted from prospect → shows blue info banner with prospect journey details
- [ ] Client created directly (no prospect) → banner not shown
- [ ] Prospect code is clickable and navigates to prospect detail page
- [ ] Days in pipeline calculated as `won_date - created_at`

---

### P0-2: Distinguish Converted vs Direct-Created Clients

**Problem:** No visual way to tell which clients came through Pipeline (tracked sales journey) vs which were created directly. Analytics can't measure pipeline effectiveness.

**What to build:**
- Add a small badge/tag on client cards and client detail page:
  - "From Pipeline" (with link icon) — if a prospect with `converted_client_id` pointing to this client exists
  - "Direct" (with plus icon) — if no matching prospect found
- Add a filter on the clients list page: "Source: All | From Pipeline | Direct"

**Where to implement:**
- Client card: `components/solutions/clients/client-card.tsx` — add badge next to partner badge
- Client list page: `app/(routes)/solutions/clients/page.tsx` — add filter dropdown
- Service: `clients-service.ts` → extend `getClients()` to optionally join `sh_prospects` on `converted_client_id`
  - OR: add a computed field by checking if any prospect has `converted_client_id = client.id`

**Acceptance criteria:**
- [ ] Every client card shows "Pipeline" or "Direct" badge
- [ ] Filter works to show only pipeline-converted or only direct-created clients
- [ ] Client detail page shows the badge in the header area

---

### P0-3: Copy More Fields in Won→Client Trigger

**Problem:** The DB trigger (`sh_prospect_won_to_client`) copies name, contact person, email, phone, source_type, tags — but drops `expected_deal_size`, `solution_type_interest`, and `notes`. The new client loses context.

**What to build:**
- Update the trigger function to copy additional fields:
  - `notes` → Append prospect notes after the "Auto-created from prospect" line
  - `solution_type_interest` → Store in client `tags` array (e.g., add 'interest:training')
  - `expected_deal_size` → Store in client `notes` (e.g., "Expected deal size: ₹5,00,000")
- Add `industry_sector` field to prospect form (currently only on client) so it can carry forward

**Where to implement:**
- New migration: `supabase/migrations/YYYYMMDDHHMMSS_improve_prospect_to_client_trigger.sql`
- Update trigger function `sh_prospect_won_to_client()` to include additional INSERT fields

**Migration SQL outline:**
```sql
CREATE OR REPLACE FUNCTION public.sh_prospect_won_to_client()
RETURNS TRIGGER AS $$
DECLARE
    new_client_id UUID;
    prospect_notes TEXT;
BEGIN
    IF NEW.pipeline_stage = 'won'
       AND (OLD.pipeline_stage IS DISTINCT FROM 'won')
       AND NEW.converted_client_id IS NULL
    THEN
        -- Build enriched notes
        prospect_notes := 'Auto-created from prospect: ' || NEW.prospect_code;
        IF NEW.expected_deal_size IS NOT NULL THEN
            prospect_notes := prospect_notes || E'\nExpected deal size: ₹' || NEW.expected_deal_size::TEXT;
        END IF;
        IF NEW.notes IS NOT NULL THEN
            prospect_notes := prospect_notes || E'\n\nProspect notes:\n' || NEW.notes;
        END IF;

        INSERT INTO sh_clients (
            name, contact_person, contact_email, contact_phone,
            source_type, partner_status, notes, tags, is_active, created_by
        ) VALUES (
            NEW.company_name, NEW.contact_person, NEW.contact_email, NEW.contact_phone,
            NEW.source_type, 'standard', prospect_notes, NEW.tags, true, NEW.created_by
        )
        RETURNING id INTO new_client_id;

        NEW.converted_client_id := new_client_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Acceptance criteria:**
- [ ] New clients created from won prospects include deal size and notes from the prospect
- [ ] Existing trigger behavior unchanged (still auto-creates, still links via converted_client_id)
- [ ] No data loss — all previously copied fields still copied

---

## P1: High Leverage (Backend + UI)

### P1-1: Dormant/Lost Prospect Re-engagement System

**Problem:** When a prospect is marked "lost" or "dormant", it's a dead end. No scheduled re-check, no reminder to try again. Many B2B deals need 2-3 attempts over months.

**What to build:**

**Phase A — Re-engagement scheduling:**
- When moving a prospect to "dormant", show a dialog asking: "When should we revisit?" with options: 30 days, 60 days, 90 days, custom date
- Store as `reopen_date` field on `sh_prospects`
- When moving to "lost", similar dialog: "Schedule re-engagement?" with same date options (optional — can skip)

**Phase B — Re-engagement alerts:**
- On the Pipeline main page (`/solutions/pipeline`), add a new section/tab: "Ready to Re-engage"
- Shows all dormant/lost prospects where `reopen_date <= today`
- Each card has two actions: "Reactivate" (moves back to 'lead' stage) and "Dismiss" (clears reopen_date)

**Phase C — Overdue re-engagement count in stats:**
- Add to `getProspectStats()`: `readyToReengage` count
- Show in `pipeline-stats.tsx` as a new card: "Ready to Re-engage" (with refresh icon)

**Where to implement:**

| Change | File |
|--------|------|
| Add `reopen_date` column | New migration on `sh_prospects` |
| Dormant dialog | New component: `components/solutions/pipeline/reopen-date-dialog.tsx` |
| Re-engage section | `app/(routes)/solutions/pipeline/page.tsx` — new tab or section |
| Reactivate action | `prospects-service.ts` → new method `reactivateProspect(id)` — sets stage to 'lead', clears lost_reason, updates is_active |
| Stats update | `prospects-service.ts` → `getProspectStats()` add reopen_date query |
| Stats display | `components/solutions/pipeline/pipeline-stats.tsx` — new card |

**Database migration:**
```sql
ALTER TABLE sh_prospects ADD COLUMN reopen_date DATE;
COMMENT ON COLUMN sh_prospects.reopen_date IS 'Date to revisit dormant/lost prospects for re-engagement';
CREATE INDEX idx_sh_prospects_reopen ON sh_prospects(reopen_date) WHERE reopen_date IS NOT NULL AND pipeline_stage IN ('dormant', 'lost');
```

**Acceptance criteria:**
- [ ] Moving to dormant shows date picker dialog → stores reopen_date
- [ ] Moving to lost optionally shows date picker dialog
- [ ] Pipeline page shows "Ready to Re-engage" section with prospects whose reopen_date has passed
- [ ] "Reactivate" button moves prospect back to lead stage and clears lost_reason/reopen_date
- [ ] Pipeline stats show re-engagement count
- [ ] Prospects without reopen_date behave exactly as before (no breaking changes)

---

### P1-2: Pipeline Analytics → Client Strategy Insights

**Problem:** Pipeline analytics (win rate, source breakdown, funnel) don't connect to client outcomes. No way to know which source types produce the best long-term clients.

**What to build:**
- New analytics section on `/solutions/pipeline/analytics`: "Source-to-Success"
- Cross-reference `sh_prospects.source_type` with `sh_clients.partner_status` and solution count
- Show:
  - **Conversion by source**: Which source types (alumni, referral, direct, yi) have the highest win rate?
  - **Value by source**: Average deal size by source type (from prospect data)
  - **Client quality by source**: For converted clients, how many solutions/referrals do they generate? (cross-query sh_clients + sh_solutions)

**Where to implement:**
- New service method: `prospects-service.ts` → `getSourceConversionAnalytics()`
  - Queries sh_prospects grouped by source_type, counts won/lost/total, avg deal size
  - For won prospects with converted_client_id, joins to sh_clients to get solution count and referral_count
- New chart component: `components/solutions/pipeline/source-success-chart.tsx`
- Add to analytics page: `app/(routes)/solutions/pipeline/analytics/page.tsx`

**Acceptance criteria:**
- [ ] New "Source-to-Success" section appears below existing analytics charts
- [ ] Bar chart shows conversion rate per source type
- [ ] Table shows: source → total prospects, won, win rate, avg deal size, avg solutions per client, avg referrals
- [ ] Data updates in real-time (uses same TanStack Query pattern)

---

## P2: Structural Changes (Architecture-level)

### P2-1: Opportunities for Repeat Business

**Problem:** Pipeline assumes NEW companies. When an existing client wants a second solution, either: (a) they skip Pipeline entirely and create a solution directly — losing sales visibility, or (b) someone creates a duplicate prospect for the same company — losing client history.

**What to build:**

A lightweight "Opportunity" concept that can attach to an existing client OR live independently as a new prospect.

**Option A — Extend Prospects (Recommended):**
- Add optional `existing_client_id` field to `sh_prospects`
- When creating a new prospect, offer: "Is this for an existing client?" → client picker
- If yes, link the prospect to the client via `existing_client_id`
- Prospect still goes through the pipeline (lead → won), but when it reaches 'won':
  - If `existing_client_id` is set: don't create a new client, just set `converted_client_id = existing_client_id`
  - If not set: existing trigger creates new client (current behavior)

**Why Option A:** Minimal schema change (one new column + one trigger update). The prospect pipeline UI, Kanban board, analytics — all work unchanged. It just adds the ability to associate a deal with a known client.

**Option B — Separate Opportunities Table (More complex, future consideration):**
- New table `sh_opportunities` with `client_id`, `opportunity_type`, `pipeline_stage`, deal tracking
- Full CRUD like prospects but always tied to a client
- New Kanban board for opportunities
- More work, but cleaner separation

**Recommended approach:** Start with Option A. Evaluate after 6 months of usage data.

**Where to implement (Option A):**

| Change | File |
|--------|------|
| Add `existing_client_id` column | New migration on `sh_prospects` |
| Update trigger | Modify `sh_prospect_won_to_client()` to check `existing_client_id` |
| Prospect form | `components/solutions/pipeline/prospect-form.tsx` — add client search/select |
| Prospect card | Show "Repeat: [Client Name]" badge if existing_client_id set |
| Prospect detail | Show linked client info in Pipeline Details card |

**Database migration:**
```sql
ALTER TABLE sh_prospects
ADD COLUMN existing_client_id UUID REFERENCES public.sh_clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN sh_prospects.existing_client_id
IS 'Links prospect to existing client for repeat business opportunities';

-- Update trigger to skip client creation if existing client linked
CREATE OR REPLACE FUNCTION public.sh_prospect_won_to_client()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pipeline_stage = 'won'
       AND (OLD.pipeline_stage IS DISTINCT FROM 'won')
       AND NEW.converted_client_id IS NULL
    THEN
        IF NEW.existing_client_id IS NOT NULL THEN
            -- Repeat business: link to existing client, don't create new
            NEW.converted_client_id := NEW.existing_client_id;
        ELSE
            -- New business: create client (existing logic)
            INSERT INTO sh_clients (...) VALUES (...)
            RETURNING id INTO new_client_id;
            NEW.converted_client_id := new_client_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Acceptance criteria:**
- [ ] "New Prospect" form has optional "Existing Client" dropdown (searchable)
- [ ] If existing client selected, prospect card shows "Repeat: [Client Name]" badge
- [ ] When repeat prospect reaches 'won': no new client created, links to existing client
- [ ] When new prospect reaches 'won': current behavior unchanged (auto-create client)
- [ ] Client detail page shows ALL linked prospects (both converted and repeat)
- [ ] Pipeline analytics count repeat vs new business separately

---

### P2-2: Multi-Solution Interest Tracking

**Problem:** `solution_type_interest` on prospects is a single field (`SolutionType = 'software' | 'training' | 'content'`). If a prospect is interested in both Training AND Content, you lose that nuance — either pick one or create two prospects.

**What to build:**
- Change `solution_type_interest` from single value to array: `solution_types_interest SolutionType[]`
- Update prospect form to use multi-select checkboxes instead of single dropdown
- Update prospect card to show multiple solution type badges
- Update pipeline analytics "by solution type" to handle array values

**Where to implement:**

| Change | File |
|--------|------|
| Column migration | New migration: ALTER COLUMN or add new array column |
| Type definition | `types.ts` — change `solution_type_interest?: SolutionType` to `solution_types_interest?: SolutionType[]` |
| Service | `prospects-service.ts` — update create/update to handle array |
| Form | `prospect-form.tsx` — multi-select checkboxes |
| Card | `prospect-card.tsx` — show multiple solution badges |
| Analytics | `pipeline/analytics` — count each type in array |

**Migration approach (non-breaking):**
```sql
-- Add new array column
ALTER TABLE sh_prospects
ADD COLUMN solution_types_interest TEXT[] DEFAULT '{}';

-- Migrate existing data
UPDATE sh_prospects
SET solution_types_interest = ARRAY[solution_type_interest]
WHERE solution_type_interest IS NOT NULL;

-- Keep old column for now (deprecate later)
```

**Acceptance criteria:**
- [ ] Prospect form shows checkboxes for Software, Training, Content (multi-select)
- [ ] Prospect card shows multiple solution type badges
- [ ] Existing single-value data migrated to array format
- [ ] Analytics handle array counting correctly (one prospect interested in 2 types counts in both)

---

## P3: Future Considerations

### P3-1: Automated Follow-up Notifications

**Current state:** Overdue detection EXISTS in UI (red badges, overdue count in stats). But there are no push notifications, emails, or automated reminders.

**Future scope:**
- Daily cron job (Supabase Edge Function or external scheduler) that:
  - Finds prospects where `next_action_date < today` AND stage not in [won, lost, dormant]
  - Sends notification to `assigned_to` user (in-app notification bell, or email)
  - Finds prospects where `reopen_date <= today` AND stage in [dormant, lost]
  - Sends "Time to re-engage [Company Name]" notification
- In-app notification system (bell icon in header with badge count)
- Optional: WhatsApp/email reminder to assigned sales person

**Dependency:** Requires a notifications infrastructure (not yet built in MyJKKN). Park this until the platform has a notification system.

---

### P3-2: Client Lifetime Value Dashboard

**Future scope:**
- Per-client dashboard showing:
  - Total revenue from all solutions (sum of payment amounts)
  - Number of solutions (active, completed, total)
  - Referral revenue generated (from clients they referred)
  - Time as client (days since creation)
  - Solution satisfaction indicators
- Aggregate "Top Clients" leaderboard on Solutions Hub dashboard

**Dependency:** Requires payment data to be populated in `sh_solution_payments`. Currently the table exists but may not have significant data yet.

---

### P3-3: Pipeline Capacity Planning

**Problem identified in FST:** No mechanism to check team bandwidth before accepting new deals. Can create unlimited solutions without capacity check.

**Future scope:**
- Track team member capacity (hours/week available for solutions)
- When prospect reaches "proposal" stage, show capacity indicator: "Team can handle this" vs "Team is at capacity"
- Solution assignment view showing workload per team member

**Dependency:** Requires team/staff management module integration.

---

## Implementation Order

| Phase | Items | Effort | Value |
|-------|-------|--------|-------|
| **Sprint 1** | P0-1 (Prospect Origin Card), P0-2 (Pipeline/Direct Badge), P0-3 (Trigger Enrichment) | ~2 days | High — immediate visibility improvement |
| **Sprint 2** | P1-1 (Re-engagement System) | ~3 days | High — turns dead ends into recycled leads |
| **Sprint 3** | P1-2 (Source-to-Success Analytics) | ~2 days | Medium — data-driven sales strategy |
| **Sprint 4** | P2-1 (Repeat Business via existing_client_id) | ~3 days | High — critical for scaling |
| **Sprint 5** | P2-2 (Multi-Solution Interest) | ~1 day | Low-Medium — nice to have |
| **Later** | P3-1, P3-2, P3-3 | TBD | Depends on platform maturity |

---

## Files Affected (Complete List)

### New Files
- `components/solutions/clients/prospect-origin-card.tsx`
- `components/solutions/pipeline/reopen-date-dialog.tsx`
- `components/solutions/pipeline/source-success-chart.tsx`
- 3-4 new Supabase migrations

### Modified Files
- `app/(routes)/solutions/clients/[id]/page.tsx` — add prospect origin card, pipeline/direct badge
- `app/(routes)/solutions/pipeline/page.tsx` — add re-engage section
- `app/(routes)/solutions/pipeline/analytics/page.tsx` — add source-to-success charts
- `components/solutions/clients/client-card.tsx` — add pipeline/direct badge
- `components/solutions/pipeline/prospect-form.tsx` — existing client picker, multi-solution checkboxes, reopen date
- `components/solutions/pipeline/prospect-card.tsx` — repeat business badge, multi-solution badges
- `components/solutions/pipeline/pipeline-stats.tsx` — re-engagement count card
- `components/solutions/pipeline/lost-reason-dialog.tsx` — add reopen date option
- `lib/services/solutions/prospects-service.ts` — new methods, updated queries
- `lib/services/solutions/clients-service.ts` — reverse prospect lookup
- `lib/services/solutions/types.ts` — new fields, updated types

### Database Tables Affected
- `sh_prospects` — add `reopen_date`, `existing_client_id`, `solution_types_interest`
- `sh_prospect_won_to_client()` trigger — handle repeat business, copy more fields

---

*Generated from FST Analysis: [[FST-Pipeline-vs-Clients]]*
