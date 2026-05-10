# Insta Solver — Core Module Spec (Strategic / Chain Output)

**Status:** SPEC LOCKED via /myjkkn-chain → /interviewcodebase · ready for /myjkkn-module DDL phase
**Spec lock date:** 2026-05-04
**Initiative lock:** `instasolver-core-module-90d` (registered in `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md`)
**Verdict date:** 2026-08-04
**Branch:** `feat/instasolver-core-module-spec` (off `jicate/main` — currently 17 commits behind, needs rebase before PR)
**Companion implementation spec:** `specs/instasolver-core-module-spec.md` (R1-R4 interview locks, file inventory, edge cases)

---

## TL;DR

Promote the existing `grievance_tickets` substrate (39 cols, 0 production rows, shipped via PRs #305/#389/#507/#608) from a NAAC-gated route at `/accreditation/naac/grievance` to a **top-level `/issues` route** that absorbs the standalone `instasolver.jkkn.ac.in` subdomain. Add a sibling `requirement_requests` table for institutional feature requests (approval / budget / voting workflow distinct from grievance complaints, distinct from existing service_requests). Migrate live Insta Solver data. Close 3 deferred grievance gaps (file uploads, anonymous status check, ICC RLS). Decommission the subdomain on Day-90 metric verdict.

**No parallel ticketing schema is created.** Architectural decision (locked Q-scope answer 2026-05-04): EXTEND, don't duplicate.

---

## Q0 — Locked Outcome Metric

```yaml
outcome_metric:
  metric_name: institutions_with_min_5_tickets
  baseline_value: 0 of 8 institutions (2026-05-04 — production grievance_tickets empty; all colleges still on subdomain)
  threshold_90d: ≥ 6 of 8 institutions with ≥5 tickets each by 2026-08-04
  kill_criterion: |
    If ≤3 of 8 by day-90 (2026-08-04):
      (a) VERDICT as MISS-narrow in Locked-Initiatives.md
      (b) NARROW /issues route audience to ONLY the 3 adopting institutions, OR
          PIVOT to integration-only (subdomain stays canonical, MyJKKN /issues becomes read-only mirror)
      (c) NO third-bite negotiation on the "8-college canonical issue tracker" ambition
  query: |
    SELECT count(*) FILTER (WHERE n>=5) AS hit_count
    FROM (
      SELECT institution_id, count(*) AS n
      FROM public.grievance_tickets
      WHERE created_at >= '2026-05-04'
      GROUP BY institution_id
    ) sub;
```

---

## Architectural Decisions (locked across chain + interview)

| Decision | Locked answer | Source |
|---|---|---|
| New schema vs extend `grievance_tickets`? | **Extend** (90%+ overlap) | /myjkkn-chain Q-scope |
| New module folder vs route promotion? | **Route promotion** to top-level `/issues` | /myjkkn-chain Q-scope |
| Requirement vs Grievance — same schema? | **Sibling `requirement_requests` table** (approval/budget/voting workflow distinct) | /myjkkn-chain Q-scope |
| Discriminator | `issue_type` col on grievance_tickets: `'grievance' \| 'requirement_link'` | DDL plan |
| /issues scope | **Two streams: grievances + requirements ONLY** (service_requests stays at /service-requests as separate module) | R4.1 |
| service_requests fate | **NOT absorbed** — distinct concept (certificates / passes / hall tickets / auditorium bookings) verified via 9 prod row sample | R4.1 + investigation |
| MCP tool fix | `lib/mcp/tools/grievance.ts` is misnamed — actually queries `service_requests`. Split into 3 correctly-named tools as part of B.1 | R3.4 |
| File attachments | Per-category required (emergency/regulatory) else optional, max 5×10MB, MIME whitelist, Supabase bucket `issues/attachments/` (closes deferred PR #305 gap) | R1.1 |
| Anonymous status check | `/track/<token>` public unauthenticated route (closes deferred PR #305 gap) | R1.2 |
| ICC RLS gating | ICC-member-only with super_admin break-glass + audit (closes deferred PR #305 A6b gap) | R1.3 |
| Form stack | RHF + Zod for `/issues/*`, leave existing /accreditation/naac/grievance as raw-useState until soft-deprecation | R1.4 |
| Vote tally visibility | Live tally visible + per-voter visibility hidden | R2.1 |
| Grievance→Requirement promotion | Manual only (button on grievance detail), no auto-suggest in v1 | R2.2 |
| Approval thresholds | Extend `approval_authority_config`, default seeds: HOD≤₹10k / Principal≤₹50k / Director>₹50k, super_admin-editable via UI | R2.3 + autonomous defaults |
| Voter eligibility | Extend `referral_category_eligibility`, default rule: same-institution + parents-on-learner-categories, super_admin-editable via UI | R2.4 + autonomous defaults |
| Voting window + quorum | 14 days default + 10% quorum via `platform_policies` rows | autonomous defaults |
| B2A external API | YES — ship `/api/b2a/issues/*` + `/api/b2a/requirements/*` mirroring grievance pattern | R3.1 |
| Notification generator | Single `unresolved_issue` (rename existing `unresolved_grievance` + filter by issue_type) | R3.2 |
| Applications tile | Soft-delete row entirely once /issues is in main nav | R3.3 |
| Subdomain shutdown | 90-day redirect window, then shutdown gated on Q0 metric verdict | R4.2 |
| Per-institution rollout | All 8 at once, day 0 (no pilot) | R4.3 |
| Cutover comms | In-app banners only (subdomain pre-redirect + /issues home), no email blast | R4.4 |
| Deprecation of `instasolver.jkkn.ac.in` | Phased: data migration → URL redirect → subdomain shutdown (3 PRs, 90-day window) | Migration plan |
| Auth | Use parent MyJKKN SSO (set `applications.uses_parent_auth=true` is moot since row is soft-deleted) | R3.3 + DDL |

---

## Persona Matrix

| Persona | Files | Triages | Resolves | Voted? | Notes |
|---|---|---|---|---|---|
| Learner | ✅ | ❌ | ❌ | ✅ (Requirements) | Existing `RaisedByType='learner'` |
| Parent | ✅ (on behalf of learner) | ❌ | ❌ | Open Q3 | Existing `RaisedByType='parent'` |
| Faculty | ✅ | ✅ (own dept) | ✅ (own dept) | ✅ (Requirements) | **NEEDS RaisedByType ENUM EXTENSION** — currently missing |
| Staff (non-faculty) | ✅ | ✅ (own dept) | ✅ (own dept) | ✅ | Existing `RaisedByType='staff'` |
| Alumni | ✅ (limited) | ❌ | ❌ | ❌ | Existing `RaisedByType='alumni'` |
| Admission Counselor | ❌ | ✅ (admission-related only) | ✅ | ❌ | Re-uses existing `assigned_to` |
| HOD | ❌ | ✅ (departmental) | ✅ | ✅ (Requirements ≤ ₹10k authority) | Approval authority for Requirements within dept |
| Principal | ❌ | ❌ | ✅ (escalation level 2+) | ✅ (Requirements ≤ ₹50k authority) | Final approver for high-budget |
| Super Admin | ✅ (any) | ✅ (any) | ✅ (any) | ✅ (any) | Full CRUD + ICC break-glass with audit |
| ICC Member | ❌ | ✅ (`is_icc_only=true` only) | ✅ (`is_icc_only=true` only) | ❌ | Sealed visibility per R1.3 |
| Anonymous | ✅ (via `anonymous_token`) | ❌ | ❌ | ❌ | Status check via `/track/<token>` per R1.2 |

**RaisedByType extension:** add `'faculty'` and `'admin'` to existing enum (additive migration).

---

## Q1 — Value Lists (CRUDable master vs enum)

| Value list | Verdict | Pattern |
|---|---|---|
| `issue_type` | Enum | Discriminator only |
| `raised_by_type` | Enum | Bound to roles taxonomy |
| `priority`, `status`, `sla_status` | Enum (existing) | State-machine-shaped |
| `requirement_status` | Enum (NEW: submitted/under_review/voting_open/voting_closed/approved/budgeted/in_progress/fulfilled/rejected/withdrawn) | State machine |
| `vote_state` | Enum (NEW) | State machine |
| `grievance_categories` / `requirement_categories` | **CRUDable master table** | per-institution overrides |
| Departments | **Existing `departments`** | Already CRUDable |
| Issue SLA hours | **`issue_sla_config` (NEW config table)** clone `hostel_maintenance_sla_config` | Pattern B |
| Approval thresholds | **Extend `approval_authority_config` → `requirement_approval_thresholds`** | Pattern B |
| Voting eligibility | **Extend `referral_category_eligibility` → `requirement_voting_config`** | Pattern B |

---

## Q2 — UI-Pattern Twin Sweep Result

3rd-copy violation surfaced. Mandatory precursor PR-Q2 extracts `components/shared/crud-master/{form-dialog, data-table, row-actions}` from existing 80-95%-similar twins (academic-leaves, campus-living-leaves) BEFORE Insta Solver categories CRUD lands. Net LOC delta: -150 to -250 vs trajectory.

---

## Q3 — Config Table Inventory (every threshold = config row)

Per Director directive 2026-04-29 + standing rule. Every Insta Solver tunable below MUST be a row, not a constant.

| Tunable | Pattern | Table | Read by |
|---|---|---|---|
| SLA hours by `(category_id, priority)` | **Pattern B** | `issue_sla_config` | `fn_compute_sla_deadline()` |
| Auto-escalation rules | **Pattern B** | `issue_escalation_rules` | cron `/api/cron/issue-escalation-check` |
| Anonymous filing window per category | **Column** | `grievance_categories.allow_anonymous boolean` | service layer |
| Notification routing | **Reuse Wave B.1** | `notification_generator_config` rows w/ key prefix `issue.*` | existing engine |
| Voting eligibility | **Pattern B** | `requirement_voting_config` | `fn_user_can_vote_on()` |
| Voting window + quorum | **Pattern A** | `platform_policies` rows | `fn_voting_window_for()` |
| Budget approval threshold by role | **Pattern B** | `requirement_approval_thresholds` | `fn_required_approver_for()` |
| Promotion threshold | **Pattern A** | `platform_policies` row | `fn_suggest_requirement_promotion()` |
| ICC-only category mapping | **Existing column** | `grievance_categories.is_icc_only` | RLS |
| Email/WhatsApp templates | **Reuse notification substrate** | `notification_generator_config` | engine |
| PDF templates (ack + resolution) | **Pattern A** | `platform_policies` rows | PDF generator |
| Anonymous filing rate-limit | **Pattern A** | `platform_policies` row | `/track/<token>` middleware |

---

## /assumption-thrash — 14-Category Silent Decisions

| # | Category | Resolution |
|---|---|---|
| 1 | Domain overlap | Extend grievance_tickets (90% overlap), add `requirement_requests` (NEW), do NOT touch `service_requests` (separate domain — verified via 9 prod row sample), do NOT touch `bug_reports` (developer SDK) |
| 2 | Migration story | Phase 1 export → Phase 2 import with `migrated_from_subdomain=true` + `legacy_external_id` → Phase 3 301-redirect → Phase 4 (gated) shutdown |
| 3 | Audience matrix | 11 personas; `RaisedByType` enum extended with `'faculty'`/`'admin'`; ICC member is custom_role |
| 4 | SSO transition | Subdomain users routed to login.jkkn.ac.in; banners only (no email per R4.4); old session cookies expire |
| 5 | Tagging / categorization | Per-institution categories overridable (`institution_id IS NULL` = platform-wide); 5 platform-wide seed categories |
| 6 | Notification policy | All routes via `notification_generator_config` (Wave B.1 substrate) with `key` prefix `issue.*` |
| 7 | SLA semantics | Reuse `fn_business_day_sla_deadline` from PR #389; per-category SLA hours in `issue_sla_config` |
| 8 | Attachment / screenshot | Supabase storage bucket `issues/attachments/`; 5 files × 10MB; MIME whitelist (images, PDF, audio for ICC voice); per-category required (R1.1) |
| 9 | Audit log | Existing `grievance_history` (7 cols); clone for `requirement_history` |
| 10 | RLS | Institution-scoped + role-tier overrides + ICC gate (R1.3) |
| 11 | Anonymous filing trust | `is_anonymous=true` + `anonymous_token` (single-display + browser-storage); `/track/<token>` route per R1.2; per-IP rate-limit via `platform_policies` |
| 12 | ICC handoff | `is_icc_only` set at filing time; super_admin can break-glass with audit log row (R1.3) |
| 13 | Requirement state machine | Voting window expires → if quorum met → `voting_closed` → eligible for approval; if quorum not met → `withdrawn` (auto); 10% quorum default via `platform_policies` |
| 14 | Voting eligibility | Default same-institution + parents-on-learner-categories; per-category overrides via `requirement_voting_config` (R2.4 default) |

---

## DDL Plan — 3 Phases (substrate-first wave-program)

### Phase B.1 — Substrate (~800 LOC SQL, ~400 LOC TS)

```sql
-- Additive migration — zero behavior change to existing /accreditation/naac/grievance
ALTER TABLE public.grievance_tickets
  ADD COLUMN issue_type text NOT NULL DEFAULT 'grievance'
    CHECK (issue_type IN ('grievance', 'requirement_link')),
  ADD COLUMN requirement_id uuid REFERENCES public.requirement_requests(id),
  ADD COLUMN migrated_from_subdomain boolean NOT NULL DEFAULT false,
  ADD COLUMN legacy_external_id text;

ALTER TYPE public.raised_by_type_enum ADD VALUE IF NOT EXISTS 'faculty';
ALTER TYPE public.raised_by_type_enum ADD VALUE IF NOT EXISTS 'admin';

ALTER TABLE public.grievance_categories
  ADD COLUMN allow_anonymous boolean NOT NULL DEFAULT true;

CREATE TABLE public.requirement_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),  -- pgcrypto in extensions schema per memory
  request_number varchar NOT NULL UNIQUE,  -- REQ-2026-001
  category_id uuid NOT NULL REFERENCES public.requirement_categories(id),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  subject varchar NOT NULL,
  description text NOT NULL,
  estimated_budget numeric(12,2),
  raised_by_type raised_by_type_enum NOT NULL,
  raised_by_id uuid REFERENCES auth.users(id),
  raised_by_name varchar,
  status requirement_status NOT NULL DEFAULT 'submitted',
  voting_opens_at timestamptz,
  voting_closes_at timestamptz,
  vote_count_yes int NOT NULL DEFAULT 0,
  vote_count_no int NOT NULL DEFAULT 0,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  budgeted_amount numeric(12,2),
  budgeted_at timestamptz,
  budgeted_by uuid REFERENCES auth.users(id),
  fulfilled_at timestamptz,
  rejection_reason text,
  approval_chain jsonb,  -- snapshot at apply-time per leave-service.ts pattern
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.requirement_categories (LIKE public.grievance_categories INCLUDING ALL);
CREATE TABLE public.requirement_history (LIKE public.grievance_history INCLUDING ALL);

CREATE TABLE public.requirement_votes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES public.requirement_requests(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id),
  vote text NOT NULL CHECK (vote IN ('yes', 'no')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(requirement_id, voter_id)
);

-- Config tables (extend existing patterns)
CREATE TABLE public.issue_sla_config (LIKE public.hostel_maintenance_sla_config INCLUDING ALL);
CREATE TABLE public.requirement_approval_thresholds (LIKE public.approval_authority_config INCLUDING DEFAULTS);
ALTER TABLE public.requirement_approval_thresholds
  ADD COLUMN min_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN max_amount numeric(12,2);
CREATE TABLE public.requirement_voting_config (LIKE public.referral_category_eligibility INCLUDING ALL);
CREATE TABLE public.issue_escalation_rules (LIKE public.counselor_routing_config INCLUDING ALL);

-- RLS — ICC clause
DROP POLICY IF EXISTS "grievance_tickets_select" ON public.grievance_tickets;
CREATE POLICY "grievance_tickets_select" ON public.grievance_tickets
  FOR SELECT USING (
    (is_icc_only = false AND role_has_institution_access(institution_id))
    OR has_role('icc_member')
    OR is_super_admin()
  );
-- Similar for INSERT/UPDATE/DELETE

-- Seed defaults (super_admin-editable via UI)
INSERT INTO public.requirement_approval_thresholds
  (institution_id, approval_authority, min_amount, max_amount, escalate_after_days, fallback_role, is_active)
VALUES
  (NULL, 'hod',         0,     10000, 7,  'principal', true),
  (NULL, 'principal',   10001, 50000, 10, 'super_admin', true),
  (NULL, 'super_admin', 50001, NULL,  14, 'super_admin', true);

INSERT INTO public.platform_policies (key, value, description) VALUES
  ('issues.requirement.voting_window_days.default', '14', 'Default voting window'),
  ('issues.requirement.voting_quorum_pct', '0.10', 'Min % of eligible voters needed'),
  ('issues.anonymous_track.rate_limit_per_hour', '60', '/track/<token> rate limit per IP'),
  ('issues.attachment.max_files', '5', 'Max files per ticket'),
  ('issues.attachment.max_size_mb', '10', 'Max MB per file');

-- Reuse SLA function from PR #389 (no new fn needed)
-- Rename notification generator
UPDATE public.notification_generator_config
SET generator_name = 'unresolved_issue',
    config = jsonb_set(config, '{issue_type_filter}', '["grievance", "requirement_link"]'::jsonb)
WHERE generator_name = 'unresolved_grievance';
-- Rename PL/pgSQL fn correspondingly: fn_generate_unresolved_grievance_items → fn_generate_unresolved_issue_items
```

### Phase B.2 — Routes (~900 LOC TS, ~50 LOC SQL)

- `/issues` (landing dashboard with tabs: My Issues / All / Requirements / Browse)
- `/issues/grievances/[id]`, `/issues/grievances/new` (RHF + Zod, attachment UI)
- `/issues/requirements/[id]` (with voting card), `/issues/requirements/new`, `/issues/requirements/[id]/vote` (POST endpoint)
- `/track/[token]` public unauth (middleware exception)
- `lib/sidebarMenuLink.ts`: add `issues.access`
- `lib/constants/permissions.ts`: add Issues category
- Soft-deprecate `/accreditation/naac/grievance/*` → redirect to `/issues/grievances`

### Phase B.3 — Admin + Migration (~600 LOC TS, ~200 LOC scripts)

- `/admin/issues/categories|sla-config|escalation-rules|voting-config|approval-thresholds` (uses extracted CrudMaster from B.0)
- `/api/b2a/issues/*` (3 routes), `/api/b2a/requirements/*` (3 routes)
- `scripts/migrate-instasolver-subdomain.ts` (one-shot data import)
- Soft-delete `applications` row for Insta Solver tile
- nginx redirect config for subdomain
- B2A endpoint registration in `app/(routes)/application-hub/api-guidelines/b2a/_data/b2a-endpoints.ts`

---

## Migration Plan — `instasolver.jkkn.ac.in` → MyJKKN `/issues`

| Step | Action | Owner | Verification |
|---|---|---|---|
| M1 | Export Insta Solver data via subdomain admin panel/DB → JSON | Boobalan (Open Q4) | Row count matches subdomain dashboard |
| M2 | Map fields: subdomain schema → `grievance_tickets` columns | Spec | Column-by-column mapping |
| M3 | Run `scripts/migrate-instasolver-subdomain.ts` | Engineering | Sample 10 rows verified manually |
| M4 | Set `migrated_from_subdomain=true` + `legacy_external_id=<old_id>` | Script | Count query |
| M5 | Subdomain → 301 redirect to `/issues/grievances?legacy_id=<old_id>` | DevOps (DNS team) | curl test |
| M6 | In-app banner on subdomain pre-redirect + /issues home welcome banner | Engineering | Browser test |
| M7 | Subdomain stays redirect-only for 90 days | DevOps | Day-90: check metric |
| M8 (gated) | Subdomain shutdown if metric ≥6/8; else stay alive per kill criterion | Director call | Verdict event in Locked-Initiatives.md |

---

## Outcome Metric Verdict — Day-90 Protocol (2026-08-04)

| `hit_count` | Verdict | Action |
|---|---|---|
| ≥ 6 | **HIT** | Mark verdict in Locked-Initiatives.md. Subdomain shutdown approved. Lock retired or extended for new metric (e.g., resolution-latency). |
| 4–5 | **PARTIAL** | Discuss with Director: extend, re-lock, or accept. |
| ≤ 3 | **MISS-narrow** | Pre-committed kill: narrow audience to 3 adopting institutions OR pivot to integration-only mirror. NO third extension. |

---

## Mandatory Chain Gates Status

| Gate | Status | Notes |
|---|---|---|
| Production-code-sweep | ✅ DONE | Surfaced grievance_tickets overlap (1st save) + service_requests false-overlap (2nd save) |
| Q0 outcome-metric lock | ✅ DONE | `institutions_with_min_5_tickets` |
| /lock-initiative cross-domain registry | ✅ DONE | Registered in JKKNKB Locked-Initiatives.md |
| Persona-design | ✅ DONE | 11 personas; 3 open questions |
| Q1 value-list check | ✅ DONE | All classified |
| Q2 UI-twin sweep | ✅ DONE | 3rd-copy violation flagged → PR-shared-crud-master precursor required |
| Q3 config-table check | ✅ DONE | All tunables classified Pattern A vs Pattern B |
| /assumption-thrash | ✅ DONE | 14 categories answered |
| /interviewcodebase 4-round interview | ✅ DONE | 16 questions answered (R1-R4); see specs/instasolver-core-module-spec.md |
| four-test discipline | ✅ DONE | All 4 pass (Colgate / Hyatt / Juicero / RXBAR) |
| Build-depth-gate Step 0 (env safety) | ⏳ PENDING | Run before B.1 DDL: verify `.env.local` not on prod |
| Build-depth-gate Step -1 (audit main build) | ⏳ PENDING | Run before any deploy hook fires |
| persona-design SKILL invocation | ⏸ DEFERRED | Inline analysis sufficient for spec |

---

## Open Questions (resolve before B.1 DDL)

1. **8 vs 9 institutions for the metric.** INSTITUTIONS const has 9 (8 colleges + Nattraja Vidhyalya school). Spec uses "8 colleges". Confirm or adjust threshold.
2. **`class_rep` / `student_council` triage authority** — allowed to triage peer issues, or filer-only?
3. **Parents filing Requirements** — allowed (cafeteria/transport) or grievance-only?
4. **Subdomain ownership transfer** — Boobalan listed as support contact. Confirm DB-export access for M1.
5. **NAAC continuity** — confirm no broken NAAC report queries (likely safe per agent finding: trigger-driven `quality_evidence_mappings`, no URL refs).
6. **MCP tool consumers** — does any external consumer currently call the misnamed `myjkkn_query_grievance`? If yes, deprecated-alias retention window required.

---

## Wave Build Plan — 4 PRs

| Wave | PR | Scope | LOC | Blocks |
|---|---|---|---|---|
| **B.0** (Q2 precursor) | PR-shared-crud-master | Extract `components/shared/crud-master/` from leaves twins | -150 net | Q2 violation if skipped |
| **B.1** (substrate) | PR-instasolver-substrate | Additive migrations, RLS, services, types, MCP fix | +800 SQL, +400 TS | Open Q1+2+3 |
| **B.2** (routes) | PR-instasolver-routes | `/issues/*` + `/track/<token>` + sidebar wiring + soft-deprecate NAAC route | +900 TS, +50 SQL | B.1 |
| **B.3** (admin + cutover) | PR-instasolver-admin-cutover | `/admin/issues/*` config UI, B2A endpoints, migration script, subdomain redirect | +600 TS, +200 scripts | B.2, Open Q4 |

**Concurrency cap:** ≤3 simultaneous agents (per memory). B.0 must merge before B.1+B.2+B.3 fan out.

---

## Next Command

```
→ Next: commit + open draft PR for both spec docs (this + specs/instasolver-core-module-spec.md)
       OR
→ Next: /myjkkn-module reading both specs → produce B.1 DDL migration files
```

---

*Generated 2026-05-04 via /myjkkn-chain · Q0 → /assumption-thrash → Q1/Q2/Q3 → persona matrix → DDL plan*
*Updated 2026-05-04 via /interviewcodebase · 4-round interview → companion spec at specs/instasolver-core-module-spec.md*
*Recovered 2026-05-04 from session context after branch-drift loss*

---

## Final Interview Locks (2026-05-04 15:48 IST)

All 6 open Director questions resolved via final interview round. **Three locks change vs the original spec; three confirm what was already documented.**

### Q1 — Metric universe REVISED ⚠️

**Original lock (06:33 IST):** 8 colleges, threshold ≥6/8 by 2026-08-04.

**Revised lock (15:48 IST):** 10 institutions (8 colleges + 2 schools), threshold **≥7/10** by 2026-08-04.

Director redirected to live `/organizations/institutions` as source of truth. DB query revealed 13 active rows; the right scope is `entity_type='institution' AND category IN ('ug_pg','pg','ug')` filtered to exclude `JKKN Testing Institution` (test row), `JKKN Main Office` (`entity_type='admin_office'`), and `Jicate Solutions` (`entity_type='company'`). Result: **10 student-serving institutions** — the 8 colleges + JKKN Matric Higher Secondary School + Nattraja Vidhyalya CBSE.

**Updated metric query:**
```sql
SELECT count(*) FILTER (WHERE n>=5) AS hit_count
FROM (
  SELECT gt.institution_id, count(*) AS n
  FROM public.grievance_tickets gt
  JOIN public.institutions inst ON inst.id = gt.institution_id
  WHERE gt.created_at >= '2026-05-04'
    AND inst.entity_type = 'institution'
    AND inst.category IN ('ug_pg', 'pg', 'ug')
    AND inst.name <> 'JKKN Testing Institution'
    AND COALESCE(inst.is_active, true) = true
  GROUP BY gt.institution_id
) sub;
```

Per memory `feedback_implementation_pivot_vs_verdict_semantics.md` — this IS a metric/threshold change, requires REVISED entry in `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md` Verdicted table + new Active row. NOT a silent edit.

**Verdict-date unchanged:** 2026-08-04.

### Q2 — class_rep / student_council triage authority

**Locked: Filer-only.** No special triage powers in v1. Class reps file like other learners; triage is staff/faculty/HOD/super_admin only. Existing RLS default — no schema change needed. Re-evaluate at 90-day verdict if HODs request peer-triage delegation.

### Q3 — Parents filing Requirements

**Locked: Allowed for transport / hostel / cafeteria / safety / fee-policy categories only.** Parents can file Requirements that affect their child's daily experience. NOT allowed for academic/curriculum (faculty domain) or faculty-recruitment (admin domain). Enforced at the UI/service layer (B.2 work) via category-level whitelist; no DDL change. The category whitelist itself lives as a config row (Pattern A) at `platform_policies` key `issues.requirement.parent_allowed_categories`.

### Q4 — Subdomain ownership / DB-export

**Confirmed: Boobalan (boobalan.a@jkkn.ac.in / 8760083627) has full DB access.** M1 migration step assignee unchanged. Spec stays as written.

### Q5 — NAAC reporting continuity

**Confirmed: Ship without separate NAAC review.** Agent analysis confirmed `/accreditation/naac/grievance` redirect is safe — `default_naac_metric_code` flows to `quality_evidence_mappings` via DB trigger on resolution, not via URL/page-route. Document the analysis in PR #696 body so NAAC team can audit later if they ask. No feature flag needed.

### Q6 — MCP tool external consumers

**Confirmed: No external consumers.** Clean swap, no deprecated alias needed. PR #699 ships as-is.

---

## What's NOT impacted by these locks

- **PR #697 (SQL substrate)** — DDL stays. Metric query is read-only on day-90, not embedded in schema.
- **PR #698 (TS services)** — Q2 (class_rep filer-only) is the existing RLS default; no service-layer change.
- **PR #699 (MCP fix)** — Q6 (clean swap) is exactly what #699 ships.

## What's impacted

- **This file (docs/INSTASOLVER-MODULE-SPEC.md)** — Q0 metric block at top is now stale; this Final Locks section is the canonical reading.
- **`~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md`** — REVISED row in Verdicted + new Active row (per /lock-initiative discipline).
- **B.2 wave** — `/issues/requirements/new` form needs the parent-category whitelist enforcement; super_admin UI at `/admin/issues/parent-allowed-categories` writes the `platform_policies` row.

*Final lockset captured 2026-05-04 15:48 IST · all 6 Director questions resolved · B.2 wave unblocked.*
