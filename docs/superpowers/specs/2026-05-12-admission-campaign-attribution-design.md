# Admission Campaign Attribution System — Design

| Field | Value |
|---|---|
| Date | 2026-05-12 |
| Author | Boobalan (aidental@jkkn.ac.in) + Claude (brainstorming session) |
| Status | Design — awaiting implementation plan |
| Spec doc | `docs/superpowers/specs/2026-05-12-admission-campaign-attribution-design.md` |
| Implementation plan | _to be produced by `superpowers:writing-plans` next_ |

---

## 1. Problem Statement

Today's admission module supports lead capture via per-source forms (`admission_forms.lead_source`), but it cannot tell you **which specific marketing campaign brought a lead in**. The page at `/admission/marketing/campaigns/monitoring` currently measures **nurture-workflow drip executions** (`admission_drip_sequences` joined to `admission_workflows`) — that is "automation runs against existing leads," not "marketing pushes that acquire new leads."

We run multiple campaigns per channel — WhatsApp Diwali Promo, Facebook January Ad Set, Education Fair Chennai, etc. The same form is shared across these campaigns, so we cannot separate analytics. This design introduces a first-class **acquisition campaign** entity with per-link attribution, click tracking, and a 5-stage funnel, while preserving the existing nurture-workflow system under a renamed `/automations/` route.

---

## 2. Seven Foundational Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Campaign ↔ Source ↔ Form relationship | **1 Campaign → 1 Source → N Forms** (each share-link picks a form) |
| 2 | Share-link URL format | **Short tracked**: `/c/{token}` → 302 → `/apply/{slug}?c={token}`; click logged + cookied |
| 3 | Attribution semantics for multi-touch leads | **Both first-touch AND last-touch** denormalized on `admission_leads`; `any-touch` queryable via captures table |
| 4 | Conversion KPIs to surface | **Full 5-stage funnel**: Clicks → Captures → Qualified → Applied → Enrolled |
| 5 | v1 feature scope | **Core + Budget/ROI + Compare/Time-series**. Deferred: QR codes, channel-integration metadata |
| 6 | Route reorganization | **Two top-level sections**: `/campaigns/` (NEW acquisition) and `/automations/` (RENAMED existing drip-sequence) |
| 7 | Public form submission routing | **Refactor through `capture_admission_lead` RPC** (fixes existing dedup gap for web/WhatsApp leads) |

---

## 3. Current vs. New Flow

### 3.1 Current flow (broken / incomplete)

```mermaid
flowchart LR
  A[Admin creates Form] -->|lead_source=whatsapp| B[(admission_forms)]
  B -->|slug| C[/apply/&#123;slug&#125;]
  C -.shared everywhere.-> D[Lead opens link]
  D -->|fills form| E[FormSubmissionService<br/>direct LeadService.createLead]
  E -->|direct insert| F[(admission_leads)]
  E -->|with utm_*| G[(admission_form_submissions)]
  F -.no campaign link.-> H[/marketing/campaigns/monitoring]
  H -->|reads drip_sequences| I[(admission_workflows)]
  style H fill:#fee
  style G fill:#fef
  style I fill:#fef
```

Disconnect: UTM data lives in `form_submissions` but the monitoring page reads `workflows` — so it cannot show "leads per campaign" even with UTMs.

### 3.2 New flow

