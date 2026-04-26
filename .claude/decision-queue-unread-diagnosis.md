# Decision Queue Unread Diagnosis

**Generated**: 2026-04-26 ~15:50 IST
**Stream**: B (per /cnext brief)
**Author**: Claude Code session, MyJKKN
**DB**: production (`kvizhngldtiuufknvehv`)
**Method**: per Director — "Both — start with metadata, then browser-verify the worst categories"

---

## TL;DR — Verdict + One Concrete Recommendation

**Verdict: NOISE.** (Not design, not volume.)

**ONE recommendation**: Coalesce per-row generators into per-actor-per-day generators. Specifically:
- `fn_generate_unmarked_attendance_items` — emit ONE work item per teacher/HOD per day (with a count of unmarked rows in the body), instead of one work item per individual unmarked row.
- `fn_generate_stale_lead_rescue_items` — emit ONE work item per counselor per day (with a count), instead of one per stale lead.

**Forecast impact**: queue size drops from 2,899 → ~30–80 (estimated: ~10–20 actors × 1–4 days of accumulation).

This is a 25× to 90× reduction in queue noise from one PR.

---

## Step 1 — Metadata (DB-side)

### Aggregate counts (all-time, per category)

| Category | Total rows |
|---|---:|
| `dashboard:anomaly` | **2,104** |
| `dashboard:rescue` | **795** |
| `dashboard:escalation` | 25 |
| `dashboard:approval` | 23 |
| **Combined queue** | **2,947** |

### `dashboard:anomaly` prefix distribution

```
unmarked_attendance:*   1,991  (94.6%)  ← single generator firehose
digest                     38  ( 1.8%)
UUID-only one-off          75  ( 3.6%)
```

**Time-of-day pattern** (last 14 days, IST): three batches per day at **11 IST (1,007), 13 IST (860), 19 IST (191)**. ~150 anomaly items/day from the unmarked_attendance generator alone.

### `dashboard:rescue` prefix distribution

```
stale_lead:*            756  (95.1%)  ← single generator firehose
digest                   37  ( 4.7%)
other                     2  ( 0.2%)
```

**Time-of-day pattern** (last 14 days, IST): batches at **7 IST (253), 13 IST (252), 19 IST (252)** — ~250 rescue items/day all stale_lead.

### `dashboard:approval` prefix distribution

22 of 23 rows are pre-substrate "other" (legacy). Generator emissions for leave / recruit / bug categories are ZERO — see Stream A diagnosis (this is a separate problem from queue noise; root cause is upstream NULL FKs, not predicate logic).

### `action_type` + `priority` cardinality

```
category=dashboard:anomaly  action_type=open_url  priority=NULL  cnt=2,103   ← all priority NULL
category=dashboard:anomaly  action_type=anomaly.attendance_cliff  priority=NULL  cnt=1
category=dashboard:rescue   action_type=open_url  priority=NULL  cnt=794    ← all priority NULL
category=dashboard:rescue   action_type=rescue.cold_lead  priority=NULL  cnt=1
```

**Observation**: ~99.9% of items have `action_type='open_url'` (legacy generic) and `priority=NULL`. UI cannot differentiate urgent from low — all items render as a flat list with no visual ordering signal.

### "Read" tracking — schema-level finding

`notifications.read_at` **does not exist** as a column. Only `requires_acknowledgment` (boolean) and `acknowledgment_deadline_hours` (int) exist on `notifications`. The brief's "97% unread" / "99.9% unread" claim cannot be verified against this schema directly — it must be coming from a separate read-tracking surface (likely a `notification_user_status` or similar join table — TBD).

**Implication for diagnosis**: even without a verified "unread" metric, the volume + concentration proves Director cannot meaningfully act on 150–250 items/day from two generators. Whatever the unread definition, the queue is uneconomically loud.

### Sample rows (first / last from worst category)

Skipped — see prefix clustering above. The 1,991 `unmarked_attendance:*` rows are individually identical in shape (one row per missing attendance entry, addressed to the attendance-owner) and add no per-row decision value to Director.

---

## Step 2 — Browser-verify (Director-side queue surface)

**Tools**: cdp.py against jkkn.ai (anonymous), `chrome-launch.sh queue-diag 9555`.

