# KBM Marathon 2.0 — Database Schemas

> **Source:** Live Supabase query on April 9, 2026
> **Project:** MyJKKN-Staging (`hhprjbgknupaplivtoib`)

## Table Inventory

| # | Table | Cols | Used By | Purpose |
|---|-------|------|---------|---------|
| 1 | `events` | 36 | Internal (shared) | Event lifecycle and config |
| 2 | `event_categories` | 17 | Internal (shared) | Race distances/categories |
| 3 | `events_registrations` | 33 | Internal (shared) | Participant registrations |
| 4 | `marathon_committees` | 11 | Both | Committee assignments |
| 5 | `marathon_tasks` | 13 | Both | Committee tasks |
| 6 | `marathon_budget_items` | 15 | Both | Budget line items |
| 7 | `marathon_checkpoints` | 11 | Both | Route checkpoints |
| 8 | `marathon_checkpoint_scans` | 9 | Both | QR scan records |
| 9 | `marathon_sponsors` | 19 | Both | Sponsor pipeline CRM |
| 10 | `marathon_sponsor_deliverables` | 10 | Both | Sponsor deliverables |
| 11 | `marathon_sponsor_activity_log` | 6 | Both | Sponsor interactions |
| 12 | `marathon_race_tracks` | 13 | Both | GPS position (latest per runner) |
| 13 | `marathon_race_track_points` | 9 | Both | GPS breadcrumb trail (replay) |
| 14 | `marathon_results` | 20 | Both | Race results + rankings |
| 15 | `marathon_incidents` | 17 | Both | Race day incidents |
| 16 | `marathon_volunteer_checkins` | 10 | Both | Volunteer station check-ins |

---

## 1. `events` (36 columns)

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | NO | uuid_generate_v4() | PK |
| `institution_id` | uuid | NO | — | FK to institutions |
| `event_type` | text | NO | — | 'marathon' |
| `name` | text | NO | — | Event name |
| `slug` | text | NO | — | URL slug |
| `description` | text | YES | — | Rich text description |
| `theme` | text | YES | — | Event theme/motto |
| `tagline` | text | YES | — | Short tagline |
| `event_date` | date | YES | — | Main event date |
| `start_time` | time | YES | — | Start time |
| `end_time` | time | YES | — | End time |
| `start_date` | timestamptz | YES | — | Multi-day start |
| `end_date` | timestamptz | YES | — | Multi-day end |
| `registration_open_date` | timestamptz | YES | — | When registration opens |
| `registration_close_date` | timestamptz | YES | — | When registration closes |
| `status` | text | NO | 'draft' | Event lifecycle status |
| `config` | jsonb | NO | '{}' | General config |
| `registration_config` | jsonb | NO | '{}' | Registration settings |
| `route_config` | jsonb | NO | '{}' | Route settings |
| `branding_config` | jsonb | NO | '{}' | Branding settings |
| `target_registrations` | integer | YES | — | Target participant count |
| `max_registrations` | integer | YES | — | Hard cap |
| `is_public` | boolean | NO | true | Publicly visible |
| `allow_external_registration` | boolean | NO | false | External participants OK |
| `is_active` | boolean | NO | true | Active flag |
| `previous_event_id` | uuid | YES | — | Link to previous edition |
| `year` | integer | YES | — | Event year |
| `edition_number` | integer | YES | — | Edition number |
| `hero_image_url` | text | YES | — | Hero image |
| `hero_video_url` | text | YES | — | Hero video |
| `venue` | text | YES | — | Venue name |
| `venue_address` | text | YES | — | Full address |
| `venue_coordinates` | jsonb | YES | — | {lat, lng} |
| `created_by` | uuid | YES | — | Creator |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

**Status values:** draft → planning → preparation → execution → live → post_event → archived | cancelled

---

## 2. `event_categories` (17 columns)

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | NO | uuid_generate_v4() | PK |
| `event_id` | uuid | NO | — | FK to events |
| `name` | text | NO | — | "10 KM Run" |
| `code` | text | YES | — | "10K" |
| `description` | text | YES | — | |
| `distance_km` | numeric | YES | — | 10.0 |
| `max_participants` | integer | YES | — | Cap per category |
| `min_age` | integer | YES | — | Minimum age |
| `max_age` | integer | YES | — | Maximum age |
| `fee_amount` | numeric | YES | 0 | Registration fee |
| `early_bird_fee` | numeric | YES | — | Discounted fee |
| `early_bird_deadline` | timestamptz | YES | — | Early bird cutoff |
| `config` | jsonb | YES | '{}' | Extra config |
| `sort_order` | integer | YES | 0 | Display order |
| `is_active` | boolean | NO | true | Active flag |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

---