```mermaid
flowchart TD
  subgraph ADMIN[Admin in MyJKKN]
    A1[Create Campaign<br/>'Diwali 2026 — WhatsApp'<br/>source=whatsapp, budget=₹50000]
    A2[Create Link #1 — Form A]
    A3[Create Link #2 — Form B]
    A1 --> A2
    A1 --> A3
  end

  subgraph SHARE[Channel distribution]
    B1[Copy short URL<br/>myjkkn.edu/c/dwl9k7p]
    B2[Paste into Meta Ad creative,<br/>WhatsApp broadcast, etc.]
    A2 --> B1 --> B2
    A3 --> B1
  end

  subgraph CLICK[Lead-side]
    C1[Lead clicks /c/dwl9k7p]
    C2[app/c/&#91;token&#93;/route.ts<br/>validate · insert click · cookie · 302]
    C3[Form renders with campaign_link_id<br/>UTM params auto-set from link]
    C4[Submit form]
    B2 --> C1 --> C2 --> C3 --> C4
  end

  subgraph CAPTURE[Lead creation]
    D1[/api/public/forms/&#91;slug&#93;/submit]
    D2[capture_admission_lead RPC<br/>+ campaign_link_id]
    D3[(admission_lead_source_captures<br/>campaign_link_id=dwl9k7p)]
    D4[Trigger: sync_lead_campaign_attribution<br/>sets first/last on admission_leads]
    D5[(admission_leads<br/>first_/last_campaign_link_id)]
    C4 --> D1 --> D2 --> D3 --> D4 --> D5
  end

  subgraph ANALYTICS[Campaign monitoring]
    E1[/admission/marketing/campaigns/&#91;id&#93;]
    E2[get_campaign_funnel RPC<br/>mode='first' / 'last' / 'any']
    E3[5-stage funnel<br/>Clicks → Captures → Qualified → Applied → Enrolled]
    E4[Time-series chart]
    E5[Compare view]
    D5 --> E2 --> E3
    E1 --> E2
    E1 --> E4
    E1 --> E5
  end
```

### 3.3 Attribution chain

```
Lead → source_capture row → campaign_link (token-addressable) → campaign → source
```

`admission_leads` carries two denormalized FKs for fast read:
- `first_campaign_link_id` — set once, on first capture with a link
- `last_campaign_link_id` — overwritten on every re-capture

`admission_lead_source_captures` is the audit-log source of truth (one row per touch). It carries `campaign_link_id` directly.

---

## 4. Database Schema

### 4.1 New tables

```sql
-- ──────────────────────────────────────────────────────────────
-- TABLE: admission_campaigns — parent record
-- ──────────────────────────────────────────────────────────────
CREATE TABLE admission_campaigns (
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

CREATE INDEX idx_campaigns_inst_status ON admission_campaigns (institution_id, status)
  WHERE archived_at IS NULL;
CREATE INDEX idx_campaigns_inst_source ON admission_campaigns (institution_id, source)
  WHERE archived_at IS NULL;
CREATE INDEX idx_campaigns_inst_dates  ON admission_campaigns (institution_id, starts_at, ends_at);

-- ──────────────────────────────────────────────────────────────
-- TABLE: admission_campaign_links — shareable atomic unit
-- ──────────────────────────────────────────────────────────────
CREATE TABLE admission_campaign_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES admission_campaigns(id) ON DELETE CASCADE,
  form_id         uuid NOT NULL REFERENCES admission_forms(id),
  token           text NOT NULL UNIQUE,           -- nanoid(8), URL-safe
  name            text NOT NULL,
  description     text,
  cost_inr        numeric(12,2),
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  is_active       boolean NOT NULL DEFAULT true,
  expires_at      timestamptz,
  click_count     integer NOT NULL DEFAULT 0,     -- denormalized counter
  capture_count   integer NOT NULL DEFAULT 0,     -- denormalized counter
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_links_campaign ON admission_campaign_links (campaign_id);
CREATE INDEX idx_links_form     ON admission_campaign_links (form_id);

-- ──────────────────────────────────────────────────────────────
-- TABLE: admission_campaign_link_clicks — append-only click log
-- ──────────────────────────────────────────────────────────────
CREATE TABLE admission_campaign_link_clicks (
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

CREATE INDEX idx_clicks_campaign_time ON admission_campaign_link_clicks (campaign_id, clicked_at DESC);
CREATE INDEX idx_clicks_link_time     ON admission_campaign_link_clicks (link_id, clicked_at DESC);
CREATE INDEX idx_clicks_session       ON admission_campaign_link_clicks (session_id)
  WHERE session_id IS NOT NULL;
```

### 4.2 Modifications to existing tables

