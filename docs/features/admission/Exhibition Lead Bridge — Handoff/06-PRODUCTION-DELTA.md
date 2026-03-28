# Exhibition Lead Bridge — Production Delta Report

> Source: `git diff origin/main...HEAD` + DB comparison (staging vs production)
> Date: 2026-03-28
> Dev branch: omm-dev (4,380 commits ahead of main)
> Staging DB: `hhprjbgknupaplivtoib` | Production DB: `kvizhngldtiuufknvehv`

## Summary

| Category | Staging | Production | Gap | Status |
|----------|---------|------------|-----|--------|
| Expo tables | ~~0~~ **15** | **15** | ~~Developer must CREATE~~ | **SYNCED (2026-03-28)** |
| admission_leads columns | ~~65~~ **81** | **78** | ~~17 missing~~ Staging now has 3 extra (WA fields) | **SYNCED (2026-03-28)** |
| Expo pages/services/hooks | **0** | **0** | Build from scratch | Developer task |
| Referral tables | 3 (has sh_client_referrals) | 2 | Staging has extra | No action needed |
| Admission tables | 24 | 23 | Staging has 1 extra | No action needed |
| Handoff spec files | 7 (in omm-dev) | 0 | New | Developer task |

## Database Delta

### Expo Tables: ~~MISSING from Staging~~ SYNCED (2026-03-28)

> **Completed**: All 15 tables were reverse-synced from production → staging on 2026-03-28 via Supabase Management API. RLS policies with institution-scoped + super_admin bypass applied to all 4 core tables.

| # | Table | Columns | Purpose |
|---|-------|---------|---------|
| 1 | `expo_masters` | 12 | Recurring event organizers (SMART EVENTZ, VIJAY INFO MEDIA) |
| 2 | `expo_events` | 18 | Individual events with dates, venues, teams, approval |
| 3 | `expo_event_team_members` | 8 | Staff + student volunteers per event |
| 4 | `expo_daily_reports` | 22 | Expenses, visitors, leads count, photos |
| 5 | `event_checklists` | 7 | Pre/during/post event preparation |
| 6 | `event_checklist_items` | 6 | Individual checklist tasks |
| 7 | `event_checklist_completions` | 6 | Who completed what |
| 8 | `event_registrations` | ? | Event registrations |
| 9 | `event_staff_assignments` | ? | Staff duty assignments |
| 10 | `event_submissions` | ? | Event submissions |
| 11 | `event_demo_slots` | ? | Demo scheduling at events |
| 12 | `event_team_members` | ? | Team member records |
| 13 | `event_team_attendance` | ? | Attendance tracking |
| 14 | `event_team_venue_allocations` | ? | Venue-team mapping |
| 15 | `event_venue_assignments` | ? | Venue assignments |

### admission_leads Columns: ~~MISSING from Staging~~ SYNCED (2026-03-28)

> **Completed**: 16 columns added to staging on 2026-03-28. Staging now has 81 columns (production has 78 — staging has 3 extra WhatsApp consent columns).

| Column | Type | Purpose |
|--------|------|---------|
| `expo_event_id` | uuid | **THE BRIDGE** — links lead to exhibition event |
| `referral_type` | text | 'learner_ambassador' for booth captures |
| `referred_by_id` | uuid | Ambassador's user ID |
| `referred_by_name` | text | Ambassador's name |
| `referrer_id` | uuid | Another referral field |
| `first_name` | text | Separate from full_name |
| `last_name` | text | Separate from full_name |
| `degree_id` | uuid | Interested degree |
| `department_id` | uuid | Interested department |
| `program_id` | uuid | Primary interested program |
| `publisher_id` | uuid | Publisher reference |
| `application_number` | text | Application tracking |
| `source_detail` | text | Sub-source detail |
| `is_duplicate` | boolean | Duplicate detection flag |
| `duplicate_of` | uuid | Points to original lead |
| `priority` | USER-DEFINED | Lead priority enum |
| `country` | text | Country field |

### Columns in Staging but NOT in Production

| Column | Type | Note |
|--------|------|------|
| `wa_opt_in` | ? | WhatsApp opt-in flag |
| `wa_opt_in_at` | ? | Opt-in timestamp |
| `wa_opt_in_source` | ? | Where they opted in |
| `wa_opt_out_at` | ? | Opt-out timestamp |

These are staging-only (WhatsApp consent tracking). DO NOT remove them.

## Code Delta

### New Files (developer must CREATE — nothing exists)

| What | Count | Notes |
|------|-------|-------|
| Expo capture pages | 0 → ~4 | Build from scratch |
| Expo services | 0 → 1 | `expo-capture-service.ts` |
| Expo hooks | 0 → 1 | `use-expo-capture.ts` |
| Expo API routes | 0 → ~4 | Capture, stats, QR, analytics |
| Expo types | 0 → 1 | `expo-capture.ts` |

### Existing Files to Modify

| File | What to Change |
|------|---------------|
| `types/admission.ts` | Add `expo_event_id`, `captured_by`, referral fields to `AdmissionLead`. Add `'ai_experience_zone'` to `LeadSource` |
| `lib/services/admission/lead-service.ts` | Handle `expo_event_id` in create/filter |
| `app/(routes)/admission/apply/page.tsx` | Reference for capture form design (57KB — existing public form) |

### Unchanged (exists in both branches)

All 358 admission files in omm-dev are NEW (not in main). The developer on main will need to cherry-pick or merge the entire admission module.

## Developer Action Checklist

### ~~P0 (Must Do First — Database Setup)~~ COMPLETED by Claude Code

- [x] ~~Copy 15 expo/event table schemas from production → create on staging~~ **DONE 2026-03-28**
- [x] ~~Add 17 missing columns to `admission_leads` on staging~~ **DONE 2026-03-28 (81 cols now)**
- [x] ~~Copy RLS policies from production for all new tables~~ **DONE — 4 core tables have institution + super_admin policies**
- [ ] Verify `referral_rewards` and `referral_reward_configs` tables work on staging (already exist)

### P1 (Build the Bridge)

- [ ] Create `lib/services/admission/expo-capture-service.ts`
- [ ] Create `hooks/admission/use-expo-capture.ts`
- [ ] Create `types/expo-capture.ts`
- [ ] Create `app/api/admission/capture/route.ts` (authenticated)
- [ ] Create `app/(routes)/admission/capture/[eventId]/page.tsx` (rapid form)
- [ ] Update `types/admission.ts` with expo fields + new LeadSource

### P2 (Dashboard + Analytics)

- [ ] Create `app/(routes)/admission/events/[eventId]/live/page.tsx`
- [ ] Create `app/(routes)/admission/events/[eventId]/qr/page.tsx`
- [ ] Create `app/(routes)/admission/events/analytics/page.tsx`
- [ ] Create corresponding API routes

### P3 (Auto-Pipeline)

- [ ] Auto-assign counselor on capture
- [ ] Auto-schedule follow-up
- [ ] WhatsApp integration (when API ready)

## What NOT to Do

- ~~DO NOT assume expo tables exist on staging~~ **They now exist (synced 2026-03-28)**
- ~~DO NOT assume admission_leads has expo_event_id on staging~~ **It now has 81 columns including expo_event_id**
- **DO NOT use Supabase MCP execute_sql** — it targets production. Use Management API for staging
- **DO NOT modify the 4 staging-only WhatsApp columns** (wa_opt_in, wa_opt_in_at, wa_opt_in_source, wa_opt_out_at)
- **DO NOT recreate referral_rewards tables** — they already exist on both staging and production
