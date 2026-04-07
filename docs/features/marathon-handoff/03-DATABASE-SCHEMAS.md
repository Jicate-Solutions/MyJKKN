# KBM Marathon 2.0 — Database Schemas

> **Source:** Live Supabase query on April 4, 2026
> **Project:** MyJKKN-Staging (`hhprjbgknupaplivtoib`)
> **Migration file:** `MyJKKN/supabase/migrations/20260404000001_marathon_tables.sql`

## Table Inventory

| # | Table | Status | Purpose |
|---|-------|--------|---------|
| 1 | `marathon_events` | EXISTS | Event lifecycle (dormant → archived) |
| 2 | `marathon_categories` | EXISTS | Race categories (10km, 5km) |
| 3 | `marathon_registrations` | EXISTS | Participant registrations |
| 4 | `marathon_sponsors` | EXISTS | Sponsor pipeline CRM |
| 5 | `marathon_sponsor_deliverables` | EXISTS | Sponsor deliverables checklist |
| 6 | `marathon_sponsor_activity_log` | EXISTS | Sponsor interaction history |
| 7 | `marathon_committees` | EXISTS | Committee assignments |
| 8 | `marathon_tasks` | EXISTS | Committee tasks |
| 9 | `marathon_budget_items` | EXISTS | Budget line items |
| 10 | `marathon_checkpoints` | EXISTS | Route checkpoints |
| 11 | `marathon_checkpoint_scans` | EXISTS | QR scan records |
| 12 | `marathon_results` | EXISTS | Race results + rankings |
| 13 | `marathon_incidents` | EXISTS | Race day incidents |
| 14 | `marathon_volunteer_checkins` | EXISTS | Volunteer station check-ins |
| 15 | `marathon_race_tracks` | **MISSING** | GPS position (latest per runner) |
| 16 | `marathon_race_track_points` | **MISSING** | GPS breadcrumb trail (replay) |

## CRITICAL: Create Missing Tables

Run this SQL on the Supabase SQL editor or via CLI:

```sql
-- GPS tracking data from public site race tracker
CREATE TABLE IF NOT EXISTS public.marathon_race_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.marathon_events(id),
  bib text NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  distance_km numeric(8,3) DEFAULT 0,
  pace_per_km numeric(8,2) DEFAULT 0,
  elapsed_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, bib)
);

CREATE INDEX IF NOT EXISTS idx_marathon_race_tracks_event ON public.marathon_race_tracks(event_id);
CREATE INDEX IF NOT EXISTS idx_marathon_race_tracks_bib ON public.marathon_race_tracks(bib);

-- Enable public INSERT for race tracker (runners push GPS data without auth)
ALTER TABLE public.marathon_race_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_can_insert_tracks" ON public.marathon_race_tracks
  FOR INSERT WITH CHECK (true);
CREATE POLICY "public_can_read_tracks" ON public.marathon_race_tracks
  FOR SELECT USING (true);
CREATE POLICY "public_can_update_tracks" ON public.marathon_race_tracks
  FOR UPDATE USING (true);

-- Individual GPS points for track replay
CREATE TABLE IF NOT EXISTS public.marathon_race_track_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  bib text NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  speed numeric(6,2),
  accuracy numeric(6,2),
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_track_points_event_bib ON public.marathon_race_track_points(event_id, bib);

ALTER TABLE public.marathon_race_track_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_can_insert_points" ON public.marathon_race_track_points
  FOR INSERT WITH CHECK (true);
CREATE POLICY "public_can_read_points" ON public.marathon_race_track_points
  FOR SELECT USING (true);
```

**CLI command:**
```bash
~/bin/supabase db execute --project-ref hhprjbgknupaplivtoib "$(cat /Users/omm/PROJECTS/MyJKKN/supabase/migrations/20260404000001_marathon_tables.sql)"
```

## Entity Relationship

```
marathon_events (1)
  ├── marathon_categories (many)
  ├── marathon_registrations (many)
  │     ├── marathon_results (1)
  │     └── marathon_checkpoint_scans (many)
  ├── marathon_sponsors (many)
  │     ├── marathon_sponsor_deliverables (many)
  │     └── marathon_sponsor_activity_log (many)
  ├── marathon_committees (many)
  │     └── marathon_tasks (many)
  ├── marathon_budget_items (many)
  ├── marathon_checkpoints (many)
  │     └── marathon_checkpoint_scans (many)
  ├── marathon_incidents (many)
  ├── marathon_volunteer_checkins (many)
  ├── marathon_race_tracks (many) ← GPS latest position
  └── marathon_race_track_points (many) ← GPS breadcrumbs
```

## Key Columns Per Table

### marathon_events
`id, institution_id, year, name, theme, tagline, event_date, start_time, venue, status, target_registrations, registration_open_date, registration_close_date, registration_config (jsonb), route_config (jsonb), branding_config (jsonb), previous_event_id, hero_video_url, is_active`

Status enum: `dormant → planning → preparation → execution → live → post_event → archived`

### marathon_registrations
`id, event_id, category_id, bib_number (unique), participant_name, age, gender, phone, email, participant_type, institution_id, institution_name, department, tshirt_size, emergency_contact_name, emergency_contact_phone, payment_status, payment_amount, payment_reference, payment_method, discount_code, source, referral_source, status, checked_in, checked_in_at`

Unique constraint: `(event_id, phone) WHERE status != 'cancelled'`

### marathon_results
`id, registration_id (unique FK), finish_time, finish_time_seconds, rank_overall, rank_category, rank_institution, pace_per_km_seconds, certificate_id (unique), certificate_url, certificate_generated_at, is_dnf, is_disqualified`

### marathon_race_tracks (GPS — MUST CREATE)
`id, event_id, bib, lat, lng, distance_km, pace_per_km, elapsed_seconds, updated_at`
Unique: `(event_id, bib)` — UPSERT pattern, one row per runner updated every 30s

### marathon_race_track_points (GPS breadcrumbs — MUST CREATE)
`id, event_id, bib, lat, lng, speed, accuracy, timestamp`
Append-only — one row per GPS reading (every 3 seconds per runner)

## RLS Summary

| Table | Public Read | Public Insert | Auth Required |
|-------|------------|---------------|---------------|
| marathon_events | Yes (active events) | No | CRUD via internal |
| marathon_registrations | No | Yes (public registration) | Read via internal |
| marathon_results | Yes | No | CRUD via internal |
| marathon_sponsors | Yes (committed+) | No | CRUD via internal |
| marathon_race_tracks | Yes | Yes | — |
| marathon_race_track_points | Yes | Yes | — |
| marathon_checkpoint_scans | No | Yes | Read via internal |
| All other tables | No | No | Full auth required |
