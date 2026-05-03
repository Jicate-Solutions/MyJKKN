# Counselor "untouched leads" anomaly — 2026-05-03 triage

## Probe finding

Read-only probe on `admission_leads` (30-day window):

| source | total | last_activity_at IS NULL | first_touch_at IS NULL |
|---|---|---|---|
| education_fair | 14,412 | 14,412 (100%) | 14,412 (100%) |
| inbound_call | 685 | 684 (99.85%) | 684 (99.85%) |
| referral | 205 | 205 (100%) | 103 (50%) |
| walk_in | 133 | 130 (97.7%) | 86 (64.7%) |
| website | 72 | 54 (75%) | 39 (54%) |
| other | 2 | 2 (100%) | 2 (100%) |

The 100% rate on the largest source (education_fair) is structurally suspicious.

## Verdict: A — Writer artifact

### Smoking gun

```text
711 leads have real activity records in 30d (calls/whatsapp/activities)
689 of those (97%) still have last_activity_at = NULL
595 of those (84%) still have first_touch_at = NULL
```

A real productivity collapse cannot produce a 97% "no activity timestamp"
rate when the activity log tables themselves are receiving 2,408 writes
across the same period.

### Phase 1 — Writer enumeration

| code path | log table written | activity row inserted | last_activity_at updated | first_touch_at updated |
|---|---|---|---|---|
| `lib/services/admission/activity-service.ts` (counselor adds activity) | `admission_lead_activities` | yes | yes (line 144) | yes (via trigger) |
| `lib/services/admission/counselor-daily-view-service.ts` (stage move to "contacted") | n/a (direct UPDATE) | no | no | no |
| `lib/services/telephony/telephony-service.ts` (call-pipeline) | `admission_call_logs` | NO | NO | NO |
| `lib/services/admission/whatsapp-campaign-service.ts` (WhatsApp campaign send) | `admission_whatsapp_logs` | NO | NO | NO |
| `lib/services/admission/parent-communication-service.ts` (parent comm) | `admission_whatsapp_logs` | NO | NO | NO |
| `lib/services/admission/insight-actions-service.ts` (insight actions) | n/a | no | no (only `last_contact_at`) | no |

### Why first_touch_at populated for some sources

DB trigger `trg_lead_first_touch_fn` exists on `admission_lead_activities`
INSERT only. So leads whose first interaction happened to flow through
activity-service get `first_touch_at` set. Sources that flow through
call/WhatsApp pipelines (which do NOT insert activity rows) never get
the trigger to fire — hence the structural 100% NULL rate.

### Why this matters (locked outcome metric)

`first_touch_at` is read by:
- `fn_dashboard_streak` — counselor SLA streak
- `fn_compute_ohs_for_institution` — institution health score
- `fn_dashboard_metrics` — dashboard SLA pane
- `fn_dashboard_morning_brief` — Director morning cold-leads count

All of these compute "compliance" as
`first_touch_at IS NOT NULL AND first_touch_at <= created_at + threshold`.
With `first_touch_at` structurally NULL on 84% of touched leads, these
metrics are DEFLATED — counselors look worse than they are, and the
locked counselor outcome metric (<36% threshold with snap-back) is being
fed garbage.

## Fix — additive triggers on log tables + one-time backfill

Migration: `supabase/migrations/20260503180100_admission_leads_activity_writer_audit.sql`

1. New PL/pgSQL function `fn_admission_leads_touch_from_log()` updates
   `admission_leads.first_touch_at` (only when NULL — never overwrites)
   and `admission_leads.last_activity_at` (uses GREATEST so we never
   regress).
2. AFTER INSERT triggers on `admission_call_logs` and
   `admission_whatsapp_logs` (gated by `NEW.lead_id IS NOT NULL`).
3. One-time backfill via UNION ALL over the three activity tables,
   COALESCE/GREATEST-guarded.

### Anti-features (intentionally NOT shipped)

- Synthetic timestamps for education_fair leads with zero activity
  records. If a lead truly has no calls/whatsapp/activities, it should
  remain NULL — the metric should reflect reality.
- Counselor escalation cron (Verdict B path). Not warranted yet —
  re-measure the metric 7 days post-merge before deciding.
- `last_activity_at: NOW()` on insert. Insert is "lead capture" not
  "counselor activity"; conflating these would re-pollute the metric.

## 30-day acceptance threshold

Re-run the probe table 30 days post-merge. Acceptance = at least one
source bucket dropping its `last_activity_at IS NULL` rate to ≤ 60%
(simply because triggers fire on every new call/WhatsApp).

If education_fair still shows 100% NULL, that bucket is genuinely
untouched and Verdict B (counselor escalation cron) becomes warranted
as a follow-up wave.
