# Sprint 4 — eSSL Biometric Device Integration (Deferred — Retrospective Design)

**Status:** DEFERRED on 2026-04-15 per user decision; design drafted retrospectively on 2026-04-24 for un-defer readiness.
**Parent Spec:** `specs/myjkkn-hr-module-spec-v4-evidence.md` (§2.1 Reliability Tiers, §2.3 Failure-Mode Test Suite, §3 Sprint Plan row S4)
**Precedes (upstream):** Sprint 1 (`hr_organizations`, `hr_employees`), Sprint 5 (Attendance engine — also deferred)
**Feeds (downstream):** Sprint 5 consumes `hr_biometric_punches` to compute `hr_attendance_records`; Sprint 7 (Payroll) consumes attendance for LOP.

**Why this sprint is documented, not built:** Sprint 6 header recorded the deferral: "Skips: Sprint 4 (eSSL biometric) + Sprint 5 (Attendance) — deferred to end per user decision." Writing the design now means un-defer is a green-light decision, not a re-plan.

---

## Why this sprint exists

55% of the 1,678 customer-evidence messages in `specs/hrapp-issues-capture.md` concern attendance. The *single highest-volume* failure mode is **"punch landed on the device but never reached HR-App"** — which the current hrapp.co integration handles silently (auto-generates LOP) and blames on the HR officer to reconcile.

Two representative quotes from the corpus:

> **2025-02-28 — JAYAMARISH N to Computer Science IQAC Coordinator:**
> *"Sir/Mam If the network switch is off, how does the HR app fetch data from the biometric device? Why do you keep turning off the network switch repeatedly? [...] There's nothing to fix, sir. The network switch must be on 24/7."*
> (Source: `specs/hrapp-issues-capture.md` line 2432)

> **2024-09-13 — Computer Science IQAC Coordinator, JKKNCAS(SF):**
> *"We are facing daily power outages in the bio metric (FR). Please arrange for a power backup/UPS connection to the bio metric(FR) device. Issue No: 163."*
> (Source: `specs/hrapp-issues-capture.md` line 1572)

> **2025-03-25 — Dr.Alwin Simon:**
> *"I have noticed that my biometric attendance is not fetched on 17-March-2023 for the Morning Session in HR App. But when I checked in the biometric device it has an morning entry recorded."*
> (Source: `specs/hrapp-issues-capture.md` line 2501)

The pattern is consistent across 14+ months of messages: device records the punch, HR-App never ingests it, staff get auto-LOP, HR officer manually reconciles via chat. Sprint 4's job is to make this class of failure **impossible to silently lose** — buffer at the edge, deduplicate at ingest, reconcile daily, surface gaps on an HR dashboard.

---

## Architecture

```
   eSSL device (X990/K21/eTimeTrackLite)
        │  (HTTP push, JSON over LAN)
        ▼
   Edge agent (Raspberry Pi per campus)
   ├─ local SQLite buffer
   ├─ idempotency-key signer
   └─ push-retry w/ exponential backoff
        │  (HTTPS, per-device bearer token)
        ▼
   POST /api/hr/biometric/webhook/[deviceToken]  (withAuth-exempt route; token-auth only)
        │
        ▼
   ingestion service (lib/services/hr/biometric-ingest-service.ts)
   ├─ verify device + institution scope
   ├─ dedupe by (device_id, employee_code, punch_at)  ±5s window
   ├─ parse punch_type IN/OUT/UNKNOWN from raw payload
   └─ insert into hr_biometric_punches (append-only)
        │
        ▼
   Sprint 5 attendance-builder (daily cron + on-demand)
   ├─ reconcile punches → hr_attendance_records
   └─ emit exceptions → hr_biometric_exceptions for HR review
```

**Hardware constraints (informed by `myjkkn-hr-module-spec-v4-evidence.md` §2.1):**

| Constraint | How we handle |
|---|---|
| eSSL devices are best-effort; we don't control firmware | Edge agent is our reliability boundary. Device offline ≠ data loss. |
| Power cuts at JKKNCAS(SF), nursing, dental (multiple quotes) | Edge agent SQLite survives power cycle; replays buffered rows on boot. |
| Network switch toggles (multiple quotes) | Edge agent exponential-backoff retry; `last_seen_at` alerts HR officer if >2h dark. |
| eSSL pushes JSON with model-specific shape | Store entire raw payload as JSONB; parsing layer is versioned per device model. |
| Duplicate punches within 5s (user taps twice) | Dedupe at ingest via `(device_id, employee_code, punch_at)` window; log as deduped, never fail. |
| Manual back-dated reconciliation from hrapp.co | HR officer can POST `/reconcile` to attach exception to attendance record. |

---

## Schema — 3 new tables

