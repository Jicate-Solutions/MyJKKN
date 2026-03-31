# Database Schemas — Live from Staging DB

> Queried: 2026-03-30 from `hhprjbgknupaplivtoib` (staging)

## Expo Tables (16 tables)

| Table | Columns | Records | Purpose |
|-------|---------|---------|---------|
| `expo_masters` | 13 | - | Recurring organizers (VIJAY INFO MEDIA, SMART EVENTZ) |
| `expo_events` | 21 | 1 | Individual events with dates, venues, teams |
| `expo_event_team_members` | 9 | 0 | Staff + student volunteers per event |
| `expo_daily_reports` | 23 | 0 | Expenses, visitors, leads count |
| `expo_lead_capture_links` | 8 | 0 | QR code short links per event |
| `event_checklists` | 7 | - | Pre/during/post event tasks |
| `event_checklist_items` | 6 | - | Individual checklist tasks |
| `event_checklist_completions` | 6 | - | Completion tracking |
| `event_registrations` | 13 | - | Event registrations |
| `event_staff_assignments` | 7 | - | Staff duty assignments |
| `event_submissions` | 31 | - | Event form submissions |
| `event_demo_slots` | 9 | - | Demo scheduling |
| `event_team_members` | 12 | - | Generic team member records |
| `event_team_attendance` | 9 | - | Team attendance tracking |
| `event_team_venue_allocations` | 7 | - | Venue-team mapping |
| `event_venue_assignments` | 10 | - | Venue assignments |

### expo_lead_capture_links (new — created on staging)

```sql
id              uuid        NOT NULL  DEFAULT gen_random_uuid()
expo_event_id   uuid        NOT NULL  -- FK → expo_events(id)
institution_id  uuid        NOT NULL  -- FK → institutions(id)
short_code      text        NOT NULL  -- UNIQUE, URL identifier
is_active       boolean     NULL      DEFAULT true
scan_count      integer     NULL      DEFAULT 0
created_at      timestamptz NULL      DEFAULT now()
expires_at      timestamptz NULL
```

RLS: `capture_links_access` — institution-scoped + super_admin bypass

### admission_leads — Expo + WhatsApp columns

| Column | Type | Purpose |
|--------|------|---------|
| `expo_event_id` | uuid | Links lead to exhibition event |
| `referral_type` | text | 'learner_ambassador' for booth captures |
| `referred_by_id` | uuid | Ambassador's user ID |
| `referred_by_name` | text | Ambassador's display name |
| `wa_opt_in` | boolean | WhatsApp consent status |
| `wa_opt_in_at` | timestamptz | When they opted in |
| `wa_opt_in_source` | text | How they opted in |
| `wa_opt_out_at` | timestamptz | When they opted out |

## WhatsApp Tables (13 tables — excluding waste_incidents false positive)

| Table | Columns | Records | Purpose |
|-------|---------|---------|---------|
| `wa_conversations` | 17 | 0 | Chat conversations |
| `wa_messages` | 11 | 0 | Individual messages |
| `wa_phone_numbers` | 13 | **0 (EMPTY!)** | WABA phone number → institution mapping |
| `wa_settings` | 16 | 0 | Institution WhatsApp config |
| `wa_quick_replies` | 10 | 0 | Canned responses |
| `wa_consent_log` | 9 | 0 | Consent audit trail |
| `wa_audience_segments` | 14 | 0 | Campaign audience segments |
| `wa_document_catalog` | 14 | 0 | Shareable documents |
| `wa_message_logs` | 18 | 0 | Message log (new format) |
| `whatsapp_templates` | 14 | 3 | Template store (DB-only, NOT synced with Meta) |
| `whatsapp_connections` | 16 | 0 | Legacy connection tracking |
| `whatsapp_active_connections` | 11 | 0 | Legacy active connections |
| `whatsapp_message_logs` | 18 | 0 | Legacy message logs |
| `whatsapp_message_stats` | 10 | 0 | Legacy message stats |
| `whatsapp_settings` | 21 | 0 | Legacy settings |
| `whatsapp_shared_access` | 8 | 0 | Legacy shared access |
| `communication_channels` | 14 | 0 | Multi-channel config |
| `communication_log` | 24 | 0 | Cross-channel message log |

### wa_phone_numbers (CRITICAL — must populate)

```sql
id                      uuid        NOT NULL  DEFAULT gen_random_uuid()
institution_id          uuid        NOT NULL  -- FK → institutions(id)
phone_number_id         text        NOT NULL  -- Meta phone number ID
business_account_id     text        NOT NULL  -- Meta WABA ID
display_number          text        NOT NULL  -- +916380310048
verified_name           text        NULL      -- "JKKN Institutions"
quality_rating          text        NULL      DEFAULT 'GREEN'
messaging_limit         text        NULL      DEFAULT 'TIER_1K'
is_primary              boolean     NOT NULL  DEFAULT false
is_active               boolean     NOT NULL  DEFAULT true
access_token_encrypted  text        NULL      -- Per-number token (optional)
created_at              timestamptz NOT NULL  DEFAULT now()
updated_at              timestamptz NOT NULL  DEFAULT now()
```

RLS: `wa_phone_numbers_access` — institution-scoped

### RLS Policies Summary

| Table | Policy Name | Type |
|-------|------------|------|
| `expo_events` | `expo_events_institution_access` | Institution + super_admin |
| `expo_event_team_members` | `expo_team_access` | Institution |
| `expo_daily_reports` | `expo_reports_institution_access` | Institution |
| `expo_lead_capture_links` | `capture_links_access` | Institution + super_admin |
| `expo_masters` | `expo_masters_institution_access` | Institution |
| `wa_conversations` | `wa_conversations_access` | Institution |
| `wa_messages` | `wa_messages_access` | Institution |
| `wa_phone_numbers` | `wa_phone_numbers_access` | Institution |
| `wa_settings` | `wa_settings_institution_access` + service_role | Institution + service |
| `wa_consent_log` | `wa_consent_log_access` | Institution |
| `wa_audience_segments` | `wa_segments_access` | Institution |
| `wa_document_catalog` | `wa_doc_catalog_access` | Institution |
| `wa_quick_replies` | `wa_quick_replies_access` | Institution |
| `wa_message_logs` | `wa_message_logs_institution_access` + service_role | Institution + service |

## Data State

| Table | Records | Note |
|-------|---------|------|
| `expo_events` | 1 | Test event (Chennai, active) |
| `admission_leads` | 1 | Test lead |
| `whatsapp_templates` | 3 | DB-only (Welcome, Fee Reminder, Attendance Alert) — NOT synced with Meta |
| Everything else | 0 | Empty — never used |