```sql
-- admission_leads
ALTER TABLE admission_leads
  ADD COLUMN first_campaign_link_id uuid REFERENCES admission_campaign_links(id) ON DELETE SET NULL,
  ADD COLUMN last_campaign_link_id  uuid REFERENCES admission_campaign_links(id) ON DELETE SET NULL;
CREATE INDEX idx_leads_first_campaign ON admission_leads (first_campaign_link_id) WHERE first_campaign_link_id IS NOT NULL;
CREATE INDEX idx_leads_last_campaign  ON admission_leads (last_campaign_link_id)  WHERE last_campaign_link_id  IS NOT NULL;

-- admission_lead_source_captures
ALTER TABLE admission_lead_source_captures
  ADD COLUMN campaign_link_id uuid REFERENCES admission_campaign_links(id) ON DELETE SET NULL;
CREATE INDEX idx_captures_campaign_link ON admission_lead_source_captures (campaign_link_id)
  WHERE campaign_link_id IS NOT NULL;

-- admission_form_submissions
ALTER TABLE admission_form_submissions
  ADD COLUMN campaign_link_id uuid REFERENCES admission_campaign_links(id) ON DELETE SET NULL;
CREATE INDEX idx_form_subs_campaign_link ON admission_form_submissions (campaign_link_id)
  WHERE campaign_link_id IS NOT NULL;
```

### 4.3 Triggers

```sql
-- ─── Trigger 1: maintain first/last attribution on admission_leads
CREATE OR REPLACE FUNCTION sync_lead_campaign_attribution()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.campaign_link_id IS NULL THEN RETURN NEW; END IF;

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
END; $$;

CREATE TRIGGER trg_sync_lead_campaign_attribution
AFTER INSERT ON admission_lead_source_captures
FOR EACH ROW EXECUTE FUNCTION sync_lead_campaign_attribution();

-- ─── Trigger 2: back-fill click row when form submission lands
CREATE OR REPLACE FUNCTION link_click_to_submission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.campaign_link_id IS NULL THEN RETURN NEW; END IF;

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
END; $$;

CREATE TRIGGER trg_link_click_to_submission
AFTER INSERT ON admission_form_submissions
FOR EACH ROW EXECUTE FUNCTION link_click_to_submission();
```

### 4.4 RPC extension — `capture_admission_lead`

Add a new `campaign_link_id` key in the `p_capture` JSONB. Body addition:

```sql
DECLARE
  v_campaign_link_id uuid;
BEGIN
  -- ... existing logic ...

  v_campaign_link_id := NULLIF(p_capture->>'campaign_link_id', '')::uuid;

  -- Soft-validate: drop bad attribution rather than failing the capture
  IF v_campaign_link_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admission_campaign_links
                      WHERE id = v_campaign_link_id AND is_active = true) THEN
    v_campaign_link_id := NULL;
  END IF;

  INSERT INTO admission_lead_source_captures (
    lead_id, institution_id, source, source_detail, captured_at, captured_by,
    utm_source, utm_medium, utm_campaign,
    expo_event_id, stall_id, referrer_id, raw_payload,
    campaign_link_id  -- ← NEW
  ) VALUES (..., v_campaign_link_id);

  RETURN jsonb_build_object(
    'lead_id',         v_lead_id,
    'is_new_lead',     v_is_new_lead,
    'was_reactivated', v_was_reactivated,
    'attributed_link', v_campaign_link_id  -- ← NEW
  );
END;
```

### 4.5 Analytics RPCs

`get_campaign_funnel(p_campaign_id, p_attribution_mode, p_start_date, p_end_date) → jsonb`
- Returns `{ stages: {clicks, captures, qualified, applied, enrolled}, rates: {...} }`
- `attribution_mode = 'first' | 'last' | 'any'`
- Funnel-stage rollups use `FILTER (WHERE funnel_stage IN (...))` to include downstream stages

`get_campaign_time_series(p_campaign_id, p_attribution_mode, p_granularity, p_start_date, p_end_date) → TABLE(bucket_at, clicks, captures, qualified, applied, enrolled)`
- Granularity: `'day' | 'week' | 'month'`
- Uses `generate_series` for empty-bucket continuity

`get_campaigns_compare(p_campaign_ids[], p_attribution_mode, p_start_date, p_end_date) → TABLE(...)`
- One row per campaign, with CPL/CPE/conversion_rate computed

`get_campaigns_overview_stats(p_institution_id?, p_start_date, p_end_date) → jsonb`
- Aggregate KPIs across all visible campaigns

`increment_campaign_link_clicks(p_link_id) → void` — single-round-trip counter bump from /c/{token} route

`reconcile_campaign_link_counters() → void` — admin-triggered drift recovery (clicks + captures recomputed from audit tables)

All RPCs are `STABLE SECURITY DEFINER` with explicit `user_has_permission` + `role_has_institution_access` checks.

### 4.6 Full body — `get_campaign_funnel`

