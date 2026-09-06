# Universal Booking Module — "Book anyone at JKKN"

**Date:** 2026-06-12 · **Status:** Spec locked via assumption-thrash (5 rounds, 20 decisions) · **Owner:** Director
**Vision:** Anyone — outside or inside MyJKKN — books meetings with Senior Learners (faculty) and Team Members (staff), Calendly-style, on the native scheduling engine.

> Terminology receipt: `app/(routes)/learn/quests/page.tsx` maps `faculty: 'Senior Learner'`. Learners = students. Team Members = non-academic staff.

## Substrate this extends (live on prod, 2026-06-12)

- Native engine: `meeting_host_schedules/windows/overrides`, `meeting_types`, `meeting_bookings` + gist exclusion `mb_no_double_booking` (migration 20260611190000). Host-agnostic — any `profiles.id` can host.
- N3a notifications (PR #1344, deployed): Resend email service + attendee cancel page `/book/cancel/[uid]?token=` (awaiting Resend env activation).
- Self-service `/meetings/availability` + `/meetings/manage` (auth-gated; `meetings.view` granted to ZERO roles today).
- Public funnel pattern `/book/[slug]` (rate-limit + honeypot + service-role + engine re-validation).
- 95 counselors provisioned (provision-counselors-native.ts); only `engineering-admission` routing config live.
- Layer-2 sweep verified 2026-06-12: NO parallel person-booking system, NO handle/username precedent anywhere. `hostel_cleaning_bookings`/`mess_meal_bookings` = resident-slot systems (different problem). `jicate_booking_*` = cal-era, retiring in N3b.

## Silent Assumption Decisions (from assumption-thrash)

### Pre-thrash (vision round)
| # | Question | Decision |
|---|----------|----------|
| D1 | Who becomes bookable | **Opt-in per person** |
| D2 | Booking confirmation | **Instant confirm** (Calendly model) |
| D3 | Discovery | **Public directory in v1** |

### Round 1 — structural
| # | Question | Decision |
|---|----------|----------|
| D4 | Where meetings happen | **Per meeting type**: `in_person` (free-text place) / `phone` (host calls) / `online`. Online URL auto-generated (Meet, via D12); manual permanent link not needed since Google is required (D20) |
| D5 | Public handle | **Auto from name, editable once at opt-in** (`/meet/akila-m`; collision → `-2` suffix; reserved words blocked: cancel, admin, jkkn, api…) |
| D6 | Directory card PII | **Name + designation + department + college + photo + meeting types.** No email/phone ever |
| D7 | Counselors | **Auto-listed in directory.** Composed with D20: counselor cards route to their COLLEGE FUNNEL (load-balanced, no Google needed); personal pages appear when a counselor individually connects Google like anyone else |

### Round 2 — workflow edges
| # | Question | Decision |
|---|----------|----------|
| D8 | Real-calendar conflicts | **Google Calendar sync in v1** (Director override — replaces manual date-block UI as the defense) |
| D9 | Daily booking cap | **No cap — availability hours ARE the cap** |
| D10 | Page-off with future bookings | **Honor existing, stop new** (host cancels individually if needed) |
| D11 | Learner hosts | **Staff-only v1** (learner-mentors = phase 2 with own guardrails) |

### Round 3 — Google + operational
| # | Question | Decision |
|---|----------|----------|
| D12 | Google depth | **FULL: freebusy busy-check + Calendar event per booking + auto Meet link for online mode + attendee invited on the event** |
| D13 | Google optionality | Optional, prompted → **superseded by D20** |
| D14 | Proxy management | **Super admin only** (no PA/HoD delegation v1) |
| D15 | Meetings menu roles | **All staff-type roles** get `meetings.view` (every non-learner role; visibility ≠ public exposure) |

### Round 4 — final edges
| # | Question | Decision |
|---|----------|----------|
| D16 | Reschedule | **True reschedule in v1**: email link → pick new time; same booking row updated (exclusion constraint re-arbitrates the UPDATE → 23P01 = slot taken); Google event updated, not recreated; auth = same `cancel_token` capability |
| D17 | Abuse cap | **No per-email cap** — rate-limit (5/hr/IP) + honeypot only. Accepted residual: patient multi-email flooding |
| D18 | Sequencing | **Single launch — hold everything until Google sync works.** (Merge-order discipline, not dark-ship) |
| D19 | Google breaks later | **Auto-hide page until reconnected** + loud warn (email + red banner). Fail-closed at slot-request time |

### Round 5 — reconciliation
| # | Question | Decision |
|---|----------|----------|
| D20 | D13 vs D19 contradiction | **Google connect REQUIRED for a public personal page.** No Google → page can't go public (internal availability pages still usable). Broken Google → D19 auto-hide. Every public host is always class-protected |

## Edge-case ledger (walked 2026-06-12)

| Edge | Resolution |
|------|------------|
| Engine can't see Google Calendar ("10 AM class shows free") | D8+D12+D20: public host ⇒ Google-connected ⇒ freebusy unioned into `loadBusy` |
| Where does the meeting happen | D4 modes; online = auto Meet link on the Google event (D12) |
| Handle collision / squatting / reserved words | D5: name-based + `-2` suffix; one-time edit; reserved-word blocklist; unique index |
| Directory PII on open internet | D6: no contact data; booking is the only contact channel |
| Counselor pile-on / funnel bypass | D7 composition: directory → funnel cards for counselors; least-loaded routing preserved |
| Page off with future bookings | D10: honor existing |
| Google token breaks silently | D19: freebusy failure at slot-time → fail closed (no slots served), mark broken, auto-hide, email host; cron re-validates connections daily |
| Reschedule race (two attendees, one slot) | UPDATE hits the same gist exclusion constraint → 23P01 → "slot taken" to the rescheduler; original booking untouched |
| Concurrent reschedule of SAME booking (double-click / two tabs) | guard `WHERE status='confirmed' AND start_time=<expected_prev>` — second update no-ops |
| Internal logged-in booker | Prefill name/email from session + store `attendee_profile_id` (nullable FK) |
| Host with no profile email | Moot under D20 — Google connection supplies a verified google_email |
| .ics attachments | Not needed v1 — attendee is invited on the Google event (gets real calendar invite); Resend mail still carries cancel/reschedule links |
| Tamil on public pages | English-only v1 (CLAUDE.md #24 — needs native review before any Tamil ships) |
| pgcrypto vault for Google tokens | MUST use `SET search_path = public, extensions` (repo migration 20260503000003 has the broken-precedent `public`-only path — do NOT copy it; see wiring-map memory) |
| Counselor funnel bookings once counselor connects Google | Same createBooking path ⇒ funnel bookings also get events/Meet links — free consistency win |
| Existing 8 meeting_bookings (ported/probes) | No google_event_id — backfill not attempted; columns nullable |

## Schema implications

- **NEW `meeting_host_pages`** — one row per host: `host_profile_id` (UNIQUE FK), `handle` (UNIQUE, citext-ish lower), `is_public`, `auto_hidden` (+reason), `headline`. Pattern: `meeting_routing_config` (config-row), RLS host-own + super-admin, REVOKE anon (public reads go through service-role routes only).
- **NEW `meeting_host_google_connections`** — `host_profile_id` UNIQUE, `google_email`, `refresh_token_encrypted` (pgp_sym_encrypt, search_path=public,extensions), `status` (active/broken/revoked), `last_ok_at`, `broken_at`. Pattern: cal-api-key-vault RPC trio (fn_set/get/clear) — corrected search_path.
- **ALTER `meeting_types`**: `location_mode` text CHECK in ('in_person','phone','online') DEFAULT 'in_person', `location_text`.
- **ALTER `meeting_bookings`**: `video_url`, `google_event_id`, `attendee_profile_id` (nullable FK profiles), `rescheduled_at`, `reschedule_count` int DEFAULT 0, `previous_start_time`.
- **Role grants migration**: merge `{"meetings.view": true}` into all staff-type `custom_roles.permissions` (exclude learner/student/parent-class roles; exact list enumerated at build from live roles).
- **Directory data**: union of (a) `meeting_host_pages` is_public + profile join, (b) active `meeting_routing_config` rows as college-funnel cards. No counselor seed rows needed.

## Build plan (PRs, each with pattern source — find-pattern-extend rule)

| PR | Contents | Pattern source |
|----|----------|----------------|
| U1 substrate | 2 new tables + 2 ALTERs + RLS + vault RPCs + role-grant migration. Ships dark | 20260611190000 + config-table-pattern + cal-api-key-vault (fixed search_path) |
| U2 Google service | `lib/services/integrations/google-calendar-service.ts`: OAuth exchange/refresh, freebusy, event create/update/delete with conferenceData; `/api/integrations/google-calendar/{connect,callback}` routes; daily connection-validation cron | cal-com-api-client (external API client shape) + existing cron route pattern |
| U3 self-service | /meetings additions: Connect-Google card, page settings (handle claim, public toggle gated on connection, headline), location fields on manage | availability/manage pages + actions (N2) |
| U4 public surfaces | `/meet` directory + `/meet/[handle]` person page + `/api/public/meet/[handle]/{slots,book}` + proxy.ts `/meet/` prefix | /book/[slug] + booking-widget + public API routes (rate-limit+honeypot) |
| U5 reschedule | `/book/reschedule/[uid]?token=` page + service updateBooking + email links + Google event patch | N3a cancel page + meeting-booking-email-service |
| Launch | D18: deploy gate = U1–U5 merged AND Google OAuth client live AND Resend active. E2E: outsider books faculty → Meet link + calendar event + emails → reschedule → cancel | three-layer sweep |

Engine changes (U2/U4): `loadBusy` unions Google freebusy when host has an active connection; freebusy error ⇒ fail-closed + flag connection broken (D19).

## Director action items (blocking)

1. **Google Cloud OAuth client** (blocks U2): create under jkkn.ac.in Workspace as **Internal** app (no Google review needed; all hosts are @jkkn.ac.in). Scopes: `calendar.events` + `calendar.freebusy`. Redirect URI: `https://www.jkkn.ai/api/integrations/google-calendar/callback`. I provide click-by-click walkthrough; client id/secret → Vercel env.
2. **Resend activation** (blocks launch + N3a receive-proof): fill `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (currently EMPTY strings) + verify jkkn.ai domain.
3. **Still open from earlier threads**: 6 college routing slugs approval; Cal.com retirement window (N3b).
