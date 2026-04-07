# Events Module — Marathon Sub-Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a new `/events/` module in MyJKKN with Marathon as the first sub-module, featuring full feature parity with the KBM Marathon 2.0 handoff spec — registration, dashboard, sponsorship CRM, committees, budget, Live Ops (GPS), results, analytics, and certificates. Includes API endpoints for external marathon app consumption.

**Architecture:** Sub-module pattern — `/events/` is the parent module, `/events/marathon/` is the first child. Each event type (marathon, cultural-fest, seminar) gets its own sub-module with dedicated services, hooks, types, and pages. Core shared tables (`events`, `event_categories`, `event_registrations`) are reused across all event types. Marathon-specific tables (`marathon_sponsors`, `marathon_race_tracks`, etc.) extend the core. External marathon app communicates via REST API endpoints at `/api/events/marathon/`.

**Tech Stack:** Next.js 15 (App Router), TypeScript 5, Supabase (PostgreSQL + RLS), React Query (TanStack), shadcn/ui, Tailwind v3, Zod validation, HDFC SmartGateway (payment)

---

## Table of Contents

1. [Phase 1: Database Schema](#phase-1-database-schema)
2. [Phase 2: Types & Validations](#phase-2-types--validations)
3. [Phase 3: Core Event Service](#phase-3-core-event-service)
4. [Phase 4: Marathon Event Service & CRUD Pages](#phase-4-marathon-event-service--crud-pages)
5. [Phase 5: Registration Module](#phase-5-registration-module)
6. [Phase 6: Sponsorship CRM](#phase-6-sponsorship-crm)
7. [Phase 7: Committees & Tasks](#phase-7-committees--tasks)
8. [Phase 8: Budget Tracker](#phase-8-budget-tracker)
9. [Phase 9: Live Ops Command Center](#phase-9-live-ops-command-center)
10. [Phase 10: Results & Certificates](#phase-10-results--certificates)
11. [Phase 11: Analytics & Race Replay](#phase-11-analytics--race-replay)
12. [Phase 12: Dashboard](#phase-12-dashboard)
13. [Phase 13: Sidebar & Navigation](#phase-13-sidebar--navigation)
14. [Phase 14: API Endpoints (External App)](#phase-14-api-endpoints-external-app)
15. [Phase 15: HDFC Payment Integration](#phase-15-hdfc-payment-integration)
16. [Phase 16: External User Registration](#phase-16-external-user-registration)

---

## Architecture Overview

```
app/(routes)/events/
├── page.tsx                              # Events hub (all event types)
├── marathon/                             # Marathon sub-module
│   ├── page.tsx                          # Marathon events list
│   ├── new/page.tsx                      # Create marathon event
│   └── [id]/
│       ├── dashboard/page.tsx
│       ├── registrations/
│       ├── sponsors/
│       ├── committees/page.tsx
│       ├── budget/page.tsx
│       ├── live/
│       ├── results/page.tsx
│       ├── analytics/page.tsx
│       ├── certificates/page.tsx
│       └── settings/page.tsx

app/api/events/marathon/                  # REST API for external app
├── [eventId]/
│   ├── route.ts                          # GET event details
│   ├── categories/route.ts
│   ├── register/route.ts
│   ├── results/route.ts
│   ├── race/track/route.ts
│   └── payment/

lib/services/events/
├── core/
│   ├── event-base-service.ts             # Shared event CRUD
│   └── hdfc-event-client.ts              # HDFC adapter for events
├── marathon/
│   ├── marathon-event-service.ts
│   ├── marathon-registration-service.ts
│   ├── marathon-sponsor-service.ts
│   ├── marathon-committee-service.ts
│   ├── marathon-budget-service.ts
│   ├── marathon-live-ops-service.ts
│   ├── marathon-results-service.ts
│   ├── marathon-analytics-service.ts
│   └── marathon-certificate-service.ts

hooks/events/
├── core/use-events.ts
├── marathon/
│   ├── use-marathon-events.ts
│   ├── use-marathon-dashboard.ts
│   ├── use-marathon-registrations.ts
│   ├── use-marathon-sponsors.ts
│   ├── use-marathon-committees.ts
│   ├── use-marathon-budget.ts
│   ├── use-marathon-live-ops.ts
│   ├── use-marathon-results.ts
│   └── use-marathon-analytics.ts

types/
├── events.ts                             # Core event types
├── events-marathon.ts                    # Marathon-specific types

lib/validations/
├── events.ts
├── events-marathon.ts
```

### Database Schema Overview

```
CORE TABLES (shared):
  events ──────────────── event_categories
    │                         │
    ├── event_registrations ──┘
    │     │
    │     └── event_external_participants
    │
    └── event_payment_transactions

MARATHON EXTENSION TABLES:
  events ──┬── marathon_sponsors
           │     ├── marathon_sponsor_deliverables
           │     └── marathon_sponsor_activity_log
           ├── marathon_committees
           │     └── marathon_tasks
           ├── marathon_budget_items
           ├── marathon_checkpoints
           │     └── marathon_checkpoint_scans
           ├── marathon_results
           ├── marathon_incidents
           ├── marathon_volunteer_checkins
           ├── marathon_race_tracks
           └── marathon_race_track_points
```

---

## Phase 1: Database Schema

### Task 1.1: Create Core Events Tables

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append at end)
- Modify: `supabase/SQL_FILE_INDEX.md` (update index)

**Step 1: Add core events tables to 01_tables.sql**

Append the following SQL at the end of `supabase/setup/01_tables.sql`:

```sql
-- ============================================================================
-- EVENTS MODULE — Core Tables (shared by all event types)
-- Created: 2026-04-07
-- ============================================================================

-- Base event table — holds common fields for all event types
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  event_type TEXT NOT NULL,  -- 'marathon', 'cultural_fest', 'seminar', 'workshop', 'sports_day', 'conference'
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- for public URLs: /public/events/kbm-marathon-2026
  description TEXT,
  theme TEXT,
  tagline TEXT,
  
  -- Dates
  event_date DATE,
  start_time TIME,
  end_time TIME,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  registration_open_date TIMESTAMPTZ,
  registration_close_date TIMESTAMPTZ,
  
  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planning','preparation','execution','live','post_event','archived','cancelled')),
  
  -- Configuration (JSONB for type-specific settings)
  config JSONB NOT NULL DEFAULT '{}',
  registration_config JSONB NOT NULL DEFAULT '{}',
  route_config JSONB NOT NULL DEFAULT '{}',
  branding_config JSONB NOT NULL DEFAULT '{}',
  
  -- Capacity
  target_registrations INT,
  max_registrations INT,
  
  -- Visibility & Access
  is_public BOOLEAN NOT NULL DEFAULT true,
  allow_external_registration BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Recurrence
  previous_event_id UUID REFERENCES public.events(id),
  year INT,
  edition_number INT,
  
  -- Media
  hero_image_url TEXT,
  hero_video_url TEXT,
  venue TEXT,
  venue_address TEXT,
  venue_coordinates JSONB,  -- {lat, lng}
  
  -- Audit
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_institution ON public.events(institution_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events(slug);
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(event_date);

-- Event categories (race categories for marathon, competition categories for cultural fest, etc.)
CREATE TABLE IF NOT EXISTS public.event_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,                 -- short code: '10K', '5K', '3K'
  description TEXT,
  distance_km NUMERIC(8,2), -- for marathon categories
  max_participants INT,
  min_age INT,
  max_age INT,
  fee_amount NUMERIC(10,2) DEFAULT 0,
  early_bird_fee NUMERIC(10,2),
  early_bird_deadline TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_categories_event ON public.event_categories(event_id);

-- External participants who don't have JKKN accounts
CREATE TABLE IF NOT EXISTS public.event_external_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  age INT,
  gender TEXT,
  date_of_birth DATE,
  blood_group TEXT,
  organization TEXT,         -- their school/college/company
  city TEXT,
  state TEXT,
  id_proof_type TEXT,
  id_proof_number TEXT,
  photo_url TEXT,
  linked_profile_id UUID REFERENCES public.profiles(id),  -- if they later become JKKN user
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone)
);

CREATE INDEX IF NOT EXISTS idx_event_ext_participants_phone ON public.event_external_participants(phone);

-- Unified registration table
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.event_categories(id),
  
  -- Participant identity (one of these will be set)
  profile_id UUID REFERENCES public.profiles(id),
  learner_id UUID,  -- references learners_profiles(id) but no FK for flexibility
  external_participant_id UUID REFERENCES public.event_external_participants(id),
  
  -- Participant type
  participant_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (participant_type IN ('internal', 'external')),
  
  -- Denormalized participant info (for quick display without joins)
  participant_name TEXT NOT NULL,
  participant_phone TEXT,
  participant_email TEXT,
  participant_age INT,
  participant_gender TEXT,
  institution_id UUID REFERENCES public.institutions(id),
  institution_name TEXT,
  department TEXT,
  
  -- Registration identifiers
  bib_number TEXT UNIQUE,
  registration_number TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('pending','registered','confirmed','checked_in','cancelled','disqualified','no_show','waitlisted')),
  checked_in BOOLEAN DEFAULT false,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES public.profiles(id),
  
  -- Payment
  payment_status TEXT DEFAULT 'not_required'
    CHECK (payment_status IN ('not_required','pending','paid','refunded','waived','failed')),
  payment_amount NUMERIC(10,2) DEFAULT 0,
  payment_method TEXT,
  payment_reference TEXT,
  discount_code TEXT,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  
  -- Event-specific custom data
  custom_data JSONB DEFAULT '{}',  -- tshirt_size, emergency_contact, dietary_pref, etc.
  
  -- Source tracking
  source TEXT DEFAULT 'internal',  -- 'internal', 'external_app', 'bulk_upload', 'admin'
  referral_source TEXT,
  
  -- Audit
  registered_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON public.event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_category ON public.event_registrations(category_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_profile ON public.event_registrations(profile_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_phone ON public.event_registrations(participant_phone);
CREATE INDEX IF NOT EXISTS idx_event_registrations_bib ON public.event_registrations(bib_number);
CREATE INDEX IF NOT EXISTS idx_event_registrations_status ON public.event_registrations(status);
CREATE INDEX IF NOT EXISTS idx_event_registrations_institution ON public.event_registrations(institution_id);

-- Payment transactions for events (separate from billing payment_transactions)
CREATE TABLE IF NOT EXISTS public.event_payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id),
  registration_id UUID REFERENCES public.event_registrations(id),
  transaction_ref TEXT UNIQUE NOT NULL,  -- unique reference for HDFC
  
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated','processing','success','failed','cancelled','expired','refunded')),
  
  payment_method TEXT,
  gateway_session_id TEXT UNIQUE,
  gateway_transaction_id TEXT,
  gateway_response JSONB,
  
  payer_name TEXT,
  payer_phone TEXT,
  payer_email TEXT,
  
  discount_code TEXT,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_amount NUMERIC(10,2),
  refund_reason TEXT,
  
  institution_id UUID REFERENCES public.institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_payments_event ON public.event_payment_transactions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_registration ON public.event_payment_transactions(registration_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_status ON public.event_payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_event_payments_session ON public.event_payment_transactions(gateway_session_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_ref ON public.event_payment_transactions(transaction_ref);
```

**Step 2: Run the SQL on Supabase**

Use Supabase MCP or SQL Editor to execute the core tables.

**Step 3: Commit**

```bash
git add supabase/setup/01_tables.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(events): add core events tables — events, categories, registrations, external participants, payments"
```

---

### Task 1.2: Create Marathon Extension Tables

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append after core tables)

**Step 1: Add marathon extension tables**

Append after the core tables:

```sql
-- ============================================================================
-- EVENTS MODULE — Marathon Extension Tables
-- Created: 2026-04-07
-- ============================================================================

-- Sponsors with pipeline tracking (CRM)
CREATE TABLE IF NOT EXISTS public.marathon_sponsors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  logo_url TEXT,
  tier TEXT DEFAULT 'prospect'
    CHECK (tier IN ('prospect','contacted','negotiating','committed','platinum','gold','silver','bronze','in_kind')),
  amount_pledged NUMERIC(10,2) DEFAULT 0,
  amount_received NUMERIC(10,2) DEFAULT 0,
  benefits TEXT,              -- what we offer
  expectations TEXT,          -- what they expect
  notes TEXT,
  pipeline_stage TEXT DEFAULT 'lead'
    CHECK (pipeline_stage IN ('lead','contacted','proposal_sent','negotiating','committed','declined','churned')),
  signed_date DATE,
  institution_id UUID REFERENCES public.institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_sponsors_event ON public.marathon_sponsors(event_id);

-- Sponsor deliverables checklist
CREATE TABLE IF NOT EXISTS public.marathon_sponsor_deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sponsor_id UUID NOT NULL REFERENCES public.marathon_sponsors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,              -- 'branding', 'logistics', 'media', 'activation'
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sponsor interaction history
CREATE TABLE IF NOT EXISTS public.marathon_sponsor_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sponsor_id UUID NOT NULL REFERENCES public.marathon_sponsors(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'call', 'email', 'meeting', 'payment', 'note'
  description TEXT NOT NULL,
  performed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Committees for event organization
CREATE TABLE IF NOT EXISTS public.marathon_committees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- 'Logistics', 'Medical', 'Marketing', 'Tech'
  description TEXT,
  lead_id UUID REFERENCES public.profiles(id),
  lead_name TEXT,
  member_ids UUID[] DEFAULT '{}',
  member_names TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_committees_event ON public.marathon_committees(event_id);

-- Tasks assigned to committees
CREATE TABLE IF NOT EXISTS public.marathon_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  committee_id UUID NOT NULL REFERENCES public.marathon_committees(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled','blocked')),
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  assigned_to UUID REFERENCES public.profiles(id),
  assigned_to_name TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_tasks_committee ON public.marathon_tasks(committee_id);
CREATE INDEX IF NOT EXISTS idx_marathon_tasks_event ON public.marathon_tasks(event_id);

-- Budget line items
CREATE TABLE IF NOT EXISTS public.marathon_budget_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category TEXT NOT NULL,     -- 'venue', 'logistics', 'marketing', 'prizes', 'food', 'medical', 'misc'
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense'
    CHECK (type IN ('income','expense')),
  estimated_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'planned'
    CHECK (status IN ('planned','approved','spent','cancelled')),
  approved_by UUID REFERENCES public.profiles(id),
  vendor TEXT,
  receipt_url TEXT,
  notes TEXT,
  institution_id UUID REFERENCES public.institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_budget_event ON public.marathon_budget_items(event_id);

-- Route checkpoints
CREATE TABLE IF NOT EXISTS public.marathon_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- 'Water Station 1', 'Medical Post 2', 'KM 5 Marker'
  type TEXT DEFAULT 'waypoint'
    CHECK (type IN ('start','finish','water','medical','waypoint','km_marker')),
  distance_from_start_km NUMERIC(8,3),
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  qr_code_data TEXT,           -- QR code content for scanning
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_checkpoints_event ON public.marathon_checkpoints(event_id);

-- QR scan records at checkpoints
CREATE TABLE IF NOT EXISTS public.marathon_checkpoint_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checkpoint_id UUID NOT NULL REFERENCES public.marathon_checkpoints(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id),
  registration_id UUID REFERENCES public.event_registrations(id),
  bib_number TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanned_by TEXT,             -- volunteer name or 'self'
  lat NUMERIC(10,7),
  lng NUMERIC(10,7)
);

CREATE INDEX IF NOT EXISTS idx_marathon_scans_checkpoint ON public.marathon_checkpoint_scans(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_marathon_scans_event ON public.marathon_checkpoint_scans(event_id);
CREATE INDEX IF NOT EXISTS idx_marathon_scans_bib ON public.marathon_checkpoint_scans(bib_number);

-- Race results and rankings
CREATE TABLE IF NOT EXISTS public.marathon_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID UNIQUE NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id),
  bib_number TEXT NOT NULL,
  finish_time TEXT,            -- formatted: "01:42:15"
  finish_time_seconds INT,    -- total seconds for sorting
  pace_per_km_seconds INT,    -- seconds per km
  rank_overall INT,
  rank_category INT,
  rank_gender INT,
  rank_institution INT,
  certificate_id TEXT UNIQUE,
  certificate_url TEXT,
  certificate_generated_at TIMESTAMPTZ,
  is_dnf BOOLEAN DEFAULT false,        -- Did Not Finish
  is_disqualified BOOLEAN DEFAULT false,
  disqualification_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_results_event ON public.marathon_results(event_id);
CREATE INDEX IF NOT EXISTS idx_marathon_results_bib ON public.marathon_results(bib_number);
CREATE INDEX IF NOT EXISTS idx_marathon_results_cert ON public.marathon_results(certificate_id);

-- Race day incidents
CREATE TABLE IF NOT EXISTS public.marathon_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('medical','logistics','security','weather','technical','other')),
  severity TEXT NOT NULL DEFAULT 'low'
    CHECK (severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  reported_by UUID REFERENCES public.profiles(id),
  reported_by_name TEXT,
  status TEXT DEFAULT 'reported'
    CHECK (status IN ('reported','acknowledged','in_progress','resolved','closed')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  bib_number TEXT,             -- affected runner (if applicable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_incidents_event ON public.marathon_incidents(event_id);

-- Volunteer station check-ins
CREATE TABLE IF NOT EXISTS public.marathon_volunteer_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  checkpoint_id UUID REFERENCES public.marathon_checkpoints(id),
  volunteer_name TEXT NOT NULL,
  volunteer_phone TEXT,
  station TEXT NOT NULL,       -- 'Water Station 1', 'Medical Post A'
  role TEXT,                   -- 'water_distributor', 'medic', 'marshal', 'photographer'
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_marathon_volunteers_event ON public.marathon_volunteer_checkins(event_id);

-- GPS position — latest per runner (UPSERT pattern)
CREATE TABLE IF NOT EXISTS public.marathon_race_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id),
  bib TEXT NOT NULL,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  distance_km NUMERIC(8,3) DEFAULT 0,
  pace_per_km NUMERIC(8,2) DEFAULT 0,
  elapsed_seconds INT DEFAULT 0,
  altitude NUMERIC(8,2),
  heading NUMERIC(6,2),
  speed NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, bib)
);

CREATE INDEX IF NOT EXISTS idx_marathon_race_tracks_event ON public.marathon_race_tracks(event_id);
CREATE INDEX IF NOT EXISTS idx_marathon_race_tracks_bib ON public.marathon_race_tracks(bib);

-- GPS breadcrumb trail (append-only for race replay)
CREATE TABLE IF NOT EXISTS public.marathon_race_track_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
  bib TEXT NOT NULL,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  speed NUMERIC(6,2),
  accuracy NUMERIC(6,2),
  altitude NUMERIC(8,2),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_track_points_event_bib ON public.marathon_race_track_points(event_id, bib);
CREATE INDEX IF NOT EXISTS idx_marathon_track_points_timestamp ON public.marathon_race_track_points(timestamp);
```

**Step 2: Run the SQL on Supabase**

**Step 3: Commit**

```bash
git add supabase/setup/01_tables.sql
git commit -m "feat(events): add marathon extension tables — sponsors, committees, budget, checkpoints, results, GPS, incidents"
```

---

### Task 1.3: Create RLS Policies

**Files:**
- Modify: `supabase/setup/03_policies.sql` (append)

**Step 1: Add RLS policies for events tables**

```sql
-- ============================================================================
-- EVENTS MODULE — RLS Policies
-- Created: 2026-04-07
-- ============================================================================

-- Events: public can read active/public events, authenticated can CRUD own institution's events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_public_read" ON public.events
  FOR SELECT USING (is_public = true AND status NOT IN ('draft','cancelled'));

CREATE POLICY "events_auth_read" ON public.events
  FOR SELECT TO authenticated USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "events_auth_insert" ON public.events
  FOR INSERT TO authenticated WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "events_auth_update" ON public.events
  FOR UPDATE TO authenticated USING (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Event categories: same as parent event
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_categories_public_read" ON public.event_categories
  FOR SELECT USING (
    event_id IN (SELECT id FROM public.events WHERE is_public = true AND status NOT IN ('draft','cancelled'))
  );

CREATE POLICY "event_categories_auth_all" ON public.event_categories
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- External participants: public insert, auth read
ALTER TABLE public.event_external_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ext_participants_public_insert" ON public.event_external_participants
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ext_participants_public_read_own" ON public.event_external_participants
  FOR SELECT USING (true);  -- needed for phone lookup during registration

CREATE POLICY "ext_participants_auth_read" ON public.event_external_participants
  FOR SELECT TO authenticated USING (true);

-- Event registrations: public insert (for external registration), auth read/manage
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_reg_public_insert" ON public.event_registrations
  FOR INSERT WITH CHECK (true);  -- external app can register

CREATE POLICY "event_reg_auth_read" ON public.event_registrations
  FOR SELECT TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "event_reg_auth_update" ON public.event_registrations
  FOR UPDATE TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Event payments: similar to registrations
ALTER TABLE public.event_payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_payments_public_insert" ON public.event_payment_transactions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "event_payments_public_read" ON public.event_payment_transactions
  FOR SELECT USING (true);  -- needed for status checks

CREATE POLICY "event_payments_public_update" ON public.event_payment_transactions
  FOR UPDATE USING (true);  -- webhook needs to update

CREATE POLICY "event_payments_auth_read" ON public.event_payment_transactions
  FOR SELECT TO authenticated USING (true);

-- Marathon extension tables: auth required for all
-- GPS tables: public insert/read (runners push data without auth)

ALTER TABLE public.marathon_sponsors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_sponsors_auth_all" ON public.marathon_sponsors
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );
-- Public can read committed sponsors
CREATE POLICY "marathon_sponsors_public_read" ON public.marathon_sponsors
  FOR SELECT USING (
    pipeline_stage = 'committed' AND
    event_id IN (SELECT id FROM public.events WHERE is_public = true)
  );

ALTER TABLE public.marathon_sponsor_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_deliverables_auth_all" ON public.marathon_sponsor_deliverables
  FOR ALL TO authenticated USING (true);

ALTER TABLE public.marathon_sponsor_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_activity_auth_all" ON public.marathon_sponsor_activity_log
  FOR ALL TO authenticated USING (true);

ALTER TABLE public.marathon_committees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_committees_auth_all" ON public.marathon_committees
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

ALTER TABLE public.marathon_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_tasks_auth_all" ON public.marathon_tasks
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

ALTER TABLE public.marathon_budget_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_budget_auth_all" ON public.marathon_budget_items
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

ALTER TABLE public.marathon_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_checkpoints_public_read" ON public.marathon_checkpoints
  FOR SELECT USING (true);
CREATE POLICY "marathon_checkpoints_auth_all" ON public.marathon_checkpoints
  FOR ALL TO authenticated USING (true);

ALTER TABLE public.marathon_checkpoint_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_scans_public_insert" ON public.marathon_checkpoint_scans
  FOR INSERT WITH CHECK (true);
CREATE POLICY "marathon_scans_public_read" ON public.marathon_checkpoint_scans
  FOR SELECT USING (true);
CREATE POLICY "marathon_scans_auth_all" ON public.marathon_checkpoint_scans
  FOR ALL TO authenticated USING (true);

ALTER TABLE public.marathon_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_results_public_read" ON public.marathon_results
  FOR SELECT USING (true);
CREATE POLICY "marathon_results_auth_all" ON public.marathon_results
  FOR ALL TO authenticated USING (true);

ALTER TABLE public.marathon_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_incidents_auth_all" ON public.marathon_incidents
  FOR ALL TO authenticated USING (
    event_id IN (
      SELECT id FROM public.events WHERE institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

ALTER TABLE public.marathon_volunteer_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_volunteers_auth_all" ON public.marathon_volunteer_checkins
  FOR ALL TO authenticated USING (true);
CREATE POLICY "marathon_volunteers_public_insert" ON public.marathon_volunteer_checkins
  FOR INSERT WITH CHECK (true);

ALTER TABLE public.marathon_race_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_tracks_public_insert" ON public.marathon_race_tracks
  FOR INSERT WITH CHECK (true);
CREATE POLICY "marathon_tracks_public_read" ON public.marathon_race_tracks
  FOR SELECT USING (true);
CREATE POLICY "marathon_tracks_public_update" ON public.marathon_race_tracks
  FOR UPDATE USING (true);

ALTER TABLE public.marathon_race_track_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marathon_points_public_insert" ON public.marathon_race_track_points
  FOR INSERT WITH CHECK (true);
CREATE POLICY "marathon_points_public_read" ON public.marathon_race_track_points
  FOR SELECT USING (true);
```

**Step 2: Run the SQL on Supabase**

**Step 3: Commit**

```bash
git add supabase/setup/03_policies.sql
git commit -m "feat(events): add RLS policies for all events and marathon tables"
```

---

## Phase 2: Types & Validations

### Task 2.1: Create Core Event Types

**Files:**
- Create: `types/events.ts`

**Step 1: Create the types file**

```typescript
// types/events.ts
// Core event types shared across all event sub-modules

// ============================================================================
// Enums & Constants
// ============================================================================

export type EventType = 'marathon' | 'cultural_fest' | 'seminar' | 'workshop' | 'sports_day' | 'conference';

export type EventStatus = 'draft' | 'planning' | 'preparation' | 'execution' | 'live' | 'post_event' | 'archived' | 'cancelled';

export type RegistrationStatus = 'pending' | 'registered' | 'confirmed' | 'checked_in' | 'cancelled' | 'disqualified' | 'no_show' | 'waitlisted';

export type ParticipantType = 'internal' | 'external';

export type PaymentStatus = 'not_required' | 'pending' | 'paid' | 'refunded' | 'waived' | 'failed';

export type EventPaymentTransactionStatus = 'initiated' | 'processing' | 'success' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  planning: 'Planning',
  preparation: 'Preparation',
  execution: 'Execution',
  live: 'Live',
  post_event: 'Post Event',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['planning', 'cancelled'],
  planning: ['preparation', 'cancelled'],
  preparation: ['execution', 'cancelled'],
  execution: ['live', 'cancelled'],
  live: ['post_event'],
  post_event: ['archived'],
  archived: [],
  cancelled: ['draft'],
};

// ============================================================================
// Core Entities
// ============================================================================

export interface Event {
  id: string;
  institution_id: string;
  event_type: EventType;
  name: string;
  slug: string;
  description: string | null;
  theme: string | null;
  tagline: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  registration_open_date: string | null;
  registration_close_date: string | null;
  status: EventStatus;
  config: Record<string, unknown>;
  registration_config: Record<string, unknown>;
  route_config: Record<string, unknown>;
  branding_config: Record<string, unknown>;
  target_registrations: number | null;
  max_registrations: number | null;
  is_public: boolean;
  allow_external_registration: boolean;
  is_active: boolean;
  previous_event_id: string | null;
  year: number | null;
  edition_number: number | null;
  hero_image_url: string | null;
  hero_video_url: string | null;
  venue: string | null;
  venue_address: string | null;
  venue_coordinates: { lat: number; lng: number } | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventCategory {
  id: string;
  event_id: string;
  name: string;
  code: string | null;
  description: string | null;
  distance_km: number | null;
  max_participants: number | null;
  min_age: number | null;
  max_age: number | null;
  fee_amount: number;
  early_bird_fee: number | null;
  early_bird_deadline: string | null;
  config: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventExternalParticipant {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  age: number | null;
  gender: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  organization: string | null;
  city: string | null;
  state: string | null;
  id_proof_type: string | null;
  id_proof_number: string | null;
  photo_url: string | null;
  linked_profile_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  category_id: string | null;
  profile_id: string | null;
  learner_id: string | null;
  external_participant_id: string | null;
  participant_type: ParticipantType;
  participant_name: string;
  participant_phone: string | null;
  participant_email: string | null;
  participant_age: number | null;
  participant_gender: string | null;
  institution_id: string | null;
  institution_name: string | null;
  department: string | null;
  bib_number: string | null;
  registration_number: string | null;
  status: RegistrationStatus;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by: string | null;
  payment_status: PaymentStatus;
  payment_amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  discount_code: string | null;
  discount_amount: number;
  custom_data: Record<string, unknown>;
  source: string;
  referral_source: string | null;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: EventCategory;
  event?: Event;
}

export interface EventPaymentTransaction {
  id: string;
  event_id: string;
  registration_id: string | null;
  transaction_ref: string;
  amount: number;
  currency: string;
  status: EventPaymentTransactionStatus;
  payment_method: string | null;
  gateway_session_id: string | null;
  gateway_transaction_id: string | null;
  gateway_response: Record<string, unknown> | null;
  payer_name: string | null;
  payer_phone: string | null;
  payer_email: string | null;
  discount_code: string | null;
  discount_amount: number;
  paid_at: string | null;
  refunded_at: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DTOs
// ============================================================================

export interface CreateEventDto {
  institution_id: string;
  event_type: EventType;
  name: string;
  slug: string;
  description?: string;
  theme?: string;
  tagline?: string;
  event_date?: string;
  start_time?: string;
  venue?: string;
  venue_address?: string;
  year?: number;
  target_registrations?: number;
  max_registrations?: number;
  is_public?: boolean;
  allow_external_registration?: boolean;
  config?: Record<string, unknown>;
  registration_config?: Record<string, unknown>;
  branding_config?: Record<string, unknown>;
}

export interface UpdateEventDto extends Partial<CreateEventDto> {
  status?: EventStatus;
  registration_open_date?: string;
  registration_close_date?: string;
  hero_image_url?: string;
  hero_video_url?: string;
  route_config?: Record<string, unknown>;
}

export interface EventFilters {
  institution_id?: string;
  event_type?: EventType;
  status?: EventStatus | EventStatus[];
  is_active?: boolean;
  search?: string;
  year?: number;
}

export interface RegistrationFilters {
  event_id: string;
  status?: RegistrationStatus;
  participant_type?: ParticipantType;
  payment_status?: PaymentStatus;
  category_id?: string;
  institution_id?: string;
  search?: string;
}
```

**Step 2: Commit**

```bash
git add types/events.ts
git commit -m "feat(events): add core event type definitions"
```

---

### Task 2.2: Create Marathon-Specific Types

**Files:**
- Create: `types/events-marathon.ts`

**Step 1: Create marathon types**

```typescript
// types/events-marathon.ts
// Marathon-specific type definitions

import type { Event, EventCategory, EventRegistration } from './events';

// ============================================================================
// Marathon-Specific Enums
// ============================================================================

export type SponsorTier = 'prospect' | 'contacted' | 'negotiating' | 'committed' | 'platinum' | 'gold' | 'silver' | 'bronze' | 'in_kind';

export type SponsorPipelineStage = 'lead' | 'contacted' | 'proposal_sent' | 'negotiating' | 'committed' | 'declined' | 'churned';

export type IncidentType = 'medical' | 'logistics' | 'security' | 'weather' | 'technical' | 'other';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'reported' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';

export type CheckpointType = 'start' | 'finish' | 'water' | 'medical' | 'waypoint' | 'km_marker';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type BudgetItemType = 'income' | 'expense';

export type BudgetItemStatus = 'planned' | 'approved' | 'spent' | 'cancelled';

// ============================================================================
// Marathon Entities
// ============================================================================

export interface MarathonSponsor {
  id: string;
  event_id: string;
  company_name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  logo_url: string | null;
  tier: SponsorTier;
  amount_pledged: number;
  amount_received: number;
  benefits: string | null;
  expectations: string | null;
  notes: string | null;
  pipeline_stage: SponsorPipelineStage;
  signed_date: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  deliverables?: MarathonSponsorDeliverable[];
  activity_log?: MarathonSponsorActivityLog[];
}

export interface MarathonSponsorDeliverable {
  id: string;
  sponsor_id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_at: string;
}

export interface MarathonSponsorActivityLog {
  id: string;
  sponsor_id: string;
  activity_type: 'call' | 'email' | 'meeting' | 'payment' | 'note';
  description: string;
  performed_by: string | null;
  created_at: string;
}

export interface MarathonCommittee {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  lead_id: string | null;
  lead_name: string | null;
  member_ids: string[];
  member_names: string[];
  status: string;
  created_at: string;
  updated_at: string;
  // Joined
  tasks?: MarathonTask[];
}

export interface MarathonTask {
  id: string;
  committee_id: string;
  event_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarathonBudgetItem {
  id: string;
  event_id: string;
  category: string;
  description: string;
  type: BudgetItemType;
  estimated_amount: number;
  actual_amount: number;
  status: BudgetItemStatus;
  approved_by: string | null;
  vendor: string | null;
  receipt_url: string | null;
  notes: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarathonCheckpoint {
  id: string;
  event_id: string;
  name: string;
  type: CheckpointType;
  distance_from_start_km: number | null;
  lat: number | null;
  lng: number | null;
  qr_code_data: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface MarathonCheckpointScan {
  id: string;
  checkpoint_id: string;
  event_id: string;
  registration_id: string | null;
  bib_number: string;
  scanned_at: string;
  scanned_by: string | null;
  lat: number | null;
  lng: number | null;
  // Joined
  checkpoint?: MarathonCheckpoint;
}

export interface MarathonResult {
  id: string;
  registration_id: string;
  event_id: string;
  bib_number: string;
  finish_time: string | null;
  finish_time_seconds: number | null;
  pace_per_km_seconds: number | null;
  rank_overall: number | null;
  rank_category: number | null;
  rank_gender: number | null;
  rank_institution: number | null;
  certificate_id: string | null;
  certificate_url: string | null;
  certificate_generated_at: string | null;
  is_dnf: boolean;
  is_disqualified: boolean;
  disqualification_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  registration?: EventRegistration;
}

export interface MarathonIncident {
  id: string;
  event_id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  reported_by: string | null;
  reported_by_name: string | null;
  status: IncidentStatus;
  resolved_at: string | null;
  resolution_notes: string | null;
  bib_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarathonVolunteerCheckin {
  id: string;
  event_id: string;
  checkpoint_id: string | null;
  volunteer_name: string;
  volunteer_phone: string | null;
  station: string;
  role: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  notes: string | null;
}

export interface MarathonRaceTrack {
  id: string;
  event_id: string;
  bib: string;
  lat: number;
  lng: number;
  distance_km: number;
  pace_per_km: number;
  elapsed_seconds: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  created_at: string;
  updated_at: string;
}

export interface MarathonRaceTrackPoint {
  id: string;
  event_id: string;
  bib: string;
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  altitude: number | null;
  timestamp: string;
}

// ============================================================================
// Marathon Dashboard Types
// ============================================================================

export interface MarathonDashboardStats {
  total_registrations: number;
  registrations_today: number;
  registrations_by_category: { category_name: string; count: number }[];
  registrations_by_institution: { institution_name: string; count: number }[];
  payment_collected: number;
  payment_pending: number;
  internal_count: number;
  external_count: number;
  checked_in_count: number;
  male_count: number;
  female_count: number;
  sponsor_total_pledged: number;
  sponsor_total_received: number;
  sponsor_count: number;
  tasks_total: number;
  tasks_completed: number;
  tasks_overdue: number;
  budget_estimated: number;
  budget_actual: number;
}

export interface MarathonLiveOpsData {
  runners: MarathonRaceTrack[];
  checkpoint_throughput: {
    checkpoint_id: string;
    checkpoint_name: string;
    scan_count: number;
    last_scan_at: string | null;
  }[];
  active_incidents: MarathonIncident[];
  volunteer_status: MarathonVolunteerCheckin[];
  stats: {
    total_tracking: number;
    on_course: number;
    finished: number;
    avg_pace: number;
    stationary_alerts: MarathonRaceTrack[];  -- no update > 3 min
  };
}

// ============================================================================
// Marathon DTOs
// ============================================================================

export interface CreateMarathonSponsorDto {
  event_id: string;
  company_name: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  tier?: SponsorTier;
  amount_pledged?: number;
  benefits?: string;
  pipeline_stage?: SponsorPipelineStage;
}

export interface CreateMarathonCommitteeDto {
  event_id: string;
  name: string;
  description?: string;
  lead_id?: string;
  lead_name?: string;
  member_ids?: string[];
  member_names?: string[];
}

export interface CreateMarathonTaskDto {
  committee_id: string;
  event_id: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
}

export interface CreateMarathonBudgetItemDto {
  event_id: string;
  category: string;
  description: string;
  type: BudgetItemType;
  estimated_amount: number;
  vendor?: string;
  notes?: string;
}

export interface CreateMarathonIncidentDto {
  event_id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description?: string;
  location?: string;
  lat?: number;
  lng?: number;
  bib_number?: string;
}

export interface GPSSyncPayload {
  event_id: string;
  bib: string;
  lat: number;
  lng: number;
  distance_km: number;
  pace_per_km: number;
  elapsed_seconds: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  points?: {
    lat: number;
    lng: number;
    speed?: number;
    accuracy?: number;
    altitude?: number;
    timestamp: string;
  }[];
}

export interface CheckpointScanPayload {
  event_id: string;
  bib_number: string;
  checkpoint_id: string;
  lat?: number;
  lng?: number;
}

export interface MarathonRegistrationCustomData {
  tshirt_size?: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_group?: string;
  medical_conditions?: string;
  previous_marathon_experience?: string;
}

export interface ImportGPSResultsResponse {
  imported: number;
  skipped: number;
  errors: string[];
}
```

**Step 2: Commit**

```bash
git add types/events-marathon.ts
git commit -m "feat(events): add marathon-specific type definitions"
```

---

### Task 2.3: Create Zod Validations

**Files:**
- Create: `lib/validations/events.ts`
- Create: `lib/validations/events-marathon.ts`

**Step 1: Create core event validations**

```typescript
// lib/validations/events.ts
import { z } from 'zod';

export const createEventSchema = z.object({
  institution_id: z.string().uuid(),
  event_type: z.enum(['marathon', 'cultural_fest', 'seminar', 'workshop', 'sports_day', 'conference']),
  name: z.string().min(3).max(200),
  slug: z.string().min(3).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
  description: z.string().optional(),
  theme: z.string().optional(),
  tagline: z.string().optional(),
  event_date: z.string().optional(),
  start_time: z.string().optional(),
  venue: z.string().optional(),
  venue_address: z.string().optional(),
  year: z.number().int().optional(),
  target_registrations: z.number().int().positive().optional(),
  max_registrations: z.number().int().positive().optional(),
  is_public: z.boolean().optional(),
  allow_external_registration: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  registration_config: z.record(z.unknown()).optional(),
  branding_config: z.record(z.unknown()).optional(),
});

export const updateEventSchema = createEventSchema.partial().extend({
  status: z.enum(['draft', 'planning', 'preparation', 'execution', 'live', 'post_event', 'archived', 'cancelled']).optional(),
  registration_open_date: z.string().optional(),
  registration_close_date: z.string().optional(),
  hero_image_url: z.string().url().optional().nullable(),
  hero_video_url: z.string().url().optional().nullable(),
  route_config: z.record(z.unknown()).optional(),
});

export const createCategorySchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().max(10).optional(),
  description: z.string().optional(),
  distance_km: z.number().positive().optional(),
  max_participants: z.number().int().positive().optional(),
  min_age: z.number().int().min(0).optional(),
  max_age: z.number().int().max(150).optional(),
  fee_amount: z.number().min(0).optional(),
  early_bird_fee: z.number().min(0).optional(),
  early_bird_deadline: z.string().optional(),
  sort_order: z.number().int().optional(),
});

export const publicRegistrationSchema = z.object({
  event_id: z.string().uuid(),
  category_id: z.string().uuid(),
  participant_name: z.string().min(2).max(200),
  participant_phone: z.string().min(10).max(15),
  participant_email: z.string().email().optional(),
  participant_age: z.number().int().min(1).max(150).optional(),
  participant_gender: z.enum(['male', 'female', 'other']).optional(),
  participant_type: z.enum(['internal', 'external']),
  institution_name: z.string().optional(),
  department: z.string().optional(),
  custom_data: z.record(z.unknown()).optional(),
  discount_code: z.string().optional(),
  source: z.string().optional(),
  referral_source: z.string().optional(),
  // For internal users
  profile_id: z.string().uuid().optional(),
  learner_id: z.string().uuid().optional(),
  institution_id: z.string().uuid().optional(),
  // For external users
  organization: z.string().optional(),
  city: z.string().optional(),
});
```

**Step 2: Create marathon validations**

```typescript
// lib/validations/events-marathon.ts
import { z } from 'zod';

export const createSponsorSchema = z.object({
  event_id: z.string().uuid(),
  company_name: z.string().min(2).max(200),
  contact_person: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  website: z.string().url().optional(),
  tier: z.enum(['prospect', 'contacted', 'negotiating', 'committed', 'platinum', 'gold', 'silver', 'bronze', 'in_kind']).optional(),
  amount_pledged: z.number().min(0).optional(),
  benefits: z.string().optional(),
  pipeline_stage: z.enum(['lead', 'contacted', 'proposal_sent', 'negotiating', 'committed', 'declined', 'churned']).optional(),
});

export const createCommitteeSchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  lead_name: z.string().optional(),
  member_ids: z.array(z.string().uuid()).optional(),
  member_names: z.array(z.string()).optional(),
});

export const createTaskSchema = z.object({
  committee_id: z.string().uuid(),
  event_id: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assigned_to: z.string().uuid().optional(),
  assigned_to_name: z.string().optional(),
  due_date: z.string().optional(),
});

export const createBudgetItemSchema = z.object({
  event_id: z.string().uuid(),
  category: z.string().min(1),
  description: z.string().min(2),
  type: z.enum(['income', 'expense']),
  estimated_amount: z.number().min(0),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

export const createIncidentSchema = z.object({
  event_id: z.string().uuid(),
  type: z.enum(['medical', 'logistics', 'security', 'weather', 'technical', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(2),
  description: z.string().optional(),
  location: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  bib_number: z.string().optional(),
});

export const gpsSyncSchema = z.object({
  event_id: z.string().uuid(),
  bib: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  distance_km: z.number().min(0),
  pace_per_km: z.number().min(0),
  elapsed_seconds: z.number().int().min(0),
  altitude: z.number().optional(),
  heading: z.number().optional(),
  speed: z.number().optional(),
  points: z.array(z.object({
    lat: z.number(),
    lng: z.number(),
    speed: z.number().optional(),
    accuracy: z.number().optional(),
    altitude: z.number().optional(),
    timestamp: z.string(),
  })).optional(),
});

export const checkpointScanSchema = z.object({
  event_id: z.string().uuid(),
  bib_number: z.string().min(1),
  checkpoint_id: z.string().uuid(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
```

**Step 3: Commit**

```bash
git add lib/validations/events.ts lib/validations/events-marathon.ts
git commit -m "feat(events): add Zod validation schemas for events and marathon"
```

---

## Phase 3: Core Event Service

### Task 3.1: Create Base Event Service

**Files:**
- Create: `lib/services/events/core/event-base-service.ts`

**Step 1: Create the service**

This service handles generic CRUD for the `events` table. All event sub-modules (marathon, cultural-fest, etc.) use this for base operations.

```typescript
// lib/services/events/core/event-base-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Event, EventCategory, CreateEventDto, UpdateEventDto, EventFilters } from '@/types/events';
import { logger } from '@/lib/utils/enhanced-logger';

export class EventBaseService {
  private static supabase = createClientSupabaseClient();

  // ── Events CRUD ─────────────────────────────────────────────────────

  static async getEvents(filters: EventFilters): Promise<Event[]> {
    let query = this.supabase.from('events').select('*');

    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.event_type) query = query.eq('event_type', filters.event_type);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    if (filters.year) query = query.eq('year', filters.year);

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    }

    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,slug.ilike.%${filters.search}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      logger.error('events/core', 'Failed to fetch events', error);
      throw error;
    }

    return (data || []) as unknown as Event[];
  }

  static async getEvent(id: string): Promise<Event | null> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('events/core', 'Failed to fetch event', error);
      throw error;
    }

    return data as unknown as Event;
  }

  static async getEventBySlug(slug: string): Promise<Event | null> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as unknown as Event;
  }

  static async createEvent(dto: CreateEventDto): Promise<Event> {
    const { data, error } = await this.supabase
      .from('events')
      .insert(dto)
      .select()
      .single();

    if (error) {
      logger.error('events/core', 'Failed to create event', error);
      throw error;
    }

    return data as unknown as Event;
  }

  static async updateEvent(id: string, dto: UpdateEventDto): Promise<Event> {
    const { data, error } = await this.supabase
      .from('events')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('events/core', 'Failed to update event', error);
      throw error;
    }

    return data as unknown as Event;
  }

  static async deleteEvent(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('events/core', 'Failed to delete event', error);
      throw error;
    }
  }

  // ── Categories CRUD ─────────────────────────────────────────────────

  static async getCategories(eventId: string): Promise<EventCategory[]> {
    const { data, error } = await this.supabase
      .from('event_categories')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order');

    if (error) {
      logger.error('events/core', 'Failed to fetch categories', error);
      throw error;
    }

    return (data || []) as unknown as EventCategory[];
  }

  static async createCategory(dto: Partial<EventCategory>): Promise<EventCategory> {
    const { data, error } = await this.supabase
      .from('event_categories')
      .insert(dto)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as EventCategory;
  }

  static async updateCategory(id: string, dto: Partial<EventCategory>): Promise<EventCategory> {
    const { data, error } = await this.supabase
      .from('event_categories')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as EventCategory;
  }

  static async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ── Utility ─────────────────────────────────────────────────────────

  static generateSlug(name: string, year?: number): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return year ? `${base}-${year}` : base;
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/events/core/event-base-service.ts
git commit -m "feat(events): add base event service with CRUD operations"
```

---

## Phase 4–12: Marathon Services, Hooks, & Pages

> **Note for implementer:** Phases 4–12 each follow the same pattern:
> 1. Create service file in `lib/services/events/marathon/`
> 2. Create React Query hook in `hooks/events/marathon/`
> 3. Create page(s) in `app/(routes)/events/marathon/`
> 4. Commit after each phase
>
> The service patterns follow the existing MyJKKN convention:
> - Static class methods
> - `createClientSupabaseClient()` for client-side
> - Error handling with `logger.error()`
> - Types imported from `types/events-marathon.ts`

### Task 4: Marathon Event Service + CRUD Pages

**Files to create:**
- `lib/services/events/marathon/marathon-event-service.ts` — Event lifecycle management, status transitions, settings
- `hooks/events/marathon/use-marathon-events.ts` — React Query hooks for event list & detail
- `app/(routes)/events/page.tsx` — Events hub page (lists all event types)
- `app/(routes)/events/marathon/page.tsx` — Marathon events list with DataTable
- `app/(routes)/events/marathon/new/page.tsx` — Create new marathon event form
- `app/(routes)/events/marathon/[id]/settings/page.tsx` — 4-tab settings (General, Categories, Route, Registration)

**Key service methods:**
- `getMarathonEvents(filters)` — Calls `EventBaseService.getEvents({ event_type: 'marathon', ...filters })`
- `createMarathonEvent(dto)` — Creates event + default categories (10km, 5km, 3km)
- `updateStatus(id, newStatus)` — Validates status transition before updating
- `getEventWithCategories(id)` — Joins event + categories

**Key hook exports:**
- `useMarathonEvents(filters)` — useQuery for event list
- `useMarathonEvent(id)` — useQuery for single event
- `useCreateMarathonEvent()` — useMutation
- `useUpdateMarathonEvent()` — useMutation
- `useUpdateMarathonStatus()` — useMutation

### Task 5: Registration Module

**Files to create:**
- `lib/services/events/marathon/marathon-registration-service.ts`
- `hooks/events/marathon/use-marathon-registrations.ts`
- `app/(routes)/events/marathon/[id]/registrations/page.tsx` — DataTable with filters (status, category, payment, institution)
- `app/(routes)/events/marathon/[id]/registrations/[regId]/page.tsx` — Registration detail (payment, checkpoint scans, result)

**Key service methods:**
- `getRegistrations(eventId, filters)` — Paginated list with category join
- `getRegistration(id)` — Single registration with all related data
- `registerParticipant(dto)` — Create registration + auto-generate BIB number
- `updateRegistrationStatus(id, status)` — Status transitions
- `checkInParticipant(id)` — Mark checked_in + timestamp
- `getRegistrationStats(eventId)` — Counts by category, status, institution, gender
- `getCollegePenetration(eventId)` — Registration % per JKKN college
- `generateBibNumber(eventId, categoryCode, sequence)` — Format: `KBM-{YEAR}-{CODE}-{SEQ}`

**BIB number format:** `KBM-2026-10K-0042`
- `KBM` = event code (from event config)
- `2026` = year
- `10K` = category code
- `0042` = sequential, zero-padded to 4 digits

### Task 6: Sponsorship CRM

**Files to create:**
- `lib/services/events/marathon/marathon-sponsor-service.ts`
- `hooks/events/marathon/use-marathon-sponsors.ts`
- `app/(routes)/events/marathon/[id]/sponsors/page.tsx` — Kanban pipeline view (lead → contacted → proposal_sent → negotiating → committed)
- `app/(routes)/events/marathon/[id]/sponsors/[sponsorId]/page.tsx` — Sponsor detail (deliverables checklist, activity timeline)

**Key service methods:**
- `getSponsors(eventId)` — All sponsors with deliverables count
- `getSponsor(id)` — Single sponsor with deliverables + activity log
- `createSponsor(dto)` — Create sponsor
- `updateSponsor(id, dto)` — Update sponsor (including pipeline stage drag-and-drop)
- `movePipelineStage(id, newStage)` — For kanban drag
- `addDeliverable(sponsorId, dto)` — Add deliverable item
- `updateDeliverable(id, dto)` — Update deliverable status
- `logActivity(sponsorId, dto)` — Add activity log entry
- `getSponsorSummary(eventId)` — Total pledged, received, by tier

### Task 7: Committees & Tasks

**Files to create:**
- `lib/services/events/marathon/marathon-committee-service.ts`
- `hooks/events/marathon/use-marathon-committees.ts`
- `app/(routes)/events/marathon/[id]/committees/page.tsx` — Accordion view with tasks per committee

**Key service methods:**
- `getCommittees(eventId)` — Committees with tasks
- `createCommittee(dto)` — Create committee
- `updateCommittee(id, dto)` — Update members, lead
- `createTask(dto)` — Create task under committee
- `updateTask(id, dto)` — Update task status, assignment
- `getTaskSummary(eventId)` — Total, completed, overdue counts

### Task 8: Budget Tracker

**Files to create:**
- `lib/services/events/marathon/marathon-budget-service.ts`
- `hooks/events/marathon/use-marathon-budget.ts`
- `app/(routes)/events/marathon/[id]/budget/page.tsx` — Budget line items with category tabs + summary cards

**Key service methods:**
- `getBudgetItems(eventId)` — All budget items
- `createBudgetItem(dto)` — Create income or expense item
- `updateBudgetItem(id, dto)` — Update amount, status
- `getBudgetSummary(eventId)` — { total_estimated, total_actual, by_category, income_total, expense_total, balance }

### Task 9: Live Ops Command Center

**Files to create:**
- `lib/services/events/marathon/marathon-live-ops-service.ts`
- `hooks/events/marathon/use-marathon-live-ops.ts`
- `app/(routes)/events/marathon/[id]/live/page.tsx` — Main Live Ops page (3-state: pre/live/post)
- `app/(routes)/events/marathon/[id]/live/_components/race-controls.tsx` — Start/End/Emergency buttons
- `app/(routes)/events/marathon/[id]/live/_components/live-runner-map.tsx` — GPS dots on map (use Leaflet or Google Maps)
- `app/(routes)/events/marathon/[id]/live/_components/runner-stats-bar.tsx` — Tracking/OnCourse/Finished/Pace
- `app/(routes)/events/marathon/[id]/live/_components/checkpoint-panel.tsx` — Throughput per checkpoint
- `app/(routes)/events/marathon/[id]/live/_components/incident-panel.tsx` — Log/resolve incidents
- `app/(routes)/events/marathon/[id]/live/_components/incident-form.tsx` — Create incident dialog
- `app/(routes)/events/marathon/[id]/live/_components/volunteer-panel.tsx` — Station check-in status
- `app/(routes)/events/marathon/[id]/live/_components/stationary-alerts.tsx` — No GPS > 3min alerts
- `app/(routes)/events/marathon/[id]/live/_components/live-runner-detail.tsx` — Individual runner slide-over

**Key service methods:**
- `getLiveOpsData(eventId)` — Returns MarathonLiveOpsData (runners, checkpoints, incidents, volunteers, stats)
- `getRunnerPositions(eventId)` — All GPS positions from marathon_race_tracks
- `getStationaryAlerts(eventId, thresholdMinutes)` — Runners with no GPS update > threshold
- `getCheckpointThroughput(eventId)` — Scan counts per checkpoint
- `syncGPSPosition(payload: GPSSyncPayload)` — UPSERT race_tracks + INSERT track_points
- `scanCheckpoint(payload: CheckpointScanPayload)` — INSERT checkpoint_scan
- `createIncident(dto)` — Log new incident
- `resolveIncident(id, resolutionNotes)` — Mark resolved
- `checkinVolunteer(dto)` — Record volunteer check-in
- `getRunnerDetail(eventId, bib)` — Full runner data: position, checkpoints, registration

**Polling:** Hook should poll every 10 seconds during live status using `refetchInterval: 10_000`.

**Map library:** Use `react-leaflet` with OpenStreetMap tiles (free, no API key needed). Install: `npm install react-leaflet leaflet @types/leaflet`.

### Task 10: Results & Certificates

**Files to create:**
- `lib/services/events/marathon/marathon-results-service.ts`
- `lib/services/events/marathon/marathon-certificate-service.ts`
- `hooks/events/marathon/use-marathon-results.ts`
- `app/(routes)/events/marathon/[id]/results/page.tsx` — Results table + GPS import button
- `app/(routes)/events/marathon/[id]/results/_components/import-gps-results.tsx` — GPS import dialog
- `app/(routes)/events/marathon/[id]/certificates/page.tsx` — Certificate generation & management

**Key results service methods:**
- `getResults(eventId)` — All results with registration join, ordered by rank
- `importFromGPS(eventId)` — Scan marathon_race_tracks, auto-create results, auto-rank
- `importFromCSV(eventId, csvData)` — Parse CSV, create results
- `updateResult(id, dto)` — Edit result manually
- `recalculateRankings(eventId)` — Recalculate all rankings (overall, category, gender, institution)
- `markDNF(id)` — Mark Did Not Finish
- `disqualify(id, reason)` — Disqualify runner

**Key certificate service methods:**
- `generateCertificates(eventId)` — Batch generate certificate IDs for all finishers
- `getCertificateData(certId)` — Get certificate data for verification
- `verifyCertificate(certId)` — Public verification endpoint

**Ranking algorithm:**
1. Sort by `finish_time_seconds` ascending (DNF/DQ at bottom)
2. Overall rank = position in sorted list
3. Category rank = position within same category
4. Gender rank = position within same gender
5. Institution rank = position within same institution

### Task 11: Analytics & Race Replay

**Files to create:**
- `lib/services/events/marathon/marathon-analytics-service.ts`
- `hooks/events/marathon/use-marathon-analytics.ts`
- `app/(routes)/events/marathon/[id]/analytics/page.tsx` — Charts dashboard
- `app/(routes)/events/marathon/[id]/analytics/_components/race-analytics.tsx` — Pace/checkpoint/college charts
- `app/(routes)/events/marathon/[id]/analytics/_components/race-replay.tsx` — Animated GPS trace replay

**Key service methods:**
- `getRegistrationAnalytics(eventId)` — Registration over time, by category, by institution, by day
- `getRaceAnalytics(eventId)` — Pace distribution, checkpoint throughput over time, DNF %, avg speed
- `getCollegePerformance(eventId)` — Average finish time per institution, participation rate
- `getYoYComparison(eventId)` — Compare with previous_event_id data
- `getRaceReplayData(eventId)` — All GPS track points ordered by timestamp (for animated replay)

**Chart library:** Use `recharts` (already likely in the project). Charts needed:
- Registration trend line chart
- Category distribution pie chart
- Pace distribution histogram
- Checkpoint throughput bar chart
- College performance ranking horizontal bar
- Race replay: animated dots moving on Leaflet map using track_points data

### Task 12: Dashboard

**Files to create:**
- `lib/services/events/marathon/marathon-dashboard-service.ts` (or add to marathon-event-service.ts)
- `hooks/events/marathon/use-marathon-dashboard.ts`
- `app/(routes)/events/marathon/[id]/dashboard/page.tsx` — 4-quadrant dashboard

**Dashboard layout (2x2 grid):**
```
┌──────────────────┬──────────────────┐
│ REGISTRATIONS    │ SPONSORS         │
│ Total: 1,247     │ ₹5.2L raised     │
│ Today: +23       │ 8 committed      │
│ [category chart] │ [tier breakdown] │
├──────────────────┼──────────────────┤
│ TASKS            │ BUDGET           │
│ 12/50 completed  │ ₹8L of ₹12L     │
│ 3 overdue        │ allocated        │
│ [progress bars]  │ [income/expense] │
└──────────────────┴──────────────────┘
```

**Polling:** Refresh every 30 seconds using `refetchInterval: 30_000`.

---

## Phase 13: Sidebar & Navigation

### Task 13.1: Add Events Module to Sidebar

**Files:**
- Modify: `lib/sidebarMenuLink.ts` — Add events module with marathon sub-navigation

**Step 1: Add permission route mappings**

Add to the `permissionRoutes` object (around line 465):

```typescript
// Events module
'/events': 'events.view',
'/events/marathon': 'events.marathon.view',
'/events/marathon/[id]/dashboard': 'events.marathon.view',
'/events/marathon/[id]/registrations': 'events.marathon.registrations.manage',
'/events/marathon/[id]/sponsors': 'events.marathon.sponsors.manage',
'/events/marathon/[id]/committees': 'events.marathon.committees.manage',
'/events/marathon/[id]/budget': 'events.marathon.budget.manage',
'/events/marathon/[id]/live': 'events.marathon.live_ops.manage',
'/events/marathon/[id]/results': 'events.marathon.results.manage',
'/events/marathon/[id]/analytics': 'events.marathon.analytics.view',
'/events/marathon/[id]/certificates': 'events.marathon.certificates.manage',
'/events/marathon/[id]/settings': 'events.marathon.settings.manage',
```

**Step 2: Add sidebar menu section**

Add events menu similar to the startup-studio pattern (around line 1540+). Key behavior:
- Extract active marathon event ID from pathname: `/events/marathon/[uuid]/...`
- Show sub-navigation items only when an event is selected
- Items: Dashboard, Registrations, Sponsors, Committees, Budget, Live Ops, Results, Analytics, Certificates, Settings

**Step 3: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(events): add events module to sidebar navigation"
```

---

## Phase 14: API Endpoints (External App)

### Task 14.1: Create Public API Routes

**Files to create (all under `app/api/events/marathon/[eventId]/`):**

| Route File | Method | Purpose |
|------------|--------|---------|
| `route.ts` | GET | Event details (public) |
| `categories/route.ts` | GET | Race categories |
| `stats/route.ts` | GET | Registration counts |
| `sponsors/route.ts` | GET | Committed sponsors |
| `register/route.ts` | POST | Create registration |
| `registrations/[phone]/route.ts` | GET | Lookup by phone |
| `results/route.ts` | GET | Public leaderboard |
| `results/[bib]/route.ts` | GET | Individual result |
| `verify/[certId]/route.ts` | GET | Certificate verification |
| `race/track/route.ts` | POST | Batch GPS sync |
| `race/checkpoint/route.ts` | POST | QR checkpoint scan |
| `race/share/route.ts` | GET | Live runner position (family tracker) |

**API pattern for each route:**

```typescript
// app/api/events/marathon/[eventId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('events')
      .select('*, event_categories(*)')
      .eq('id', eventId)
      .eq('event_type', 'marathon')
      .eq('is_public', true)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Important:** Use `createServiceRoleClient()` (server-side, bypasses RLS) for public API routes since they are called without auth. Apply your own access checks in the route handler.

**GPS sync endpoint pattern:**

```typescript
// app/api/events/marathon/[eventId]/race/track/route.ts
export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = await request.json();
  const parsed = gpsSyncSchema.safeParse({ ...body, event_id: eventId });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { bib, lat, lng, distance_km, pace_per_km, elapsed_seconds, points } = parsed.data;

  // UPSERT latest position
  await supabase.from('marathon_race_tracks').upsert(
    { event_id: eventId, bib, lat, lng, distance_km, pace_per_km, elapsed_seconds, updated_at: new Date().toISOString() },
    { onConflict: 'event_id,bib' }
  );

  // INSERT breadcrumb points
  if (points?.length) {
    await supabase.from('marathon_race_track_points').insert(
      points.map(p => ({ event_id: eventId, bib, ...p }))
    );
  }

  return NextResponse.json({ success: true });
}
```

**Step: Commit after creating all API routes**

```bash
git add app/api/events/
git commit -m "feat(events): add 12 public API endpoints for external marathon app"
```

---

## Phase 15: HDFC Payment Integration

### Task 15.1: Extract Shared HDFC Client

**Files:**
- Create: `lib/services/events/core/hdfc-event-client.ts`
- Reference: `lib/services/billing/payment-gateway-service.ts` (existing — DO NOT modify)

**Purpose:** Create a lightweight adapter that reuses the HDFC gateway configuration and API communication logic for event payments. This does NOT modify the billing payment service.

**Key methods:**
- `createPaymentSession(params)` — Call HDFC /session API, return payment_url
- `verifyPaymentStatus(sessionId)` — Call HDFC Order Status API, return real status
- `getHDFCConfig()` — Reuse same env vars as billing

### Task 15.2: Create Event Payment Service

**Files:**
- Create: `lib/services/events/core/event-payment-service.ts`

**Key methods:**
- `initiatePayment(registrationId, amount, payer)` — Create event_payment_transactions row, call HDFC, return payment_url
- `handleCallback(transactionRef, clientStatus)` — Server-side verify with HDFC, update transaction + registration
- `handleWebhook(payload)` — Process HDFC webhook notification
- `checkPaymentStatus(transactionId)` — Return current status
- `processRefund(transactionId, reason)` — Mark as refunded

### Task 15.3: Create Payment API Routes

**Files:**
- Create: `app/api/events/marathon/[eventId]/payment/initiate/route.ts`
- Create: `app/api/events/marathon/[eventId]/payment/callback/route.ts`
- Create: `app/api/events/marathon/[eventId]/payment/webhook/route.ts`
- Create: `app/api/events/marathon/[eventId]/payment/status/[transactionId]/route.ts`

**Commit:**

```bash
git add lib/services/events/core/hdfc-event-client.ts lib/services/events/core/event-payment-service.ts app/api/events/marathon/
git commit -m "feat(events): add HDFC payment integration for event registrations"
```

---

## Phase 16: External User Registration

### Task 16.1: External Participant Service

**Files:**
- Create: `lib/services/events/core/external-participant-service.ts`

**Key methods:**
- `findByPhone(phone)` — Lookup existing external participant
- `createOrUpdate(dto)` — Create new or update existing (by phone)
- `linkToProfile(participantId, profileId)` — Link external participant to JKKN profile

### Task 16.2: Update Registration Service for External Users

**Files:**
- Modify: `lib/services/events/marathon/marathon-registration-service.ts`

Add to the `registerParticipant` method:
1. If `participant_type === 'external'`, first create/find external participant
2. Set `external_participant_id` on registration
3. Do not require `profile_id` or `learner_id`
4. Phone OTP verification handled by the external app (not enforced server-side)

**Commit:**

```bash
git add lib/services/events/core/external-participant-service.ts lib/services/events/marathon/marathon-registration-service.ts
git commit -m "feat(events): add external user registration support"
```

---

## Implementation Order Summary

| # | Phase | Files | Est. Lines | Dependencies |
|---|-------|-------|-----------|-------------|
| 1 | Database Schema | 3 SQL files | ~400 | None |
| 2 | Types & Validations | 4 files | ~900 | Phase 1 |
| 3 | Core Event Service | 1 file | ~200 | Phase 2 |
| 4 | Marathon Event + CRUD | 3 files + 4 pages | ~1,200 | Phase 3 |
| 5 | Registration Module | 1 service + 1 hook + 2 pages | ~1,500 | Phase 4 |
| 6 | Sponsorship CRM | 1 service + 1 hook + 2 pages | ~1,200 | Phase 4 |
| 7 | Committees & Tasks | 1 service + 1 hook + 1 page | ~800 | Phase 4 |
| 8 | Budget Tracker | 1 service + 1 hook + 1 page | ~600 | Phase 4 |
| 9 | Live Ops Center | 1 service + 1 hook + 10 components | ~3,000 | Phase 5 |
| 10 | Results & Certs | 2 services + 1 hook + 3 pages | ~1,500 | Phase 5, 9 |
| 11 | Analytics | 1 service + 1 hook + 3 components | ~1,200 | Phase 5, 10 |
| 12 | Dashboard | 1 hook + 1 page | ~600 | Phases 5-8 |
| 13 | Sidebar Nav | 1 file modify | ~100 | Phase 4 |
| 14 | API Endpoints | 12 route files | ~1,500 | Phases 5, 9, 10 |
| 15 | HDFC Payment | 3 files + 4 routes | ~1,200 | Phase 14 |
| 16 | External Users | 2 files | ~400 | Phase 15 |

**Total estimated: ~15,000-16,000 lines across ~60 files**

---

## Critical Path

```
Phase 1 (DB) → Phase 2 (Types) → Phase 3 (Core Service) → Phase 4 (Marathon CRUD)
                                                                      │
                                      ┌───────────────────────────────┤
                                      ▼               ▼              ▼
                                 Phase 5          Phase 6         Phase 7
                                 (Registration)   (Sponsors)      (Committees)
                                      │                               │
                                      │                          Phase 8
                                      │                          (Budget)
                                      ▼
                                 Phase 9 ────── Phase 13 (Sidebar)
                                 (Live Ops)
                                      │
                              ┌───────┴───────┐
                              ▼               ▼
                         Phase 10        Phase 11
                         (Results)       (Analytics)
                              │
                              ▼
                         Phase 12 (Dashboard)
                              │
                              ▼
                         Phase 14 (API Endpoints)
                              │
                              ▼
                         Phase 15 (HDFC Payment)
                              │
                              ▼
                         Phase 16 (External Users)
```

**Phases 5-8 can be built in parallel** (registration, sponsors, committees, budget are independent).
**Phase 13 (sidebar) can be done anytime after Phase 4.**

---

## Testing Strategy

For each service:
1. Test CRUD operations with Supabase MCP (read-only verification)
2. Test page rendering by running `npm run dev` and navigating to the route
3. Test API endpoints with `curl` or REST client
4. Test payment flow in HDFC UAT environment

**Smoke test for each phase:**
```bash
npm run build  # Verify no TypeScript errors
npm run dev    # Verify pages load
```

---

## Notes for Implementer

1. **Supabase types**: Marathon tables are NOT in generated types. Use `as unknown as Type` cast pattern (existing MyJKKN convention).
2. **Client-side Supabase**: Use `createClientSupabaseClient()` for services called from React components. Use `createServiceRoleClient()` for API routes.
3. **Existing patterns**: Follow the billing module patterns for payment, the startup-studio patterns for sidebar navigation, and the academic module patterns for service structure.
4. **Map component**: For Live Ops and Route visualization, install `react-leaflet` + `leaflet`. Use OpenStreetMap tiles (no API key). Alternative: if Google Maps is preferred, use `@react-google-maps/api`.
5. **Chart library**: Use `recharts` for analytics charts (check if already installed, otherwise `npm install recharts`).
6. **The handoff docs** at `docs/features/marathon-handoff/` contain additional context about race-day operations, deployment, and the public site architecture. Reference these for detailed feature behavior.
