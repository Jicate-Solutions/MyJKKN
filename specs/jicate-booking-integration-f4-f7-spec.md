# jicate-booking ↔ MyJKKN Integration Spec — Features F4-F7

**Status:** DRAFT — awaiting Director sign-off before code
**Initiative:** `jicate-booking-multi-tenant-90d` (verdict 2026-07-30)
**License posture:** Path D (deferred) — research deploy, no production sovereignty yet
**Author:** Claude session 4725eba9 — 2026-05-02
**Companion files:**
- `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md` (the lock entry)
- `~/.claude/skills/jicate-booking-deploy/state/research-deploy.json` (deploy state)
- `/Users/omm/PROJECTS/jicate-booking/.claude/JICATE-CLAUDE.md` (jicate-booking rules)

---

## 1. What this spec satisfies

The Locked-Initiatives entry defines metric **(a) sovereignty achieved** as a 4-clause AND:

| Clause | Description | Phase 3 status |
|--------|-------------|----------------|
| A1 | "deployed at JICATE-controlled domain" | **DEFERRED** (license-posture binary) |
| A2 | "MyJKKN tenant provisioned" in jicate-booking | **DONE outside this spec** (`provision-tenant.sh` exists) |
| A3 | "≥1 real (non-test) booking made through jicate-booking for a MyJKKN host" | **GATED on A1** + UI surface |
| A4 | "JOINable record visible from MyJKKN's Supabase via cross-DB bridge" | **THIS SPEC** |

This spec scopes the **substrate that makes A4 possible** plus the host/user-facing surfaces in MyJKKN. A1 + A3 are gated on the license decision and not covered here.

### F4-F7 — operationalized

| ID | Name | Acceptance |
|----|------|------------|
| **F4** | Cal.com webhook receiver | `POST /api/webhooks/jicate-booking` accepts Cal.com webhook payloads, HMAC-verifies via `X-Cal-Signature-256`, persists to `jicate_booking_mirror` idempotently. Returns 200 within 5s p99. |
| **F5** | Booking mirror table + JOIN | `jicate_booking_mirror` row exists per Cal.com Booking with `host_user_id` resolved to `profiles(id)` by email match. SQL `JOIN profiles ON jicate_booking_mirror.host_user_id = profiles.id` returns 1 row per booking. |
| **F6** | Meeting types catalog | `jicate_booking_meeting_types` row per Cal.com `EventType` that MyJKKN hosts use. Includes `internal_kind` ('advisor_session', 'parent_meeting', 'office_hours'…) for downstream routing/reporting. |
| **F7** | `/meetings` inbox | Authenticated MyJKKN user sees their bookings as host (counselor / faculty / staff) at `app/(routes)/meetings/inbox`. List + detail views, status badges, no edit (Cal.com remains source of truth). |

### Non-goals (explicit)

- **Booking creation from MyJKKN** — bookings are created in jicate-booking; MyJKKN is read-only mirror
- **Edit/cancel from MyJKKN** — actions deep-link out to jicate-booking UI
- **Calendar conflict detection** — deferred until conflict-substrate decision
- **Event-type CRUD UI** — `meeting_types` rows seeded by migration, not user-managed in this phase
- **Custom-domain provisioning** — license-gated
- **Real-time presence / occupancy** — deferred

---

## 2. Architecture

### Choice: webhook + mirror (rejected: FDW, scheduled sync)

The Locked-Initiatives entry lists three options for the cross-DB bridge: `webhook+mirror`, `Postgres FDW`, or `scheduled sync`. **Webhook+mirror wins** for these reasons:

| Criterion | webhook+mirror | Postgres FDW | scheduled sync |
|-----------|---------------|--------------|----------------|
| Real-time | ✅ <5s typical | ✅ live | ❌ minutes-hours lag |
| Setup complexity | Low — Cal.com has native webhooks; MyJKKN has 7 webhook routes already | High — FDW between two Supabase projects requires elevated DB perms + direct network reach | Low — but doubles the work since you still want webhooks for real-time |
| Failure mode | Lossy unless we add idempotency + replay (we will) | Hard-binds MyJKKN's queries to jicate-booking's schema; jicate-booking schema migrations break MyJKKN | Stale data; thundering-herd on cron tick |
| Pattern reuse | Mirrors `app/api/integrations/intent-platform/prospects/route.ts` exactly | No precedent in MyJKKN | Drift-prone (memory: `feedback_specs_decay_verify_reality`) |
| **Verdict** | **CHOSEN** | rejected — coupling risk | rejected — redundant with webhooks |