The heart of the analytics. The funnel-stage rollups use `FILTER (WHERE funnel_stage IN (...))` so that "Qualified" honestly means "qualified or beyond," because funnel-stage progression is a poset, not a strict ordering — a lead at `interview_completed` has already passed `qualified` and `application_submitted`.

```sql
CREATE OR REPLACE FUNCTION public.get_campaign_funnel(
  p_campaign_id        uuid,
  p_attribution_mode   text    DEFAULT 'first',  -- 'first' | 'last' | 'any'
  p_start_date         timestamptz DEFAULT NULL,
  p_end_date           timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_institution_id uuid;
  v_link_ids       uuid[];
  v_clicks         integer := 0;
  v_captures       integer := 0;
  v_qualified      integer := 0;
  v_applied        integer := 0;
  v_enrolled       integer := 0;
BEGIN
  -- Access control
  SELECT institution_id INTO v_institution_id
    FROM admission_campaigns WHERE id = p_campaign_id;
  IF v_institution_id IS NULL
     OR NOT user_has_permission(auth.uid(), 'admission.campaigns.view')
     OR NOT role_has_institution_access(auth.uid(), v_institution_id) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT array_agg(id) INTO v_link_ids
    FROM admission_campaign_links WHERE campaign_id = p_campaign_id;

  -- Clicks (from append-only log)
  SELECT COUNT(*) INTO v_clicks
    FROM admission_campaign_link_clicks
   WHERE link_id = ANY(v_link_ids)
     AND (p_start_date IS NULL OR clicked_at >= p_start_date)
     AND (p_end_date   IS NULL OR clicked_at <  p_end_date);

  -- Captures + funnel-stage rollups (attribution-mode aware)
  WITH attributed_leads AS (
    SELECT DISTINCT l.id, l.funnel_stage, l.created_at
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
       AND (p_start_date IS NULL OR l.created_at >= p_start_date)
       AND (p_end_date   IS NULL OR l.created_at <  p_end_date)
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE funnel_stage IN (
      'qualified','application_started','application_submitted',
      'documents_pending','documents_verified','interview_scheduled',
      'interview_completed','offer_sent','offer_accepted','token_paid','enrolled')),
    COUNT(*) FILTER (WHERE funnel_stage IN (
      'application_submitted','documents_pending','documents_verified',
      'interview_scheduled','interview_completed','offer_sent',
      'offer_accepted','token_paid','enrolled')),
    COUNT(*) FILTER (WHERE funnel_stage = 'enrolled')
  INTO v_captures, v_qualified, v_applied, v_enrolled
  FROM attributed_leads;

  RETURN jsonb_build_object(
    'campaign_id',      p_campaign_id,
    'attribution_mode', p_attribution_mode,
    'date_range',       jsonb_build_object('from', p_start_date, 'to', p_end_date),
    'stages', jsonb_build_object(
      'clicks',    v_clicks,    'captures',  v_captures,
      'qualified', v_qualified, 'applied',   v_applied,
      'enrolled',  v_enrolled),
    'rates',  jsonb_build_object(
      'click_to_capture', CASE WHEN v_clicks    > 0 THEN ROUND(100.0 * v_captures  / v_clicks,    2) ELSE 0 END,
      'capture_to_qual',  CASE WHEN v_captures  > 0 THEN ROUND(100.0 * v_qualified / v_captures,  2) ELSE 0 END,
      'qual_to_applied',  CASE WHEN v_qualified > 0 THEN ROUND(100.0 * v_applied   / v_qualified, 2) ELSE 0 END,
      'applied_to_enrol', CASE WHEN v_applied   > 0 THEN ROUND(100.0 * v_enrolled  / v_applied,   2) ELSE 0 END,
      'overall',          CASE WHEN v_clicks    > 0 THEN ROUND(100.0 * v_enrolled  / v_clicks,    2) ELSE 0 END)
  );
END; $$;
```

The other analytics RPCs (`get_campaign_time_series`, `get_campaigns_compare`, `get_campaigns_overview_stats`) follow the same access-control prelude + attribution-mode CASE pattern, varying only in their aggregation shape. Full bodies will be produced in the implementation plan.

---

## 5. Public Flow Endpoints

### 5.1 `app/c/[token]/route.ts` (NEW, GET)

