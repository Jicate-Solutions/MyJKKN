# MyJKKN Events Module — Spec v2 (Resource-First)

> **Saved to vault** because the MyJKKN working tree's auto-save hooks wiped this file twice. Vault is outside the hostile branch-flip cycle. Re-import to `MyJKKN/specs/` once auto-save chaos is addressed.

**Status:** Post-assumption-thrash (resource-first lens). Ready for `/myjkkn-api` build phase.
**Author:** Omm (Director, JKKN Institutions)
**Date:** 2026-04-16 evening (replaces v1 lost 2026-04-15)
**Path:** Direct-to-production via `/myjkkn-chain`. Director merges; Director approves migration apply; I run `apply_migration` on prod Supabase post-confirm.

---

## North-star principle

**An event is a bundle of resource reservations + human roles + approvals — orchestrated for a stakeholder outcome.**

Events do NOT duplicate resource booking, approval, or escalation logic. They COMPOUND with the existing 10-table resource-management system.

## Strategic seed decisions (locked before thrash)

| # | Decision | Why |
|---|---|---|
| S1 | Resource-first architecture | Avoid duplicating `resource_approvals` schema; events orchestrate, don't reinvent |
| S2 | Single `event_human_roles` table with role_type enum | One table covers coordinator/speaker/volunteer/security/photographer/firstaid/catering_staff/host/emcee/judge/usher |
| S3 | Approval cascade: event approval → auto-fire resource approvals | Reuses `resources.approval_config` per-resource |
| S4 | **Top-level `/events`** (NOT under `/iqac`) | Events serve all stakeholders; IQAC compliance is one downstream consumer |
| S5 | **Deprecate `lc_events` tables**; LC UI re-points to `/events?category=learners_council` | Empty parallel module (0 rows × 3 tables); Startup-Studio failure pattern |
| S6 | **Continue parallel to Workshop Transformation Phase 1** | Events BLOCKS the IQAC evidence pipeline (Attributes 5/7/8/9/10) |

## 22 silent-assumption decisions (5 thrash rounds)

### Round 1 — Structural

| # | Decision | Schema impact |
|---|---|---|
| 1 | `event_id` FK on `resource_reservations` + new `event_resource_bundles` junction | ALTER `resource_reservations` ADD `event_id`; new table `event_resource_bundles` |
| 2 | Parallel fan-out approval cascade, event waits for ALL | trigger fires N parallel `resource_approvals` rows; event status: pending → approved → approved_awaiting_resources → fully_approved / partially_approved |
| 3 | Each reservation has own start_time/end_time | reuse existing `resource_reservations.start_time/end_time` |
| 4 | 3 cross-cutting tag cols on events: `naac_criteria text[]` + `okr_kr_id uuid` + `iqac_evidence_status enum` | ALTER `events` ADD 3 cols; indexed for IQAC dashboards |

### Round 2 — Edge cases + workflow

| # | Decision | Schema impact |
|---|---|---|
| 5 | First-come-first-served + waitlist on resource conflicts | reuse `resource_reservations.status` enum; new `event_waitlist` table |
| 6 | Auto-release ALL linked reservations on event cancel | trigger on `events.status='cancelled'`; cascade + waitlist promotion |
| 7 | Sessions: nullable polymorphic FK (`event_id` OR `session_id` on reservations) | new `event_sessions` table; CHECK constraint exactly-one |
| 8 | Decrement `current_stock_quantity` on reservation APPROVAL | trigger on `resource_reservations.status='approved'`; restore on cancel |

### Round 3 — Operational edges

| # | Decision | Schema impact |
|---|---|---|
| 9 | Snapshot at approval time — original approver stays the record | reuse `resource_approvals.approver_user_id`; new caretaker can RE-APPROVE (audit-tracked) |
| 10 | Director-only `is_emergency` flag overrides BOTH conflicts AND maintenance windows + audit | `events.is_emergency` + new `events_emergency_overrides_log` table |
| 11 | Anyone in `event_human_roles` can check-in/out resources | reuse `resource_reservations.checked_in_by/checked_out_by`; permission against role table |
| 12 | Auto-escalate after `escalate_after_hours` (per `resources.approval_config`) to caretaker's manager | reuse `resource_approvals.escalated_to/escalated_at`; cron job |