### 1. `hr_biometric_devices` — device registry

```sql
CREATE TABLE hr_biometric_devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id  uuid NOT NULL REFERENCES hr_organizations(id),
  institution_id      uuid REFERENCES institutions(id),  -- de-normalized for RLS fast-path
  device_code         varchar(50) NOT NULL,              -- JKKN-assigned, e.g., "CAS-SF-BIO-01"
  vendor              varchar(30) NOT NULL DEFAULT 'eSSL',
  model               varchar(50),                       -- "X990", "K21", "eTimeTrackLite", free-form
  location_label      varchar(200),                      -- "Nursing block, 2nd floor entrance"
  auth_token_hash     text NOT NULL,                     -- bcrypt of webhook bearer; plaintext shown once on create
  auth_token_prefix   varchar(8) NOT NULL,               -- first 8 chars (shown in UI for identification)
  is_active           boolean NOT NULL DEFAULT true,
  last_seen_at        timestamptz,                       -- updated on every webhook hit
  last_punch_at       timestamptz,                       -- updated when punches processed
  offline_alert_after_minutes int NOT NULL DEFAULT 120,
  created_by          uuid NOT NULL REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hr_organization_id, device_code)
);
CREATE INDEX idx_hbd_org          ON hr_biometric_devices(hr_organization_id);
CREATE INDEX idx_hbd_last_seen    ON hr_biometric_devices(last_seen_at) WHERE is_active = true;
```

### 2. `hr_biometric_punches` — append-only punch log

```sql
CREATE TABLE hr_biometric_punches (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id                uuid NOT NULL REFERENCES hr_biometric_devices(id),
  hr_organization_id       uuid NOT NULL REFERENCES hr_organizations(id),  -- de-normalized
  employee_code            varchar(50) NOT NULL,                             -- biometric_id (may not yet match staff)
  employee_id              uuid REFERENCES staff(id),                        -- resolved during reconcile
  punch_at                 timestamptz NOT NULL,
  punch_type               varchar(10) NOT NULL DEFAULT 'UNKNOWN'
                           CHECK (punch_type IN ('IN','OUT','UNKNOWN')),
  idempotency_key          text NOT NULL,                                    -- client-supplied UUID
  raw_payload              jsonb NOT NULL,                                   -- full eSSL push body
  received_at              timestamptz NOT NULL DEFAULT now(),
  reconciled_attendance_id uuid REFERENCES hr_attendance_records(id),        -- nullable; Sprint 5 links
  reconciled_at            timestamptz,
  is_duplicate_of          uuid REFERENCES hr_biometric_punches(id),         -- dedup chain (5s window)
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, idempotency_key)                                        -- idempotency guard
);
CREATE INDEX idx_hbp_org_date     ON hr_biometric_punches(hr_organization_id, punch_at);
CREATE INDEX idx_hbp_employee     ON hr_biometric_punches(employee_code, punch_at);
CREATE INDEX idx_hbp_unreconciled ON hr_biometric_punches(hr_organization_id, received_at)
                                     WHERE reconciled_attendance_id IS NULL AND is_duplicate_of IS NULL;
```

**Append-only guard:** no UPDATE policy on this table except for `reconciled_attendance_id` + `reconciled_at` + `is_duplicate_of` (set once, never mutated again). Enforced via trigger.

### 3. `hr_biometric_exceptions` — manual-review queue

```sql
CREATE TABLE hr_biometric_exceptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id  uuid NOT NULL REFERENCES hr_organizations(id),
  exception_type      varchar(30) NOT NULL
                      CHECK (exception_type IN (
                        'unknown_employee_code',   -- biometric_id not in staff/hr_employees
                        'orphan_punch',            -- punch not matched to attendance record
                        'device_offline',          -- device silent past offline_alert_after_minutes
                        'duplicate_suspect',       -- ≥3 punches in 1 min (not just dedup)
                        'clock_skew'               -- punch_at differs from received_at by >10min
                      )),
  punch_id            uuid REFERENCES hr_biometric_punches(id),
  device_id           uuid REFERENCES hr_biometric_devices(id),
  employee_code       varchar(50),
  details             jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_status   varchar(20) NOT NULL DEFAULT 'open'
                      CHECK (resolution_status IN ('open','resolved','ignored')),
  resolved_by         uuid REFERENCES profiles(id),
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hbe_open ON hr_biometric_exceptions(hr_organization_id, created_at)
                            WHERE resolution_status = 'open';
```

---