Behavior:
1. Look up link + parent campaign + form (single SELECT with joins).
2. Validate: link.is_active, link.expires_at, campaign.status='active', campaign.ends_at, form.status='published'. Any failure → 404 (security: never enumerate).
3. Insert click row into `admission_campaign_link_clicks` with ip_hash, user_agent, referrer, device_type, country, session_id.
4. Increment `admission_campaign_links.click_count` via `increment_campaign_link_clicks` RPC.
5. Build target URL: `/apply/{form.slug}?c={token}&utm_source=...&utm_medium=...&utm_campaign=...&utm_content=...`.
6. Set `mjk_campaign_token` cookie (httpOnly, sameSite=lax, 30-day expiry, secure in prod).
7. 302 redirect (NOT 301 — links may need future retargeting).

Failure handling: click insert wrapped in try/catch, Sentry-captured on failure but **always falls through to redirect** (fail-open per ad-tech convention).

### 5.2 `app/apply/[slug]/page.tsx` (EXISTING — extended)

Add: read `?c={token}` searchParam first, fallback to cookie `mjk_campaign_token`. Validate token against `admission_campaign_links` (must be active + campaign active). If valid, pass `campaignLinkId` (resolved UUID) to client component. Client passes through to submit body.

### 5.3 `app/api/public/forms/[slug]/submit/route.ts` (EXISTING — refactored)

Switch from `LeadService.createLead()` (direct insert) to `capture_admission_lead` RPC. Pass `campaignLinkId` in `p_capture.campaign_link_id`. After RPC returns, also INSERT into `admission_form_submissions` with the same `campaign_link_id` for form-level analytics.

This refactor incidentally fixes the existing dedup bug where web leads couldn't merge with walk-in/gate-entry duplicates on phone match.

---

## 6. Admin UI Structure

### 6.1 New routes

```
/admission/marketing/campaigns/
  ├── page.tsx                        Campaign list (filterable DataTable)
  ├── new/page.tsx                    3-step create wizard
  ├── monitoring/page.tsx             Overview dashboard (grid of campaign cards)
  ├── compare/page.tsx                Side-by-side comparison (2-5 campaigns)
  └── [id]/
        ├── page.tsx                  Detail: funnel + KPIs + time-series + links + leads
        ├── edit/page.tsx             Edit campaign metadata
        ├── links/page.tsx            Share-link manager
        └── leads/page.tsx            Attributed leads drill-down
```

### 6.2 Renamed routes

```
OLD                                              → NEW
/admission/marketing/campaigns/monitoring        → /admission/marketing/automations/monitoring
/admission/marketing/campaigns/roi               → /admission/marketing/automations/roi
/admission/marketing/campaigns/segments          → /admission/marketing/automations/segments
```

`middleware.ts` carries 301 redirects for one release cycle (≥90 days).

### 6.3 Campaign detail page wireframe

```
┌──── Header: name, source, status, dates, spent ──────────────────┐
│  [Attribution: ● First ○ Last ○ Any]   [Date: Last 30 days ▾]   │
└──────────────────────────────────────────────────────────────────┘
┌──── 5-STAGE FUNNEL ──────────────────────────────────────────────┐
│  Clicks    Captures    Qualified    Applied    Enrolled          │
│  1,247       312          98           45          12            │
│              25.0%       31.4%        45.9%      26.7%           │
└──────────────────────────────────────────────────────────────────┘
┌──── KPIs: CPL · CPE · ROI · Goal Progress ──────────────────────┐
└──────────────────────────────────────────────────────────────────┘
┌──── Time-Series Chart (recharts) ────────────────────────────────┐
└──────────────────────────────────────────────────────────────────┘
┌──── Share Links (with click/capture counts + [Copy]) ────────────┐
└──────────────────────────────────────────────────────────────────┘
┌──── Recent Attributed Leads ─────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────┘
```

### 6.4 Create wizard (3 steps)

1. **Basics** — name, slug, description, source (`lead_source` enum), institution, start/end dates
2. **Budget & goals** — budget_inr, target_leads, target_enrolled (all optional)
3. **First share link** — pick form (filtered by source binding), name link, optional UTM overrides, preview generated `/c/{token}` URL

### 6.5 New components

`<CampaignFunnelCard>`, `<CampaignKPIs>`, `<CampaignTimeSeriesChart>`, `<CampaignLinksTable>`, `<CreateLinkDialog>`, `<CopyShareUrlButton>`, `<AttributionModeToggle>`. All under `components/admission/marketing/`. Reuses existing `<DataTable>`, `<DateRangePicker>`, `<PermissionGuard>`, `<AutoTabNav>`.

