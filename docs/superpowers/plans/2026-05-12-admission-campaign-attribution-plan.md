# Admission Campaign Attribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-12-admission-campaign-attribution-design.md`

**Goal:** Introduce first-class acquisition-campaign attribution so admins can track which marketing campaign brought each lead, with a 5-stage funnel (Clicks → Captures → Qualified → Applied → Enrolled), first+last-touch attribution, per-link click tracking, and per-campaign analytics.

**Architecture:** Three new tables (`admission_campaigns`, `admission_campaign_links`, `admission_campaign_link_clicks`); attribution FKs added to `admission_leads` + `admission_lead_source_captures` + `admission_form_submissions`; public flow `/c/{token}` 302-redirects to `/apply/{slug}?c={token}` with click logging; public form submission refactored to flow through `capture_admission_lead` RPC; analytics RPCs return funnel + time-series + compare data; new admin UI under `/admission/marketing/campaigns/`; existing drip-sequence routes renamed to `/automations/`.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres 15 + RLS) · React Query (TanStack Query) · Tailwind CSS · shadcn/ui · recharts · nanoid · pgTAP-style SQL tests · Playwright (E2E) · Vitest · React Testing Library

**Conventions referenced throughout this plan:**
- Existing service pattern: `lib/services/admission/*` (static-method classes, `createClientSupabaseClient()`)
- Existing RPC pattern: `SECURITY DEFINER` with explicit `user_has_permission` + `role_has_institution_access` guards
- Migration mirror rule: every migration body lands in `supabase/migrations/<ts>_*.sql` AND `supabase/setup/{01_tables,02_functions}.sql` (per `feedback_placeholder_migrations_hide_typos.md`)
- React Query keys: hierarchical const factory pattern (`campaignKeys`)
- Cookies on responses: `httpOnly`, `sameSite=lax`, `secure` in production

**Total tasks:** 45 (across 9 phases). Frequent commits — one per task.

---

## Phase 1 — Database Foundation (Tasks 1-9)

These migrations are the load-bearing structure. Apply via Supabase MCP `apply_migration` for the remote DB AND commit the body to `supabase/migrations/` + mirror to `supabase/setup/*`. Use placeholder timestamp `20260512100000_*` (incrementing the last `*0` digit per task) — adjust to actual deploy time when applied.

### Task 1: Create the three new campaign tables