### Round 4 — Compliance + visibility

| # | Decision | Schema impact |
|---|---|---|
| 13 | Per-reservation `pre_check_photos` + `post_check_photos` jsonb + condition_status | ALTER `resource_reservations` ADD 3 cols |
| 14 | 4-tier visibility on EVENTS cascades to reservations | `events.visibility` enum (public/all_jkkn/institution/invited) |
| 15 | Auto-generated NAAC Evidence Pack PDF on event closeout | trigger; new `event_naac_evidence_packs` table |
| 16 | IQAC Coordinator (per college) reviews + validates per event | new `event_iqac_validations` table; flips `events.iqac_evidence_status='validated'` |

### Round 5 — Wrap-up

| # | Decision | Schema impact |
|---|---|---|
| 17 | Creative assets (poster/cert/banner) = `resources` (new sub-category 'Creative Asset') | seed row in `resource_sub_categories`; designer briefs become `resource_reservations`; Designer Jicate is caretaker. **Zero new tables.** |
| 18 | Honorarium tracking on `event_human_roles`: amount + status + payment_method | columns on the new table; future FK to billing's vendor_invoice_id |
| 19 | Defer social-media pipeline to v2 — v1 has poster_url + caption + social_published_at + social_platforms[] only | 4 columns on events; SEO publishes manually |
| 20 | Phase 1A foundation + Phase 1B IQAC validation (split into 2 PRs) | reduces silent-failure surface; Phase 1B unblocks Workshop Transformation IQAC roll-out |

(Decisions 21-22 = the strategic seeds S5, S6 above.)

---

## Schema implications

### NEW tables (8, vs v1's 16)

| Table | Purpose |
|---|---|
| `event_resource_bundles` | Group reservations: 'AV bundle', 'Catering bundle', 'Decoration bundle' |
| `event_human_roles` | 11-role-type table with honorarium tracking |
| `event_sessions` | Optional, multi-day session details |
| `event_waitlist` | Capacity overflow queue |
| `event_closeout_reports` | Post-event NAAC fields |
| `event_iqac_validations` | IQAC Coordinator review log |
| `event_naac_evidence_packs` | Generated PDF tracking |
| `events_emergency_overrides_log` | Audit trail for `is_emergency` overrides |

### ALTER existing tables

**`events`** (36 → ~58 cols) — adds: `event_category_id`, `proposed_by`, `is_emergency`, `emergency_reason`, `is_sensitive`, `approval_chain_snapshot`, `venue_text`, `superseded_by`, `recurrence_pattern`, `recurrence_parent_id`, `visibility` (4-tier CHECK), `requires_od`, `target_audience`, `scope` (3-tier CHECK), `budget_estimate`, `cap_behavior` (3-tier CHECK), `status_lifecycle_stage`, `closure_enforced`, **`naac_criteria text[]`**, **`okr_kr_id uuid`**, **`iqac_evidence_status text`** (5-state CHECK), **`poster_url`**, **`caption_text`**, **`social_published_at`**, **`social_platforms text[]`**.

**`resource_reservations`** (25 → 31 cols) — adds: `event_id uuid NULL FK`, `session_id uuid NULL FK`, `session_label text`, `pre_check_photos jsonb`, `post_check_photos jsonb`, `condition_status text` (CHECK ok/minor_damage/major_damage/n/a). CHECK: at most one of (event_id, session_id) is set.

**`event_categories`** (17 → 23 cols) — adds: `approval_chain_template jsonb`, `required_docs_config jsonb`, `default_visibility`, `default_od_trigger`, `default_cap_behavior`, `priority_order`.

### Triggers (9)