### 6.6 Navigation update

`app/(routes)/admission/nav-config.ts` adds:

```typescript
{ label: 'Campaigns',  href: '/admission/marketing/campaigns',  icon: 'Megaphone', permission: 'admission.campaigns.view' }
{ label: 'Automations', href: '/admission/marketing/automations', icon: 'Workflow',  permission: 'admission.automations.view' }
```

---

## 7. Service Layer + Hooks

```typescript
// lib/services/admission/campaign-service.ts
class CampaignService {
  list(filters)                                      // SELECT with filters
  get(id)
  create(input)                                      // auto-slug from name
  update(id, patch)
  pause(id) / resume(id) / archive(id)               // soft-archive via status

  createLink(campaignId, input)                      // generates nanoid(8) token
  updateLink(linkId, patch)
  deactivateLink(linkId)

  getFunnel(campaignId, mode, range)                 // rpc → CampaignFunnel
  getTimeSeries(campaignId, mode, granularity, range)// rpc → TimeSeriesPoint[]
  compare(campaignIds[], mode, range)                // rpc → CompareRow[]
  getOverviewStats(range)
}
```

```typescript
// hooks/admission/use-campaigns.ts
useCampaigns(filters)             staleTime 30s
useCampaign(id)
useCampaignFunnel(id, mode, range)  staleTime 60s, refetchInterval 5min
useCampaignTimeSeries(...)          staleTime 5min
useCampaignsCompare(ids, ...)
useCampaignsOverview(range)
useCampaignLinks(campaignId)

// mutations
useCreateCampaign · useUpdateCampaign · usePauseCampaign · useResumeCampaign · useArchiveCampaign
useCreateCampaignLink · useUpdateLink · useDeactivateLink
```

Query keys are namespaced under `['campaigns', ...]` for invalidation surface.

---

## 8. Permission Model + RLS

### 8.1 New permission keys

```
admission.campaigns.view       View campaigns + analytics + share links
admission.campaigns.create     Create new campaigns and share links
admission.campaigns.edit       Edit campaigns, pause/resume, edit/deactivate links
admission.campaigns.delete     Archive (soft delete only)
```

### 8.2 Default role grants

| Role | view | create | edit | delete |
|---|:-:|:-:|:-:|:-:|
| super_admin / admin / admission_global_user | ✅ | ✅ | ✅ | ✅ |
| principal | ✅ | ❌ | ❌ | ❌ |
| admission_counselor / expo_counselor / hr_admin / others | ❌ | ❌ | ❌ | ❌ |

### 8.3 Permission key rename (existing system)

Existing `admission.campaigns.*` keys are renamed to `admission.automations.*` to free the `admission.campaigns.*` namespace for the new system. Migration script updates `user_roles`, `permissions_catalog`, and `module_scopes`. Two-deploy expand-then-contract rollout to avoid permission flicker.

### 8.4 RLS policies

```sql
-- admission_campaigns
CREATE POLICY p_campaigns_select FOR SELECT USING (
  user_has_permission(auth.uid(), 'admission.campaigns.view')
  AND role_has_institution_access(auth.uid(), institution_id)
);
-- (mirror for INSERT/UPDATE with .create/.edit keys)

-- admission_campaign_links — use SECURITY DEFINER helper to avoid RLS recursion
CREATE FUNCTION _campaign_link_institution_id(p_link_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.institution_id FROM admission_campaign_links l
  JOIN admission_campaigns c ON c.id = l.campaign_id WHERE l.id = p_link_id
$$;

CREATE POLICY p_links_select FOR SELECT USING (
  user_has_permission(auth.uid(), 'admission.campaigns.view')
  AND role_has_institution_access(auth.uid(), _campaign_link_institution_id(id))
);

-- admission_campaign_link_clicks — SELECT only; INSERT via service-role from /c/{token}
CREATE POLICY p_clicks_select FOR SELECT USING (
  user_has_permission(auth.uid(), 'admission.campaigns.view')
  AND EXISTS (SELECT 1 FROM admission_campaigns c
              WHERE c.id = campaign_id
                AND role_has_institution_access(auth.uid(), c.institution_id))
);
```