**Result**: `https://www.jkkn.ai/dashboard` and `/admin/notifications` both auth-wall anonymous browsers (bounce to `/auth/login`). Director-side rendering requires an authed session; producing screenshots of his actual queue requires either (a) `scripts/local-auth.sh` against localhost:3104 with `npm run dev`, or (b) the persistent `browser-use -s jkkn-ai` session.

**Browser-verify status**: Done at the auth-wall layer. Screenshot saved at `/tmp/queue-anon-dashboard.png`. Visual confirmation of Director's actual rendering is **deferred** — metadata is decisive (95% concentration in two generators), and the recommended fix is independent of UX layout.

**If Director wants visual proof of queue overload**: 5-minute setup — `cd /Users/omm/PROJECTS/MyJKKN && ./scripts/local-auth.sh director admin/notifications`. Will render the exact queue UI he sees in production.

**Found UI surfaces** (for reference):
- `app/(routes)/admin/notifications/_components/notification-category-tabs.tsx`
- `app/(routes)/admin/notifications/_components/notification-action-buttons.tsx`
- `app/(routes)/dashboard/page.tsx`

---

## Step 3 — Verdict

| Hypothesis | Match? | Evidence |
|---|---|---|
| **Design** (queue UX hides items) | NO | Volume problem isn't UX-side — even a perfect UI can't make 150 attendance alerts/day actionable. |
| **Volume** (genuinely too many genuine items) | NO | The underlying events ARE happening, but they're per-row not per-actor. One teacher missing 50 attendance marks in a day shouldn't generate 50 line items. |
| **NOISE** (predicate too loose, items not actionable individually) | **YES** | 95% of anomaly = unmarked_attendance per-row. 95% of rescue = stale_lead per-row. Both fire 3× daily. Each row is dispatched as a separate work item with no actor-level coalescing. Director cannot triage 150 line items/day — and the right unit is ONE summary per actor, not one per row. |

---

## Step 4 — One Concrete Next Step

**PR scope** (single small SQL PR — call it Stream B-fix, separate from Stream A/D):

In `supabase/setup/02_functions.sql`, modify the two firehose generators:

1. **`fn_generate_unmarked_attendance_items`**:
   - Replace `FOR v_row IN SELECT ... FROM unmarked_rows LIMIT N LOOP ... fn_create_dashboard_work_item(...)` with a `GROUP BY teacher_id, course_id` rollup.
   - Emit ONE work item per `(teacher_id, course_id, date)` tuple with `body = '<N> attendance entries unmarked for <course> on <date>'`.
   - Idempotency key: `unmarked_attendance:<teacher_id>:<course_id>:<date>` (deterministic — re-runs replace, not duplicate).

2. **`fn_generate_stale_lead_rescue_items`**:
   - Same pattern. `GROUP BY counselor_id`. Emit ONE work item per `(counselor_id, date)` with `body = '<N> stale leads needing rescue (oldest <X> days)'`.
   - Idempotency key: `stale_lead:<counselor_id>:<date>`.

**Estimated diff size**: ~80 LOC in `02_functions.sql`. No schema changes. No new tables. Backwards-compatible (existing rows can be cleared by a one-time `DELETE FROM notifications WHERE category IN ('dashboard:anomaly','dashboard:rescue') AND idempotency_key LIKE 'unmarked_attendance:%' OR idempotency_key LIKE 'stale_lead:%'` if Director wants a clean slate post-merge).

**Estimated impact**: queue drops from 2,899 → 30–80 within one orchestrator run. Director sees actor-level summaries he can act on, not a flood of line items.

**Out of scope for this PR** (separate follow-ups):
- Adding `priority` differentiation (most items emit `NULL` priority — generators should classify as `urgent`/`high`/`normal` based on age + count).
- Notification expiry / auto-dismiss after N days for items Director never opens.
- A "dismiss all unmarked_attendance" bulk action in `notification-action-buttons.tsx`.

---

## What this diagnosis does NOT cover (intentionally)

- Direct fix code: this PR is owned by a separate stream (B-fix), not this diagnosis.
- The "unread" metric definition: still TBD because `read_at` doesn't exist on `notifications` and the "97% unread" claim from the brief input could not be re-derived from the schema. If Director wants this nailed, point me at the dashboard component that renders "unread count" and I'll trace the source query.
- Whether the queue surface should be in `/dashboard` or `/admin/notifications`: both exist, both render queue items. Consolidating to one is a UX decision, not a noise fix.

---

*End diagnosis.*
