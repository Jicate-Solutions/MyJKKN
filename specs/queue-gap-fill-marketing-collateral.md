# Spec: Marketing Collateral Approvals — Queue Gap Fill

**Status**: SPEC ONLY (no code, no migration, no PR this session per Director's directive)
**Stream**: D-3 (per /cnext brief 2026-04-26)
**Source signal**: Google Chat audit 2025-04-26 → 2026-04-26 → **59 decision-requests in 365 days**, largest unbuilt module by volume. **4× growth** between 90d → 365d windows.
**Stakeholders**: Designer Jicate (Designer Jicate / Jicate Designer), Ramesh, Communications team
**Approver in current chat workflow**: Director (Omm)

---

## Why This Spec Exists

For 12 months, ~5 marketing-collateral approval requests per month flow through Google Chat: posters, brochures, press releases, social-media graphics, banner designs, video reels, event swag mockups. Each one ends up as a chat message with attached images/PDFs to Director, asking for approval before printing/publishing.

This is precisely the workflow MyJKKN should absorb (per the Chat Bypass program — `/Users/omm/PROJECTS/MyJKKN/specs/chat-bypass-workflow-gravity.md`). Director said this is the **#1 unbuilt module** ranked by 365d ask volume.

---

## §1 — User Stories

### Designer / Comms team submits collateral for approval

> *As a designer, I want to upload a poster mockup, name the campaign + target date, and route it to Director for approval, without using Google Chat — so the approval is tracked, has an audit trail, and doesn't get lost in the chat scroll.*

### Director approves / requests revision

> *As Director, I want a queued list of pending collateral approvals with thumbnail previews, so I can approve/reject in 30 seconds per item from `/dashboard` or `/admin/marketing-collateral` without opening Google Chat.*

### Approval-history retrieval

> *As Comms head, I want to see all approved collateral for a given campaign or quarter, so I can audit what was published in JKKN's name without searching multiple chat threads.*

---

## §2 — Schema Sketch (NOT a migration — for design only)

```sql
-- Table: marketing_collateral_approvals
-- Belongs in supabase/setup/01_tables.sql when implemented (date-stamped comment).

CREATE TABLE marketing_collateral_approvals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  -- Submitter
  submitted_by          UUID NOT NULL REFERENCES profiles(id),
  submitter_role        VARCHAR(50),               -- 'designer', 'comms_team', 'department_head'
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Collateral metadata
  collateral_type       VARCHAR(50) NOT NULL,      -- 'poster','brochure','social_post','press_release','video_reel','banner','swag','other'
  campaign_name         VARCHAR(200),              -- e.g. 'Admissions 2026 Drive', 'Diwali Greeting'
  target_publish_date   DATE,                      -- when designer needs approval by
  channel               VARCHAR(50),               -- 'print','social','email','website','event'
  -- Asset
  asset_urls            JSONB DEFAULT '[]',        -- array of {url, type, size_kb}
  thumbnail_url         TEXT,                      -- pre-computed thumb for queue card
  brief_description     TEXT NOT NULL,             -- 2-3 sentence context
  -- Approval workflow
  status                VARCHAR(30) NOT NULL DEFAULT 'pending_approval',
                        -- 'pending_approval','approved','revision_requested','rejected','withdrawn','published'
  final_approver_id     UUID REFERENCES profiles(id),  -- defaults to Director (super_admin) on insert
  approved_by           UUID REFERENCES profiles(id),
  approved_at           TIMESTAMPTZ,
  revision_notes        TEXT,                      -- approver's "please change X"
  rejection_reason      TEXT,
  -- Post-publish
  published_url         TEXT,                      -- where it actually appeared
  published_at          TIMESTAMPTZ,
  -- Audit
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mca_status_submitted ON marketing_collateral_approvals(status, submitted_at);
CREATE INDEX idx_mca_institution ON marketing_collateral_approvals(institution_id);
CREATE INDEX idx_mca_approver ON marketing_collateral_approvals(final_approver_id) WHERE status='pending_approval';
```

---

## §3 — RLS Sketch

Standard MyJKKN pattern (see `CLAUDE.md` Role System section):

```sql
-- SELECT: super_admin + user_has_permission('marketing.collateral.view') + role_has_institution_access(institution_id)
-- INSERT: user_has_permission('marketing.collateral.submit')
-- UPDATE: super_admin OR final_approver_id=auth.uid() OR submitted_by=auth.uid() (with status guards)
-- DELETE: super_admin only
```

New permission keys required in `lib/constants/permissions.ts`:
- `marketing.collateral.view`
- `marketing.collateral.submit`
- `marketing.collateral.approve`
- `marketing.collateral.publish` (for post-approval publish-link tracking)

Roles that should get these by default:
- `super_admin` — all
- `designer` (NEW role? or extend `comms_team`?) — submit, view, publish
- `comms_team` — submit, view
- `department_head` — view (visibility into their dept's collateral pipeline)

---

## §4 — Generator Outline (queue work-item emission)

Function: `fn_generate_marketing_collateral_approval_items` (additive to `fn_generate_all_dashboard_work_items` orchestrator).

```sql
CREATE OR REPLACE FUNCTION fn_generate_marketing_collateral_approval_items()
RETURNS INT AS $$
DECLARE
  v_created INT := 0;
  v_row RECORD;
  v_target UUID;
  v_key TEXT;
  v_hours INT;
BEGIN
  FOR v_row IN
    SELECT id, campaign_name, collateral_type, channel,
           target_publish_date, final_approver_id, brief_description, thumbnail_url,
           EXTRACT(EPOCH FROM (NOW() - submitted_at))/3600 AS hours_pending
    FROM marketing_collateral_approvals
    WHERE status = 'pending_approval'
      AND submitted_at < NOW() - INTERVAL '4 hours'   -- give designer-side a settle window
      AND submitted_at > NOW() - INTERVAL '60 days'
    ORDER BY target_publish_date ASC NULLS LAST, submitted_at ASC
    LIMIT 100
  LOOP
    v_target := COALESCE(v_row.final_approver_id, fn_resolve_dashboard_target(NULL));  -- Stream A helper
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_hours := v_row.hours_pending::INT;
    v_key := 'marketing_collateral:' || v_row.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:approval',
      CASE WHEN v_row.target_publish_date <= CURRENT_DATE + 1 THEN 'urgent'
           WHEN v_hours > 48 THEN 'high'
           ELSE 'normal' END,
      'Collateral approval pending: ' || COALESCE(v_row.campaign_name, v_row.collateral_type),
      LEFT(v_row.brief_description, 140) || ' | publish-by ' || COALESCE(v_row.target_publish_date::text, 'TBD'),
      jsonb_build_object(
        'mca_id', v_row.id,
        'collateral_type', v_row.collateral_type,
        'channel', v_row.channel,
        'thumbnail_url', v_row.thumbnail_url,
        'url', '/admin/marketing-collateral/' || v_row.id::text
      ),
      v_target, v_key,
      CASE WHEN v_row.target_publish_date <= CURRENT_DATE + 1 THEN 4 ELSE 24 END
    );
  END LOOP;
  RETURN v_created;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```

Wire into `fn_generate_all_dashboard_work_items` orchestrator alongside the existing 7 generators (additive `r8 INT := 0; e8 TEXT := NULL; ...`).

---

## §5 — Intake Form Sketch (UI)

### Route: `/admin/marketing-collateral/submit` (or `/marketing/collateral/submit`)

Three visible fields by default (Phase 1A), progressive disclosure for the rest:

1. **What** — `collateral_type` dropdown (Poster | Brochure | Social Post | Press Release | Video Reel | Banner | Event Swag | Other)
2. **Campaign + publish-by** — `campaign_name` text + `target_publish_date` date picker
3. **Asset upload** — drag-drop / file picker, multi-file. Stored in Supabase Storage. Client-side thumbnail extraction for the queue-card preview.

Progressive (advanced) fields:
- `channel` — print/social/email/website/event
- `brief_description` — required textarea (2-3 sentences why)
- `submitter_role` — auto-filled from `profiles.role`
- `final_approver_id` — auto-filled to Director (super_admin) on insert; over-rideable by department_head

Pre-filled from `auth.uid()`:
- `submitted_by`
- `institution_id` (from `profiles.institution_id`)
- `submitter_role`

### Route: `/admin/marketing-collateral/[id]` (status page)

- Shows asset gallery + brief + status timeline (pending → approved / revision_requested / rejected → published).
- If approver: action buttons {Approve | Request Revision | Reject}.
- If submitter: action buttons {Withdraw | Resubmit (if revision_requested)}.
- After approval: `published_url` + `published_at` capture form so audit trail closes.

### Route: `/admin/marketing-collateral` (list)

- Filters: institution, status, channel, campaign, date range.
- Default sort: `target_publish_date ASC NULLS LAST`.
- Tabs: Pending Approval | Revision Requested | Approved (Awaiting Publish) | Published | Rejected.

---

## §6 — Decision Flow

```
[designer/comms_team] ─submit→ marketing_collateral_approvals(status='pending_approval')
                                  │
                                  ↓ orchestrator (every cron tick)
                       fn_generate_marketing_collateral_approval_items()
                                  │
                                  ↓ creates work item in `notifications`(category='dashboard:approval')
                                  │
                                  ↓ Director sees in /dashboard queue
                                  │
                       ┌──────────┴──────────┬─────────────────────┐
                       ↓                     ↓                     ↓
                   {Approve}          {Revise}                {Reject}
                       │                     │                     │
            status='approved'      status='revision_requested'  status='rejected'
            approved_at=NOW         revision_notes set         rejection_reason set
            approved_by=auth.uid()
                       │                     │
                       ↓                     ↓
       [comms publishes externally,    [submitter resubmits → goes back to 'pending_approval']
        captures published_url +
        published_at via UI form]
                       │
                       ↓
            status='published'
            (queue work item auto-dismisses on status transition)
```

---

## §7 — Open Questions (for Director, before implementation)

1. **Multi-step approval?** — should some collateral types (press releases, public-facing banners) require BOTH Comms head AND Director? Or is single-Director-approval enough for v1? (Default assumption: single approval, escalate later if needed.)
2. **Asset retention** — keep all asset versions forever, or auto-archive after publish (30/60/90 days)? Storage cost.
3. **Brand-kit integration** — should there be auto-checks (logo, color palette, font compliance) before submission, or is human approval the only gate? (Default: human-only for v1; add automated brand-kit checks later as separate spec.)
4. **Publish-tracking** — is the `published_url` field reliably captured by Comms post-publish, or does that step need its own enforcement (push reminder N days post-approval)?

---

## §8 — Estimated Implementation Effort

When Director gives the green light to build:
- Schema + RLS + permissions: ~1 day
- Intake form + list + status page UI: ~3 days (with frontend-design skill)
- Generator function + orchestrator wiring: ~0.5 day
- Asset upload to Supabase Storage + thumbnail extraction: ~1 day
- Test accounts + role assignments + RLS verification: ~1 day
- **Total: ~6.5 days for v1 (single-approver, no automated brand checks)**

---

*End spec. NO code, NO migration, NO PR shipped this session.*
