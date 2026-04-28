# Admission Counselor Rules-Engine Spec

**Status:** DRAFT — awaiting Omm's sign-off
**Author:** Claude (per Omm's 2026-04-27 directive after `/myjkkn-chain assumption-thrash` interview)
**Domain owner:** Omm Sharravana — MD + CAIO
**Last updated:** 2026-04-27

---

## Problem statement

MyJKKN's admission funnel today routes new leads via `fn_auto_assign_counselor` — a trigger that picks the least-loaded active counselor in the same institution, with random tie-break. The trigger ignores the existing `admission_assignment_rules` table (criteria/action JSONB rows are CRUDable at `/admission/settings/assignment-rules` but unused by the engine). It has no awareness of:

- Counselor working schedule (day-of-week, effective dates)
- Counselor on/off-duty state (manual emergency-off, HR leave)
- Lead source (`admission_lead_source_captures.source` is captured but not used in routing)
- Multi-institution counselors (current schema is single FK)
- Off-duty cascade (when a counselor flips off, their open leads sit idle until they return)
- Queue when zero counselors are on-duty
- Principal/HOD visibility (no read-side surface scoped to institution)

This spec defines the additive infrastructure to wire all of those concerns into one extension of the existing `admission_assignment_rules` table — without introducing parallel sources of truth.

---

## Locked decisions (20)

### Identity & taxonomy

| # | Decision |
|---|---|
| 1 | 4 counselor categories: `counselor` (Admission), `learner_counselor` (peer/student), `staff_counselor` (faculty/staff), `health_counselor`. **Holder-based semantic** — role describes WHO the counselor is, not who they counsel. |
| 2 | Reassignment of 14 existing `counselor` users: 9 students → `learner_counselor`, 1 faculty (test.faculty) → `staff_counselor`, 4 admission-cell users stay as `counselor`. |
| 3 | UI surface lives at `/admission/counselors/team` (new page). |

### Sources

| # | Decision |
|---|---|
| 4 | Sources are CRUDable via a master table `admission_lead_sources_master`. Standard MyJKKN multi-tenant pattern (matches `leave_types`, `custom_roles`). |
| 16 | Initial seed: 10 canonical sources, all `is_system=true`: `facebook_ad`, `google_ad`, `instagram_dm`, `whatsapp_inbound`, `walk_in`, `phone_inbound`, `expo_event`, `school_visit`, `referral`, `website_form`. Admins can add more (with `is_system=false`) and disable system rows. |

### Schedule

| # | Decision |
|---|---|
| 8 | Granularity: **day-level only** (on/off per day-of-week). No hour blocks, no half-day AM/PM. |
| 6 | Authority: admin-only (super_admin / admission / admission_staff). Counselor is read-only on their schedule. |
| 19 | Schedule rows have `effective_from` + `effective_to` (nullable = open-ended). Admin can pre-load future schedule changes without disturbing today's. |
| 17 | Emergency-off ("I'm off NOW"): toggle covers **today only**, auto-clears at 00:00 IST. |

### Auto-off triggers

| # | Decision |
|---|---|
| 12 | A counselor is off-duty if ANY: schedule says off today, emergency-off flag set, `is_active=false`, OR an approved `hr_leave_applications` row covers today. **No institution-holiday calendar** — left to admin to mark via schedule changes if they want. |

### Routing engine

| # | Decision |
|---|---|
| 7 | Tie-break: strict least-loaded (count of open leads), random tie-break. Same as current production logic. |
| 11 | Capacity: `admission_counselors.max_leads` is **dropped from routing** as a gate. Column kept for display purposes but engine doesn't reference it. |
| 9 | Cardinality: many-to-many junction tables for both institutions (`admission_counselor_institutions`) AND sources (`admission_counselor_sources`). |
| 10 | Cascade pool priority: 3-tier query — (1) match institution AND source, (2) fall back to match institution only, (3) queue with `counselor_id=NULL`. |
| 15 | Zero on-duty fallback: queue with `counselor_id=NULL`. Cron flushes queue every 15 min as counselors come on-duty. |

### Cascade

| # | Decision |
|---|---|
| 5 | Timing: 60-min off-duty threshold (configurable via env `COUNSELOR_CASCADE_THRESHOLD_MIN`). Flips ≤ 60 min do not cascade — accommodates short breaks. |
| 13 | Notes on cascade: append-only timeline. Previous counselor's notes immutable, attributed to them. New counselor adds new notes attributed to them. |
| 14 | Off-duty counselor visibility: their cascaded leads are read-only with "Reassigned to <Y>" badge. No auto-clawback on return. |

### Operations

| # | Decision |
|---|---|
| 18 | Cron timing: every 15 min (`*/15 * * * *`), all day. Single endpoint `/api/cron/counselor-shift-flip` does two sub-tasks: re-evaluate on-duty status + flush queued leads. |

### Visibility

| # | Decision |
|---|---|
| 20 | Principal / HOD see read-only counselor data scoped to their institution via the existing `role_has_institution_access(institution_id)` RLS pattern. No new view-side infrastructure. |

---

## Open tactical items (proposed defaults — flag for review)

| # | Item | Proposed default | Reasoning |
|---|---|---|---|
| O1 | Performance metrics on `/admission/counselors/team` Members tab | Per counselor: open leads, leads converted (last 30d), avg response time (last 30d), conversion rate, total calls (last 30d). 5 metrics, all already computable from `admission_leads` + `admission_call_logs` + existing services. | Aligns with the existing `counselor-daily-view-service.ts` + `counselor-metrics-service.ts` columns. |
| O2 | Calendar timezone | `Asia/Kolkata` (IST) | All 8 colleges in Tamil Nadu. Matches existing cron timezones. |
| O3 | Audit log granularity | Log every: cascade reassignment, schedule edit, source-mapping edit, institution-mapping edit, emergency-off toggle, queue assignment. Reuse existing `admission_counselors_audit_log` table — extend `action_type` enum. | Single audit log surface across all counselor changes. |
| O4 | HR leave query predicate | `EXISTS (SELECT 1 FROM hr_leave_applications a WHERE a.user_id = c.user_id AND a.status='approved' AND CURRENT_DATE BETWEEN a.start_date AND a.end_date)` | Standard JKKN HR pattern. Leverages existing index. |

---

## DB schema additions

### Net new tables (3)

```sql
-- Sources master (CRUDable, seeded with 10 canonical)
CREATE TABLE admission_lead_sources_master (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT NOT NULL UNIQUE,                    -- e.g. 'facebook_ad'
  label         TEXT NOT NULL,                            -- e.g. 'Facebook Ads'
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 100,
  institution_id UUID REFERENCES institutions(id),       -- NULL = global; UUID = institution-specific
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES profiles(id)
);

-- Junction: counselor → institutions (many-to-many)
CREATE TABLE admission_counselor_institutions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id    UUID NOT NULL REFERENCES admission_counselors(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  UNIQUE (counselor_id, institution_id)
);

-- Junction: counselor → sources (many-to-many)
CREATE TABLE admission_counselor_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id UUID NOT NULL REFERENCES admission_counselors(id) ON DELETE CASCADE,
  source_id    UUID NOT NULL REFERENCES admission_lead_sources_master(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES profiles(id),
  UNIQUE (counselor_id, source_id)
);

-- Schedule: day-of-week × counselor with effective dates
CREATE TABLE admission_counselor_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id    UUID NOT NULL REFERENCES admission_counselors(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun, 6=Sat
  is_working      BOOLEAN NOT NULL,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,                                                    -- NULL = open-ended
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Cascade audit history (lead-level reassignment events)
CREATE TABLE admission_lead_cascade_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  from_counselor_id  UUID REFERENCES admission_counselors(id),
  to_counselor_id    UUID REFERENCES admission_counselors(id),
  reason             TEXT NOT NULL,    -- 'off_duty_60min', 'manual_reassign', 'queue_flush'
  cascaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_by       UUID REFERENCES profiles(id),       -- NULL = system/cron
  metadata           JSONB DEFAULT '{}'::jsonb
);
```

### Column additions to existing tables (2)

```sql
ALTER TABLE admission_counselors
  ADD COLUMN emergency_off_today BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN emergency_off_set_at TIMESTAMPTZ;

-- Cron at 00:00 IST clears emergency_off_today nightly via a 1-line UPDATE.
```

### `max_leads` deprecation note

```sql
COMMENT ON COLUMN admission_counselors.max_leads IS
  'DEPRECATED 2026-04-27 — no longer used as a routing gate. Kept for display in UI dashboards. See specs/admission-counselor-rules-engine-spec.md decision #11.';
```

### RLS additions

Standard MyJKKN multi-tenant pattern on every new table:

```sql
-- Pattern (applied to all 5 new tables — schedules, junctions, sources_master, cascade_history)
ALTER TABLE admission_counselor_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admission_counselor_schedules_select" ON admission_counselor_schedules
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('admission.counselors.team.view')
    AND EXISTS (
      SELECT 1 FROM admission_counselors c
      WHERE c.id = admission_counselor_schedules.counselor_id
        AND role_has_institution_access(c.institution_id)
    )
  )
);

CREATE POLICY "admission_counselor_schedules_modify" ON admission_counselor_schedules
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.counselors.team.manage')
);
```

### New permission keys (in `lib/constants/permissions.ts` `Admission` block)

```ts
{ key: 'admission.counselors.team.view',   label: 'View Counselor Team page' },
{ key: 'admission.counselors.team.manage', label: 'Manage Counselor Team (reassign, schedule, allocate)' }
```

---

## Routing engine — function signatures

### `fn_auto_assign_counselor` (rewrite)

Trigger BEFORE INSERT on `admission_leads`. Replaces the current single-tier logic.

```
1. If NEW.counselor_id IS NOT NULL → respect manual assignment, return.
2. If NEW.institution_id IS NULL → return (can't route without institution).
3. Resolve NEW source via admission_lead_source_captures.source_id (NULL if unknown).
4. PASS 1 — match institution AND source:
     SELECT c.id FROM admission_counselors c
     JOIN admission_counselor_institutions aci ON aci.counselor_id = c.id AND aci.institution_id = NEW.institution_id
     JOIN admission_counselor_sources acs    ON acs.counselor_id = c.id AND acs.source_id = NEW.source_id
     LEFT JOIN admission_leads al ON al.counselor_id = c.id
                                  AND al.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
     WHERE c.is_active = TRUE
       AND fn_counselor_is_on_duty(c.id, CURRENT_TIMESTAMP) = TRUE
     GROUP BY c.id
     ORDER BY COUNT(al.id) ASC, RANDOM()
     LIMIT 1;
5. PASS 2 — match institution only (drop source filter): same query without the source join.
6. If still NULL → leave NEW.counselor_id NULL. Lead lands in queue, surfaces in v_institutions_needing_admission_counselors.
7. Return NEW.
```

### `fn_counselor_is_on_duty(counselor_id, at_time)` — new helper

```
Returns BOOLEAN. Counselor X is on-duty at time T iff ALL of:
  - admission_counselors.is_active = TRUE
  - admission_counselors.emergency_off_today = FALSE
  - The schedule row matching (counselor_id, dow=EXTRACT(DOW FROM T))
    where T::DATE BETWEEN effective_from AND COALESCE(effective_to, '9999-12-31')
    has is_working = TRUE
  - NO admission_counselors.user_id row in hr_leave_applications
    where status='approved' AND T::DATE BETWEEN start_date AND end_date
```

### `fn_reassign_off_duty_leads(counselor_id, threshold_min INT DEFAULT 60)` — new

Invoked by cron when a counselor's `emergency_off_today` flips true OR when shift transitions to off-duty AND time-since-flip exceeds threshold.

```
1. If time since off-duty < threshold_min → no-op (just-a-break).
2. SELECT id FROM admission_leads WHERE counselor_id = $1
     AND funnel_stage NOT IN (terminal stages).
3. For each open lead:
   a. Re-run fn_auto_assign_counselor logic (PASS 1 → PASS 2 → queue).
   b. If new counselor found:
      - UPDATE admission_leads SET counselor_id = new_counselor_id WHERE id = lead_id.
      - INSERT admission_lead_cascade_history (lead_id, from, to, reason='off_duty_threshold', triggered_by=NULL).
   c. If no on-duty counselor found:
      - UPDATE admission_leads SET counselor_id = NULL WHERE id = lead_id.
      - INSERT admission_lead_cascade_history (lead_id, from=$1, to=NULL, reason='queued_no_match', triggered_by=NULL).
```

### `fn_flush_queued_leads()` — new

Invoked by 15-min cron. Re-routes leads with `counselor_id=NULL` if any on-duty counselor matches now.

```
1. SELECT id FROM admission_leads WHERE counselor_id IS NULL
     AND funnel_stage NOT IN (terminal stages)
     AND created_at >= NOW() - INTERVAL '7 days'.    -- don't reanimate ancient leads
2. For each: re-run fn_auto_assign_counselor logic.
3. If matched: UPDATE counselor_id, INSERT cascade_history with reason='queue_flush'.
4. If still no match: leave queued.
```

---

## Cron route

**Path:** `app/api/cron/counselor-shift-flip/route.ts`
**Schedule:** `*/15 * * * *` (every 15 min, all day, all timezones — function logic uses IST internally)
**Auth:** `Bearer ${CRON_SECRET}` — same pattern as other crons
**Tasks per fire:**

1. Sweep all active counselors. For each, recompute `is_on_duty` via `fn_counselor_is_on_duty()`. Compare to a cached state. On flip OFF: invoke `fn_reassign_off_duty_leads(c.id)` if time-since-flip > 60 min.
2. Invoke `fn_flush_queued_leads()`.
3. At 00:00 IST (15-min window includes midnight): `UPDATE admission_counselors SET emergency_off_today = false, emergency_off_set_at = NULL WHERE emergency_off_today = true`.

Idempotent. Safe to fire arbitrarily often. Worst-case: counselor's leads cascade 14 minutes after the threshold instead of exactly at 60.

---

## UI surface — `/admission/counselors/team`

Permission gate: `admission.counselors.team.view` (read) / `admission.counselors.team.manage` (write).

### 5 tabs

| Tab | Read perm | Write perm | Content |
|---|---|---|---|
| **Members** | `.view` | `.manage` | 4 cards (Admission / Learner / Staff / Health). Each lists assigned users with avatar + email + primary_role + load. "Reassign" + "Add member" actions. |
| **Roster** | `.view` | `.manage` | Counselor × 7-day grid of on/off toggles. Effective-date selector (today / future). Emergency-off "Force off-today" button. |
| **Allocation** | `.view` | `.manage` | Two sub-tables: counselor × institution and counselor × source. Click cells to toggle. |
| **Rules** | `.view` | `.manage` | Embed existing `<AssignmentRulesDataTable />` from `/admission/settings/assignment-rules`. Same data, same component. |
| **Activity** | `.view` | — | Reverse-chronological feed from `admission_counselors_audit_log` + `admission_lead_cascade_history`. RLS-scoped. Principal / HOD sees only their institution's events. |

### Single-counselor detail page (`/admission/counselors/team/[counselor_id]`)

- 5 metrics (per O1): open leads, conversion 30d, avg response 30d, conversion rate, calls 30d
- Per-counselor schedule (7-day toggle row, effective dates)
- Institution checklist
- Source checklist
- Emergency-off button
- "Cascade now" admin action (force immediate reassignment of all open leads)
- Cascade history (last 30 events from `admission_lead_cascade_history`)

### Lead detail handover banner (Phase 6)

When `admission_lead_cascade_history` has rows for the lead:
```
┌─ Reassigned ─────────────────────────────────────────┐
│ This lead was previously with [Counselor X]          │
│ until [date] (cascaded due to off-duty).             │
│ See conversation history below — X's notes preserved.│
└──────────────────────────────────────────────────────┘
```

Notes timeline shows author per entry. Visual distinction when authorship changes.

---

## PR decomposition (7 PRs, ~1,000 LOC total)

| PR | Title | Files | Ship gate |
|---|---|---|---|
| 1 | `chore(admission): reassign 14 counselor users to correct categories` | 1 SQL file (~30 LOC) | None — pure data fix |
| 2 | `feat(admission): counselor rules-engine DB foundation (sources/junctions/schedule/cascade-history)` | 5 new tables + 2 col adds + RLS + 2 perm keys (~250 LOC SQL/TS) | catalog-sync gate |
| 3 | `feat(admission): rewrite fn_auto_assign_counselor + add cascade + queue-flush functions` | 3 functions (~280 LOC SQL) | discovery-test on existing leads |
| 4 | `feat(admission): cron /api/cron/counselor-shift-flip — on/off duty + queue flush` | 1 route + helpers (~120 LOC TS) | env-target check (Step 0) before testing |
| 5 | `feat(admission): /admission/counselors/team UI — Members + Roster + Allocation + Rules + Activity` | 5 components + 1 page + service (~600 LOC TS) | build-depth-gate (UI change classification) |
| 6 | `feat(admission): handover banner + cascaded-lead-readonly view on lead detail` | 2 components + lead detail page extend (~180 LOC TS) | runtime Issues delta |
| 7 | `chore(admission): seed default schedules + 10 sources + audit-log action_type extensions` | 1 migration (~80 LOC SQL) | None — additive seed |

### Per-PR mandatory gates (per `/myjkkn-chain`)

Every PR runs:
- Production-code-sweep (already done at spec time — embedded above)
- pr-preflight (before `gh pr create`)
- silent-failure-auditor (on touched files)
- catalog-sync (PRs touching MENU_PERMISSIONS or PERMISSION_CATEGORIES = PRs 2, 5)
- build-depth-gate (PR 4 = High-risk; PR 5 = UI change; PR 6 = UI change)
- discovery-test re-verification (PR 3 = critical — engine rewrite)

### Estimated effort

- **Sprint 1 (1 week):** PRs 1–3 (data + engine foundation)
- **Sprint 2 (1 week):** PRs 4–6 (cron + UI + handover)
- **PR 7:** ride alongside Sprint 2

Total: ~2 sprints, 2 weeks at sustainable pace.

---

## Migration strategy

### Phase 1 (this PR's docs + reassignment migration)

```sql
-- supabase/migrations/20260427_reassign_admission_counselors_to_correct_categories.sql

DO $$
DECLARE
  v_learner_counselor_id UUID;
  v_staff_counselor_id   UUID;
  v_counselor_id         UUID;
BEGIN
  SELECT id INTO v_learner_counselor_id FROM custom_roles WHERE role_key='learner_counselor';
  SELECT id INTO v_staff_counselor_id   FROM custom_roles WHERE role_key='staff_counselor';
  SELECT id INTO v_counselor_id         FROM custom_roles WHERE role_key='counselor';

  -- Move 9 student peer counselors to learner_counselor
  INSERT INTO user_roles (user_id, role_id, created_at)
  SELECT ur.user_id, v_learner_counselor_id, now()
  FROM user_roles ur
  JOIN profiles p ON p.id = ur.user_id
  WHERE ur.role_id = v_counselor_id
    AND p.role = 'counselor'
    AND EXISTS (
      SELECT 1 FROM user_roles ur2
      JOIN custom_roles cr2 ON cr2.id = ur2.role_id
      WHERE ur2.user_id = ur.user_id AND cr2.role_key = 'student'
    )
  ON CONFLICT DO NOTHING;

  DELETE FROM user_roles
  WHERE role_id = v_counselor_id
    AND user_id IN (
      SELECT ur.user_id FROM user_roles ur
      JOIN profiles p ON p.id = ur.user_id
      JOIN user_roles ur2 ON ur2.user_id = ur.user_id
      JOIN custom_roles cr2 ON cr2.id = ur2.role_id
      WHERE p.role = 'counselor' AND cr2.role_key = 'student'
    );

  -- Move test.faculty to staff_counselor
  INSERT INTO user_roles (user_id, role_id, created_at)
  SELECT id, v_staff_counselor_id, now() FROM profiles
  WHERE email = 'test.faculty@jkkn.ac.in'
  ON CONFLICT DO NOTHING;

  DELETE FROM user_roles
  WHERE role_id = v_counselor_id
    AND user_id IN (SELECT id FROM profiles WHERE email = 'test.faculty@jkkn.ac.in');

  -- Update primary role on profiles for affected users to match new role
  UPDATE profiles SET role = 'learner_counselor'
  WHERE role = 'counselor'
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = profiles.id AND cr.role_key = 'student'
    );

  UPDATE profiles SET role = 'staff_counselor' WHERE email = 'test.faculty@jkkn.ac.in';
END $$;
```

Verification (run post-migration):

```sql
SELECT
  cr.role_key,
  (SELECT COUNT(*) FROM user_roles WHERE role_id = cr.id) AS users
FROM custom_roles cr
WHERE cr.role_key IN ('counselor','learner_counselor','staff_counselor','health_counselor')
ORDER BY cr.role_key;
-- Expected: counselor=4, learner_counselor=9, staff_counselor=1, health_counselor=1
```

### Phase 7 (closeout seed)

After Phases 2–6 ship, seed default schedules for the 14 reassigned counselors:

```sql
-- Default: working Mon-Sat (1-6), off Sun (0)
INSERT INTO admission_counselor_schedules (counselor_id, day_of_week, is_working, effective_from)
SELECT c.id, dow, dow != 0, CURRENT_DATE
FROM admission_counselors c
CROSS JOIN generate_series(0, 6) AS dow
WHERE c.is_active = true
ON CONFLICT DO NOTHING;
```

---

## Test plan

### Phase 1 verification (post-merge)

```sql
-- Counts must match
SELECT role_key, COUNT(ur.user_id)
FROM custom_roles cr LEFT JOIN user_roles ur ON ur.role_id = cr.id
WHERE role_key IN ('counselor','learner_counselor','staff_counselor','health_counselor')
GROUP BY role_key;
-- Expected: 4 / 9 / 1 / 1
```

### Phase 3 (engine) discovery-test

```sql
-- Create a synthetic test lead, observe routing
BEGIN;
  INSERT INTO admission_lead_source_captures (source) VALUES ('facebook_ad') RETURNING id;
  INSERT INTO admission_leads (institution_id, source_capture_id, ...)
  VALUES ('<JKKN Pharmacy UUID>', '<above-id>', ...) RETURNING counselor_id;
  -- Expected: counselor_id IS NOT NULL, points to a JKKN Pharmacy on-duty counselor
ROLLBACK;
```

### Phase 4 (cron) verification

```bash
# Manually trigger the cron with secret
curl -H "Authorization: Bearer $CRON_SECRET" https://www.jkkn.ai/api/cron/counselor-shift-flip
# Expected: 200 OK, JSON response with { duty_flips: N, queue_flush: M, midnight_clear: K }
```

### Phase 5 (UI) browser-verify

Per `/myjkkn-chain` Step 2.6 (discovery-test re-verification):

```bash
bash scripts/local-auth.sh principal@jkkn-pharmacy.ac.in /admission/counselors/team
# Expected: Members tab loads, shows ONLY JKKN Pharmacy counselors (RLS scope verified)
# Activity tab shows ONLY JKKN Pharmacy events
```

---

## Out of scope (explicit non-goals)

- ❌ Hour-block schedules (day-level only — Q5)
- ❌ Auto-promotion of off-duty counselors when capacity is full (decision #11 — capacity isn't a routing input)
- ❌ Cross-institution cascade fallback (queue is the fallback, not cross-college routing)
- ❌ Counselor self-serve schedule editing (read-only — Q6)
- ❌ Counselor-to-counselor lead-swap requests (admin-only operations)
- ❌ Lead reassignment notifications via SMS/email (defer to Phase 8 if usage proves the need)
- ❌ Performance leaderboard ranking algorithm (existing leaderboard at `/admission/counselors` continues unchanged)
- ❌ Holiday calendar (Q9 — admin manages via schedule edits if needed)
- ❌ Renaming `counselor` → `admission_counselor` (separate migration with code-sweep — deferred indefinitely)

---

## Open questions for review

1. **Performance metrics list (O1)** — confirm the 5 proposed (open leads, conversion 30d, avg response 30d, conversion rate, calls 30d) cover what Principal/HOD actually want to see. Add/remove?
2. **Calendar timezone (O2)** — IST locked, or any institution want different?
3. **Audit log granularity (O3)** — propose logging every cascade + every schedule edit + every emergency-off. Anything else? Anything to skip?
4. **HR leave query (O4)** — confirm `hr_leave_applications` is the right table and `status='approved'` is the right filter. Does any other status block on-duty (e.g., 'pending_approval')?

---

## Appendix — production state at spec time (DB-verified 2026-04-27)

```
custom_roles (active counselor roles):
  counselor          14 users   34 perms   institution_scope='all'   is_system=true
  learner_counselor   0 users   14 perms   institution_scope='own'   is_system=true
  staff_counselor     0 users   12 perms   institution_scope='own'   is_system=true
  health_counselor    1 user     2 perms   institution_scope='own'   is_system=true

admission_counselors:                   8+ rows (live)
admission_counselors_audit_log:         exists, will extend action_type
admission_lead_source_captures:         exists, exposes source/utm_source/expo_event_id
admission_assignment_rules:             exists with criteria + action JSONB; UI live; engine doesn't consume yet
admission_assignment_rules UI:          /admission/settings/assignment-rules (live)
fn_auto_assign_counselor:               trigger BEFORE INSERT on admission_leads, picks least-loaded
v_institutions_needing_admission_counselors:  view exists for queue surfacing

Existing services to extend (NOT replace):
  lib/services/admission/counselor-daily-view-service.ts
  lib/services/dashboard/counselor-metrics-service.ts
  lib/services/telephony/counselor-sync-service.ts
  lib/services/whatsapp/whatsapp-counselor-analytics-service.ts
  lib/services/admission/assignment-rules-service.ts
  hooks/admission/use-assignment-rules.ts
```

---

## Sign-off

When this spec is signed off, the implementation kicks off via `/myjkkn-api` per phase, with `pr-preflight` + `silent-failure-auditor` + `catalog-sync` gates per PR (per `/myjkkn-chain` directives).

**Reviewer checklist:**

- [ ] All 20 locked decisions match Omm's intent
- [ ] All 4 open tactical defaults (O1–O4) are acceptable
- [ ] PR decomposition + sequencing is sensible
- [ ] No missing requirements from the original conversation
- [ ] Out-of-scope list correctly excludes the deferred items

When checked, comment `LGTM` on the PR. Phase 1 ships within 24h of sign-off.