### 8.5 DataTable bypass list

Per memory note `feedback_datatable_must_mirror_permissionguard_bypasses.md`: `components/ui/data-table.tsx` must NOT treat `admission.campaigns.*` as a counselor-bypass module. Verify before merge.

---

## 9. Migration Plan

### 9.1 Order

```
Deploy 1 (code + migrations 1-6):
  1. _create_admission_campaigns_tables.sql           NEW tables
  2. _add_campaign_attribution_columns.sql            NULLABLE columns on existing tables
  3. _create_attribution_triggers.sql                 triggers + functions
  4. _create_attribution_rls_policies.sql             RLS
  5. _extend_capture_admission_lead_rpc.sql           RPC body change
  6. _create_campaign_analytics_rpcs.sql              new RPCs

  Code: new pages live, old pages still work, both perm namespaces accepted

Deploy 2 (code + migrations 7-8, ≥24h later):
  7. _rename_admission_campaigns_permissions.sql      rename old → automations
  8. _seed_default_campaign_role_grants.sql           insert role_permissions

  Code: clean key references everywhere
```

Each migration is independently revertable. Every migration body goes into both `supabase/migrations/<timestamp>_*.sql` AND `supabase/setup/{01_tables,02_functions}.sql` (per memory note `feedback_placeholder_migrations_hide_typos.md`).

### 9.2 Backfill policy

**No backfill.** Pre-migration leads have `first_campaign_link_id=NULL` and appear as "Untracked / Organic" in analytics. We do NOT reconstruct campaigns from past UTM trails — that creates fake history and undermines analytics credibility.

### 9.3 Route migration

3 page files move from `campaigns/{monitoring,roi,segments}/page.tsx` to `automations/{monitoring,roi,segments}/page.tsx`. No code change inside the files. `middleware.ts` gets 301 redirects for the old URLs. Hardcoded internal links audited and updated.

---

## 10. Error Handling Matrix

### 10.1 `/c/{token}` failures

| Scenario | Behavior |
|---|---|
| Token not found / inactive / expired / campaign paused / form unpublished | 404 (never leak which condition) |
| Click insert fails | Fail-open: redirect succeeds; Sentry captures |
| Token regex mismatch | 404 before DB query |

### 10.2 Form submit failures

| Scenario | Behavior |
|---|---|
| `campaign_link_id` invalid | RPC drops attribution silently, lead still captured |
| Same phone resubmits | RPC `FOR UPDATE` merges; one lead, multiple captures |
| Lost lead resubmits | RPC reactivates `lost → new`, `was_reactivated=true` |
| Honeypot triggered | 200 success-shaped, no DB write |
| Rate-limit hit (5/hour/IP) | 429 with retry-after |

### 10.3 Admin mutation failures

| Scenario | Behavior |
|---|---|
| Duplicate slug per institution | UNIQUE violation, friendly UI error |
| Form picker filtered to wrong source | UI prevents at picker level |
| Nanoid collision (~1 in 218T) | Service retries up to 3 times |
| Pause/archive during in-flight captures | In-flight succeed; new clicks 404 |
| Token edit attempt | Blocked — token is immutable post-creation |
| `campaign.source` edit attempt | Blocked — immutable |

### 10.4 Counter drift recovery

Manual admin button calls `reconcile_campaign_link_counters()`. Recomputes `click_count` and `capture_count` from audit tables. Gated behind `admission.campaigns.edit`.

---

## 11. Testing Approach

### 11.1 Test counts

```
Unit / RPC:       ~80 tests
Integration:      ~40 tests
API routes:       ~25 tests
UI components:    ~10 tests
E2E journeys:        5 tests
```

### 11.2 E2E journeys (Playwright)

1. Admin creates campaign + share link via wizard
2. Lead clicks link, fills form; verify first+last attribution set on lead
3. Same-phone resubmission via different campaign; verify merge + multi-capture
4. Funnel page updates within 60s of submission
5. Old `/campaigns/monitoring` 301-redirects to `/automations/monitoring`

### 11.3 Manual smoke checklist (pre-merge)

