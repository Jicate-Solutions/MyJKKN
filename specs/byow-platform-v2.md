# BYOW Platform v2 — Locked Spec Bundle (3 sub-specs)

**Author:** Claude (orchestrating /myjkkn-chain → /interview → /sdd)
**Date locked:** 2026-05-03
**Predecessor:** `specs/byow-whatsapp-revival.md` (v4, "Spec 0" — admission-only revival, shipped via PR #675 + commit 5a8721f26)
**Status:** Decisions locked across 5 interview rounds + Q0 lock. Ready to chain to /myjkkn-api per sub-spec.
**Owner account:** aiengineering@jkkn.ac.in

---

## §0 Why this bundle exists

Spec 0 (BYOW revival) restored the existing admission-only feature. Director's strategic feedback during /interview: BYOW shouldn't be cage-bound to admission — it's a platform capability. The right channel-strategy framing is:

**Three recipient classes** (added 2026-05-03 from Director feedback):

| Class | Definition | Channel |
|---|---|---|
| **`cold`** | We initiated, no prior contact, no CRM record OR cold-lead status | WABA only — protect against ban |
| **`warmed_by_action`** | THEY initiated via inbound call (Exotel), inbound WhatsApp, form submission, etc. — within last 24h | BYOW eligible — they've consented by reaching out |
| **`established`** | In CRM as parent/learner/staff/alumni — ongoing relationship | BYOW preferred, WABA fallback |

**Audience matrix:**

| Audience | Channel |
|---|---|
| **Cold admission leads** (no inbound, just sourced) | WABA only |
| **Hot leads (post-reply)** | `warmed_by_action` → BYOW for 24h after their last contact |
| **Active learners + parents** | `established` → BYOW preferred |
| **Staff (HR comms)** | `established` → BYOW only |
| **Alumni** | `established` → BYOW preferred |
| **Hostel parents (warden→parent)** | `established` → BYOW (warden's dept WhatsApp) |
| **Inbound-caller follow-ups (Exotel)** | `warmed_by_action` → BYOW auto-trigger after call ends |
| **Inbound-WhatsApp auto-replies** | `warmed_by_action` → BYOW auto-reply via auto-trigger |
| **Bulk announcements (>50 recipients)** | WABA — hard-blocked for BYOW regardless of class |

The "BYOW" account model is also reframed: NOT staff personal phones, but **staff personal devices with institution-issued dept SIMs** (cheaper procurement, accounts survive staff churn, ban-risk lands on dept account not personal account).

---

## §1 Umbrella outcome metric (locked)

```yaml
umbrella_outcome_metric:
  metric_name: byow_platform_v2_composite
  baseline_value:
    measured_at: 2026-05-03
    components:
      modules_using_byow: 1                        # admission only (post Spec 0)
      msgs_per_week: 0                             # zero adoption today
      silent_revoke_incidents_undetected_over_6h: untracked
      ban_events_30d: 0
      inbound_capture_rate: untracked
  threshold_90d:
    verdict_date: 2026-08-03
    composite_pass_requires_all_4:
      - modules_actively_using_byow >= 4           # admission + campus-living + HR + alumni minimum
      - msgs_per_week_4wk_sustained >= 1500
      - silent_revoke_incidents_undetected_over_6h == 0
      - ban_events_30d == 0
  kill_criterion:
    trigger: "ANY of the 4 components fails at verdict_date"
    consequence: |
      Initiative architecturally failed (built too much surface area for our maturity).
      Specific responses by which component failed:
        - <4 modules → archive R3 module rollout, keep R1+R2+H1-H4 (platform infra still useful for admission alone)
        - <1500 msgs/wk → archive entire BYOW (low adoption proves WABA covers actual needs); roll back to WABA-only
        - silent_revoke detected too late → keep BYOW but add stricter ops; investigate H1-H4 reliability gaps
        - ban event → emergency lock-down BYOW to staff-internal recipients only; investigate root cause
```

Cross-domain register via `/lock-initiative` to `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md`.

---

## §2 Four sub-specs (sequential ship order)

| # | Spec | Sub-metric (verdicts independently) | Ships before |
|---|---|---|---|
| **Spec 1** | R1 — Decouple BYOW from admission cage | infra-only (`metric_name='infra'`) — all 6 admission routes work via redirect bridge or moved cleanly + new platform routes mounted | 2026-05-17 |
| **Spec 3** | H1-H4 — Reliability infra + Senior Learner UI + measurement | silent_revoke_undetected_over_6h == 0 by 2026-08-03 AND inbound_capture_rate ≥98% | 2026-06-15 |
| **Spec 2** | R2 + R4 — Channel router + ban-risk governance + R3 module rollout + warmed_by_action class + auto-triggers (Round 6) | ban_events_30d == 0 AND modules_actively_using_byow >= 4 | 2026-07-15 |
| **Spec 4** | Drip campaign engine (Round 7) — unlimited-step sequences triggered by Round 6 events | ≥3 active drip campaigns AND <0.5% unsubscribe rate AND ≥80% of drip-eligible inbound events trigger a campaign | 2026-08-03 |

**Why Spec 3 ships before Spec 2** (counter-intuitive): per Round 4 #4 lock, measurement infra must exist BEFORE module rollout so verdict numbers are real not estimated.

**Why Spec 4 ships LAST**: drip campaigns depend on the channel router (Spec 2) for routing decisions, and depend on warmed_by_action infrastructure (Spec 2 Round 6) for trigger events. Building drip before its substrate = wasted work.

---

## §3 Locked decisions matrix (24 total across all 3 specs)

### Q0 (umbrella) + Spec-shape
| # | Decision | Sub-spec |
|---|---|---|
| Q0 | Composite metric, all 4 components must pass at day-90 | Umbrella |
| QS | 3 sub-specs with composite umbrella | Umbrella |

### Round 1 — Architecture & boundary
| # | Decision | Sub-spec | Schema impact |
|---|---|---|---|
| 1.1 | Single shared Railway service + documented split trigger | Spec 1 | `wa_byow.tenancy_split_threshold_connections=5` policy row |
| 1.2 | Hybrid routing: hardcoded tier-1 + DB rules | Spec 2 | New `wa_channel_routing_rules` table + immutable code consts |
| 1.3 | Hard cutover (single PR move + delete old paths) | Spec 1 | Move 6 routes + 1 UI page + 5 services |
| 1.4 | Hybrid attribution: thread → phone → unattached | Spec 3 | New `wa_personal_conversation_threads` table + cascade resolver |

### Round 2 — Permissions, consent, lifecycle
| # | Decision | Sub-spec | Schema impact |
|---|---|---|---|
| 2.1 | HoD-only connect (institutional dept WhatsApp model) | Spec 1 | `wa_byow.connector_role_required='hod'` policy row + RLS |
| 2.2 | Implicit consent for known relationships | Spec 2 | `wa_byow.consent_mode='implicit_for_known'` policy row |
| 2.3 | SIM-portable: HoD-A returns SIM → admin → HoD-B receives → reconnects | Spec 1 | Procurement note in spec; existing trigger handles auto-disconnect on user deactivation |
| 2.4 | Connector + HoD on disconnect (in-app + email) | Spec 3 | `wa_byow.disconnect_notify_roles=["connector","hod"]` policy row |

### Round 2.5 — Reframe locks
| # | Decision | Sub-spec |
|---|---|---|
| R.A | Code stays `wa_byow.*`; UI labels show "Department WhatsApp" | All 3 |
| R.B | Phones = personal staff device; SIMs = institutional dept-issued (procurement: ~24 SIMs) | Spec 1 (operational dependency note) |

### Round 3 — Connection health surfacing
| # | Decision | Sub-spec | Schema impact |
|---|---|---|---|
| 3.1 | Both surfaces: dashboard card + header badge | Spec 3 | New components on Senior Learner home + global header |
| 3.2 | Per-connection auto-disable when stale | Spec 3 | `wa_byow.connection_stale_threshold_hours=24` + cron + `status='stale'` value |
| 3.3 | All 3 measurement methods (synthetic + drop + monthly audit) | Spec 3 | New audit-msg cron + drop-detector cron + scheduled monthly verdict agent |
| 3.4 | Bypass-detection via inbound:outbound ratio | Spec 3 | Weekly cron compares ratios, surfaces in Director digest |

### Round 4 — Outbound governance + rollout
| # | Decision | Sub-spec | Schema impact |
|---|---|---|---|
| 4.1 | Hybrid recipient classification: phone-presence default + per-record-type overrides | Spec 2 | `wa_channel_routing_rules` row format includes `record_type` filter |
| 4.2 | Hard-block bulk via BYOW (>50 recipients → WABA) | Spec 2 | `wa_byow.bulk_threshold=50` policy row + tier-1 immutable rule |
| 4.3 | Academic module first for R3 rollout | Spec 2 | New send entry-points in academic faculty/HoD UI |
| 4.4 | Build measurement infra in Spec 3 BEFORE R3 module rollout (Spec 2) | Bundle ordering | Spec 3 ships before Spec 2 |

### Round 5 — Security, retention, override, verdict-ops
| # | Decision | Sub-spec | Schema impact |
|---|---|---|---|
| 5.1 | Single shared HMAC secret + 90-day rotation policy | Spec 3 | `wa_byow.webhook_secret_rotation_days=90` + admin UI rotate button |
| 5.2 | Forever retention on `wa_personal_message_logs` (no cleanup) | Spec 3 | (no cleanup cron; doc decision) |
| 5.3 | Tier-1 super_admin override via `force_byow` flag with mandatory reason | Spec 2 | `wa_byow.tier1_override_log` table + RLS super_admin only |
| 5.4 | Synthetic+drop automated; monthly audit = scheduled background agent | Spec 3 | Monthly cron-spawned agent emails Director with audit form |

### Round 6 — Warmed-by-action + Exotel auto-trigger (added 2026-05-03 from Director use-case)
| # | Decision | Sub-spec | Schema impact |
|---|---|---|---|
| 6.1 | Per-action-type TTL: inbound_call=24h, inbound_whatsapp=72h, form=7d, email=72h | Spec 2 | `wa_byow.warmed_window_hours_by_action_type` JSON policy row |
| 6.2 | All 4 action types warm a recipient: Exotel call + inbound WhatsApp + form + email reply | Spec 2 | New `wa_personal_recipient_actions` table (action_type, recipient_phone, action_at, source_event_id) |
| 6.3 | Both call_answered AND call_missed fire auto-msg, with different templates | Spec 2 | Extend `wa_personal_auto_trigger_rules` table (rename of existing); add 2 default trigger rows |
| 6.4 | 1 msg per recipient per dedup window (default 60 min) | Spec 2 | `wa_byow.auto_trigger_dedup_window_minutes=60` policy row + dedup index on `wa_personal_message_logs(recipient_phone, sent_at)` |

### Round 7 — Drip campaigns (added 2026-05-03 from Director use-case)
| # | Decision | Sub-spec | Schema impact |
|---|---|---|---|
| 7.1 | Unlimited drip steps per campaign; per-campaign limit set by author | Spec 4 | No hard cap; `wa_byow.drip_max_steps_default=5` advisory only |
| 7.2 | Strict keyword-only opt-out: STOP, UNSUBSCRIBE, REMOVE, etc. (multilingual EN+TA+HI) | Spec 4 | New `wa_byow_drip_unsubscribes` table + keyword detector in webhook handler + `wa_byow.drip_stop_keywords` JSON policy row |
| 7.3 | Super_admin authors campaigns; HoD opts dept in/out | Spec 4 | New permission key `system.config.drip.author` (super_admin only) + `wa_byow.auto_trigger_enabled_per_dept` per-dept opt-in matrix |
| 7.4 | CRM-auto-resolved variables at send-time, graceful fallback if missing | Spec 4 | New `lib/whatsapp/drip-variable-resolver.ts` + `wa_byow.drip_variable_fallbacks` policy row (e.g., `{"first_name":"there"}`) |

---

## §4 All policy rows in `platform_policies` (final list)

| Key | Type | Default | Source |
|---|---|---|---|
| `wa_byow.is_enabled` | boolean | `true` | Spec 0 (live) |
| `wa_byow.health_failure_threshold` | number | `3` | Spec 0 (live) |
| `wa_byow.health_probe_timeout_seconds` | number | `10` | Spec 0 (live) |
| `wa_byow.alert_channels` | array | `["sentry"]` | Spec 0 (live) |
| `wa_byow.health_log_retention_days` | number | `0` | Spec 0 (live) |
| `wa_byow.tenancy_split_threshold_connections` | number | `5` | Spec 1 |
| `wa_byow.connector_role_required` | string | `"hod"` | Spec 1 |
| `wa_byow.tier1_immutable_rules` | array | `[{recipient_type:"lead_cold",force_channel:"waba"}]` | Spec 2 |
| `wa_byow.consent_mode` | string | `"implicit_for_known"` | Spec 2 |
| `wa_byow.bulk_threshold` | number | `50` | Spec 2 |
| `wa_byow.disconnect_notify_roles` | array | `["connector","hod"]` | Spec 3 |
| `wa_byow.connection_stale_threshold_hours` | number | `24` | Spec 3 |
| `wa_byow.connection_force_disconnect_after_hours` | number | `72` | Spec 3 |
| `wa_byow.inbound_attribution_cascade` | array | `["thread","phone","unattached"]` | Spec 3 |
| `wa_byow.webhook_secret_rotation_days` | number | `90` | Spec 3 |
| `wa_byow.warmed_window_hours_by_action_type` | jsonb | `{"inbound_call":24,"inbound_whatsapp":72,"form_submit":168,"email_reply":72}` | Spec 2 |
| `wa_byow.auto_trigger_dedup_window_minutes` | number | `60` | Spec 2 |
| `wa_byow.auto_trigger_templates` | jsonb | `{"call_answered":"...","call_missed":"...","inbound_whatsapp":"...","form_submit":"..."}` | Spec 2 |
| `wa_byow.auto_trigger_enabled_per_dept` | jsonb | `{}` (default opt-in for HoD per-dept) | Spec 2 |
| `wa_byow.drip_max_steps_default` | number | `5` (advisory; super_admin can override per-campaign) | Spec 4 |
| `wa_byow.drip_stop_keywords` | jsonb | `["STOP","UNSUBSCRIBE","REMOVE","DON'T MESSAGE","OPT OUT","நிறுத்து","रोको"]` | Spec 4 |
| `wa_byow.drip_variable_fallbacks` | jsonb | `{"first_name":"there","course":"our courses","dept":"the team"}` | Spec 4 |
| `wa_byow.drip_pause_on_first_reply` | boolean | `false` (Round 7 chose strict-keyword-only opt-out) | Spec 4 |

**23 keys total** (5 already live + 18 new from this bundle). All editable via future `/admin/whatsapp-byow` UI.

---

## §6.5 Spec 4 — Drip campaign engine (added Round 7)

### 6.5a Outcome metric
```yaml
outcome_metric:
  metric_name: byow_drip_engagement
  components:
    - active_drip_campaigns >= 3
    - drip_unsubscribe_rate < 0.005   # <0.5% — strong "people aren't reporting as spam"
    - eligible_inbound_event_to_drip_trigger_rate >= 0.80
  threshold_90d: pass all three by 2026-08-03
  kill_criterion:
    - >2% unsubscribe rate → drip messaging perceived as spam, archive engine
    - <1 active campaign at day-90 → super_admin not authoring → engine unused, archive
```

### 6.5b New tables
| Table | Purpose |
|---|---|
| `wa_byow_drip_campaigns` | Campaign definition: name, trigger_event, target_class, status, author_user_id |
| `wa_byow_drip_steps` | Sequence steps: step_order, delay_after_previous_minutes, message_template, branch_conditions |
| `wa_byow_drip_executions` | Per-recipient state: campaign_id, recipient_phone, current_step, started_at, paused_at, stopped_reason |
| `wa_byow_drip_unsubscribes` | Phone numbers that have opted out of ALL drips: phone, opted_out_at, opt_out_keyword_matched, opt_out_source_msg_id |

### 6.5c Phase plan (~12-15 hr)
1. **DB schema for 4 tables** + migrations (~2hr)
2. **Drip-advancer cron** every 5 min (~3hr) — reads pending executions, advances those whose delay window expired, sends next msg via channel-router
3. **STOP keyword detector** in webhook handler (~1.5hr) — parses inbound msgs, matches against `wa_byow.drip_stop_keywords`, marks executions stopped + writes unsubscribe row
4. **Variable resolver** `lib/whatsapp/drip-variable-resolver.ts` (~2hr) — recipient phone → CRM lookup → field substitution + fallback handling
5. **Admin UI `/admin/whatsapp-byow/drip-campaigns`** (~3hr) — list / create / edit / preview campaigns, sequence builder, per-step delay + template editor
6. **Per-dept opt-in matrix UI** (~1hr) — HoDs see which campaigns are active for their dept, can disable
7. **Trigger wiring** (~1.5hr) — when warming events fire (Round 6), check if any campaign matches the trigger_event + target_class, start a drip execution

---

---

## §5 New tables (all 3 specs combined)

| Table | Sub-spec | Purpose |
|---|---|---|
| `wa_channel_routing_rules` | Spec 2 | Per-recipient-type routing decisions (Pattern B per-module typed config) |
| `wa_personal_conversation_threads` | Spec 3 | Outbound→inbound thread tracking for attribution cascade |
| `wa_byow_connection_health` | Spec 3 | Per-connection rolling health metrics (last_inbound, last_outbound, inbound_count_24h, etc.) |
| `wa_byow_synthetic_audit_log` | Spec 3 | Synthetic test sends + their inbound-capture verifications |
| `wa_byow_monthly_audit_results` | Spec 3 | Director's monthly random-sample audit answers |
| `wa_byow_tier1_override_log` | Spec 2 | Every super_admin force_byow override + reason |
| `wa_personal_recipient_actions` | Spec 2 (Round 6) | Inbound calls/msgs/forms/email-replies that warm a recipient |
| `wa_byow_drip_campaigns` | Spec 4 | Drip campaign definitions |
| `wa_byow_drip_steps` | Spec 4 | Per-step sequence: order, delay, template, branch |
| `wa_byow_drip_executions` | Spec 4 | Per-recipient execution state |
| `wa_byow_drip_unsubscribes` | Spec 4 | Opt-out tracking with keyword + source msg evidence |

Plus: extension of existing `wa_personal_connections` with `status='stale'` value and possibly a `current_hod_user_id` denormalized column for fast lookup.

---

## §6 Spec 1 — R1: Decouple BYOW from admission cage

**Status:** ✅ SHIPPED 2026-05-03 via PR #682 → merge commit `098128ee6` → prod deploy verified (NEW path /api/whatsapp-personal/* → 401, OLD path /api/admission/whatsapp-personal/* → 404, Railway WEBHOOK_URL updated + service healthy).

### 6a Outcome metric
```yaml
outcome_metric:
  metric_name: infra
  rationale: "Pure infra refactor; no user-facing outcome metric. Enables Specs 2 + 3."
  smoke_test: |
    - All 6 existing admission routes still respond (via redirect or move)
    - New platform routes mounted at /api/whatsapp-personal/*
    - Existing UI at /admission/settings/whatsapp-numbers still works
    - Type-check + build green
    - Browser test: HoD can connect via UI without console errors
```

### 6b Phase plan (~6-8 hr)
1. **Move routes** (~2hr): `app/api/admission/whatsapp-personal/*` → `app/api/whatsapp-personal/*`. 10 route files.
2. **Move services** (~1hr): Already module-neutral. Update imports only. Type-fix any admission-specific assumptions.
3. **Generalize connection table** (~1hr): Migration adds `scope_type` column (default `'department'`), keeps `department_id` (rename later if needed). Backfills existing 4 rows.
4. **Move UI** (~1.5hr): Create `/admin/whatsapp/connections` route. Old `/admission/settings/whatsapp-numbers/personal-connection-tab.tsx` becomes a thin link or stays for admission's specific wrapper.
5. **Update all 6 callers + UI** (~1hr): Search-and-replace import paths. Per memory rule: hard cutover in single PR.
6. **Insert 2 new policy rows** (~15min): `tenancy_split_threshold_connections`, `connector_role_required`. Via Supabase MCP.
7. **HoD-only RLS update** (~30min): Add policy `wa_personal_connections_insert_hod_only` enforcing `connected_by must be HoD of department_id`.
8. **Procurement-dependency doc** (~15min): Operational note in spec naming "24 dept SIMs needed by 2026-06-15."

### 6c Operational dependency (NOT software)
- Admin/HR procures **~24 dept-issued SIMs** (3 per institution × 8 institutions) by 2026-06-15
- Each HoD installs WhatsApp Business app on personal phone, registers with dept SIM
- HR contract addendum: SIM return policy on staff exit
- IT support documented for "install WhatsApp Business + scan QR" runbook

---

## §7 Spec 2 — R2 + R4: Channel router + ban-risk governance + R3 academic rollout

### 7a Outcome metric
```yaml
outcome_metric:
  metric_name: byow_governance_pass
  components:
    - ban_events_in_90d == 0
    - modules_actively_using_byow >= 4
    - tier1_violation_rate == 0   # zero cold-lead msgs sent via BYOW
  threshold_90d: pass all three by 2026-08-03
  kill_criterion:
    - any single ban event → emergency lock BYOW to staff-only recipients
    - <4 modules → archive R3 (router infra still useful for admission)
    - any tier1 violation → audit override log, identify policy gap
```

### 7b Phase plan (~12-16 hr)
1. **New table `wa_channel_routing_rules`** (~1hr): Pattern B per-module typed. Seed with default rules.
2. **New `lib/whatsapp/channel-router.ts`** (~3hr): `pickChannel(recipient, sender) → {transport, reason}`. Reads tier-1 immutable consts + DB rules + classifies recipient.
3. **Recipient classification logic** (~2hr): Phone-lookup against learners/parents/staff/alumni/leads tables. Returns `record_type` + `relationship`.
4. **Tier-1 immutable consts in code** (~30min): Hardcoded tier-1 rules in router; DB rules NEVER override these.
5. **Bulk threshold enforcement** (~1hr): Channel router refuses BYOW if `recipient_count > wa_byow.bulk_threshold`.
6. **Tier-1 override pattern** (~2hr): `force_byow` flag + reason field on send API + `wa_byow_tier1_override_log` table + Sentry capture on every override.
7. **Refactor every existing send call site** (~2hr): All BYOW + WABA sends now go through `channel-router → pickChannel → send`. Touches admission-leads, admission-followups, hostel-comms, bug-reports, exovoice-callbacks.
8. **R3 academic module rollout** (~3hr): Add "Send via WhatsApp" affordance on faculty/HoD UI for academic recipients. Routes through channel-router.

### 7c Module rollout sequence (after academic pilot)
- Week 1 post-Spec 2: Academic (faculty/HoD → learner+parent)
- Week 2: Campus-living (warden → parent)
- Week 3: HR (HR officer → staff)
- Week 4: Alumni (alumni officer → alumni)

Each module ships as a separate small PR. Reuse `channel-router → pickChannel → send` pattern. Total ~3-4hr per module.

---

## §8 Spec 3 — H1-H4: Reliability infra + Senior Learner UI + measurement

### 8a Outcome metric
```yaml
outcome_metric:
  metric_name: byow_reliability_pass
  components:
    - silent_revoke_undetected_over_6h_count == 0
    - inbound_capture_rate >= 0.98
    - senior_learner_sees_stale_connection_within_1h == true
  threshold_90d: pass all three by 2026-08-03
  kill_criterion: |
    - any silent-revoke >24h undetected → BYOW unsuitable as system of record
    - <90% inbound capture → downgrade BYOW to outbound-only
    - Senior Learner doesn't see stale within 1h → UI surfacing failed; iterate
```

### 8b Phase plan (~14-18 hr) — SHIPS BEFORE Spec 2 per measurement-first ordering
1. **H1.1 Webhook receiver** (~1hr): Verify existing `/api/admission/whatsapp-personal/webhook` works end-to-end. Update path to `/api/whatsapp-personal/webhook` per Spec 1 cutover.
2. **H1.2 New table `wa_byow_connection_health`** (~1hr): Per-connection rolling metrics.
3. **H1.3 Connection-pulse cron `whatsapp-byow-connection-pulse`** (~2hr): Every 5 min pings each ready connection's `/status`, updates health table, detects stuck patterns.
4. **H1.4 Sentry stale-pattern alert** (~30min): Alert when no inbound 6h on previously-active connection.
5. **H2.1 Header badge** (~2hr): Global header WhatsApp icon component, click-drawer with connection list.
6. **H2.2 Senior Learner dashboard card** (~2hr): "Department WhatsApp Health" widget on home page.
7. **H2.3 Lead-card inline indicator** (~1.5hr): "Connection: {phone} · live for 4h" or "⚠️ Connection lost".
8. **H2.4 Auto-toast on action attempt** (~1hr): Toast with reconnect link when send blocked.
9. **H3.1 Recovery inbound count tracking** (~1hr): Capture flood-msgs after reconnect.
10. **H3.2 Bypass detector cron** (~1.5hr): Weekly inbound:outbound ratio compare per dept.
11. **H3.3 Reconnect deadline countdown** (~1hr): "Messages will be lost in N days" UI.
12. **H4.1-H4.4 Senior Learner integration** (~2hr): Permission key, dashboard wiring, notification rules.
13. **5.1 Webhook secret rotation UI** (~2hr): Super_admin clicks rotate, updates Railway + Vercel env, Sentry captures.
14. **5.4 Monthly audit scheduled agent** (~1hr): Use `/schedule` skill, monthly cron, sample 10 recipients/dept, email Director with form.
15. **3.3 Synthetic audit cron** (~2hr): Hourly send from audit number, expect log row within 5min.

### 8c Senior Learner UI specifics (your specific ask)
- Route: `/senior-learner/dashboard` (or wherever the existing landing is)
- Component: `<DepartmentWhatsAppHealthCard scope={user.scope} />`
- Shows each in-scope dept as row: status pill, last_inbound timestamp, last_outbound timestamp, "Reconnect" CTA if down
- Permission key: `whatsapp.connection.view_dept` (Senior Learner gets by default)
- Auto-refresh every 60s (React Query staleTime)
- Notification rule: Senior Learner gets email if dept connection in their scope drops, fires within 1h

---

## §9 What I won't do without explicit go-ahead

Per CLAUDE.md confirmation discipline:
- Spec 1: any DDL on `wa_personal_connections` (RLS changes are auth-adjacent)
- Spec 2: applying `wa_channel_routing_rules` table + tier-1 override log + the refactor of all send call sites
- Spec 3: enabling the synthetic audit cron (sends real WhatsApp messages from audit number — counts toward institutional WhatsApp quota)
- Any module rollout (R3) requires module-owner sign-off
- Procurement of dept SIMs

---

## §10 Cross-domain registration

Run `/lock-initiative` after this spec to register umbrella in `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md`:
- Initiative: BYOW Platform v2 (composite)
- Verdict date: 2026-08-03
- Kill criterion: ANY of 4 components missing at verdict

---

## §11 Skill chain handoff per /sdd

Per /sdd orchestration:
1. **/spec** → THIS document (done)
2. **/writing-plans** → break each sub-spec into atomic 2-4 hr tasks per file/feature
3. **/myjkkn-api** → ship Spec 1 first (R1 decouple) as the unblocker
4. **/ship-myjkkn** → PR per spec
5. **/deploy-myjkkn** → verify per ship
6. **/schedule** → register the 2026-08-03 verdict agent

---

→ **Next: `/writing-plans Spec 1`** to produce the atomic task breakdown for the R1 decouple work, then chain into /myjkkn-api for the actual build.