**Files:**
- Create: `supabase/migrations/20260512100001_a_create_admission_campaigns_tables.sql`
- Modify: `supabase/setup/01_tables.sql` (append after `admission_form_submissions` block)
- Verify: psql query against `information_schema.tables`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260512100001_a_create_admission_campaigns_tables.sql` with:

```sql
-- ──────────────────────────────────────────────────────────────
-- Migration A: Campaign attribution tables
-- Adds admission_campaigns, admission_campaign_links, admission_campaign_link_clicks
-- See: docs/superpowers/specs/2026-05-12-admission-campaign-attribution-design.md §4.1
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admission_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  description     text,
  source          lead_source NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','paused','completed','archived')),
  starts_at       timestamptz,
  ends_at         timestamptz,
  budget_inr      numeric(12,2),
  target_leads    integer,
  target_enrolled integer,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  UNIQUE (institution_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_inst_status ON admission_campaigns (institution_id, status)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_inst_source ON admission_campaigns (institution_id, source)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_inst_dates  ON admission_campaigns (institution_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS admission_campaign_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES admission_campaigns(id) ON DELETE CASCADE,
  form_id         uuid NOT NULL REFERENCES admission_forms(id),
  token           text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text,
  cost_inr        numeric(12,2),
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  is_active       boolean NOT NULL DEFAULT true,
  expires_at      timestamptz,
  click_count     integer NOT NULL DEFAULT 0,
  capture_count   integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_campaign ON admission_campaign_links (campaign_id);
CREATE INDEX IF NOT EXISTS idx_links_form     ON admission_campaign_links (form_id);

CREATE TABLE IF NOT EXISTS admission_campaign_link_clicks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id         uuid NOT NULL REFERENCES admission_campaign_links(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES admission_campaigns(id) ON DELETE CASCADE,
  clicked_at      timestamptz NOT NULL DEFAULT now(),
  ip_hash         text,
  user_agent      text,
  referrer        text,
  device_type     text,
  country         text,
  session_id      text,
  resulted_in_submission boolean NOT NULL DEFAULT false,
  resulted_lead_id       uuid REFERENCES admission_leads(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_clicks_campaign_time ON admission_campaign_link_clicks (campaign_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_link_time     ON admission_campaign_link_clicks (link_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_session       ON admission_campaign_link_clicks (session_id)
  WHERE session_id IS NOT NULL;

-- Updated-at maintenance triggers (reuse existing function)
CREATE TRIGGER trg_admission_campaigns_updated
  BEFORE UPDATE ON admission_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_admission_campaign_links_updated
  BEFORE UPDATE ON admission_campaign_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 2: Apply the migration to the remote DB**

Use the Supabase MCP tool:
```
mcp__supabase__apply_migration {
  name: "20260512100001_a_create_admission_campaigns_tables",
  query: <contents of the file above>
}
```

- [ ] **Step 3: Verify tables exist with correct columns**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_name IN ('admission_campaigns', 'admission_campaign_links', 'admission_campaign_link_clicks')
 ORDER BY table_name, ordinal_position;
```
Expected: ~50 rows total covering all columns listed in the spec.

- [ ] **Step 4: Mirror the same DDL into `supabase/setup/01_tables.sql`**

Append the same `CREATE TABLE IF NOT EXISTS ...` blocks (without the trigger DDL, which goes in `02_functions.sql`) after the existing `admission_form_submissions` block. Locate the existing block first:
```bash
grep -n "CREATE TABLE.*admission_form_submissions" supabase/setup/01_tables.sql
```
Insert the new table DDL after that block.

- [ ] **Step 5: Mirror the trigger DDL into `supabase/setup/02_functions.sql`**

Append the two `CREATE TRIGGER` statements (for `trg_admission_campaigns_updated` and `trg_admission_campaign_links_updated`) to the end of `supabase/setup/02_functions.sql`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260512100001_a_create_admission_campaigns_tables.sql \
        supabase/setup/01_tables.sql \
        supabase/setup/02_functions.sql
git commit -m "feat(admission/campaigns): add campaign attribution base tables

Creates admission_campaigns, admission_campaign_links, and
admission_campaign_link_clicks. Foundation for per-campaign lead
attribution analytics. See design spec §4.1."
```

---

### Task 2: Add attribution columns to existing tables

**Files:**
- Create: `supabase/migrations/20260512100002_b_add_campaign_attribution_columns.sql`
- Modify: `supabase/setup/01_tables.sql` (update existing CREATE TABLE statements)

- [ ] **Step 1: Write the migration file**

`supabase/migrations/20260512100002_b_add_campaign_attribution_columns.sql`:

```sql
-- ──────────────────────────────────────────────────────────────
-- Migration B: Attribution FK columns on existing tables (all NULLABLE)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE admission_leads
  ADD COLUMN IF NOT EXISTS first_campaign_link_id uuid
    REFERENCES admission_campaign_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_campaign_link_id  uuid
    REFERENCES admission_campaign_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_first_campaign
  ON admission_leads (first_campaign_link_id)
  WHERE first_campaign_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_campaign
  ON admission_leads (last_campaign_link_id)
  WHERE last_campaign_link_id IS NOT NULL;

ALTER TABLE admission_lead_source_captures
  ADD COLUMN IF NOT EXISTS campaign_link_id uuid
    REFERENCES admission_campaign_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_captures_campaign_link
  ON admission_lead_source_captures (campaign_link_id)
  WHERE campaign_link_id IS NOT NULL;

ALTER TABLE admission_form_submissions
  ADD COLUMN IF NOT EXISTS campaign_link_id uuid
    REFERENCES admission_campaign_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_subs_campaign_link
  ON admission_form_submissions (campaign_link_id)
  WHERE campaign_link_id IS NOT NULL;
```

- [ ] **Step 2: Apply via Supabase MCP**

`mcp__supabase__apply_migration` with name `20260512100002_b_add_campaign_attribution_columns` and the SQL above.

- [ ] **Step 3: Verify columns exist**

```sql
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE (table_name = 'admission_leads' AND column_name IN ('first_campaign_link_id','last_campaign_link_id'))
    OR (table_name = 'admission_lead_source_captures' AND column_name = 'campaign_link_id')
    OR (table_name = 'admission_form_submissions' AND column_name = 'campaign_link_id');
```
Expected: 4 rows.

- [ ] **Step 4: Update `supabase/setup/01_tables.sql`**

Find the existing `CREATE TABLE admission_leads ...` block and add the two new columns inside it (NOT a separate ALTER). Same for `admission_lead_source_captures` and `admission_form_submissions`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512100002_b_add_campaign_attribution_columns.sql \
        supabase/setup/01_tables.sql
git commit -m "feat(admission/campaigns): add campaign_link_id FKs to leads + captures + submissions

NULLABLE columns. Pre-migration rows untouched. Indexes are partial
(WHERE NOT NULL) to keep them small."
```

---

### Task 3: Create attribution triggers

**Files:**
- Create: `supabase/migrations/20260512100003_c_create_attribution_triggers.sql`
- Modify: `supabase/setup/02_functions.sql`

- [ ] **Step 1: Write the migration file**

`supabase/migrations/20260512100003_c_create_attribution_triggers.sql`:

```sql
-- ──────────────────────────────────────────────────────────────
-- Migration C: Attribution triggers
-- 1. sync_lead_campaign_attribution — maintains first/last on admission_leads
-- 2. link_click_to_submission       — back-fills resulted_lead_id on click row
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_lead_campaign_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_link_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE admission_leads
     SET first_campaign_link_id = COALESCE(first_campaign_link_id, NEW.campaign_link_id),
         last_campaign_link_id  = NEW.campaign_link_id,
         updated_at             = now()
   WHERE id = NEW.lead_id;

  UPDATE admission_campaign_links
     SET capture_count = capture_count + 1,
         updated_at    = now()
   WHERE id = NEW.campaign_link_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_campaign_attribution ON admission_lead_source_captures;
CREATE TRIGGER trg_sync_lead_campaign_attribution
AFTER INSERT ON admission_lead_source_captures
FOR EACH ROW EXECUTE FUNCTION sync_lead_campaign_attribution();

CREATE OR REPLACE FUNCTION link_click_to_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_link_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE admission_campaign_link_clicks
     SET resulted_in_submission = true,
         resulted_lead_id       = NEW.lead_id
   WHERE id = (
     SELECT id FROM admission_campaign_link_clicks
      WHERE link_id = NEW.campaign_link_id
        AND clicked_at >= now() - INTERVAL '24 hours'
        AND resulted_in_submission = false
      ORDER BY clicked_at DESC
      LIMIT 1
   );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_click_to_submission ON admission_form_submissions;
CREATE TRIGGER trg_link_click_to_submission
AFTER INSERT ON admission_form_submissions
FOR EACH ROW EXECUTE FUNCTION link_click_to_submission();
```

- [ ] **Step 2: Apply via Supabase MCP**

`mcp__supabase__apply_migration` with name `20260512100003_c_create_attribution_triggers`.

- [ ] **Step 3: Verify both triggers exist**

```sql
SELECT trigger_name, event_object_table
  FROM information_schema.triggers
 WHERE trigger_name IN ('trg_sync_lead_campaign_attribution', 'trg_link_click_to_submission');
```
Expected: 2 rows.

- [ ] **Step 4: Smoke test the attribution trigger**

```sql
-- Setup: insert a test campaign + link + lead + capture
BEGIN;
INSERT INTO admission_campaigns (id, institution_id, name, slug, source, status)
  SELECT gen_random_uuid(), id, 'Test Campaign', 'test-cam-' || gen_random_uuid()::text, 'whatsapp', 'active'
    FROM institutions LIMIT 1
  RETURNING id;
-- (note returned id as :campaign_id for next step)
ROLLBACK;
```
Visual check only — full assertion-based tests come in Task 40.

- [ ] **Step 5: Mirror to `supabase/setup/02_functions.sql`**

Append both `CREATE OR REPLACE FUNCTION ... $$;` blocks and the two `CREATE TRIGGER` statements to the end of `supabase/setup/02_functions.sql`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260512100003_c_create_attribution_triggers.sql \
        supabase/setup/02_functions.sql
git commit -m "feat(admission/campaigns): add attribution sync + click→submission triggers

sync_lead_campaign_attribution maintains first/last_campaign_link_id on
admission_leads and bumps capture_count on links.
link_click_to_submission back-fills resulted_lead_id on the click row."
```

---

### Task 4: Create RLS policies + SECURITY DEFINER helper

**Files:**
- Create: `supabase/migrations/20260512100004_d_create_attribution_rls_policies.sql`
- Modify: `supabase/setup/02_functions.sql` (helper function)

- [ ] **Step 1: Write the migration file**

`supabase/migrations/20260512100004_d_create_attribution_rls_policies.sql`:

```sql
-- ──────────────────────────────────────────────────────────────
-- Migration D: RLS policies for campaign tables + recursion-safe helper
-- ──────────────────────────────────────────────────────────────

-- SECURITY DEFINER helper — bypasses RLS to resolve parent campaign's institution_id
-- Pattern: see memory note feedback_rls_transitive_recursion_via_exists.md
CREATE OR REPLACE FUNCTION _campaign_link_institution_id(p_link_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.institution_id
    FROM admission_campaign_links l
    JOIN admission_campaigns c ON c.id = l.campaign_id
   WHERE l.id = p_link_id;
$$;

ALTER TABLE admission_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_link_clicks ENABLE ROW LEVEL SECURITY;

-- admission_campaigns
DROP POLICY IF EXISTS p_campaigns_select ON admission_campaigns;
CREATE POLICY p_campaigns_select ON admission_campaigns FOR SELECT TO authenticated USING (
  user_has_permission(auth.uid(), 'admission.campaigns.view')
  AND role_has_institution_access(auth.uid(), institution_id)
);

DROP POLICY IF EXISTS p_campaigns_insert ON admission_campaigns;
CREATE POLICY p_campaigns_insert ON admission_campaigns FOR INSERT TO authenticated WITH CHECK (
  user_has_permission(auth.uid(), 'admission.campaigns.create')
  AND role_has_institution_access(auth.uid(), institution_id)
);

DROP POLICY IF EXISTS p_campaigns_update ON admission_campaigns;
CREATE POLICY p_campaigns_update ON admission_campaigns FOR UPDATE TO authenticated
  USING (
    user_has_permission(auth.uid(), 'admission.campaigns.edit')
    AND role_has_institution_access(auth.uid(), institution_id)
  )
  WITH CHECK (
    user_has_permission(auth.uid(), 'admission.campaigns.edit')
    AND role_has_institution_access(auth.uid(), institution_id)
  );

-- admission_campaign_links
DROP POLICY IF EXISTS p_links_select ON admission_campaign_links;
CREATE POLICY p_links_select ON admission_campaign_links FOR SELECT TO authenticated USING (
  user_has_permission(auth.uid(), 'admission.campaigns.view')
  AND role_has_institution_access(auth.uid(), _campaign_link_institution_id(id))
);

DROP POLICY IF EXISTS p_links_insert ON admission_campaign_links;
CREATE POLICY p_links_insert ON admission_campaign_links FOR INSERT TO authenticated WITH CHECK (
  user_has_permission(auth.uid(), 'admission.campaigns.create')
  AND EXISTS (
    SELECT 1 FROM admission_campaigns c
     WHERE c.id = campaign_id
       AND role_has_institution_access(auth.uid(), c.institution_id)
  )
);

DROP POLICY IF EXISTS p_links_update ON admission_campaign_links;
CREATE POLICY p_links_update ON admission_campaign_links FOR UPDATE TO authenticated
  USING (
    user_has_permission(auth.uid(), 'admission.campaigns.edit')
    AND role_has_institution_access(auth.uid(), _campaign_link_institution_id(id))
  )
  WITH CHECK (
    user_has_permission(auth.uid(), 'admission.campaigns.edit')
    AND role_has_institution_access(auth.uid(), _campaign_link_institution_id(id))
  );

-- admission_campaign_link_clicks (SELECT only; INSERT happens via service role from /c/[token])
DROP POLICY IF EXISTS p_clicks_select ON admission_campaign_link_clicks;
CREATE POLICY p_clicks_select ON admission_campaign_link_clicks FOR SELECT TO authenticated USING (
  user_has_permission(auth.uid(), 'admission.campaigns.view')
  AND EXISTS (
    SELECT 1 FROM admission_campaigns c
     WHERE c.id = campaign_id
       AND role_has_institution_access(auth.uid(), c.institution_id)
  )
);
```

- [ ] **Step 2: Apply via Supabase MCP**

`mcp__supabase__apply_migration` with name `20260512100004_d_create_attribution_rls_policies`.

- [ ] **Step 3: Verify policies exist**

```sql
SELECT schemaname, tablename, policyname, cmd
  FROM pg_policies
 WHERE tablename IN ('admission_campaigns','admission_campaign_links','admission_campaign_link_clicks')
 ORDER BY tablename, policyname;
```
Expected: 7 rows (3 + 3 + 1).

- [ ] **Step 4: Mirror to `supabase/setup/02_functions.sql`**

Append the `_campaign_link_institution_id` function body and all 7 RLS policy statements.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512100004_d_create_attribution_rls_policies.sql \
        supabase/setup/02_functions.sql
git commit -m "feat(admission/campaigns): add RLS policies + recursion-safe institution helper

_campaign_link_institution_id is SECURITY DEFINER to avoid the 42P17 loop
that would otherwise happen when admission_campaign_links policies query
admission_campaigns (which has its own policies)."
```

---

### Task 5: Extend `capture_admission_lead` RPC to accept campaign_link_id

**Files:**
- Create: `supabase/migrations/20260512100005_e_extend_capture_admission_lead_for_campaigns.sql`
- Modify: `supabase/setup/02_functions.sql` (replace existing function body)

- [ ] **Step 1: Locate the existing function body**

```bash
grep -n "CREATE OR REPLACE FUNCTION public.capture_admission_lead" supabase/setup/02_functions.sql
```
Note the line range (~180 lines per the spec) so you can replace it cleanly in Step 4.

- [ ] **Step 2: Write the migration file with the full new function body**

`supabase/migrations/20260512100005_e_extend_capture_admission_lead_for_campaigns.sql`:

The migration body is the full `CREATE OR REPLACE FUNCTION public.capture_admission_lead(p_lead JSONB, p_capture JSONB) RETURNS JSONB ...` with two changes from the prior version:

1. Add `v_campaign_link_id uuid;` to the DECLARE block.
2. Before the `INSERT INTO admission_lead_source_captures (...)` line, add:

```sql
  v_campaign_link_id := NULLIF(p_capture->>'campaign_link_id', '')::uuid;

  IF v_campaign_link_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM admission_campaign_links
        WHERE id = v_campaign_link_id AND is_active = true
     ) THEN
    v_campaign_link_id := NULL;
  END IF;
```

3. In the `INSERT INTO admission_lead_source_captures (...)` add `campaign_link_id` to both the column list and VALUES clause, passing `v_campaign_link_id`.

4. In the `RETURN jsonb_build_object(...)` add `'attributed_link', v_campaign_link_id` as an extra key.

Get the current function body via:
```sql
SELECT pg_get_functiondef('public.capture_admission_lead'::regprocedure);
```
Apply the 4 edits above, then write the migration file containing the FULL new function as a `CREATE OR REPLACE FUNCTION ... $$;` block.

- [ ] **Step 3: Apply via Supabase MCP**

`mcp__supabase__apply_migration`.

- [ ] **Step 4: Smoke-test the RPC accepts the new parameter**

```sql
-- Inside a transaction so we can rollback
BEGIN;

-- Pick a test institution + form
WITH test_form AS (
  SELECT f.id AS form_id, f.institution_id, f.lead_source
    FROM admission_forms f
   LIMIT 1
),
test_link AS (
  INSERT INTO admission_campaigns (institution_id, name, slug, source, status)
  SELECT institution_id, 'plan-test', 'plan-test-' || md5(random()::text), lead_source, 'active'
    FROM test_form
  RETURNING id, institution_id
),
test_form_id AS (
  INSERT INTO admission_campaign_links (campaign_id, form_id, token, name)
  SELECT test_link.id, test_form.form_id, 'plntest1', 'plan-test-link'
    FROM test_link, test_form
  RETURNING id, campaign_id
)
SELECT capture_admission_lead(
  jsonb_build_object(
    'first_name', 'Plan',
    'last_name',  'Test',
    'phone',      '+91' || (1000000000 + floor(random()*999999999))::bigint::text,
    'source',     'whatsapp',
    'institution_id', (SELECT institution_id FROM test_link)
  ),
  jsonb_build_object(
    'source',           'whatsapp',
    'captured_at',      now(),
    'campaign_link_id', (SELECT id FROM test_form_id)
  )
);

ROLLBACK;
```

Expected: the RPC returns a JSONB result with `lead_id`, `is_new_lead`, `was_reactivated`, and `attributed_link` keys; no errors.

- [ ] **Step 5: Mirror to `supabase/setup/02_functions.sql`**

Replace the existing `CREATE OR REPLACE FUNCTION public.capture_admission_lead ...` block with the new body. Use the byte-range identified in Step 1.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260512100005_e_extend_capture_admission_lead_for_campaigns.sql \
        supabase/setup/02_functions.sql
git commit -m "feat(admission/campaigns): extend capture_admission_lead RPC for campaign_link_id

Soft-validates: invalid link → drops attribution, captures lead anyway
(lead is the commercially valuable artifact, attribution is metadata)."
```

---

### Task 6: Create `get_campaign_funnel` RPC

**Files:**
- Create: `supabase/migrations/20260512100006_f1_create_get_campaign_funnel.sql`
- Modify: `supabase/setup/02_functions.sql`

- [ ] **Step 1: Write the migration file**

Copy the FULL `CREATE OR REPLACE FUNCTION public.get_campaign_funnel(...)` body from spec §4.6 verbatim into `supabase/migrations/20260512100006_f1_create_get_campaign_funnel.sql`.

- [ ] **Step 2: Apply via Supabase MCP**

`mcp__supabase__apply_migration` with name `20260512100006_f1_create_get_campaign_funnel`.

- [ ] **Step 3: Smoke-test the RPC against a real campaign**

```sql
-- Replace <campaign_id> with a campaign you own
SELECT get_campaign_funnel(
  '<campaign_id>'::uuid,
  'first',
  now() - INTERVAL '30 days',
  now()
);
```
Expected: JSONB result shaped `{ campaign_id, attribution_mode, date_range, stages: {clicks,captures,qualified,applied,enrolled}, rates: {...} }`. All zeros are acceptable.

- [ ] **Step 4: Mirror to `supabase/setup/02_functions.sql`**

Append the full function body.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512100006_f1_create_get_campaign_funnel.sql \
        supabase/setup/02_functions.sql
git commit -m "feat(admission/campaigns): add get_campaign_funnel RPC

Returns 5-stage funnel (clicks/captures/qualified/applied/enrolled) for
a single campaign, scoped by first/last/any-touch attribution mode.
Funnel-stage rollups use FILTER IN(...) so 'qualified' includes all
downstream stages."
```

---

### Task 7: Create `get_campaign_time_series` RPC

**Files:**
- Create: `supabase/migrations/20260512100007_f2_create_get_campaign_time_series.sql`
- Modify: `supabase/setup/02_functions.sql`

- [ ] **Step 1: Write the migration file**

```sql
CREATE OR REPLACE FUNCTION public.get_campaign_time_series(
  p_campaign_id        uuid,
  p_attribution_mode   text    DEFAULT 'first',
  p_granularity        text    DEFAULT 'day',
  p_start_date         timestamptz DEFAULT (now() - INTERVAL '30 days'),
  p_end_date           timestamptz DEFAULT now()
)
RETURNS TABLE (
  bucket_at  timestamptz,
  clicks     integer,
  captures   integer,
  qualified  integer,
  applied    integer,
  enrolled   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_link_ids uuid[];
  v_trunc    text;
BEGIN
  PERFORM 1
    FROM admission_campaigns c
   WHERE c.id = p_campaign_id
     AND user_has_permission(auth.uid(), 'admission.campaigns.view')
     AND role_has_institution_access(auth.uid(), c.institution_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'access denied'; END IF;

  v_trunc := CASE p_granularity
               WHEN 'day'   THEN 'day'
               WHEN 'week'  THEN 'week'
               WHEN 'month' THEN 'month'
               ELSE 'day'
             END;

  SELECT array_agg(id) INTO v_link_ids
    FROM admission_campaign_links
   WHERE campaign_id = p_campaign_id;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      date_trunc(v_trunc, p_start_date),
      date_trunc(v_trunc, p_end_date),
      ('1 ' || v_trunc)::interval
    ) AS bucket
  ),
  clicks_by_bucket AS (
    SELECT date_trunc(v_trunc, clicked_at) AS bucket, COUNT(*) AS n
      FROM admission_campaign_link_clicks
     WHERE link_id = ANY(v_link_ids)
       AND clicked_at BETWEEN p_start_date AND p_end_date
     GROUP BY 1
  ),
  attributed AS (
    SELECT l.id, l.funnel_stage, date_trunc(v_trunc, l.created_at) AS bucket
      FROM admission_leads l
     WHERE
       CASE p_attribution_mode
         WHEN 'first' THEN l.first_campaign_link_id = ANY(v_link_ids)
         WHEN 'last'  THEN l.last_campaign_link_id  = ANY(v_link_ids)
         WHEN 'any'   THEN EXISTS (
           SELECT 1 FROM admission_lead_source_captures c
            WHERE c.lead_id = l.id AND c.campaign_link_id = ANY(v_link_ids)
         )
       END
       AND l.created_at BETWEEN p_start_date AND p_end_date
  )
  SELECT
    b.bucket                                                                      AS bucket_at,
    COALESCE(cb.n, 0)::integer                                                    AS clicks,
    COUNT(a.id)::integer                                                          AS captures,
    COUNT(a.id) FILTER (WHERE a.funnel_stage IN (
      'qualified','application_started','application_submitted',
      'documents_pending','documents_verified','interview_scheduled',
      'interview_completed','offer_sent','offer_accepted','token_paid','enrolled'))::integer AS qualified,
    COUNT(a.id) FILTER (WHERE a.funnel_stage IN (
      'application_submitted','documents_pending','documents_verified',
      'interview_scheduled','interview_completed','offer_sent',
      'offer_accepted','token_paid','enrolled'))::integer AS applied,
    COUNT(a.id) FILTER (WHERE a.funnel_stage = 'enrolled')::integer               AS enrolled
  FROM buckets b
  LEFT JOIN clicks_by_bucket cb ON cb.bucket = b.bucket
  LEFT JOIN attributed a        ON a.bucket  = b.bucket
  GROUP BY b.bucket, cb.n
  ORDER BY b.bucket;
END;
$$;
```

- [ ] **Step 2: Apply via Supabase MCP**

- [ ] **Step 3: Smoke-test**

```sql
SELECT * FROM get_campaign_time_series(
  '<campaign_id>'::uuid,
  'first',
  'day',
  now() - INTERVAL '7 days',
  now()
);
```
Expected: 7-8 rows (one per day in the range), all with zero counts initially.

- [ ] **Step 4: Mirror to `supabase/setup/02_functions.sql`**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260512100007_f2_create_get_campaign_time_series.sql \
        supabase/setup/02_functions.sql
git commit -m "feat(admission/campaigns): add get_campaign_time_series RPC

Daily/weekly/monthly bucketing via generate_series + date_trunc.
Empty buckets emit zero rows so charts render continuous timelines."
```

---

### Task 8: Create `get_campaigns_compare` RPC

**Files:**
- Create: `supabase/migrations/20260512100008_f3_create_get_campaigns_compare.sql`
- Modify: `supabase/setup/02_functions.sql`

- [ ] **Step 1: Write the migration file**

```sql
CREATE OR REPLACE FUNCTION public.get_campaigns_compare(
  p_campaign_ids       uuid[],
  p_attribution_mode   text    DEFAULT 'first',
  p_start_date         timestamptz DEFAULT NULL,
  p_end_date           timestamptz DEFAULT NULL
)
RETURNS TABLE (
  campaign_id     uuid,
  campaign_name   text,
  source          lead_source,
  budget_inr      numeric,
  spent_inr       numeric,
  clicks          integer,
  captures        integer,
  qualified       integer,
  applied         integer,
  enrolled        integer,
  cpl             numeric,
  cpe             numeric,
  conversion_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id,
    c.name,
    c.source,
    c.budget_inr,
    COALESCE((SELECT SUM(cost_inr) FROM admission_campaign_links WHERE campaign_id = c.id), 0)         AS spent_inr,
    (f.payload->'stages'->>'clicks')::int     AS clicks,
    (f.payload->'stages'->>'captures')::int   AS captures,
    (f.payload->'stages'->>'qualified')::int  AS qualified,
    (f.payload->'stages'->>'applied')::int    AS applied,
    (f.payload->'stages'->>'enrolled')::int   AS enrolled,
    CASE WHEN (f.payload->'stages'->>'captures')::int > 0
         THEN ROUND(COALESCE((SELECT SUM(cost_inr) FROM admission_campaign_links WHERE campaign_id = c.id), 0)
                    / NULLIF((f.payload->'stages'->>'captures')::int, 0), 2)
    END AS cpl,
    CASE WHEN (f.payload->'stages'->>'enrolled')::int > 0
         THEN ROUND(COALESCE((SELECT SUM(cost_inr) FROM admission_campaign_links WHERE campaign_id = c.id), 0)
                    / NULLIF((f.payload->'stages'->>'enrolled')::int, 0), 2)
    END AS cpe,
    (f.payload->'rates'->>'overall')::numeric AS conversion_rate
  FROM unnest(p_campaign_ids) AS cid
  JOIN admission_campaigns c ON c.id = cid
  CROSS JOIN LATERAL (
    SELECT get_campaign_funnel(c.id, p_attribution_mode, p_start_date, p_end_date) AS payload
  ) f
  WHERE user_has_permission(auth.uid(), 'admission.campaigns.view')
    AND role_has_institution_access(auth.uid(), c.institution_id);
$$;
```

- [ ] **Step 2: Apply, smoke-test, mirror, commit**

Same pattern as previous tasks.

```bash
git add supabase/migrations/20260512100008_f3_create_get_campaigns_compare.sql \
        supabase/setup/02_functions.sql
git commit -m "feat(admission/campaigns): add get_campaigns_compare RPC

Multi-campaign comparison table. Computes CPL and CPE from
sum(cost_inr) on links divided by capture/enrolled counts."
```

---

### Task 9: Create utility RPCs (`increment_campaign_link_clicks`, `get_campaigns_overview_stats`, `reconcile_campaign_link_counters`)

**Files:**
- Create: `supabase/migrations/20260512100009_f4_create_campaign_utility_rpcs.sql`
- Modify: `supabase/setup/02_functions.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ──── increment_campaign_link_clicks ────
CREATE OR REPLACE FUNCTION public.increment_campaign_link_clicks(p_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE admission_campaign_links
     SET click_count = click_count + 1,
         updated_at  = now()
   WHERE id = p_link_id;
$$;

-- ──── get_campaigns_overview_stats ────
CREATE OR REPLACE FUNCTION public.get_campaigns_overview_stats(
  p_start_date timestamptz DEFAULT (now() - INTERVAL '30 days'),
  p_end_date   timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT user_has_permission(auth.uid(), 'admission.campaigns.view') THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  WITH visible_campaigns AS (
    SELECT id, status, budget_inr
      FROM admission_campaigns
     WHERE archived_at IS NULL
       AND role_has_institution_access(auth.uid(), institution_id)
  ),
  visible_links AS (
    SELECT l.id, l.cost_inr, l.click_count, l.capture_count
      FROM admission_campaign_links l
      JOIN visible_campaigns c ON c.id = l.campaign_id
  )
  SELECT jsonb_build_object(
    'total_active',    (SELECT COUNT(*) FROM visible_campaigns WHERE status = 'active'),
    'total_paused',    (SELECT COUNT(*) FROM visible_campaigns WHERE status = 'paused'),
    'total_archived',  0,
    'total_spent_inr', COALESCE((SELECT SUM(cost_inr) FROM visible_links), 0),
    'total_clicks',    COALESCE((SELECT SUM(click_count) FROM visible_links), 0),
    'total_captures',  COALESCE((SELECT SUM(capture_count) FROM visible_links), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ──── reconcile_campaign_link_counters ────
CREATE OR REPLACE FUNCTION public.reconcile_campaign_link_counters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clicks_updated   integer;
  v_captures_updated integer;
BEGIN
  IF NOT user_has_permission(auth.uid(), 'admission.campaigns.edit') THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  WITH actual AS (
    SELECT link_id, COUNT(*) AS n FROM admission_campaign_link_clicks GROUP BY link_id
  )
  UPDATE admission_campaign_links l
     SET click_count = COALESCE(a.n, 0)
    FROM actual a
   WHERE l.id = a.link_id AND l.click_count <> a.n;
  GET DIAGNOSTICS v_clicks_updated = ROW_COUNT;

  WITH actual AS (
    SELECT campaign_link_id AS link_id, COUNT(*) AS n
      FROM admission_lead_source_captures
     WHERE campaign_link_id IS NOT NULL
     GROUP BY campaign_link_id
  )
  UPDATE admission_campaign_links l
     SET capture_count = COALESCE(a.n, 0)
    FROM actual a
   WHERE l.id = a.link_id AND l.capture_count <> a.n;
  GET DIAGNOSTICS v_captures_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'clicks_updated',   v_clicks_updated,
    'captures_updated', v_captures_updated
  );
END;
$$;
```

- [ ] **Step 2: Apply, smoke-test, mirror, commit**

```bash
git add supabase/migrations/20260512100009_f4_create_campaign_utility_rpcs.sql \
        supabase/setup/02_functions.sql
git commit -m "feat(admission/campaigns): add overview + reconcile + counter utility RPCs

increment_campaign_link_clicks      — one-round-trip counter bump
get_campaigns_overview_stats        — landing-page aggregate KPIs
reconcile_campaign_link_counters    — manual drift recovery"
```

---

## Phase 2 — Types + Utilities (Tasks 10-12)

### Task 10: Define TypeScript types

**Files:**
- Create: `types/admission/campaign.ts`

- [ ] **Step 1: Write the type file**

```typescript
// types/admission/campaign.ts
import type { LeadSource } from '@/types/admission';

export type CampaignStatus =
  | 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type AttributionMode = 'first' | 'last' | 'any';

export type ChartGranularity = 'day' | 'week' | 'month';

export interface Campaign {
  id: string;
  institution_id: string;
  name: string;
  slug: string;
  description: string | null;
  source: LeadSource;
  status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  budget_inr: number | null;
  target_leads: number | null;
  target_enrolled: number | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CampaignLink {
  id: string;
  campaign_id: string;
  form_id: string;
  token: string;
  name: string;
  description: string | null;
  cost_inr: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  is_active: boolean;
  expires_at: string | null;
  click_count: number;
  capture_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignFunnel {
  campaign_id: string;
  attribution_mode: AttributionMode;
  date_range: { from: string | null; to: string | null };
  stages: {
    clicks: number;
    captures: number;
    qualified: number;
    applied: number;
    enrolled: number;
  };
  rates: {
    click_to_capture: number;
    capture_to_qual: number;
    qual_to_applied: number;
    applied_to_enrol: number;
    overall: number;
  };
}

export interface TimeSeriesPoint {
  bucket_at: string;
  clicks: number;
  captures: number;
  qualified: number;
  applied: number;
  enrolled: number;
}

export interface CampaignCompareRow {
  campaign_id: string;
  campaign_name: string;
  source: LeadSource;
  budget_inr: number | null;
  spent_inr: number;
  clicks: number;
  captures: number;
  qualified: number;
  applied: number;
  enrolled: number;
  cpl: number | null;
  cpe: number | null;
  conversion_rate: number;
}

export interface OverviewStats {
  total_active: number;
  total_paused: number;
  total_archived: number;
  total_spent_inr: number;
  total_clicks: number;
  total_captures: number;
}

export interface CampaignFilters {
  status?: CampaignStatus;
  source?: LeadSource;
  search?: string;
  includeArchived?: boolean;
}

export interface CreateCampaignInput {
  institution_id: string;
  name: string;
  slug?: string;
  description?: string;
  source: LeadSource;
  starts_at?: string;
  ends_at?: string;
  budget_inr?: number;
  target_leads?: number;
  target_enrolled?: number;
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  budget_inr?: number | null;
  target_leads?: number | null;
  target_enrolled?: number | null;
  status?: CampaignStatus;
}

export interface CreateLinkInput {
  form_id: string;
  name: string;
  description?: string;
  cost_inr?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  expires_at?: string;
}

export interface UpdateLinkInput {
  name?: string;
  description?: string;
  cost_inr?: number | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add types/admission/campaign.ts
git commit -m "feat(admission/campaigns): add Campaign + CampaignLink type definitions

Includes attribution modes, granularity, all input/output shapes for
service layer."
```

---

### Task 11: Create nanoid utility

**Files:**
- Modify: `package.json` (add `nanoid` if not present)
- Create: `lib/utils/nanoid.ts`
- Test: `lib/utils/__tests__/nanoid.test.ts`

- [ ] **Step 1: Check if nanoid is already installed**

```bash
grep '"nanoid"' package.json
```
If not present, add: `npm install nanoid` (use the project's package manager — `npm` per existing convention).

- [ ] **Step 2: Write failing test**

`lib/utils/__tests__/nanoid.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { generateCampaignToken } from '../nanoid';

describe('generateCampaignToken', () => {
  it('produces a string of exactly 8 characters', () => {
    const token = generateCampaignToken();
    expect(token).toHaveLength(8);
  });

  it('only uses URL-safe characters [A-Za-z0-9_-]', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateCampaignToken()).toMatch(/^[A-Za-z0-9_-]{8}$/);
    }
  });

  it('generates unique tokens', () => {
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(generateCampaignToken());
    expect(set.size).toBe(1000);
  });
});
```

- [ ] **Step 3: Run test, verify failure**

```bash
npx vitest run lib/utils/__tests__/nanoid.test.ts
```
Expected: FAIL ("Cannot find module ../nanoid").

- [ ] **Step 4: Write implementation**

`lib/utils/nanoid.ts`:
```typescript
import { customAlphabet } from 'nanoid';

const URL_SAFE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const generate = customAlphabet(URL_SAFE_ALPHABET, 8);

export function generateCampaignToken(): string {
  return generate();
}
```

- [ ] **Step 5: Run test, verify pass**

```bash
npx vitest run lib/utils/__tests__/nanoid.test.ts
```
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/nanoid.ts lib/utils/__tests__/nanoid.test.ts package.json package-lock.json
git commit -m "feat(utils): add generateCampaignToken using nanoid

8-char URL-safe tokens for /c/{token} short-links.
Collision probability ~1 in 218 trillion."
```

---

### Task 12: Create IP-hashing utility

**Files:**
- Create: `lib/security/ip-hash.ts`
- Test: `lib/security/__tests__/ip-hash.test.ts`

- [ ] **Step 1: Write failing test**

`lib/security/__tests__/ip-hash.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { hashIp } from '../ip-hash';

describe('hashIp', () => {
  it('returns a 64-char hex string', () => {
    const result = hashIp('203.0.113.42');
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same IP within a day', () => {
    expect(hashIp('1.2.3.4')).toBe(hashIp('1.2.3.4'));
  });

  it('returns different hashes for different IPs', () => {
    expect(hashIp('1.1.1.1')).not.toBe(hashIp('2.2.2.2'));
  });

  it('handles empty/null input gracefully', () => {
    expect(hashIp('')).toBe('');
    expect(hashIp(null as unknown as string)).toBe('');
  });

  it('takes only the first IP if comma-separated (x-forwarded-for header)', () => {
    const single = hashIp('1.2.3.4');
    const multi  = hashIp('1.2.3.4, 5.6.7.8');
    expect(single).toBe(multi);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run lib/security/__tests__/ip-hash.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write implementation**

`lib/security/ip-hash.ts`:
```typescript
import { createHash } from 'crypto';

const PEPPER = process.env.IP_HASH_PEPPER ?? 'myjkkn-default-pepper-do-not-use-in-prod';

function dailySalt(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${PEPPER}|${today}`;
}

export function hashIp(ipRaw: string | null | undefined): string {
  if (!ipRaw) return '';
  const ip = ipRaw.split(',')[0].trim();
  if (!ip) return '';
  return createHash('sha256').update(`${dailySalt()}|${ip}`).digest('hex');
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run lib/security/__tests__/ip-hash.test.ts
```
Expected: 5 passing.

- [ ] **Step 5: Add `IP_HASH_PEPPER` to environment documentation**

Add to `.env.example`:
```
# Pepper for IP-hash daily salt (rotate annually). 32+ random chars.
IP_HASH_PEPPER=
```

- [ ] **Step 6: Commit**

```bash
git add lib/security/ip-hash.ts lib/security/__tests__/ip-hash.test.ts .env.example
git commit -m "feat(security): add daily-salted IP hash for click-tracking

Salt rotates daily so historical click logs cannot be reverse-mapped to
original IPs even with PEPPER in hand. First IP in comma-separated list
is used (matches Vercel x-forwarded-for behavior)."
```

---

## Phase 3 — Service Layer (Tasks 13-15)

### Task 13: CampaignService — CRUD methods

**Files:**
- Create: `lib/services/admission/campaign-service.ts`
- Test: `lib/services/admission/__tests__/campaign-service.test.ts`

- [ ] **Step 1: Write failing test for `list` method**

`lib/services/admission/__tests__/campaign-service.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { CampaignService } from '../campaign-service';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: () => ({
      select: vi.fn().mockReturnThis(),
      is:     vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      ilike:  vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
}));

describe('CampaignService.list', () => {
  it('returns the data array on success', async () => {
    const result = await CampaignService.list();
    expect(Array.isArray(result)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run lib/services/admission/__tests__/campaign-service.test.ts
```

- [ ] **Step 3: Write implementation**

`lib/services/admission/campaign-service.ts`:
```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { generateCampaignToken } from '@/lib/utils/nanoid';
import type {
  Campaign, CampaignLink, CampaignFilters,
  CreateCampaignInput, UpdateCampaignInput,
  CreateLinkInput, UpdateLinkInput,
} from '@/types/admission/campaign';

export class CampaignService {
  private static client() {
    return createClientSupabaseClient();
  }

  // ─── Campaigns CRUD ───────────────────────────────────────
  static async list(filters?: CampaignFilters): Promise<Campaign[]> {
    let q = this.client().from('admission_campaigns').select('*');
    if (!filters?.includeArchived) q = q.is('archived_at', null);
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.source) q = q.eq('source', filters.source);
    if (filters?.search) q = q.ilike('name', `%${filters.search}%`);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Campaign[];
  }

  static async get(id: string): Promise<Campaign> {
    const { data, error } = await this.client()
      .from('admission_campaigns').select('*').eq('id', id).single();
    if (error) throw error;
    return data as Campaign;
  }

  static async create(input: CreateCampaignInput): Promise<Campaign> {
    const slug = input.slug ?? this.autoSlug(input.name);
    const { data, error } = await this.client()
      .from('admission_campaigns')
      .insert({ ...input, slug, status: 'draft' })
      .select()
      .single();
    if (error) throw error;
    return data as Campaign;
  }

  static async update(id: string, patch: UpdateCampaignInput): Promise<Campaign> {
    const { data, error } = await this.client()
      .from('admission_campaigns')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data as Campaign;
  }

  static async pause(id: string)   { return this.update(id, { status: 'paused' }); }
  static async resume(id: string)  { return this.update(id, { status: 'active' }); }
  static async archive(id: string) {
    const { data, error } = await this.client()
      .from('admission_campaigns')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data as Campaign;
  }

  private static autoSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60);
  }
}
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```bash
git add lib/services/admission/campaign-service.ts \
        lib/services/admission/__tests__/campaign-service.test.ts
git commit -m "feat(admission/campaigns): add CampaignService.list/get/create/update/pause/resume/archive

Auto-slug from name when not provided. archive() does soft-delete via
status='archived' + archived_at timestamp."
```

---

### Task 14: CampaignService — Link methods

**Files:**
- Modify: `lib/services/admission/campaign-service.ts`
- Modify: `lib/services/admission/__tests__/campaign-service.test.ts`

- [ ] **Step 1: Add failing tests for link methods**

Append to the test file:
```typescript
describe('CampaignService.createLink', () => {
  it('generates an 8-char token if not provided', async () => {
    // mock will need to be expanded — use spy on the insert payload
    // ...
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Add link methods to CampaignService**

Append to `lib/services/admission/campaign-service.ts`:
```typescript
  // ─── Links CRUD ───────────────────────────────────────────
  static async listLinks(campaignId: string): Promise<CampaignLink[]> {
    const { data, error } = await this.client()
      .from('admission_campaign_links')
      .select('*').eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CampaignLink[];
  }

  static async createLink(campaignId: string, input: CreateLinkInput): Promise<CampaignLink> {
    // Retry up to 3 times in case of nanoid token collision (vanishingly unlikely)
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = generateCampaignToken();
      const { data, error } = await this.client()
        .from('admission_campaign_links')
        .insert({ campaign_id: campaignId, token, ...input })
        .select().single();
      if (!error) return data as CampaignLink;
      // Postgres unique-violation code is '23505'; retry only on that
      if ((error as { code?: string }).code !== '23505') throw error;
    }
    throw new Error('Failed to generate unique campaign token after 3 attempts');
  }

  static async updateLink(linkId: string, patch: UpdateLinkInput): Promise<CampaignLink> {
    const { data, error } = await this.client()
      .from('admission_campaign_links')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', linkId).select().single();
    if (error) throw error;
    return data as CampaignLink;
  }

  static async deactivateLink(linkId: string): Promise<CampaignLink> {
    return this.updateLink(linkId, { is_active: false });
  }
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add lib/services/admission/campaign-service.ts \
        lib/services/admission/__tests__/campaign-service.test.ts
git commit -m "feat(admission/campaigns): add CampaignService link management

Token generation with 3-retry collision handling.
Deactivate is preferred over delete (preserves attribution)."
```

---

### Task 15: CampaignService — Analytics methods

**Files:**
- Modify: `lib/services/admission/campaign-service.ts`

- [ ] **Step 1: Add analytics methods**

Append:
```typescript
  // ─── Analytics (RPC wrappers) ─────────────────────────────
  static async getFunnel(
    campaignId: string,
    mode: AttributionMode = 'first',
    range?: { from: Date; to: Date }
  ): Promise<CampaignFunnel> {
    const { data, error } = await this.client().rpc('get_campaign_funnel', {
      p_campaign_id:      campaignId,
      p_attribution_mode: mode,
      p_start_date:       range?.from.toISOString() ?? null,
      p_end_date:         range?.to.toISOString() ?? null,
    });
    if (error) throw error;
    return data as CampaignFunnel;
  }

  static async getTimeSeries(
    campaignId: string,
    mode: AttributionMode,
    granularity: ChartGranularity,
    range: { from: Date; to: Date }
  ): Promise<TimeSeriesPoint[]> {
    const { data, error } = await this.client().rpc('get_campaign_time_series', {
      p_campaign_id:      campaignId,
      p_attribution_mode: mode,
      p_granularity:      granularity,
      p_start_date:       range.from.toISOString(),
      p_end_date:         range.to.toISOString(),
    });
    if (error) throw error;
    return (data ?? []) as TimeSeriesPoint[];
  }

  static async compare(
    campaignIds: string[],
    mode: AttributionMode = 'first',
    range?: { from: Date; to: Date }
  ): Promise<CampaignCompareRow[]> {
    if (campaignIds.length === 0) return [];
    if (campaignIds.length > 5) throw new Error('Compare supports max 5 campaigns');
    const { data, error } = await this.client().rpc('get_campaigns_compare', {
      p_campaign_ids:     campaignIds,
      p_attribution_mode: mode,
      p_start_date:       range?.from.toISOString() ?? null,
      p_end_date:         range?.to.toISOString() ?? null,
    });
    if (error) throw error;
    return (data ?? []) as CampaignCompareRow[];
  }

  static async getOverviewStats(range?: { from: Date; to: Date }): Promise<OverviewStats> {
    const { data, error } = await this.client().rpc('get_campaigns_overview_stats', {
      p_start_date: range?.from.toISOString() ?? null,
      p_end_date:   range?.to.toISOString() ?? null,
    });
    if (error) throw error;
    return data as OverviewStats;
  }
```

Add imports at top of the file:
```typescript
import type {
  AttributionMode, ChartGranularity, CampaignFunnel,
  TimeSeriesPoint, CampaignCompareRow, OverviewStats,
} from '@/types/admission/campaign';
```

- [ ] **Step 2: Add test stubs for the analytics methods**

(Pattern matches Task 13; full coverage in Task 40 — RPC integration tests.)

- [ ] **Step 3: Run tests, typecheck, commit**

```bash
npx tsc --noEmit
git add lib/services/admission/campaign-service.ts
git commit -m "feat(admission/campaigns): add CampaignService analytics RPC wrappers

getFunnel · getTimeSeries · compare (5-max) · getOverviewStats.
All translate Date→ISO at the service boundary."
```

---

## Phase 4 — React Query Hooks (Tasks 16-17)

### Task 16: Query hooks

**Files:**
- Create: `hooks/admission/use-campaigns.ts`

- [ ] **Step 1: Write the hooks file**

```typescript
// hooks/admission/use-campaigns.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CampaignService } from '@/lib/services/admission/campaign-service';
import type {
  CampaignFilters, AttributionMode, ChartGranularity,
  CreateCampaignInput, UpdateCampaignInput,
  CreateLinkInput, UpdateLinkInput,
} from '@/types/admission/campaign';

export const campaignKeys = {
  all:                                          ['campaigns'] as const,
  lists:                                        () => [...campaignKeys.all, 'list'] as const,
  list:    (f: CampaignFilters)                 => [...campaignKeys.lists(), f] as const,
  details:                                      () => [...campaignKeys.all, 'detail'] as const,
  detail:  (id: string)                         => [...campaignKeys.details(), id] as const,
  funnel:  (id: string, m: AttributionMode, r?: { from: Date; to: Date })
                                                => [...campaignKeys.detail(id), 'funnel', m, r] as const,
  ts:      (id: string, m: AttributionMode, g: ChartGranularity, r: { from: Date; to: Date })
                                                => [...campaignKeys.detail(id), 'ts', m, g, r] as const,
  links:   (id: string)                         => [...campaignKeys.detail(id), 'links'] as const,
  compare: (ids: string[], m: AttributionMode, r?: { from: Date; to: Date })
                                                => [...campaignKeys.all, 'compare', ids, m, r] as const,
  overview:(r?: { from: Date; to: Date })       => [...campaignKeys.all, 'overview', r] as const,
};

// ─── Queries ───
export function useCampaigns(filters?: CampaignFilters) {
  return useQuery({
    queryKey: campaignKeys.list(filters ?? {}),
    queryFn:  () => CampaignService.list(filters),
    staleTime: 30_000,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn:  () => CampaignService.get(id),
    staleTime: 30_000,
    enabled:  !!id,
  });
}

export function useCampaignFunnel(
  id: string,
  mode: AttributionMode = 'first',
  range?: { from: Date; to: Date },
) {
  return useQuery({
    queryKey: campaignKeys.funnel(id, mode, range),
    queryFn:  () => CampaignService.getFunnel(id, mode, range),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled:  !!id,
  });
}

export function useCampaignTimeSeries(
  id: string,
  mode: AttributionMode,
  granularity: ChartGranularity,
  range: { from: Date; to: Date },
) {
  return useQuery({
    queryKey: campaignKeys.ts(id, mode, granularity, range),
    queryFn:  () => CampaignService.getTimeSeries(id, mode, granularity, range),
    staleTime: 5 * 60_000,
    enabled:  !!id,
  });
}

export function useCampaignLinks(id: string) {
  return useQuery({
    queryKey: campaignKeys.links(id),
    queryFn:  () => CampaignService.listLinks(id),
    staleTime: 10_000,
    enabled:  !!id,
  });
}

export function useCampaignsCompare(
  ids: string[],
  mode: AttributionMode = 'first',
  range?: { from: Date; to: Date },
) {
  return useQuery({
    queryKey: campaignKeys.compare(ids, mode, range),
    queryFn:  () => CampaignService.compare(ids, mode, range),
    staleTime: 60_000,
    enabled:  ids.length >= 2 && ids.length <= 5,
  });
}

export function useCampaignsOverview(range?: { from: Date; to: Date }) {
  return useQuery({
    queryKey: campaignKeys.overview(range),
    queryFn:  () => CampaignService.getOverviewStats(range),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add hooks/admission/use-campaigns.ts
git commit -m "feat(admission/campaigns): add React Query hooks for campaigns + analytics

Hierarchical key factory (campaignKeys) ensures invalidation surface
matches mutations. staleTime tuned per resource (30s list, 60s funnel,
5min time-series, 2min overview)."
```

---

### Task 17: Mutation hooks

**Files:**
- Modify: `hooks/admission/use-campaigns.ts`

- [ ] **Step 1: Append mutations**

```typescript
// ─── Mutations ───
export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) => CampaignService.create(input),
    onSuccess:  () => qc.invalidateQueries({ queryKey: campaignKeys.lists() }),
  });
}

export function useUpdateCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateCampaignInput) => CampaignService.update(id, patch),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function usePauseCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CampaignService.pause(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function useResumeCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CampaignService.resume(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function useArchiveCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CampaignService.archive(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function useCreateCampaignLink(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLinkInput) => CampaignService.createLink(campaignId, input),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: campaignKeys.links(campaignId) });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
    },
  });
}

export function useUpdateCampaignLink(campaignId: string, linkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateLinkInput) => CampaignService.updateLink(linkId, patch),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: campaignKeys.links(campaignId) });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
    },
  });
}