| # | Trigger | Fires on |
|---|---|---|
| 1 | tr_event_approved_cascade_reservations | events.status → 'approved' |
| 2 | tr_event_cancelled_cascade_release | events.status → 'cancelled' |
| 3 | tr_all_reservations_approved_promote_event | last resource_approvals completes |
| 4 | tr_reservation_approved_decrement_stock | resource_reservations.status → 'approved' |
| 5 | tr_reservation_cancelled_increment_stock | resource_reservations.status → 'cancelled' |
| 6 | tr_emergency_event_override | events.is_emergency=true |
| 7 | tr_event_closeout_generate_naac_pack | event_closeout_reports INSERT |
| 8 | tr_iqac_validate_flip_status | event_iqac_validations INSERT WHERE status='validated' |
| 9 | tr_caretaker_escalate_silent_approvals | cron (hourly) |

### Compounding map (8 modules)

resource-management • leave (`requires_od`) • institution_leaves (holiday conflict) • academic_calendar (exam conflict) • OKR (`okr_kr_id` FK) • IQAC dashboards (Phase 1B) • billing (vendor_invoice_id for paid speakers) • notifications • Learners Council UI re-point.

---

## Phasing

### Phase 1A — Foundation + Resource Integration

4 named migrations, services, hooks, read-only UI, seed (12 categories + 5 retro-load events + Creative Asset sub-category).

### Phase 1B — IQAC Validation + NAAC Evidence + LC Migration

3 named migrations, IQAC validation queue UI (per-college), NAAC evidence PDF viewer, LC UI cutover.

### Phase 2 (later)

Designer creative-asset workflow + multi-platform social-media scheduler. Deferred per Q19.

---

## Day-1 retro-load (5 events)

Curated from `/Users/omm/Vaults/JKKNKB/MyJKKN/modules/events/research/jkkn-events-team-messages-2024-2026.json` (1,810 messages, 245 threads, 159 senders, 576 attachments):

1. Festival/cultural — highest-attachment cultural fest
2. Sports (non-marathon) — inter-institution sports meet (chat 2026-02-14)
3. Alumni — Alumni Insights CSE (chat 2024-10-24)
4. Guest Lecture — highest-attendance guest lecture
5. Graduation — 2026 convocation

Each `status='completed'`, retro-tagged NAAC criteria, stub feedback + photos.

---

## Open questions for v2

| Question | Reason |
|---|---|
| Designer brief workflow with template library | Q17 puts assets as resources; full Designer UX deferred |
| Multi-platform social scheduler | Q19 — defer |
| Event certificate templates + auto-generation | Compound with Q17 |

---

## Learnings Applied

#1 live context · #2 intake-first (12 categories) · #3 chat-as-input (1,724 msgs) · #4 role-routed approvals · #5 three-page UI · **#6 assumption-thrash (this doc, 26 decisions across 5 rounds)** · **#7 compounding (8 modules — deeper than v1's surface map)** · #8 confidentiality RLS (4-tier + sensitive) · #9 vocabulary · #10 retro-load (5 events) · M1 production-truth (Layer 2 caught both event-schema duplication AND resource-mgmt under-integration).

---

## Recovery instructions when re-importing to MyJKKN repo

This file lives at `/Users/omm/Vaults/JKKNKB/MyJKKN/modules/events/specs/spec-v2-resource-first.md` because the MyJKKN repo's auto-save hooks wiped earlier copies twice on 2026-04-15 + 2026-04-16.

To re-import:

1. Get to a stable branch on MyJKKN that auto-save isn't actively committing on (or temporarily disable the auto-save hook in `.claude/hooks/`)
2. Copy this file: `cp /Users/omm/Vaults/JKKNKB/MyJKKN/modules/events/specs/spec-v2-resource-first.md /Users/omm/PROJECTS/MyJKKN/specs/myjkkn-events-module-spec-v2-resource-first.md`
3. `git add specs/myjkkn-events-module-spec-v2-resource-first.md && git commit -m "spec(events): v2 resource-first" && git push ommdev feat/events-module`
4. Wait 30 seconds. Verify file still on branch via `git ls-files specs/`. If wiped again, the hook is the problem — fix that before retry.

---

**Version history:**
- v1 (2026-04-15) — initial spec, lost to auto-save wipe.
- v2 (2026-04-16 evening) — resource-first redesign, lost twice from MyJKKN repo, **safely persisted in vault**.