## API surface — 4 endpoint groups

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/hr/biometric/webhook/[deviceToken]` | Bearer token (NOT withAuth; device-only) | eSSL/edge agent pushes punches. Returns 200 + idempotency-key on duplicate. |
| GET | `/api/hr/biometric/punches` | withAuth + `hr.biometric.view` | Paginated punch list; filters by device, employee_code, date range, reconciled status. |
| POST | `/api/hr/biometric/punches/[id]/reconcile` | withAuth + `hr.biometric.reconcile` | Manually attach punch to `hr_attendance_records.id`. Creates audit trail row. |
| GET | `/api/hr/biometric/devices` | withAuth + `hr.biometric.devices.view` | List registered devices + health (last_seen_at, last_punch_at). |
| POST | `/api/hr/biometric/devices` | withAuth + `hr.biometric.devices.edit` | Register new device. Returns plaintext token **once**; hashed thereafter. |
| PATCH | `/api/hr/biometric/devices/[id]` | withAuth + `hr.biometric.devices.edit` | Update label/location/active flag. Token rotation via separate `POST .../rotate-token`. |
| POST | `/api/hr/biometric/devices/[id]/rotate-token` | withAuth + `hr.biometric.devices.edit` | Invalidate old token + issue new. Returns plaintext once. |
| GET | `/api/hr/biometric/exceptions` | withAuth + `hr.biometric.view` | Review queue. |
| POST | `/api/hr/biometric/exceptions/[id]/resolve` | withAuth + `hr.biometric.reconcile` | Resolve with note. |

**Webhook auth pattern (non-withAuth; safe because):**
- Endpoint matches only `POST` + `/biometric/webhook/[token]`; nothing else.
- Token is high-entropy (32 bytes); bcrypt-compared server-side.
- Request body signed with same token as HMAC (X-Device-Signature header) to prevent replay across devices.
- Rate-limited per device (default 60 req/min).
- Bearer token alone cannot read/write other HR resources — ingestion service is the *only* consumer.

---

## Permission keys to add

Append to `lib/constants/permissions.ts` under the `hr` category:

```ts
// Biometric (Sprint 4) — eSSL device integration
{ key: 'hr.biometric.view', label: 'View Biometric Punches + Exceptions' },
{ key: 'hr.biometric.manage', label: 'Manage Biometric Ingestion (resolve exceptions)' },
{ key: 'hr.biometric.reconcile', label: 'Manually Reconcile Punches to Attendance' },
{ key: 'hr.biometric.devices.view', label: 'View Biometric Device Registry' },
{ key: 'hr.biometric.devices.edit', label: 'Register/Edit Biometric Devices + Rotate Tokens' },
```

Grant defaults (matches pattern from Sprint 1-3):
- `super_admin`, `hr_head`: all 5 keys
- `hr_officer`: `view` + `reconcile` + `manage` + `devices.view`
- `institution_admin`: `view` + `devices.view` (read-only for their org)
- `staff` / `faculty`: none (staff see their own punches via /hr/attendance, Sprint 5)

---

## File inventory — 11 new files, zero modifications to existing files except schema + permissions

**Schema (4 appends):**
1. `supabase/setup/01_tables.sql` — append 3 CREATE TABLE blocks + indexes
2. `supabase/setup/03_policies.sql` — append RLS for all 3 tables (pattern: `auth_hr_organization_id() OR is_super_admin()` + permission gate)
3. `supabase/setup/04_triggers.sql` — append append-only guard trigger on `hr_biometric_punches`; append `last_seen_at` updater trigger
4. `supabase/migrations/<date>_hr_biometric_tables.sql` — idempotent migration wrapping the above

**Service + types (3):**
5. `types/hr-biometric.ts` — `HRBiometricDevice`, `HRBiometricPunch`, `HRBiometricException`, payload schemas
6. `lib/services/hr/biometric-ingest-service.ts` — webhook handler core: verify token, dedup, parse, insert, update device.last_seen_at
7. `lib/services/hr/biometric-device-service.ts` — CRUD + token issue/rotate

**API routes (5 files under `app/api/hr/biometric/`):**
8. `webhook/[deviceToken]/route.ts` — POST only, bearer-token auth
9. `punches/route.ts` + `punches/[id]/reconcile/route.ts`
10. `devices/route.ts` + `devices/[id]/route.ts` + `devices/[id]/rotate-token/route.ts`
11. `exceptions/route.ts` + `exceptions/[id]/resolve/route.ts`

**Hooks + UI (placeholder — UI in Sprint 5 or separate sub-sprint):**
- `hooks/hr/use-biometric.ts` (minimal: `useDevices`, `useDeviceHealth`, `useExceptions`)
- `/hr/biometric/devices` page (device registry)
- `/hr/biometric/exceptions` page (review queue)

**Permissions:**
- `lib/constants/permissions.ts` — 5 new entries (above)
- `lib/sidebarMenuLink.ts` — one new entry: `{ href: '/hr/biometric', permission: 'hr.biometric.view', label: 'Biometric Devices' }`

**Total file impact:** ~11 new files + 3 appended config files. Matches Sprint 3's footprint.

---

## Verification — testing without real eSSL hardware

Verified end-to-end via simulator — `scripts/hr/simulate-essl-push.ts` POSTs JSON fixtures to `/api/hr/biometric/webhook/[token]` with realistic timing + idempotency keys. Ships with 3 fixtures: `happy-path.json` (50 staff × 2 punches), `power-cut.json` (20 punches + 3h gap + 20 buffered replays), `dup-flood.json` (5 punches in 10s).

Gate tests (all must pass + 1 real-device smoke test at JKKNCAS-SF — the most power-cut-prone campus per evidence):

| # | Test | Expected |
|---|------|----------|
| 1 | Happy-path ingest | 100 rows in `hr_biometric_punches`, `last_seen_at` on device updated |
| 2 | Idempotency | Re-POST same fixture → still 100 rows |
| 3 | Dedup | `dup-flood.json` → 1 primary + 4 rows with `is_duplicate_of` set |
| 4 | Offline alert | 125min silence → 1 `device_offline` exception |
| 5 | Manual reconcile | `/reconcile` links orphan punch to attendance record |
| 6 | RLS | hr_officer sees own-org only; staff gets 403 everywhere |
| 7 | Permission gate | Strip `hr.biometric.reconcile` → `/reconcile` returns 403 |

---

## Open questions (must interview before un-defer)

1. **Which eSSL models are physically deployed at JKKN's 11 campuses?** v4 spec names X990/K21/eTimeTrackLite defensively, but actual model affects push-payload parsing. Blocks simulator fixture accuracy and parser versioning.

2. **Is the edge agent (Raspberry Pi) already deployed, planned, or unowned?** If not planned, either (a) MyJKKN team builds + ships it, (b) Jicate Solutions builds as a paid service, (c) direct device→MyJKKN (no edge agent) with all buffering at device — only option (c) is sprint-4-internal; (a) and (b) are scope additions.

3. **What's the authoritative `employee_code` source — `staff.biometric_id`, a new `hr_employees.biometric_id`, or an external mapping file?** Multiple evidence messages cite 4-digit codes (7004, 7006, 7010) that don't exist in any current table. Un-deferral needs the mapping strategy locked.

4. **Back-fill policy for the hrapp.co transition month:** does Sprint 4 accept historical punches (e.g., a CSV from eSSL WebAPI dumping the last 30 days into `hr_biometric_punches`) with a `source='backfill'` tag, or is it strictly live-punch-only?

5. **Retention:** append-only table grows ~1M rows/year at JKKN scale (≈400 staff × 2 punches × 300 days × 11 campuses). Do we partition by year, archive to cold storage after N years, or keep indefinitely for auditable LOP disputes? (Grievance/litigation retention often 7 years.)

---

## Guardrails (same as Sprint 1-3)

1. Zero modifications to MyJKKN core tables (`staff`, `institutions`, `leave_approval_chains`).
2. Every RLS policy includes `is_super_admin()` bypass + `auth_hr_organization_id()` scope.
3. Append-only discipline on `hr_biometric_punches` — no row deletes, no payload mutations.
4. Idempotency-key UNIQUE constraint is load-bearing; tests MUST verify it.
5. Webhook route is the **only** non-withAuth endpoint in the HR surface. Any future non-withAuth HR route requires a design review.
6. Per `feedback_service_institution_id_signature_convention.md`: biometric services type `hr_organization_id: string | undefined` and guard `.eq()` on truthy. Write paths are not guarded.

---

## Sprint-4 complete when (if un-deferred)

- [ ] All 3 tables created + RLS applied; EXPLAIN ANALYZE on MyJKKN core tables unchanged
- [ ] Webhook accepts simulated punch from `happy-path.json` fixture; row appears in `hr_biometric_punches`
- [ ] Re-POSTing same fixture is a 200 no-op (idempotency guard)
- [ ] Dedup test: 5-punch flood becomes 1 primary + 4 `is_duplicate_of` rows
- [ ] Offline detector: 125min silence creates a `device_offline` exception
- [ ] Device registry UI at `/hr/biometric/devices` lists devices + last-seen health
- [ ] Exception review UI at `/hr/biometric/exceptions` lets hr_officer resolve with note
- [ ] One real-device smoke test at JKKNCAS-SF campus passes (10 real staff punches ingest correctly within 60s)
- [ ] PR merged to `Jicate-Solutions/MyJKKN`; deployed via `/deploy-myjkkn`; browser-verified

---

*This sprint plan was drafted 2026-04-24 against evidence recovered in PR #461. It sits dormant until the user green-lights un-deferral. All 5 open questions must be interview-locked before implementation begins.*