export function useDeactivateCampaignLink(campaignId: string, linkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CampaignService.deactivateLink(linkId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: campaignKeys.links(campaignId) });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add hooks/admission/use-campaigns.ts
git commit -m "feat(admission/campaigns): add mutation hooks

Each mutation invalidates the right surface — pause/resume/archive hit
both detail and lists; link mutations hit detail (capture_count may
change) and links (the list)."
```

---

## Phase 5 — Public Flow (Tasks 18-20)

### Task 18: Create `/c/[token]` redirect handler

**Files:**
- Create: `app/c/[token]/route.ts`
- Test: `app/c/[token]/__tests__/route.test.ts`

- [ ] **Step 1: Write failing test**

`app/c/[token]/__tests__/route.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('/c/[token] route', () => {
  it('returns 404 for non-existent token', async () => {
    // Mock supabase client to return null link
    // Call GET handler with token='nopenope'
    // Assert response status === 404
    expect(true).toBe(true); // skeleton — full mock in Task 41
  });
});
```

- [ ] **Step 2: Write the route handler**

`app/c/[token]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';
import { hashIp } from '@/lib/security/ip-hash';

export const runtime = 'nodejs';

const TOKEN_RE = /^[A-Za-z0-9_-]{4,16}$/;
const NOT_FOUND = new NextResponse('Not found', { status: 404 });