```
□ Create a campaign through the UI; copy share link; open in incognito → form loads
□ Submit form in incognito; confirm lead appears in admin lead list with campaign attribution
□ Pause the campaign; click the share link again → 404
□ Resume; click again → form loads
□ Open campaign detail; verify funnel matches lead count
□ Toggle attribution mode (First/Last/Any); verify numbers change appropriately
□ Switch date range; verify chart updates
□ Open Compare view; pick 3 campaigns; verify table renders
□ Counselor login → /admission/marketing/campaigns/* returns Unauthorized
□ Principal login → can view campaigns but Create/Edit/Archive buttons hidden
□ Archive a campaign; verify it disappears from default list and reappears with "Show archived" toggle
□ Verify old /campaigns/monitoring URL redirects to /automations/monitoring (301 in DevTools network tab)
□ Verify Sentry receives a synthetic test exception from one of the new tags
```

### 11.4 Performance targets

| Operation | Target |
|---|---|
| `/c/{token}` redirect (warm) | < 80ms TTFB |
| `get_campaign_funnel` (10k leads) | < 500ms |
| `get_campaigns_compare` (5 campaigns) | < 2s |
| Campaign detail page LCP | < 1.5s |
| Click insert throughput | 100 RPS sustained |

---

## 12. Acceptance Criteria

The 12 items that constitute "done":

1. All migrations apply cleanly via `supabase db reset`; 8 rows in `supabase_migrations`.
2. All RPC tests pass (`npm run test:db`).
3. All API route tests pass (`npm run test:api`).
4. All integration / hook tests pass (`npm run test:integration`).
5. All UI component tests pass (`npm run test:ui`).
6. 5/5 E2E journeys green.
7. Manual smoke checklist signed off by reviewer ≠ implementer.
8. `npm run typecheck` zero errors.
9. `npm run lint` zero errors.
10. Migrations committed both to `supabase/migrations/*.sql` AND `supabase/setup/*.sql`.
11. Permissions audit page shows new `admission.campaigns.*` keys + renamed `admission.automations.*` keys, no orphans.
12. Old `/campaigns/{monitoring,roi,segments}` URLs return 301 with correct new Location.

---

## 13. Out of Scope (deferred to v1.1+)

- QR code generation per share link (we have the `qr-code` skill — can ship later)
- Channel-integration metadata jsonb on campaigns (Meta ad set IDs, Google Ads campaign IDs, etc.)
- Meta Ads API / Google Ads API automatic cost imports — v1 budget is admin-entered
- Per-channel campaign tables (`whatsapp_campaigns`, `email_campaigns`) — generic `admission_campaigns` covers all sources
- Multi-touch fractional attribution (split credit %) — v1 is first+last side-by-side, not weighted
- Auto-pause on budget overrun
- Manual lead-to-campaign backfill UI
- Cron-based counter drift reconciliation — manual admin button is sufficient
- WCAG accessibility audit
- Localization
- Cross-browser visual regression
- Penetration testing

---

## 14. Key Memory References Used

This design intentionally builds on prior decisions captured in project memory:

- `project_admission_lead_multi_source_dedup.md` — `capture_admission_lead` RPC semantics (FOR UPDATE atomic, lost→new reactivation)
- `feedback_rls_transitive_recursion_via_exists.md` — SECURITY DEFINER helper pattern (`_campaign_link_institution_id`)
- `feedback_module_scope_needs_matching_perm_keys.md` — no `module_scopes.admission_campaigns` tri-state in v1
- `feedback_placeholder_migrations_hide_typos.md` — migrations land in BOTH `supabase/migrations/` AND `supabase/setup/`
- `feedback_datatable_must_mirror_permissionguard_bypasses.md` — data-table.tsx bypass-list audit before merge
- `feedback_auth_gate_use_auth_provider.md` — page-level perm gates use `useAuth()`, not local profile fetch
- `feedback_supabase_mutations_must_check_error.md` — every `supabase.from(...).insert/update/delete` destructures `{error}`
- `feedback_denormalized_counter_triggers_need_security_definer.md` — `sync_lead_campaign_attribution` is SECURITY DEFINER
- `feedback_dashboard_rpc_role_access_check.md` — analytics RPCs check `user_has_permission` + `role_has_institution_access`
- `project_dynamic_permissions.md` — Role Management is single source of truth; no hardcoded role names in SQL

---

## 15. Implementation Plan Hand-off

This document represents the **design** (the "what" and "why"). The next step is `superpowers:writing-plans` which produces the **implementation plan** (the "how", broken into engineer-executable tasks with exact file paths, code samples, and verification steps per task).