## 3. `events_registrations` (33 columns)

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | NO | uuid_generate_v4() | PK |
| `event_id` | uuid | NO | — | FK to events |
| `category_id` | uuid | YES | — | FK to event_categories |
| `profile_id` | uuid | YES | — | FK to profiles (MyJKKN users) |
| `learner_id` | uuid | YES | — | FK to learners |
| `external_participant_id` | uuid | YES | — | FK to external_participants |
| `participant_type` | text | NO | 'internal' | internal / external |
| `participant_name` | text | NO | — | Full name |
| `participant_phone` | text | YES | — | Phone number |
| `participant_email` | text | YES | — | Email |
| `participant_age` | integer | YES | — | Age |
| `participant_gender` | text | YES | — | Gender |
| `institution_id` | uuid | YES | — | Institution |
| `institution_name` | text | YES | — | Institution name (denormalized) |
| `department` | text | YES | — | Department/program |
| `bib_number` | text | YES | — | Auto-generated: KUM-2026-5K-0001 |
| `registration_number` | text | YES | — | Alternative registration ID |
| `status` | text | NO | 'registered' | Registration status |
| `checked_in` | boolean | YES | false | Race day check-in |
| `checked_in_at` | timestamptz | YES | — | Check-in timestamp |
| `checked_in_by` | uuid | YES | — | Who checked them in |
| `payment_status` | text | YES | 'not_required' | Payment state |
| `payment_amount` | numeric | YES | 0 | Amount paid |
| `payment_method` | text | YES | — | Cash/online/UPI |
| `payment_reference` | text | YES | — | Transaction ID |
| `discount_code` | text | YES | — | Discount code used |
| `discount_amount` | numeric | YES | 0 | Discount applied |
| `custom_data` | jsonb | YES | '{}' | Marathon-specific: blood_group, tshirt_size, emergency_contact_name, emergency_contact_phone, roll_number, program, section, semester, registration_fee_override |
| `source` | text | YES | 'internal' | Where registered from |
| `referral_source` | text | YES | — | How they heard about it |
| `registered_by` | uuid | YES | — | Staff who registered them |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

**BIB format:** `KUM-2026-{CATEGORY_CODE}-{4-digit sequence}`

---

## 4-16. Marathon-Specific Tables

### `marathon_committees` (11 cols)
id, event_id, name, description, lead_id (uuid), lead_name (text), member_ids (uuid[]), member_names (text[]), status (default 'active'), created_at, updated_at

### `marathon_tasks` (13 cols)
id, committee_id (FK), event_id (FK), title, description, status (default 'pending'), priority (default 'medium'), assigned_to (uuid), assigned_to_name, due_date, completed_at, created_at, updated_at

### `marathon_budget_items` (15 cols)
id, event_id, category, description, type (default 'expense'), estimated_amount, actual_amount (default 0), status (default 'planned'), approved_by (uuid), vendor, receipt_url, notes, institution_id, created_at, updated_at

### `marathon_checkpoints` (11 cols)
id, event_id, name, type (default 'waypoint'), distance_from_start_km, lat, lng, qr_code_data, sort_order (default 0), is_active (default true), created_at

### `marathon_checkpoint_scans` (9 cols)
id, checkpoint_id (FK), event_id, registration_id, bib_number, scanned_at (default now()), scanned_by, lat, lng

### `marathon_sponsors` (19 cols)
id, event_id, company_name, contact_person, contact_email, contact_phone, website, logo_url, tier (default 'prospect'), amount_pledged (default 0), amount_received (default 0), benefits, expectations, notes, pipeline_stage (default 'lead'), signed_date, institution_id, created_at, updated_at

### `marathon_sponsor_deliverables` (10 cols)
id, sponsor_id (FK), title, description, category, status (default 'pending'), due_date, completed_at, assigned_to, created_at

### `marathon_sponsor_activity_log` (6 cols)
id, sponsor_id (FK), activity_type, description, performed_by, created_at

### `marathon_race_tracks` (13 cols)
id, event_id (FK), bib, lat, lng, distance_km (default 0), pace_per_km (default 0), elapsed_seconds (default 0), altitude, heading, speed, created_at, updated_at
**UNIQUE(event_id, bib)** — one latest position per runner

### `marathon_race_track_points` (9 cols)
id, event_id, bib, lat, lng, speed, accuracy, altitude, timestamp (default now())
**No unique constraint** — every GPS reading is a new row (breadcrumb trail)

### `marathon_results` (20 cols)
id, registration_id (FK), event_id (FK), bib_number, finish_time (text), finish_time_seconds (int), pace_per_km_seconds, rank_overall, rank_category, rank_gender, rank_institution, certificate_id, certificate_url, certificate_generated_at, is_dnf (default false), is_disqualified (default false), disqualification_reason, notes, created_at, updated_at

### `marathon_incidents` (17 cols)
id, event_id, type, severity (default 'low'), title, description, location, lat, lng, reported_by, reported_by_name, status (default 'reported'), resolved_at, resolution_notes, bib_number, created_at, updated_at

### `marathon_volunteer_checkins` (10 cols)
id, event_id, checkpoint_id, volunteer_name, volunteer_phone, station, role, checked_in_at (default now()), checked_out_at, notes