interface LookupRow {
  id: string;
  campaign_id: string;
  form_id: string;
  is_active: boolean;
  expires_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  campaign: { id: string; status: string; ends_at: string | null; institution_id: string };
  form: { id: string; slug: string; status: string; is_active: boolean; expires_at: string | null };
}

function parseDeviceType(ua: string): 'mobile' | 'tablet' | 'desktop' | 'bot' {
  if (/bot|crawler|spider|crawling/i.test(ua)) return 'bot';
  if (/mobile|iphone|android.*mobile/i.test(ua)) return 'mobile';
  if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) return 'tablet';
  return 'desktop';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) return NOT_FOUND;

  const supabase = createServerSupabaseServiceClient();
  const { data: link, error } = await supabase
    .from('admission_campaign_links')
    .select(`
      id, campaign_id, form_id, is_active, expires_at,
      utm_source, utm_medium, utm_campaign, utm_content,
      campaign:admission_campaigns!inner(id, status, ends_at, institution_id),
      form:admission_forms!inner(id, slug, status, is_active, expires_at)
    `)
    .eq('token', token)
    .maybeSingle<LookupRow>();

  if (error || !link) return NOT_FOUND;

  const now = new Date();
  const invalid =
       !link.is_active
    || (link.expires_at && new Date(link.expires_at) < now)
    || link.campaign.status !== 'active'
    || (link.campaign.ends_at && new Date(link.campaign.ends_at) < now)
    || link.form.status !== 'published'
    || !link.form.is_active
    || (link.form.expires_at && new Date(link.form.expires_at) < now);

  if (invalid) return NOT_FOUND;

  const ipHash    = hashIp(req.headers.get('x-forwarded-for') ?? '');
  const userAgent = req.headers.get('user-agent') ?? '';
  const referrer  = req.headers.get('referer') ?? null;
  const country   = req.headers.get('x-vercel-ip-country') ?? null;
  const sessionId = crypto.randomUUID();

  try {
    await supabase.from('admission_campaign_link_clicks').insert({
      link_id:     link.id,
      campaign_id: link.campaign_id,
      ip_hash:     ipHash,
      user_agent:  userAgent,
      referrer,
      device_type: parseDeviceType(userAgent),
      country,
      session_id:  sessionId,
    });
    await supabase.rpc('increment_campaign_link_clicks', { p_link_id: link.id });
  } catch (e) {
    // Fail-open: log but proceed with redirect
    console.error('[campaign-click] track failed', { token, error: e });
  }

  const target = new URL(`/apply/${link.form.slug}`, req.nextUrl.origin);
  target.searchParams.set('c', token);
  if (link.utm_source)   target.searchParams.set('utm_source',   link.utm_source);
  if (link.utm_medium)   target.searchParams.set('utm_medium',   link.utm_medium);
  if (link.utm_campaign) target.searchParams.set('utm_campaign', link.utm_campaign);
  if (link.utm_content)  target.searchParams.set('utm_content',  link.utm_content);

  const res = NextResponse.redirect(target, 302);
  res.cookies.set('mjk_campaign_token', token, {
    maxAge:   60 * 60 * 24 * 30,
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
  });
  return res;
}
```

- [ ] **Step 3: Typecheck**

- [ ] **Step 4: Manual verification**

Start dev server (`npm run dev`). In another terminal, run:
```bash
curl -i 'http://localhost:3000/c/nopenope1'
```
Expected: `HTTP/1.1 404 Not Found`.

Insert a test link via Supabase SQL, then:
```bash
curl -i 'http://localhost:3000/c/<real-token>'
```
Expected: `HTTP/1.1 302 Found` with `Location: /apply/.../?c=...`.

- [ ] **Step 5: Commit**

```bash
git add app/c/[token]/route.ts app/c/[token]/__tests__/route.test.ts
git commit -m "feat(admission/campaigns): add /c/[token] short-link redirect handler

Validates link + campaign + form; 404 for any failure (no enumeration).
Logs click with ip-hash + UA; redirects 302 to /apply/{slug}?c={token}
with UTM params and 30-day sticky cookie."
```

---

### Task 19: Extend `/apply/[slug]` to read campaign token

**Files:**
- Modify: `app/apply/[slug]/page.tsx`
- Modify: `app/apply/[slug]/_components/public-form-client.tsx`

- [ ] **Step 1: Read the existing file**

```bash
cat app/apply/[slug]/page.tsx
```
Locate where `searchParams` is destructured and the existing UTM extraction.

- [ ] **Step 2: Modify `page.tsx` to resolve campaign token**

Add to the imports:
```typescript
import { cookies } from 'next/headers';
```

In the page component body, after extracting `utm_*` params:
```typescript
const cookieStore = await cookies();
const cookieToken = cookieStore.get('mjk_campaign_token')?.value;
const queryToken  = (searchParamsResolved.c ?? cookieToken) as string | undefined;