### Data flow

```
┌──────────────┐  Cal.com webhook  ┌──────────────────────────────────┐
│              │ ──── POST ──────▶ │ /api/webhooks/jicate-booking     │
│ jicate-      │  X-Cal-Sig-256    │  - HMAC-verify (timingSafeEqual)  │
│ booking      │                   │  - Zod parse                      │
│ (Cal.com)    │ ◀── 200/4xx ────  │  - idempotent UPSERT by uid       │
│              │                   │  - host_user_id ← profiles(email) │
└──────────────┘                   └──────────────┬───────────────────┘
                                                  ▼
                                   ┌──────────────────────────────────┐
                                   │ jicate_booking_mirror            │
                                   │ jicate_booking_meeting_types     │
                                   └──────────────┬───────────────────┘
                                                  ▼
                                   ┌──────────────────────────────────┐
                                   │ /meetings/inbox                   │
                                   │ /meetings/[uid] (detail)          │
                                   └──────────────────────────────────┘
```

### Idempotency + replay

- Primary uniqueness key: `cal_booking_uid` (Cal.com's `Booking.uid`, stable across reschedules of same booking? **OPEN — see §6**)
- UPSERT on receipt; webhook delivery may retry. Handler must be idempotent.
- Raw payload preserved in `raw_payload jsonb` for replay/debugging
- Webhook event types tracked in `webhook_event` text (BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED, MEETING_ENDED, etc.)

### Auth model

- **Inbound (Cal.com → MyJKKN):** HMAC-SHA256 signature in `X-Cal-Signature-256`, secret `CAL_BOOKING_WEBHOOK_SECRET` env var. Verified with `crypto.timingSafeEqual`. Mirrors intent-platform pattern verbatim.
- **Outbound (MyJKKN → jicate-booking):** none in this phase — MyJKKN reads only from its own mirror, never queries jicate-booking-prod directly.

---

## 3. Schema

Migration files (apply in order):

### 3.1 `2026MMDD000001_create_jicate_booking_meeting_types.sql`

```sql
CREATE TABLE public.jicate_booking_meeting_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cal_event_type_id integer NOT NULL UNIQUE,        -- Cal.com EventType.id
  cal_event_type_slug text NOT NULL,                 -- e.g., 'engg-counseling'
  internal_kind text NOT NULL,                       -- 'advisor_session' | 'parent_meeting' | 'office_hours' | 'admission_call' | 'other'
  meeting_for text NOT NULL,                         -- 'counselor' | 'faculty' | 'staff' | 'admin'
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_kind_check CHECK (internal_kind IN ('advisor_session','parent_meeting','office_hours','admission_call','other')),
  CONSTRAINT meeting_for_check CHECK (meeting_for IN ('counselor','faculty','staff','admin'))
);

COMMENT ON TABLE public.jicate_booking_meeting_types IS
  'MyJKKN-side categorization of Cal.com EventTypes hosted on jicate-booking. Seeded by migration; not user-managed in F4-F7.';

CREATE INDEX idx_jbmt_internal_kind ON public.jicate_booking_meeting_types(internal_kind) WHERE is_active = true;
```

### 3.2 `2026MMDD000002_create_jicate_booking_mirror.sql`

```sql
CREATE TABLE public.jicate_booking_mirror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cal.com identity
  cal_booking_uid text NOT NULL UNIQUE,              -- Cal.com Booking.uid; survives reschedules per §6 OPEN-2
  cal_booking_id integer NOT NULL,                   -- Cal.com Booking.id; non-unique on rescheduled bookings
  cal_event_type_id integer,                         -- soft FK shape to meeting_types.cal_event_type_id

  -- Host (MyJKKN-side resolution)
  host_user_id uuid REFERENCES public.profiles(id),  -- nullable: webhook may arrive before profile sync
  host_email text NOT NULL,
  host_name text,

  -- Attendee (external — may be student parent, prospect, etc.)
  attendee_email text NOT NULL,
  attendee_name text,
  attendee_phone text,

  -- Schedule
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  timezone text,

  -- State
  status text NOT NULL CHECK (status IN ('pending','confirmed','cancelled','rescheduled','completed','no_show')),
  cancellation_reason text,
  reschedule_uid text,                               -- previous Booking.uid if this is a reschedule

  -- Provenance
  webhook_event text NOT NULL,
  webhook_received_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.jicate_booking_mirror IS
  'Read-only mirror of Cal.com bookings on jicate-booking-prod. Source of truth = Cal.com; this table is eventually-consistent. Refreshed via webhooks at /api/webhooks/jicate-booking.';

CREATE INDEX idx_jbm_host_user_id_start ON public.jicate_booking_mirror(host_user_id, start_time DESC) WHERE status NOT IN ('cancelled');
CREATE INDEX idx_jbm_status_start ON public.jicate_booking_mirror(status, start_time DESC);
CREATE INDEX idx_jbm_attendee_email ON public.jicate_booking_mirror(attendee_email);

-- RLS
ALTER TABLE public.jicate_booking_mirror ENABLE ROW LEVEL SECURITY;

-- Hosts see their own bookings
CREATE POLICY "host_sees_own_bookings" ON public.jicate_booking_mirror
  FOR SELECT TO authenticated
  USING (host_user_id = auth.uid());

-- Super admins see all
CREATE POLICY "super_admin_sees_all_bookings" ON public.jicate_booking_mirror
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin','director')));
```

### 3.3 Seed migration (separate, lands with F6)

`2026MMDD000003_seed_jicate_booking_meeting_types.sql` inserts initial rows for every active EventType on jicate-booking that MyJKKN hosts care about. This requires running the **inspection script** (see §5.1) against jicate-booking-prod first to enumerate live EventTypes.

---

## 4. Routes / surfaces

### 4.1 `app/api/webhooks/jicate-booking/route.ts` (F4)

Mirrors intent-platform pattern verbatim. Skeleton:

```typescript
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-cal-signature-256');
  if (!verifyHmac256(rawBody, signature, process.env.CAL_BOOKING_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }
  const parsed = calWebhookPayloadSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) return NextResponse.json({ error: 'bad_payload', issues: parsed.error.issues }, { status: 400 });

  await jicateBookingMirrorService.upsertFromWebhook(parsed.data);
  return NextResponse.json({ ok: true });
}
```

Service class location: `lib/services/integrations/jicate-booking-mirror-service.ts`.

### 4.2 `app/(routes)/meetings/inbox/page.tsx` (F7)

Server component. Fetches `jicate_booking_mirror` filtered by `host_user_id = current user`, paginated, ordered by `start_time DESC`. Status filter: All / Upcoming / Past / Cancelled. Each row links to `/meetings/[uid]`.

### 4.3 `app/(routes)/meetings/[uid]/page.tsx` (F7 detail)

Single booking detail. Read-only. Action buttons deep-link to jicate-booking ("Reschedule on Cal.com" → `https://jicate-booking.vercel.app/booking/<uid>?reschedule=true`).

### 4.4 Navigation entry

Add `meetings` chip to the appropriate nav surface(s). Per memory `feedback_action_config_url_target_domain_not_meta`, this should be reachable from the user's role-specific dashboard (counselor dashboard, faculty dashboard) — NOT just from a meta notifications view.

---

## 5. Inspection / discovery scripts (run before seeding)

### 5.1 `scripts/jicate-booking/list-event-types.ts`

Uses jicate-booking's `.mcp.json` (MCP must be loaded — i.e., script run from `cd /Users/omm/PROJECTS/jicate-booking`). Lists active EventTypes, prints SQL INSERT statements for the seed migration.

### 5.2 `scripts/jicate-booking/list-org-slugs.ts`

Verifies the MyJKKN tenant's org+team structure on jicate-booking matches expectations. Prints any orphan teams.

---

## 6. Open decisions for Director (BEFORE code)

| # | Decision | Recommendation |
|---|----------|----------------|
| **OPEN-1** | **PR shape** — single PR with all 4 features, or 4 sequential PRs? | **4 sequential PRs**: substrate-first per `feedback_substrate_first_wave_program_velocity` memory. Order: F6 (meeting_types migration + seed) → F5 (mirror migration) → F4 (webhook receiver) → F7 (inbox UI). Each ships green before the next starts. |
| **OPEN-2** | **Reschedule semantics** — Cal.com creates a NEW Booking.uid on reschedule and references the old one. Mirror keeps both rows, or replaces? | **Keep both, link via `reschedule_uid`**. Inbox shows latest by default; `?include_history=1` shows the chain. Preserves audit trail. |
| **OPEN-3** | **Auth coverage on /meetings** — counselors only? all roles? | **All authenticated users with at least one mirror row WHERE host_user_id = them**. RLS handles it. Don't gate at the route level. |
| **OPEN-4** | **Email→profile resolution failures** — what happens when host_email doesn't match any profile? | **Persist row with `host_user_id = NULL`**. Add a reconciliation job (separate spec) that runs nightly to backfill. Director sees these in a "unresolved" admin view. |
| **OPEN-5** | **Webhook secret rotation** — single static secret in env? per-environment? | **Single secret via `CAL_BOOKING_WEBHOOK_SECRET` env var**, rotated semi-annually or on suspected compromise. Both jicate-booking (sender) and MyJKKN (receiver) must update simultaneously. |
| **OPEN-6** | **Outcome metric for Phase 3 itself** — per memory `feedback_outcome_metric_first`, every shipped module needs a named metric + 90-day threshold | Proposed: **"≥1 webhook successfully ingested AND at least 1 host_user_id resolved AND visible in /meetings/inbox by 2026-08-30."** Lock this with `/lock-initiative` separately from the parent jicate-booking lock. |

---

## 7. Test plan

| Layer | Tool | What |
|-------|------|------|
| DB | Supabase migration apply via `supabase db push` (staging first, then prod via PR) | Tables exist with correct columns + indexes + RLS |
| Webhook receiver | `curl` with manually-computed HMAC against staging | 401 on bad sig, 400 on bad payload, 200 + row inserted on good payload |
| Idempotency | Replay same payload 3× | Single row, `webhook_received_at` updated |
| Cross-tenant | Use existing `cross-tenant-probe.py` pattern adapted to mirror table | Host A cannot see Host B's bookings under RLS |
| UI | Browser via cdp.py at localhost:3104 | Per memory `feedback_ui_change_browser_verify_before_ready` — load /meetings/inbox as 2 different roles, count rows, click into detail |
| End-to-end | Make a real booking on jicate-booking (research deploy), watch webhook fire, verify row in MyJKKN | This is the F4-F7 capstone smoke test |

Per memory `feedback_discovery_test_is_verification_test`: the same E2E scenario that uncovers a bug must be re-run against the fix before flipping any PR Ready.

---

## 8. What this spec does NOT decide

- Whether the license decision (Path A/B/C) ultimately fires — that's Director-driven, separate workstream
- Whether F5 mirror's eventual-consistency is acceptable for downstream consumers (e.g., reporting, AI Pulse, super-admin digest) — those will need their own cache-invalidation contracts when they consume mirror data
- Whether jicate-booking should ever push more than booking events (e.g., availability changes, calendar sync events) — out of scope

---

## 9. Director sign-off checklist

- [ ] Architecture choice (webhook+mirror) is the right call
- [ ] All 6 OPEN decisions in §6 resolved
- [ ] PR shape (4 sequential, substrate-first) approved
- [ ] Phase 3 outcome metric (OPEN-6) locked via `/lock-initiative`
- [ ] Greenlight to proceed to Phase 3.1 (F6 migration + seed)