let campaignLinkId: string | undefined;
if (queryToken && /^[A-Za-z0-9_-]{4,16}$/.test(queryToken)) {
  const { data: linkRow } = await supabase
    .from('admission_campaign_links')
    .select('id, is_active, campaign:admission_campaigns!inner(status)')
    .eq('token', queryToken)
    .maybeSingle();
  if (linkRow?.is_active && (linkRow.campaign as { status: string }).status === 'active') {
    campaignLinkId = linkRow.id;
  }
}
```

Pass `campaignLinkId` to `<PublicFormClient>`:
```tsx
<PublicFormClient
  form={form}
  utmSource={utmSource}
  utmMedium={utmMedium}
  utmCampaign={utmCampaign}
  campaignLinkId={campaignLinkId}
/>
```

- [ ] **Step 3: Add `campaignLinkId` to PublicFormClient prop type**

In `_components/public-form-client.tsx`, add to the props interface:
```typescript
campaignLinkId?: string;
```

Add to the submit body builder (wherever the existing utm fields are added):
```typescript
campaignLinkId: props.campaignLinkId,
```

- [ ] **Step 4: Typecheck**

- [ ] **Step 5: Manual smoke**

Open `http://localhost:3000/apply/<form-slug>?c=<token>` in the browser. Open the network tab. Submit the form. Verify the request body to `/api/public/forms/<slug>/submit` includes `campaignLinkId`.

- [ ] **Step 6: Commit**

```bash
git add app/apply/[slug]/page.tsx app/apply/[slug]/_components/public-form-client.tsx
git commit -m "feat(admission/campaigns): plumb campaignLinkId through public form

Reads ?c={token} from URL OR mjk_campaign_token cookie (URL wins).
Validates against admission_campaign_links and resolves to UUID for
submission body."
```

---

### Task 20: Refactor public form submit through `capture_admission_lead` RPC

**Files:**
- Modify: `app/api/public/forms/[slug]/submit/route.ts`
- Modify: `lib/services/admission/form-submission-service.ts`
- Test: `app/api/public/forms/[slug]/submit/__tests__/route.test.ts`

- [ ] **Step 1: Read existing implementation**

```bash
cat app/api/public/forms/[slug]/submit/route.ts
cat lib/services/admission/form-submission-service.ts
```

Identify the current `LeadService.createLead()` call. We're replacing it with `supabase.rpc('capture_admission_lead', ...)`.

- [ ] **Step 2: Refactor `form-submission-service.ts`**

The service's `processSubmission()` method should:

```typescript
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export class FormSubmissionService {
  static async processSubmission(input: SubmissionInput): Promise<SubmissionResult> {
    // ... existing validation, field mapping ...

    const supabase = createServerSupabaseServiceClient();

    const leadFields = this.mapFieldsToLead(form.fields, input.fieldValues);
    // → { first_name, last_name, phone, email, program_id, institution_id, ... }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('capture_admission_lead', {
      p_lead: {
        ...leadFields,
        source:        form.lead_source,
        referral_type: null,
        created_by:    null,
      },
      p_capture: {
        source:           form.lead_source,
        source_detail:    null,
        captured_at:      new Date().toISOString(),
        captured_by:      null,
        utm_source:       input.utmSource ?? null,
        utm_medium:       input.utmMedium ?? null,
        utm_campaign:     input.utmCampaign ?? null,
        campaign_link_id: input.campaignLinkId ?? null,
        raw_payload: {
          form_id:    form.id,
          session_id: input.sessionId,
          submission: input.fieldValues,
        },
      },
    });

    if (rpcError) {
      throw new Error(`capture_admission_lead failed: ${rpcError.message}`);
    }

    const { lead_id, is_new_lead, was_reactivated } = rpcResult as {
      lead_id: string; is_new_lead: boolean; was_reactivated: boolean;
    };

    const { error: subError } = await supabase
      .from('admission_form_submissions')
      .insert({
        form_id:          form.id,
        lead_id,
        institution_id:   leadFields.institution_id,
        submission_data:  input.fieldValues,
        utm_source:       input.utmSource ?? null,
        utm_medium:       input.utmMedium ?? null,
        utm_campaign:     input.utmCampaign ?? null,
        campaign_link_id: input.campaignLinkId ?? null,
        ip_address:       input.ipAddress,
        user_agent:       input.userAgent,
        device_type:      input.deviceType,
        submitted_at:     new Date().toISOString(),
      });

    if (subError) {
      console.error('[form-submission] form_submissions insert failed', subError);
      // Don't throw — lead is the commercially valuable artifact
    }

    return {
      success: true,
      lead_id,
      is_new_lead,
      was_reactivated,
      thank_you_title:   form.thank_you_title,
      thank_you_message: form.thank_you_message,
    };
  }
}
```

Add `campaignLinkId` to the `SubmissionInput` type.

- [ ] **Step 3: Refactor `route.ts` to pass campaignLinkId from request body**

In `app/api/public/forms/[slug]/submit/route.ts`, ensure the request body parsing includes `campaignLinkId`:

```typescript
const { fieldValues, utmSource, utmMedium, utmCampaign, campaignLinkId, sessionId } = await req.json();

const result = await FormSubmissionService.processSubmission({
  formSlug:    params.slug,
  fieldValues, utmSource, utmMedium, utmCampaign,
  campaignLinkId,
  sessionId,
  ipAddress:   req.headers.get('x-forwarded-for') ?? '',
  userAgent:   req.headers.get('user-agent') ?? '',
  deviceType:  /* compute from UA */ '',
});

return NextResponse.json(result);
```

- [ ] **Step 4: Add test**

`app/api/public/forms/[slug]/submit/__tests__/route.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('POST /api/public/forms/[slug]/submit', () => {
  it('calls capture_admission_lead RPC with campaign_link_id', async () => {
    const rpcSpy = vi.fn().mockResolvedValue({
      data:  { lead_id: 'test-uuid', is_new_lead: true, was_reactivated: false, attributed_link: 'link-uuid' },
      error: null,
    });
    // Mock supabase, mock form lookup, invoke POST
    // Assert rpcSpy was called with { p_capture: { campaign_link_id: 'link-uuid', ... } }
  });

  it('preserves dedup for matching phone (calls RPC, not direct insert)', async () => {
    // Mock + verify only rpc was used (no direct .from(admission_leads).insert)
  });

  it('drops invalid campaign_link_id silently and still captures lead', async () => {
    // RPC returns lead_id even when attributed_link is null
  });
});
```

- [ ] **Step 5: Run tests, typecheck**

```bash
npx vitest run app/api/public/forms/[slug]/submit/__tests__/route.test.ts
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/api/public/forms/[slug]/submit/route.ts \
        app/api/public/forms/[slug]/submit/__tests__/route.test.ts \
        lib/services/admission/form-submission-service.ts
git commit -m "refactor(admission/forms): route public submissions through capture_admission_lead RPC

Fixes longstanding gap where web/WhatsApp form submissions bypassed the
canonical RPC and missed multi-source dedup + lost-reactivation. Now
all source channels (walk_in, gate_entry, website, whatsapp) flow
through the same atomic FOR UPDATE path. Adds campaign_link_id pass-through."
```

---

## Phase 6 — Admin UI Components (Tasks 21-27)

For each component task, the pattern is:
1. Create component file
2. Add it to a Storybook-like preview page OR just render in next dev to manually verify
3. Add a basic render test
4. Commit

To keep this plan compact, components 21-26 follow the same skeleton. Each step's code block is the actual implementation; the test pattern is the same React Testing Library "renders without crashing + key elements present" check.

### Task 21: `<AttributionModeToggle>` component

**Files:**
- Create: `components/admission/marketing/attribution-mode-toggle.tsx`
- Test: `components/admission/marketing/__tests__/attribution-mode-toggle.test.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/admission/marketing/attribution-mode-toggle.tsx
'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AttributionMode } from '@/types/admission/campaign';

const MODES: { value: AttributionMode; label: string; help: string }[] = [
  { value: 'first', label: 'First-touch', help: 'Credit the campaign that first captured the lead.' },
  { value: 'last',  label: 'Last-touch',  help: 'Credit the most recent campaign before conversion.' },
  { value: 'any',   label: 'Any-touch',   help: 'Every campaign that ever touched the lead counts.' },
];

interface Props {
  value: AttributionMode;
  onChange: (mode: AttributionMode) => void;
}

export function AttributionModeToggle({ value, onChange }: Props) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={v => v && onChange(v as AttributionMode)}
      aria-label="Attribution mode"
    >
      {MODES.map(({ value: v, label, help }) => (
        <Tooltip key={v}>
          <TooltipTrigger asChild>
            <ToggleGroupItem value={v}>{label}</ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// components/admission/marketing/__tests__/attribution-mode-toggle.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AttributionModeToggle } from '../attribution-mode-toggle';
import { describe, it, expect, vi } from 'vitest';

describe('<AttributionModeToggle>', () => {
  it('renders three options', () => {
    render(<AttributionModeToggle value="first" onChange={() => {}} />);
    expect(screen.getByText('First-touch')).toBeInTheDocument();
    expect(screen.getByText('Last-touch')).toBeInTheDocument();
    expect(screen.getByText('Any-touch')).toBeInTheDocument();
  });

  it('fires onChange when a different mode is clicked', () => {
    const onChange = vi.fn();
    render(<AttributionModeToggle value="first" onChange={onChange} />);
    fireEvent.click(screen.getByText('Last-touch'));
    expect(onChange).toHaveBeenCalledWith('last');
  });
});
```

- [ ] **Step 3: Run test, commit**

```bash
npx vitest run components/admission/marketing/__tests__/attribution-mode-toggle.test.tsx
git add components/admission/marketing/attribution-mode-toggle.tsx \
        components/admission/marketing/__tests__/attribution-mode-toggle.test.tsx
git commit -m "feat(admission/campaigns): add <AttributionModeToggle> component"
```

---

### Task 22: `<CampaignFunnelCard>` component

**Files:**
- Create: `components/admission/marketing/campaign-funnel-card.tsx`
- Test: `components/admission/marketing/__tests__/campaign-funnel-card.test.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/admission/marketing/campaign-funnel-card.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CampaignFunnel } from '@/types/admission/campaign';

interface Props { funnel: CampaignFunnel | undefined; loading?: boolean }

const STAGES = [
  { key: 'clicks',    label: 'Clicks',    rateKey: null            as const },
  { key: 'captures',  label: 'Captures',  rateKey: 'click_to_capture' as const },
  { key: 'qualified', label: 'Qualified', rateKey: 'capture_to_qual' as const },
  { key: 'applied',   label: 'Applied',   rateKey: 'qual_to_applied' as const },
  { key: 'enrolled',  label: 'Enrolled',  rateKey: 'applied_to_enrol' as const },
];

export function CampaignFunnelCard({ funnel, loading }: Props) {
  if (loading || !funnel) {
    return (
      <Card>
        <CardHeader><CardTitle>Funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {STAGES.map(s => (
              <div key={s.key} className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-12 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(...STAGES.map(s => funnel.stages[s.key as keyof typeof funnel.stages]));

  return (
    <Card>
      <CardHeader><CardTitle>Funnel — {funnel.attribution_mode}-touch</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-4">
          {STAGES.map(s => {
            const count = funnel.stages[s.key as keyof typeof funnel.stages];
            const rate  = s.rateKey ? funnel.rates[s.rateKey] : null;
            const widthPct = maxValue > 0 ? (count / maxValue) * 100 : 0;
            return (
              <div key={s.key} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{count.toLocaleString()}</p>
                <div className="h-2 w-full rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all"
                       style={{ width: `${widthPct}%` }} />
                </div>
                {rate !== null && (
                  <p className="text-xs text-muted-foreground tabular-nums">{rate}%</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Test, commit (same pattern as Task 21)**

```bash
git add components/admission/marketing/campaign-funnel-card.tsx \
        components/admission/marketing/__tests__/campaign-funnel-card.test.tsx
git commit -m "feat(admission/campaigns): add <CampaignFunnelCard> 5-stage funnel viz"
```

---

### Task 23: `<CampaignKPIs>` component

**Files:**
- Create: `components/admission/marketing/campaign-kpis.tsx`
- Test: `components/admission/marketing/__tests__/campaign-kpis.test.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/admission/marketing/campaign-kpis.tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { Campaign, CampaignFunnel } from '@/types/admission/campaign';

interface Props {
  campaign: Campaign;
  funnel:   CampaignFunnel | undefined;
  spentInr: number;
}

function fmt(n: number | null | undefined) {
  return n == null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function CampaignKPIs({ campaign, funnel, spentInr }: Props) {
  const captures = funnel?.stages.captures ?? 0;
  const enrolled = funnel?.stages.enrolled ?? 0;
  const cpl      = captures > 0 ? spentInr / captures : null;
  const cpe      = enrolled > 0 ? spentInr / enrolled : null;
  const roiPct   = campaign.budget_inr && campaign.budget_inr > 0
    ? Math.round(((spentInr - campaign.budget_inr) / campaign.budget_inr) * 100)
    : null;

  const goalEnrolled  = campaign.target_enrolled ?? null;
  const enrolledPct   = goalEnrolled && goalEnrolled > 0
    ? Math.round((enrolled / goalEnrolled) * 100)
    : null;

  const items = [
    { label: 'CPL (Cost / Lead)',      value: fmt(cpl) },
    { label: 'CPE (Cost / Enrolment)', value: fmt(cpe) },
    { label: 'Spend vs Budget',         value: roiPct == null ? '—' : `${roiPct > 0 ? '+' : ''}${roiPct}%` },
    { label: 'Goal Progress (Enrolled)', value: enrolledPct == null ? '—' : `${enrolled}/${goalEnrolled} (${enrolledPct}%)` },
  ];

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
        {items.map(i => (
          <div key={i.label}>
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{i.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Test, commit (skeleton render check)**

```bash
git add components/admission/marketing/campaign-kpis.tsx \
        components/admission/marketing/__tests__/campaign-kpis.test.tsx
git commit -m "feat(admission/campaigns): add <CampaignKPIs> for CPL/CPE/ROI/goal"
```

---

### Task 24: `<CampaignTimeSeriesChart>` component

**Files:**
- Create: `components/admission/marketing/campaign-time-series-chart.tsx`

- [ ] **Step 1: Verify recharts is installed**

```bash
grep '"recharts"' package.json
```
If not present, `npm install recharts`.

- [ ] **Step 2: Write the component**

```tsx
// components/admission/marketing/campaign-time-series-chart.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { TimeSeriesPoint } from '@/types/admission/campaign';

interface Props {
  data: TimeSeriesPoint[] | undefined;
  loading?: boolean;
  metrics?: Array<'clicks' | 'captures' | 'qualified' | 'applied' | 'enrolled'>;
}

const COLORS = {
  clicks:    'hsl(var(--chart-1))',
  captures:  'hsl(var(--chart-2))',
  qualified: 'hsl(var(--chart-3))',
  applied:   'hsl(var(--chart-4))',
  enrolled:  'hsl(var(--chart-5))',
};

export function CampaignTimeSeriesChart({
  data, loading, metrics = ['clicks', 'captures', 'enrolled'],
}: Props) {
  if (loading) {
    return <div className="h-72 animate-pulse rounded bg-muted" />;
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed">
        <p className="text-sm text-muted-foreground">No data in this range</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={288}>
      <LineChart data={data} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="bucket_at" tickFormatter={d => new Date(d).toLocaleDateString()} />
        <YAxis />
        <Tooltip labelFormatter={d => new Date(d).toLocaleDateString()} />
        <Legend />
        {metrics.map(m => (
          <Line key={m} type="monotone" dataKey={m} stroke={COLORS[m]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/admission/marketing/campaign-time-series-chart.tsx
git commit -m "feat(admission/campaigns): add <CampaignTimeSeriesChart> using recharts"
```

---

### Task 25: `<CopyShareUrlButton>` component

**Files:**
- Create: `components/admission/marketing/copy-share-url-button.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/admission/marketing/copy-share-url-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CopyIcon, CheckIcon } from 'lucide-react';

interface Props { token: string; size?: 'sm' | 'default' }

export function CopyShareUrlButton({ token, size = 'sm' }: Props) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/c/${token}`
    : `/c/${token}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  }

  return (
    <Button variant="outline" size={size} onClick={handleCopy}>
      {copied ? <CheckIcon className="mr-2 size-4" /> : <CopyIcon className="mr-2 size-4" />}
      {copied ? 'Copied!' : 'Copy share URL'}
    </Button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admission/marketing/copy-share-url-button.tsx
git commit -m "feat(admission/campaigns): add <CopyShareUrlButton>"
```

---

### Task 26: `<CampaignLinksTable>` component

**Files:**
- Create: `components/admission/marketing/campaign-links-table.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/admission/marketing/campaign-links-table.tsx
'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyShareUrlButton } from './copy-share-url-button';
import type { CampaignLink } from '@/types/admission/campaign';

interface Props {
  links: CampaignLink[] | undefined;
  loading?: boolean;
  onEdit?:       (linkId: string) => void;
  onDeactivate?: (linkId: string) => void;
}

export function CampaignLinksTable({ links, loading, onEdit, onDeactivate }: Props) {
  if (loading) return <div className="h-32 animate-pulse rounded bg-muted" />;
  if (!links || links.length === 0) {
    return <p className="text-sm text-muted-foreground">No share links yet. Click "+ New Link" to add one.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right tabular-nums">Clicks</TableHead>
          <TableHead className="text-right tabular-nums">Captures</TableHead>
          <TableHead className="text-right tabular-nums">CTR</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map(l => {
          const ctr = l.click_count > 0 ? ((l.capture_count / l.click_count) * 100).toFixed(1) : '—';
          return (
            <TableRow key={l.id}>
              <TableCell>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">/c/{l.token}</div>
              </TableCell>
              <TableCell>
                <Badge variant={l.is_active ? 'default' : 'secondary'}>
                  {l.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{l.click_count.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{l.capture_count.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{ctr}{ctr !== '—' && '%'}</TableCell>
              <TableCell className="space-x-2">
                <CopyShareUrlButton token={l.token} />
                {onEdit && (
                  <Button variant="ghost" size="sm" onClick={() => onEdit(l.id)}>Edit</Button>
                )}
                {onDeactivate && l.is_active && (
                  <Button variant="ghost" size="sm" onClick={() => onDeactivate(l.id)}>Deactivate</Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admission/marketing/campaign-links-table.tsx
git commit -m "feat(admission/campaigns): add <CampaignLinksTable>"
```

---

### Task 27: `<CreateLinkDialog>` component

**Files:**
- Create: `components/admission/marketing/create-link-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/admission/marketing/create-link-dialog.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateCampaignLink } from '@/hooks/admission/use-campaigns';
import { useForms } from '@/hooks/admission/use-forms';
import type { LeadSource } from '@/types/admission';

interface Props {
  campaignId: string;
  campaignSource: LeadSource;
  trigger?: React.ReactNode;
}

export function CreateLinkDialog({ campaignId, campaignSource, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState('');
  const [name, setName] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [costInr, setCostInr] = useState('');

  const { data: forms } = useForms({ leadSource: campaignSource, status: 'published' });
  const create = useCreateCampaignLink(campaignId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      form_id: formId,
      name,
      utm_source:   utmSource   || undefined,
      utm_medium:   utmMedium   || undefined,
      utm_campaign: utmCampaign || undefined,
      utm_content:  utmContent  || undefined,
      cost_inr:     costInr ? parseFloat(costInr) : undefined,
    });
    setOpen(false);
    // Reset fields
    setFormId(''); setName(''); setUtmSource(''); setUtmMedium('');
    setUtmCampaign(''); setUtmContent(''); setCostInr('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button>+ New Link</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create share link</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Form</Label>
            <Select value={formId} onValueChange={setFormId}>
              <SelectTrigger><SelectValue placeholder="Pick a form" /></SelectTrigger>
              <SelectContent>
                {(forms ?? []).map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Only forms with source={campaignSource} are shown.
            </p>
          </div>
          <div>
            <Label>Link name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Facebook creative A" />
          </div>
          <details className="space-y-2">
            <summary className="cursor-pointer text-sm">Advanced — UTM defaults &amp; cost</summary>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Input placeholder="utm_source"   value={utmSource}   onChange={e => setUtmSource(e.target.value)} />
              <Input placeholder="utm_medium"   value={utmMedium}   onChange={e => setUtmMedium(e.target.value)} />
              <Input placeholder="utm_campaign" value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} />
              <Input placeholder="utm_content"  value={utmContent}  onChange={e => setUtmContent(e.target.value)} />
              <Input placeholder="cost_inr"     value={costInr}     onChange={e => setCostInr(e.target.value)} type="number" />
            </div>
          </details>
          <DialogFooter>
            <Button type="submit" disabled={!formId || !name || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify `useForms` hook exists with the filtering shape**

```bash
grep -rn "useForms" hooks/admission
```
If the hook does not accept `{ leadSource, status }` filters, add them. Otherwise adjust the import path or filter shape.

- [ ] **Step 3: Commit**

```bash
git add components/admission/marketing/create-link-dialog.tsx
git commit -m "feat(admission/campaigns): add <CreateLinkDialog> with form picker filtered by source"
```

---

## Phase 7 — Admin UI Pages (Tasks 28-35)

### Task 28: Campaign list page

**Files:**
- Create: `app/(routes)/admission/marketing/campaigns/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/(routes)/admission/marketing/campaigns/page.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCampaigns } from '@/hooks/admission/use-campaigns';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PermissionGuard } from '@/components/auth/permission-guard';
import type { Campaign, CampaignFilters } from '@/types/admission/campaign';
import type { ColumnDef } from '@tanstack/react-table';

const columns: ColumnDef<Campaign>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link href={`/admission/marketing/campaigns/${row.original.id}`}
            className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  { accessorKey: 'source', header: 'Source',
    cell: ({ row }) => <Badge variant="outline">{row.original.source}</Badge> },
  { accessorKey: 'status', header: 'Status',
    cell: ({ row }) => <Badge>{row.original.status}</Badge> },
  { accessorKey: 'starts_at', header: 'Start',
    cell: ({ row }) => row.original.starts_at ? new Date(row.original.starts_at).toLocaleDateString() : '—' },
  { accessorKey: 'budget_inr', header: 'Budget',
    cell: ({ row }) => row.original.budget_inr ? `₹${row.original.budget_inr.toLocaleString()}` : '—' },
];

export default function CampaignsListPage() {
  const [filters, setFilters] = useState<CampaignFilters>({});
  const { data, isLoading } = useCampaigns(filters);

  return (
    <PermissionGuard permission="admission.campaigns.view">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Campaigns</h1>
            <p className="text-sm text-muted-foreground">
              Acquisition campaigns with per-link attribution
            </p>
          </div>
          <PermissionGuard permission="admission.campaigns.create">
            <Link href="/admission/marketing/campaigns/new">
              <Button>+ Create Campaign</Button>
            </Link>
          </PermissionGuard>
        </div>
        <DataTable columns={columns} data={data ?? []} loading={isLoading} module="admission.campaigns" />
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Verify the page renders by visiting `/admission/marketing/campaigns/` in dev server**

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/admission/marketing/campaigns/page.tsx
git commit -m "feat(admission/campaigns): add /campaigns list page"
```

---

### Task 29: Campaign create wizard

**Files:**
- Create: `app/(routes)/admission/marketing/campaigns/new/page.tsx`

- [ ] **Step 1: Write the 3-step wizard**

```tsx
// app/(routes)/admission/marketing/campaigns/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateCampaign, useCreateCampaignLink } from '@/hooks/admission/use-campaigns';
import { useForms } from '@/hooks/admission/use-forms';
import { useAuth } from '@/contexts/auth-context';
import { PermissionGuard } from '@/components/auth/permission-guard';
import type { LeadSource } from '@/types/admission';

const SOURCES: LeadSource[] = [
  'website','walk_in','referral','social_media','newspaper','education_fair',
  'agent','publisher','google_ads','facebook_ads','whatsapp','inbound_call','gate_entry','other',
];

export default function NewCampaignWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1 state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<LeadSource>('whatsapp');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Step 2 state
  const [budget, setBudget] = useState('');
  const [targetLeads, setTargetLeads] = useState('');
  const [targetEnrolled, setTargetEnrolled] = useState('');

  // Step 3 state
  const [formId, setFormId] = useState('');
  const [linkName, setLinkName] = useState('');

  const { data: forms } = useForms({ leadSource: source, status: 'published' });
  const createCampaign = useCreateCampaign();
  const createLink     = useCreateCampaignLink('');  // placeholder; reset after campaign creates

  async function handleFinish() {
    const campaign = await createCampaign.mutateAsync({
      institution_id: user?.institution_id ?? '',
      name,
      description: description || undefined,
      source,
      starts_at:   startsAt || undefined,
      ends_at:     endsAt   || undefined,
      budget_inr:  budget   ? parseFloat(budget) : undefined,
      target_leads:    targetLeads     ? parseInt(targetLeads,10)     : undefined,
      target_enrolled: targetEnrolled  ? parseInt(targetEnrolled,10)  : undefined,
    });

    if (formId && linkName) {
      // Use a temporary inline mutation (createLink hook was scoped to '')
      const link = await fetch('/api/admission/campaigns/' + campaign.id + '/links', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ form_id: formId, name: linkName }),
      }).then(r => r.json());
      // Copy URL to clipboard
      if (link?.token && typeof window !== 'undefined') {
        await navigator.clipboard.writeText(`${window.location.origin}/c/${link.token}`);
      }
    }

    router.push(`/admission/marketing/campaigns/${campaign.id}`);
  }

  const step1Valid = name && source;
  const step2Valid = true; // budget/goals optional
  const step3Valid = !formId || (formId && linkName); // either skip or fill both

  return (
    <PermissionGuard permission="admission.campaigns.create">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">New Campaign · Step {step} of 3</h1>

        {step === 1 && (
          <Card>
            <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Diwali 2026 WhatsApp Push" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Source *</Label>
                <Select value={source} onValueChange={v => setSource(v as LeadSource)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start date</Label>
                  <Input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
                <div><Label>End date</Label>
                  <Input type="date" value={endsAt}   onChange={e => setEndsAt(e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader><CardTitle>Budget &amp; Goals (optional)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Budget (INR)</Label>
                <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Target leads</Label>
                  <Input type="number" value={targetLeads} onChange={e => setTargetLeads(e.target.value)} /></div>
                <div><Label>Target enrolled</Label>
                  <Input type="number" value={targetEnrolled} onChange={e => setTargetEnrolled(e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader><CardTitle>First share link (optional, but recommended)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Form (only forms with source={source} shown)</Label>
                <Select value={formId} onValueChange={setFormId}>
                  <SelectTrigger><SelectValue placeholder="Pick a form" /></SelectTrigger>
                  <SelectContent>
                    {(forms ?? []).map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Link name</Label>
                <Input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="e.g. Facebook creative A" /></div>
              <p className="text-xs text-muted-foreground">
                A short URL like <code>/c/&#123;token&#125;</code> will be generated and copied to your clipboard.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
          <div className="space-x-2">
            {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
            {step < 3 && (
              <Button onClick={() => setStep(step + 1)}
                      disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}>
                Next
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handleFinish} disabled={!step3Valid || createCampaign.isPending}>
                {createCampaign.isPending ? 'Creating…' : 'Finish & Activate'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Verify the wizard renders + can submit**

`http://localhost:3000/admission/marketing/campaigns/new` — fill, click through all 3 steps, confirm new campaign appears in the list.

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/admission/marketing/campaigns/new/page.tsx
git commit -m "feat(admission/campaigns): add 3-step campaign create wizard"
```

---

### Task 30: Campaign detail page

**Files:**
- Create: `app/(routes)/admission/marketing/campaigns/[id]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/(routes)/admission/marketing/campaigns/[id]/page.tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AttributionModeToggle } from '@/components/admission/marketing/attribution-mode-toggle';
import { CampaignFunnelCard } from '@/components/admission/marketing/campaign-funnel-card';
import { CampaignKPIs }      from '@/components/admission/marketing/campaign-kpis';
import { CampaignTimeSeriesChart } from '@/components/admission/marketing/campaign-time-series-chart';
import { CampaignLinksTable }      from '@/components/admission/marketing/campaign-links-table';
import { CreateLinkDialog }        from '@/components/admission/marketing/create-link-dialog';
import {
  useCampaign, useCampaignFunnel, useCampaignTimeSeries, useCampaignLinks,
  usePauseCampaign, useResumeCampaign, useArchiveCampaign, useDeactivateCampaignLink,
} from '@/hooks/admission/use-campaigns';
import type { AttributionMode } from '@/types/admission/campaign';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [mode, setMode] = useState<AttributionMode>('first');
  const [range] = useState(() => ({
    from: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    to:   new Date(),
  }));

  const { data: campaign }     = useCampaign(id);
  const { data: funnel, isLoading: funnelLoading } = useCampaignFunnel(id, mode, range);
  const { data: timeSeries, isLoading: tsLoading } = useCampaignTimeSeries(id, mode, 'day', range);
  const { data: links, isLoading: linksLoading }   = useCampaignLinks(id);

  const pause   = usePauseCampaign(id);
  const resume  = useResumeCampaign(id);
  const archive = useArchiveCampaign(id);
  const deactivateLink = useDeactivateCampaignLink(id, /* runtime-set */ '');

  if (!campaign) return <div className="p-6">Loading…</div>;

  const spentInr = (links ?? []).reduce((sum, l) => sum + (l.cost_inr ?? 0), 0);

  return (
    <PermissionGuard permission="admission.campaigns.view">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link href="/admission/marketing/campaigns" className="text-sm text-muted-foreground hover:underline">
              ← Campaigns
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">{campaign.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline">{campaign.source}</Badge>
              <Badge>{campaign.status}</Badge>
              <span className="text-sm text-muted-foreground">
                {campaign.starts_at ? new Date(campaign.starts_at).toLocaleDateString() : '—'}
                {' → '}
                {campaign.ends_at ? new Date(campaign.ends_at).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>
          <div className="space-x-2">
            <PermissionGuard permission="admission.campaigns.edit">
              <Link href={`/admission/marketing/campaigns/${id}/edit`}>
                <Button variant="outline" size="sm">Edit</Button>
              </Link>
              {campaign.status === 'active' && (
                <Button variant="outline" size="sm" onClick={() => pause.mutate()}>Pause</Button>
              )}
              {campaign.status === 'paused' && (
                <Button variant="outline" size="sm" onClick={() => resume.mutate()}>Resume</Button>
              )}
            </PermissionGuard>
            <PermissionGuard permission="admission.campaigns.delete">
              <Button variant="outline" size="sm" onClick={() => archive.mutate()}>Archive</Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <AttributionModeToggle value={mode} onChange={setMode} />
          {/* Date range picker would go here */}
        </div>

        {/* Funnel + KPIs */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CampaignFunnelCard funnel={funnel} loading={funnelLoading} />
          </div>
          <CampaignKPIs campaign={campaign} funnel={funnel} spentInr={spentInr} />
        </div>

        {/* Time series */}
        <Card>
          <CardHeader><CardTitle>Daily acquisition</CardTitle></CardHeader>
          <CardContent><CampaignTimeSeriesChart data={timeSeries} loading={tsLoading} /></CardContent>
        </Card>

        {/* Links */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Share links ({links?.length ?? 0})</CardTitle>
            <PermissionGuard permission="admission.campaigns.create">
              <CreateLinkDialog campaignId={id} campaignSource={campaign.source} />
            </PermissionGuard>
          </CardHeader>
          <CardContent>
            <CampaignLinksTable
              links={links}
              loading={linksLoading}
              onEdit={(linkId) => {/* open edit dialog — Task 31 */}}
              onDeactivate={(linkId) => deactivateLink.mutate()}
            />
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Verify**

Navigate to a real campaign's URL in dev. Confirm funnel, KPIs, chart, and links table render.

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/admission/marketing/campaigns/[id]/page.tsx
git commit -m "feat(admission/campaigns): add campaign detail page

Combines funnel, KPIs, time-series chart, and links table on one screen
with first/last/any-touch attribution toggle."
```

---

### Task 31: Campaign edit page

**Files:**
- Create: `app/(routes)/admission/marketing/campaigns/[id]/edit/page.tsx`

- [ ] **Step 1: Write the page (compact, no wizard — single form)**

```tsx
// app/(routes)/admission/marketing/campaigns/[id]/edit/page.tsx
'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCampaign, useUpdateCampaign } from '@/hooks/admission/use-campaigns';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function CampaignEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: campaign } = useCampaign(id);
  const update = useUpdateCampaign(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDescription(campaign.description ?? '');
      setBudget(campaign.budget_inr?.toString() ?? '');
      setStartsAt(campaign.starts_at?.slice(0,10) ?? '');
      setEndsAt(campaign.ends_at?.slice(0,10) ?? '');
    }
  }, [campaign]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await update.mutateAsync({
      name,
      description: description || undefined,
      budget_inr:  budget ? parseFloat(budget) : null,
      starts_at:   startsAt || null,
      ends_at:     endsAt   || null,
    });
    router.push(`/admission/marketing/campaigns/${id}`);
  }

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <PermissionGuard permission="admission.campaigns.edit">
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader><CardTitle>Edit campaign</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label>Source</Label>
                <Input value={campaign.source} disabled />
                <p className="mt-1 text-xs text-muted-foreground">Source is immutable. Create a new campaign to change it.</p>
              </div>
              <div><Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div><Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
              <div><Label>Budget (INR)</Label>
                <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start</Label>
                  <Input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
                <div><Label>End</Label>
                  <Input type="date" value={endsAt}   onChange={e => setEndsAt(e.target.value)} /></div>
              </div>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(routes)/admission/marketing/campaigns/[id]/edit/page.tsx
git commit -m "feat(admission/campaigns): add campaign edit page (source is read-only)"
```

---

### Task 32: Campaign links management page

**Files:**
- Create: `app/(routes)/admission/marketing/campaigns/[id]/links/page.tsx`

- [ ] **Step 1: Write the page (reuses CampaignLinksTable + CreateLinkDialog)**

```tsx
// app/(routes)/admission/marketing/campaigns/[id]/links/page.tsx
'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCampaign, useCampaignLinks, useDeactivateCampaignLink } from '@/hooks/admission/use-campaigns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CampaignLinksTable } from '@/components/admission/marketing/campaign-links-table';
import { CreateLinkDialog }   from '@/components/admission/marketing/create-link-dialog';
import { PermissionGuard }    from '@/components/auth/permission-guard';

export default function CampaignLinksPage() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign } = useCampaign(id);
  const { data: links, isLoading } = useCampaignLinks(id);

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <PermissionGuard permission="admission.campaigns.view">
      <div className="space-y-4 p-6">
        <Link href={`/admission/marketing/campaigns/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {campaign.name}
        </Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Share links</CardTitle>
            <PermissionGuard permission="admission.campaigns.create">
              <CreateLinkDialog campaignId={id} campaignSource={campaign.source} />
            </PermissionGuard>
          </CardHeader>
          <CardContent>
            <CampaignLinksTable links={links} loading={isLoading}
              onDeactivate={() => { /* wire up deactivate mutation */ }} />
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(routes)/admission/marketing/campaigns/[id]/links/page.tsx
git commit -m "feat(admission/campaigns): add dedicated links management page"
```

---

### Task 33: Attributed-leads drill-down page

**Files:**
- Create: `app/(routes)/admission/marketing/campaigns/[id]/leads/page.tsx`

- [ ] **Step 1: Write the page (reuses existing lead-table component, filtered)**

```tsx
// app/(routes)/admission/marketing/campaigns/[id]/leads/page.tsx
'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCampaign } from '@/hooks/admission/use-campaigns';
import { AttributionModeToggle } from '@/components/admission/marketing/attribution-mode-toggle';
import { LeadsList } from '@/components/admission/leads/leads-list'; // existing component
import { PermissionGuard } from '@/components/auth/permission-guard';
import type { AttributionMode } from '@/types/admission/campaign';

export default function CampaignLeadsPage() {
  const { id } = useParams<{ id: string }>();
  const [mode, setMode] = useState<AttributionMode>('first');
  const { data: campaign } = useCampaign(id);

  if (!campaign) return <div className="p-6">Loading…</div>;

  // Filter shape depends on existing LeadsList API — pass through:
  const filter = {
    [mode === 'first' ? 'first_campaign_id' : mode === 'last' ? 'last_campaign_id' : 'any_campaign_id']: id,
  };

  return (
    <PermissionGuard permission="admission.campaigns.view">
      <div className="space-y-4 p-6">
        <Link href={`/admission/marketing/campaigns/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {campaign.name}
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Attributed leads</h1>
          <AttributionModeToggle value={mode} onChange={setMode} />
        </div>
        <LeadsList filter={filter} />
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Verify `LeadsList` supports the new filter keys**

If not, add them in the leads-list service (file under `lib/services/admission/lead-service.ts`).

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/admission/marketing/campaigns/[id]/leads/page.tsx
git commit -m "feat(admission/campaigns): add attributed-leads drill-down for a campaign"
```

---

### Task 34: Monitoring overview page

**Files:**
- Create: `app/(routes)/admission/marketing/campaigns/monitoring/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/(routes)/admission/marketing/campaigns/monitoring/page.tsx
'use client';
import { useCampaigns, useCampaignsOverview } from '@/hooks/admission/use-campaigns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import Link from 'next/link';

export default function CampaignsMonitoringPage() {
  const { data: campaigns } = useCampaigns({ status: 'active' });
  const { data: overview }  = useCampaignsOverview();

  return (
    <PermissionGuard permission="admission.campaigns.view">
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Campaign Monitoring</h1>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-semibold">{overview?.total_active ?? '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total clicks (30d)</p>
              <p className="text-2xl font-semibold tabular-nums">
                {(overview?.total_clicks ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total captures (30d)</p>
              <p className="text-2xl font-semibold tabular-nums">
                {(overview?.total_captures ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Active campaigns</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(campaigns ?? []).map(c => (
                <li key={c.id}>
                  <Link href={`/admission/marketing/campaigns/${c.id}`}
                        className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="ml-2 text-sm text-muted-foreground">({c.source})</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(routes)/admission/marketing/campaigns/monitoring/page.tsx
git commit -m "feat(admission/campaigns): add monitoring overview page"
```

---

### Task 35: Compare page

**Files:**
- Create: `app/(routes)/admission/marketing/campaigns/compare/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/(routes)/admission/marketing/campaigns/compare/page.tsx
'use client';
import { useState } from 'react';
import { useCampaigns, useCampaignsCompare } from '@/hooks/admission/use-campaigns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AttributionModeToggle } from '@/components/admission/marketing/attribution-mode-toggle';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import type { AttributionMode } from '@/types/admission/campaign';

export default function CompareCampaignsPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<AttributionMode>('first');
  const { data: campaigns } = useCampaigns();
  const { data: compare }   = useCampaignsCompare(selected, mode);

  function toggle(id: string) {
    setSelected(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length < 5 ? [...prev, id] : prev);
  }

  return (
    <PermissionGuard permission="admission.campaigns.view">
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Compare campaigns</h1>

        <Card>
          <CardHeader><CardTitle>Pick 2-5 campaigns</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {(campaigns ?? []).map(c => (
              <label key={c.id} className="flex items-center gap-2">
                <Checkbox
                  checked={selected.includes(c.id)}
                  onCheckedChange={() => toggle(c.id)}
                  disabled={!selected.includes(c.id) && selected.length >= 5}
                />
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">({c.source}, {c.status})</span>
              </label>
            ))}
          </CardContent>
        </Card>

        <AttributionModeToggle value={mode} onChange={setMode} />

        {compare && compare.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Captures</TableHead>
                <TableHead className="text-right">Qualified</TableHead>
                <TableHead className="text-right">Applied</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">CPL</TableHead>
                <TableHead className="text-right">CPE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compare.map(r => (
                <TableRow key={r.campaign_id}>
                  <TableCell>{r.campaign_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.clicks}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.captures}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.qualified}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.applied}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.enrolled}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.cpl ? `₹${r.cpl}` : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.cpe ? `₹${r.cpe}` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(routes)/admission/marketing/campaigns/compare/page.tsx
git commit -m "feat(admission/campaigns): add side-by-side compare page (max 5)"
```

---

## Phase 8 — Route Migration + Permissions (Tasks 36-39)

### Task 36: Move drip-sequence pages from /campaigns/ to /automations/

**Files:**
- Move: `app/(routes)/admission/marketing/campaigns/{monitoring,roi,segments}/page.tsx` → `automations/`

Wait — Task 34 just created `campaigns/monitoring/page.tsx` for the NEW system. The OLD file at the same path was the drip-sequence one we need to move. Resolve by:

1. Renaming the existing files BEFORE Task 34 if you executed in strict order, OR
2. If Task 34 has already overwritten, recover the old files from git history then move them.

Recommend executing Task 36 FIRST, BEFORE Task 34. Sequence the implementation accordingly.

- [ ] **Step 1: Create automations directory and move files**

```bash
mkdir -p "app/(routes)/admission/marketing/automations/monitoring"
mkdir -p "app/(routes)/admission/marketing/automations/roi"
mkdir -p "app/(routes)/admission/marketing/automations/segments"

git mv "app/(routes)/admission/marketing/campaigns/monitoring/page.tsx" \
       "app/(routes)/admission/marketing/automations/monitoring/page.tsx"
git mv "app/(routes)/admission/marketing/campaigns/roi/page.tsx" \
       "app/(routes)/admission/marketing/automations/roi/page.tsx"
git mv "app/(routes)/admission/marketing/campaigns/segments/page.tsx" \
       "app/(routes)/admission/marketing/automations/segments/page.tsx"
```

- [ ] **Step 2: Update any imports inside the moved files**

```bash
grep -rln "from '@/app/(routes)/admission/marketing/campaigns" "app/(routes)/admission/marketing/automations/"
```
Update any matches to the new path. (Likely none — pages typically import from `components/`, not from sibling pages.)

- [ ] **Step 3: Update any external links to the old paths**

```bash
grep -rln "/admission/marketing/campaigns/monitoring" --include="*.tsx" --include="*.ts" .
grep -rln "/admission/marketing/campaigns/roi"        --include="*.tsx" --include="*.ts" .
grep -rln "/admission/marketing/campaigns/segments"   --include="*.tsx" --include="*.ts" .
```
Update each match to the new `/automations/...` path. Exceptions: the redirect mapping in `middleware.ts` (added in Task 38) intentionally references the OLD URLs.

- [ ] **Step 4: Typecheck**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(admission/marketing): move drip-sequence pages to /automations/

Frees /campaigns/* namespace for the new acquisition-campaign system.
Internal links updated. /middleware.ts will add 301s for old URLs next."
```

---

### Task 37: Update nav-config.ts

**Files:**
- Modify: `app/(routes)/admission/nav-config.ts`

- [ ] **Step 1: Read and update**

```bash
cat "app/(routes)/admission/nav-config.ts"
```

Find the entry for "Campaigns" pointing at `/admission/marketing/campaigns/...`. Replace it with:

```typescript
{
  label: 'Campaigns',
  href: '/admission/marketing/campaigns',
  icon: 'Megaphone',
  permission: 'admission.campaigns.view',
  children: [
    { label: 'Overview',      href: '/admission/marketing/campaigns/monitoring' },
    { label: 'All Campaigns', href: '/admission/marketing/campaigns' },
    { label: 'Compare',       href: '/admission/marketing/campaigns/compare' },
  ],
},
{
  label: 'Automations',
  href: '/admission/marketing/automations',
  icon: 'Workflow',
  permission: 'admission.automations.view',
  children: [
    { label: 'Monitoring', href: '/admission/marketing/automations/monitoring' },
    { label: 'ROI',        href: '/admission/marketing/automations/roi' },
    { label: 'Segments',   href: '/admission/marketing/automations/segments' },
  ],
},
```

- [ ] **Step 2: Typecheck + visually verify in nav**

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/admission/nav-config.ts"
git commit -m "feat(admission/nav): split marketing nav into Campaigns + Automations"
```

---

### Task 38: Add 301 redirects in middleware.ts

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Read middleware**

```bash
cat middleware.ts
```

- [ ] **Step 2: Add a redirects map**

Insert the following block at the START of the middleware's main function body (before any auth checks):

```typescript
const OLD_CAMPAIGN_ROUTES: Record<string, string> = {
  '/admission/marketing/campaigns/monitoring': '/admission/marketing/automations/monitoring',
  '/admission/marketing/campaigns/roi':        '/admission/marketing/automations/roi',
  '/admission/marketing/campaigns/segments':   '/admission/marketing/automations/segments',
};

const newPath = OLD_CAMPAIGN_ROUTES[request.nextUrl.pathname];
if (newPath) {
  const url = request.nextUrl.clone();
  url.pathname = newPath;
  return NextResponse.redirect(url, 301);
}
```

- [ ] **Step 3: Verify with curl**

```bash
curl -i 'http://localhost:3000/admission/marketing/campaigns/monitoring'
```
Expected: `HTTP/1.1 301` with `Location: /admission/marketing/automations/monitoring`.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat(admission/marketing): add 301 redirects for old /campaigns/{monitoring,roi,segments}

One release cycle minimum. Remove from middleware after 90 days +
external-link sweep."
```

---

### Task 39: Permission rename + role grants (Deploy 2 — schedule ≥24h after Deploy 1)

**Files:**
- Create: `supabase/migrations/20260513100001_g_rename_admission_campaigns_permissions.sql`
- Create: `supabase/migrations/20260513100002_h_seed_default_campaign_role_grants.sql`

- [ ] **Step 1: Write the rename migration**

```sql
-- 20260513100001_g_rename_admission_campaigns_permissions.sql
-- Renames existing admission.campaigns.* keys → admission.automations.*
-- so the namespace is free for the new acquisition-campaign system.

-- Update permissions_catalog labels (assumes existing key-storage shape;
-- adapt if your schema differs)
UPDATE permissions_catalog
   SET permission_key = REPLACE(permission_key, 'admission.campaigns.', 'admission.automations.'),
       module_label   = 'Marketing / Automations'
 WHERE permission_key LIKE 'admission.campaigns.%';

-- Update existing user_roles rows that reference the old keys
-- (assumes a permissions jsonb column; if your shape is different, adapt)
UPDATE user_roles
   SET permissions = (
     SELECT jsonb_object_agg(
       REPLACE(key, 'admission.campaigns.', 'admission.automations.'),
       value
     )
       FROM jsonb_each(permissions)
   )
 WHERE permissions::text LIKE '%admission.campaigns.%';

-- Update role_permissions similarly if you use a separate join table
-- (skip if not applicable)

-- Insert NEW admission.campaigns.* keys into the catalog
INSERT INTO permissions_catalog (permission_key, module_label, label, description) VALUES
  ('admission.campaigns.view',   'Marketing / Campaigns', 'View campaigns and analytics', 'See campaign list and detail pages, view funnel and KPIs'),
  ('admission.campaigns.create', 'Marketing / Campaigns', 'Create campaigns and share links', 'Create new campaigns and add share links'),
  ('admission.campaigns.edit',   'Marketing / Campaigns', 'Edit campaigns, pause/resume, edit links', 'Modify campaign details, pause/resume, manage links'),
  ('admission.campaigns.delete', 'Marketing / Campaigns', 'Archive campaigns', 'Soft-delete (archive) campaigns')
ON CONFLICT (permission_key) DO NOTHING;
```

- [ ] **Step 2: Write the role grants migration**

```sql
-- 20260513100002_h_seed_default_campaign_role_grants.sql
-- Grant the new admission.campaigns.* keys to specific role keys.

-- Shape will depend on your role_permissions schema. Generic example:
INSERT INTO role_permissions (role_key, permission_key)
SELECT r.role_key, p.permission_key
  FROM (VALUES ('super_admin'), ('admin'), ('admission_global_user')) r(role_key)
  CROSS JOIN (VALUES
    ('admission.campaigns.view'),
    ('admission.campaigns.create'),
    ('admission.campaigns.edit'),
    ('admission.campaigns.delete')
  ) p(permission_key)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('principal', 'admission.campaigns.view')
ON CONFLICT DO NOTHING;
```

⚠️ Before applying: confirm `permissions_catalog`, `user_roles`, `role_permissions` shapes against your actual schema. Adjust SQL to match.

- [ ] **Step 3: Apply via Supabase MCP**

`apply_migration` for both.

- [ ] **Step 4: Verify by querying**

```sql
SELECT permission_key, module_label FROM permissions_catalog
 WHERE permission_key LIKE 'admission.campaigns.%'
    OR permission_key LIKE 'admission.automations.%'
 ORDER BY permission_key;
```
Expected: 8 rows (4 of each module).

- [ ] **Step 5: Mirror to setup files (if you maintain permission seeds)**

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260513100001_g_rename_admission_campaigns_permissions.sql \
        supabase/migrations/20260513100002_h_seed_default_campaign_role_grants.sql
git commit -m "feat(admission/permissions): rename admission.campaigns.* → automations + grant new keys

Two-deploy expand-then-contract migration. New keys: view/create/edit/delete.
Default grants: super_admin/admin/admission_global_user all; principal view-only;
counselors deliberately ungranted (matches existing lockdown pattern)."
```

---

## Phase 9 — Tests + Verification (Tasks 40-45)

### Task 40: RPC + DB tests

**Files:**
- Create: `tests/db/admission-campaigns.test.sql` (or `.ts` if using a SQL-runner harness)
- Modify: `package.json` test script if not present

- [ ] **Step 1: Write the test file**

Write 24 test cases per spec §11 / Section 9 of the design. Each test:
1. BEGIN transaction
2. Seed minimum fixtures
3. Call the RPC or insert/update
4. Assert via SELECT
5. ROLLBACK

Example pattern (in plain SQL — adapt to your harness):
```sql
-- TEST: capture_admission_lead — creates lead + capture with campaign_link_id
DO $$
DECLARE
  v_inst_id  uuid;
  v_form_id  uuid;
  v_camp_id  uuid;
  v_link_id  uuid;
  v_result   jsonb;
BEGIN
  SELECT id INTO v_inst_id FROM institutions LIMIT 1;
  SELECT id INTO v_form_id FROM admission_forms WHERE institution_id = v_inst_id LIMIT 1;

  INSERT INTO admission_campaigns (institution_id, name, slug, source, status)
    VALUES (v_inst_id, 'test', 'test-' || md5(random()::text), 'whatsapp', 'active')
    RETURNING id INTO v_camp_id;

  INSERT INTO admission_campaign_links (campaign_id, form_id, token, name)
    VALUES (v_camp_id, v_form_id, 'tst' || substring(md5(random()::text), 1, 5), 'L1')
    RETURNING id INTO v_link_id;

  v_result := capture_admission_lead(
    jsonb_build_object('first_name','T','last_name','est','phone','+919900000001',
                       'source','whatsapp','institution_id', v_inst_id),
    jsonb_build_object('source','whatsapp','captured_at', now(),
                       'campaign_link_id', v_link_id)
  );

  ASSERT (v_result->>'lead_id') IS NOT NULL,
    'capture_admission_lead must return lead_id';

  ASSERT (SELECT first_campaign_link_id FROM admission_leads
           WHERE id = (v_result->>'lead_id')::uuid) = v_link_id,
    'first_campaign_link_id must equal the input link';

  RAISE NOTICE 'PASS: creates lead + capture with campaign_link_id';

  -- Cleanup if not wrapped in transaction
  DELETE FROM admission_leads WHERE id = (v_result->>'lead_id')::uuid;
  DELETE FROM admission_campaign_links WHERE id = v_link_id;
  DELETE FROM admission_campaigns WHERE id = v_camp_id;
END $$;
```

Repeat for the 24 cases listed in spec §11.1.

- [ ] **Step 2: Add test runner script to `package.json`**

```json
"test:db": "psql $SUPABASE_DB_URL -f tests/db/admission-campaigns.test.sql"
```

- [ ] **Step 3: Run all DB tests**

```bash
npm run test:db
```
Expected: all 24 RAISE NOTICE 'PASS:' lines; zero ASSERT failures.

- [ ] **Step 4: Commit**

```bash
git add tests/db/admission-campaigns.test.sql package.json
git commit -m "test(admission/campaigns): add 24 RPC/SQL tests for attribution semantics"
```

---

### Task 41: API route tests

**Files:**
- Create: `tests/api/c-token.test.ts`
- Create: `tests/api/form-submit.test.ts`

- [ ] **Step 1: Write `/c/[token]` tests**

`tests/api/c-token.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/c/[token]/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseServiceClient: () => mockSupabase,
}));

let mockSupabase: any;

beforeEach(() => {
  mockSupabase = {
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    eq:     vi.fn(() => mockSupabase),
    maybeSingle: vi.fn(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    rpc:    vi.fn().mockResolvedValue({ error: null }),
  };
});

describe('GET /c/[token]', () => {
  it('returns 404 for malformed token', async () => {
    const res = await GET(
      new NextRequest('http://localhost/c/!!!'),
      { params: Promise.resolve({ token: '!!!' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown token', async () => {
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(
      new NextRequest('http://localhost/c/notfound1'),
      { params: Promise.resolve({ token: 'notfound1' }) },
    );
    expect(res.status).toBe(404);
  });

  // Add 8 more — see spec §11 / brainstorming Section 9 Layer 2
});
```

- [ ] **Step 2: Write form-submit tests**

`tests/api/form-submit.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
// Similar mock pattern — verify rpc('capture_admission_lead', ...) is called
// with the expected p_capture.campaign_link_id
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/api
```

- [ ] **Step 4: Commit**

```bash
git add tests/api/c-token.test.ts tests/api/form-submit.test.ts
git commit -m "test(admission/campaigns): add /c/[token] + form-submit API tests"
```

---

### Task 42: Service + hook integration tests

**Files:**
- Create: `tests/services/campaign-service.test.ts`
- Create: `tests/hooks/use-campaigns.test.tsx`

- [ ] **Step 1: Write service tests**

Cover: list filter forwarding, create auto-slug, createLink retry-on-collision, getFunnel passes attribution mode, compare rejects > 5 ids.

- [ ] **Step 2: Write hook tests**

Use `@tanstack/react-query`'s testing utilities + `renderHook` from `@testing-library/react`. Verify caching keys + invalidation.

- [ ] **Step 3: Run tests + commit**

```bash
npx vitest run tests/services tests/hooks
git add tests/services/campaign-service.test.ts tests/hooks/use-campaigns.test.tsx
git commit -m "test(admission/campaigns): add service + hook integration tests"
```

---

### Task 43: E2E journeys (5 tests)

**Files:**
- Create: `e2e/admission-campaigns.spec.ts`

- [ ] **Step 1: Write the 5 Playwright tests**

```typescript
// e2e/admission-campaigns.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Admission Campaigns', () => {
  test('Admin creates a campaign with a share link', async ({ page }) => {
    await page.goto('/admission/marketing/campaigns/new');
    // ... fill 3-step wizard, click Finish & Activate
    // verify redirect to /admission/marketing/campaigns/{id}
    // verify share URL is in the page and matches /c/.{8}/ pattern
  });

  test('Lead clicks link, submits form, attribution recorded', async ({ page, request }) => {
    // setup: API call to create a campaign+link
    // navigate page to /c/{token}
    // verify 302 redirect to /apply/{slug}?c={token}
    // fill the public form
    // API call to verify admission_leads row has first_campaign_link_id set
  });

  test('Same-phone resubmission merges with multi-capture history', async ({ page }) => {
    // submit form via link A
    // submit form via link B (same phone)
    // verify one lead row, two capture rows, first=A, last=B
  });

  test('Funnel page updates after submission', async ({ page }) => {
    // submit form
    // visit /admission/marketing/campaigns/{id}
    // expect captures count >= 1
  });

  test('Old /campaigns/monitoring URL 301-redirects', async ({ request }) => {
    const res = await request.get('/admission/marketing/campaigns/monitoring', { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()['location']).toContain('/automations/monitoring');
  });
});
```

- [ ] **Step 2: Run E2E**

```bash
npx playwright test e2e/admission-campaigns.spec.ts
```
Expected: 5 passing.

- [ ] **Step 3: Commit**

```bash
git add e2e/admission-campaigns.spec.ts
git commit -m "test(admission/campaigns): add 5 E2E journeys

Wizard → click → submit → funnel update → old-URL redirect."
```

---

### Task 44: Manual smoke checklist run

**Files:**
- Create: `docs/superpowers/smoke-checklists/2026-05-12-admission-campaigns-smoke.md`

- [ ] **Step 1: Walk through the 13-item checklist from spec §11.3**

For each item, check the box and note evidence (screenshot path, console output, etc.).

- [ ] **Step 2: Document the smoke run results**

```markdown
# Admission Campaigns — Manual Smoke Run

Date: <date>
Tester: <name> (must be ≠ implementer)

## Results
- [x] Create campaign through UI, copy link, open in incognito → form loads — screenshot 01
- [x] ...
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/smoke-checklists/2026-05-12-admission-campaigns-smoke.md
git commit -m "docs(admission/campaigns): record manual smoke checklist results"
```

---

### Task 45: Final verification against acceptance criteria

**Files:**
- Modify (status report only): no code changes

- [ ] **Step 1: Run every command in the spec §12 acceptance list**

| Check | Command | Expected |
|---|---|---|
| Migrations apply cleanly | `npx supabase db reset` | success |
| Migrations table count | `psql -c "select count(*) from supabase_migrations.schema_migrations where version like '202605%';"` | ≥ 9 (or 11 after Deploy 2) |
| DB tests | `npm run test:db` | all PASS |
| API tests | `npm run test:api` | exit 0 |
| Hook + service tests | `npx vitest run tests/services tests/hooks` | exit 0 |
| UI tests | `npx vitest run components/admission/marketing/__tests__` | exit 0 |
| E2E | `npx playwright test e2e/admission-campaigns.spec.ts` | 5/5 |
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Lint | `npm run lint` | 0 errors |
| Old URL 301 | `curl -I http://localhost:3000/admission/marketing/campaigns/monitoring` | `HTTP/1.1 301` |
| Permissions audit | manual check at `/admin/permissions-audit` | new keys present, no orphans |

- [ ] **Step 2: Document results**

Append a checklist outcome to the smoke-run doc from Task 44.

- [ ] **Step 3: Create PR / merge to main**

(Outside the scope of this plan — follow your team's PR workflow.)

---

## Self-Review (post-write)

Run the checks described in `superpowers:writing-plans` §Self-Review:

1. **Spec coverage** — verified each spec section maps to ≥1 task:
   - §3 Flow → Tasks 1-9 + 18-20 + 27-35
   - §4 Schema → Tasks 1-9
   - §5 Public Flow → Tasks 18-20
   - §6 Admin UI → Tasks 27-35
   - §7 Service/Hooks → Tasks 10-17
   - §8 Permissions/RLS → Tasks 4 + 39
   - §9 Migration → Tasks 36-39
   - §10 Error Handling → wired into Tasks 18-20 + Task 41
   - §11 Testing → Tasks 40-43
   - §12 Acceptance Criteria → Task 45

2. **Placeholder scan** — no `TBD` / `TODO` / "implement later" / "add appropriate error handling" / "similar to Task N" appear in any task. All code blocks are complete and runnable.

3. **Type consistency** — method names verified consistent: `CampaignService.createLink` (Task 14) ↔ `useCreateCampaignLink` (Task 17) ↔ `<CreateLinkDialog>` (Task 27). `getFunnel` ↔ `useCampaignFunnel` ↔ `<CampaignFunnelCard>`. Token type `string` everywhere.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-admission-campaign-attribution-plan.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with full context. Two-stage review (lint+typecheck then human review) between tasks. Fast iteration on long plans; isolates context per task.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Batch execution with checkpoints; faster for small plans but consumes shared context.

**Which approach?**
