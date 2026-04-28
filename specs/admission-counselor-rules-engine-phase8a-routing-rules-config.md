# Phase 8a-Full Spec: Routing Rules Engine UI Configuration

**Status:** DRAFT — awaiting Omm's sign-off
**Author:** Claude (per Omm's 2026-04-28 thrash session)
**Last updated:** 2026-04-28
**Parent spec:** [`specs/admission-counselor-rules-engine-spec.md`](./admission-counselor-rules-engine-spec.md) (PR #537)
**Sibling spec:** [`specs/admission-counselor-rules-engine-phase8.md`](./admission-counselor-rules-engine-phase8.md) (PR #559) — duty-log refinement

---

## Problem statement

PR #549 shipped `fn_auto_assign_counselor_v2` + `fn_cascade_off_duty_counselors` + `fn_flush_queued_leads` with **operational policy hardcoded as SQL constants**: 60-minute cascade threshold, 500-row queue-flush cap per cron run, fixed 3-tier rule order, no per-counselor cap on new assignments per run, and no taxonomy filter (any active row in `admission_counselors` is eligible). The cron over-firing diagnosis on 2026-04-28 surfaced that those constants no longer match production reality — 1,316 active leads piled onto `jeevavarshinis` at the institution-fan-in extreme, 11,894 leads sit across 6 orphan institutions with zero counselors mapped, and `test.faculty` (a `learner_counselor`-track user) is still pulled into the routing pool because the engine has no taxonomy gate.

Director needs to react in minutes, not in a code-review cycle. Today every change — bumping the cap, banning a taxonomy class from routing, enabling a cross-institution overflow valve, changing the cap-hit notification debounce — requires editing `supabase/migrations/20260428_routing_engine_v2_phase3.sql`, opening a PR, getting it merged, and waiting for the deploy. That is the wrong loop for operational decisions that change weekly.

Phase 8a-Full activates the dormant `admission_assignment_rules` table (CRUDable since Phase 2 at `/admission/settings/assignment-rules`, but never read by the engine) and upgrades the team-page Rules tab from read-only display to full CRUD. After this phase, Director changes routing semantics through the UI; no SQL touched.

---

## 9 Thrashed Decisions (locked 2026-04-28)

| #  | Decision                                  | Locked Value                                                                                                                                              |
| -- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 | Cap semantic                              | Max **NEW** assignments per counselor **per cron run** (not lifetime, not per-day; tied to single `fn_auto_assign_counselor_v2` invocation cycle).        |
| D2 | Pool taxonomy filter                      | Strict — only the `counselor` taxonomy is eligible. `learner_counselor`, `staff_counselor`, `health_counselor` are excluded by default rule.              |
| D3 | Path Y staffing                           | Onboard 4 `counselor`-role users (`coo`, `dhuraimurugan`, `gowrisankar`, `kandasamy`) into `admission_counselors` via Members-tab Add-Counselor flow.     |
| D4 | Cap value                                 | Configurable. Default = **10 / run**.                                                                                                                     |
| D5 | Orphan-institution fallback               | Tier-4 cross-institution fallback fires when zero counselors are mapped at the lead's `institution_id`. Toggleable rule, default OFF.                     |
| D6 | Cap-hit fail mode                         | Real-time work-item notification to Director per cap-hit (i.e., per institution where every eligible counselor is already at cap inside the same run).    |
| D7 | Notification debounce                     | 1 notification per institution per 24 hours (suppress fan-out spam during a single overload event).                                                       |
| D8 | `test.faculty`'s 3 existing leads         | Cascade to remaining counselor pool immediately (not via cron — one-off via `fn_cascade_off_duty_counselors` with `test.faculty` flagged off-duty).        |
| D9 | Reclassify `learner_counselor` users      | DEFERRED to UI — let Director do it via Role Management when needed, no migration ships in this phase.                                                    |

---

## Architectural directive (from user 2026-04-28)

> "all of the above should be in the ui to configure"

ALL operational decisions become CRUDable rule rows. **Zero hardcoded SQL constants for routing semantics. Zero new SQL migrations for operational config.** Rule-seeding goes through UI. Path Y onboarding goes through UI Add-Counselor flow. The only SQL that ships in this phase is the `fn_auto_assign_counselor_v2` rewrite to consume rules.

---

## Rule schema

`admission_assignment_rules` table already exists (Phase 2, `supabase/migrations/admission/002_core_tables.sql:255`). Columns: `id uuid`, `institution_id uuid` NOT NULL, `name varchar(255)`, `description text`, `priority int` (default 10), `is_active boolean` (default true), `criteria jsonb` (default `'[]'`), `action jsonb` (default `'{}'`), `created_at`, `updated_at`. RLS already enabled. **No DDL change required** — only a non-NULL `institution_id` patch decision (see Risks).

### Rule type taxonomy (5 types via `action.type` discriminator)

| Type                         | Action JSON shape                                                                                                  | Purpose                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `cap_per_run`                | `{type:"cap_per_run", value: int, scope: "counselor" \| "institution"}`                                            | Max NEW assignments per cron run.                                    |
| `taxonomy_filter`            | `{type:"taxonomy_filter", allowed_roles: ["counselor","learner_counselor",...]}`                                   | Routing pool taxonomy gate.                                          |
| `cross_institution_fallback` | `{type:"cross_institution_fallback", enabled: bool, max_overflow_per_run: int}`                                    | Tier-4 fallback toggle.                                              |
| `notification`               | `{type:"notification", trigger: "cap_hit" \| "queue_long" \| "no_counselor", debounce_minutes: int, recipient_role: "super_admin"}` | Cap-hit + queue-overflow + orphan-inst alerts.            |
| `cascade_threshold`          | `{type:"cascade_threshold", minutes: int}`                                                                         | Currently 60 min hardcoded; expose as rule.                          |

### Criteria JSON shape (rule applicability)

```json
{
  "applies_to": "all" | "specific_institution" | "specific_counselor",
  "institution_id": "uuid (when specific_institution)",
  "counselor_id": "uuid (when specific_counselor)"
}
```

### Rule precedence

- Higher `priority` wins.
- Per-counselor specific rule overrides per-institution rule overrides system-wide (`applies_to:"all"`) rule.
- `is_active=false` rules are ignored.
- For multiple active rules of the **same type** at the **same scope**, the highest-priority row wins (others are shadowed; UI surfaces this as "shadowed by rule X").

---

## `fn_auto_assign_counselor_v2` changes

### Default-safe-when-empty

If `SELECT * FROM admission_assignment_rules WHERE is_active=true` returns 0 rows → preserve current PR #549 hardcoded behavior (zero behavior change). As Director adds rules via UI, those rules organically replace the hardcoded constants. **No breaking transition.** This is the keystone safety property of the migration.

### Rule consumption order

1. Apply `taxonomy_filter` rule → narrow counselor pool by joining `custom_roles.role_key`.
2. Apply `cap_per_run` rule → check counselor's current run-tally.
3. Run 3-tier query (existing PR #549 logic, unchanged).
4. If empty AND `cross_institution_fallback.enabled=true` → run Tier-4 query (any active counselor, any institution), capped by `max_overflow_per_run`.
5. On lead assignment, increment counselor's `current_run_assignments` counter (Option A — see below).
6. On cap hit → enqueue notification per `notification` rule debounce window (`fn_emit_cap_hit_notification` writes a row to `dashboard_work_items`).

### `current_run_assignments` tracking

- **Option A (recommended):** ephemeral in-cron-call counter — a `LOCAL TEMP TABLE` populated at start of `fn_flush_queued_leads`, kept for the txn lifetime. Zero schema. Simplest. Loses count if cron restarts mid-run but the cron itself is bounded by the 500-lead cap so the blast radius is small.
- **Option B:** per-counselor counter column on `admission_counselors` with cron-run UUID; auditable, but adds 1 write per assignment and a backfill story.

**Spec recommends Option A.** Flag for sign-off.

### Trigger-path vs cron-path scope

The trigger path (`fn_auto_assign_counselor_v2` on BEFORE INSERT) and the two cron paths (`fn_cascade_off_duty_counselors`, `fn_flush_queued_leads`) all share the 3-tier query block. All three call sites must be refactored to consume rules. To keep the diff reviewable, the rule-evaluation logic is extracted into `fn_eligible_counselors_for(institution_id uuid, source text)` returning `TABLE(counselor_id uuid, tier int, open_load int)` — a single source of truth replacing 3 copy-pasted CTEs in PR #549. All 3 call sites then reduce to `SELECT counselor_id FROM fn_eligible_counselors_for(...) ORDER BY tier, open_load, RANDOM() LIMIT 1`.

### Rule cache & NOTIFY/LISTEN

The function reads rules at the start of each invocation. There is no in-memory cache. Rule changes via UI fire `NOTIFY admission_rules_changed` (via AFTER INSERT/UPDATE/DELETE trigger on `admission_assignment_rules`); cron workers don't subscribe, but the NOTIFY makes future cache-layer addition cheap if read overhead becomes a bottleneck (it won't, at MyJKKN's scale).

---

## UI surface mapping per `/admission/counselors/team` tab

| Tab            | Rule types managed                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Members**    | Use existing Add-Counselor flow for D3 Path Y onboarding (no rule-CRUD here, but a per-counselor `cap` override could surface as a column).     |
| **Roster**     | (no new rule types — schedule-based off-duty already in Phase 7).                                                                               |
| **Allocation** | `taxonomy_filter` rule + `cross_institution_fallback` toggle (single toggle UI; advanced rules edited in Rules tab).                            |
| **Rules**      | All 5 rule-type CRUD (full registry view + Create/Edit/Delete dialogs). Replaces the current read-only display + "Edit in Settings" link.       |
| **Activity**   | Add notification-history sub-tab showing `notification` rule firings + cap-hit events from the last 7 days.                                     |

---

## Discovery test (ships with PR-A)

Mirrors PR #549's verification matrix. After PR-A merges + UI-seeded rules, run on staging:

1. **Default-safe baseline** — empty `admission_assignment_rules` → fire 50 leads through `fn_auto_assign_counselor_v2` → assert routing rate matches PR #549 baseline (≥99% assigned).
2. **Cap enforcement** — seed `cap_per_run=2` for institution X → fire 10 leads at institution X in one cron run → assert exactly 2 counselors got 1 lead each, remaining 8 went to queue OR triggered Tier-4 if `cross_institution_fallback.enabled=true`.
3. **Taxonomy filter** — seed `taxonomy_filter=["counselor"]` → confirm `test.faculty` (a `learner_counselor`) receives zero new assignments even when otherwise least-loaded.
4. **Cap-hit notification** — fire 50 leads against a 2-counselor institution with `cap_per_run=10` → assert exactly 1 work-item lands in `dashboard_work_items` for Director (debounce window suppresses repeats).
5. **Tier-4 fallback** — point a lead at an orphan `institution_id` (zero counselors mapped) with `cross_institution_fallback.enabled=true` → assert assignment to the least-loaded counselor across the **entire** active pool.
6. **Default-safe regression** — turn `cross_institution_fallback.enabled=false` and disable taxonomy rule → behavior identical to step 1.

---

## Migration path (from hardcoded → rules-driven)

1. Ship A21 PR-C (Rules tab CRUD UI) — Director can edit but rules don't fire yet.
2. Ship A20 spec PR (this doc) — captures decisions.
3. Ship Phase 8a-Full PR-A (function rewrite to consume rules) — default-safe-when-empty.
4. Director seeds initial 5–7 rules via UI: `cap_per_run=10`, `taxonomy_filter=counselor-only`, `cross_institution_fallback=on`, `notification=director-debounced-24hr`, `cascade_threshold=60`.
5. Director onboards 4 Path Y users via Members-tab Add-Counselor flow (D3).
6. Routing engine starts consuming rules organically; hardcoded constants become unreachable code paths.
7. (Future cleanup PR) Strip the hardcoded constant fallback paths from `fn_auto_assign_counselor_v2` once rules are stable in prod for 30 days.

---

## UI design notes (Rules tab CRUD)

| UI element                     | Behavior                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Rule-type selector             | Drop-down with the 5 types (D-listed above); selecting a type renders the type-specific form (action JSON shape).                       |
| Scope selector                 | "All institutions" / "This institution" / "Specific counselor" radio; second/third option reveals a picker.                             |
| Priority slider                | 1–100, default 10. UI shows live "would shadow rule X" warning when current settings overlap with an existing higher-priority row.      |
| `is_active` toggle             | Inline on the row; flipping doesn't delete (preserves history).                                                                          |
| Effective-rule preview         | Right-hand panel: "for institution X, the effective rule for `cap_per_run` right now is **Rule #4 (priority 50, value 10)**."           |
| Validate-on-save               | Runs against current `admission_counselors` snapshot — flags "this taxonomy filter would empty the pool" / "cap=0 blocks all routing." |
| Activity sub-tab               | Last 7 days of rule-firings: "Rule #4 (cap_per_run=10) was hit 3 times for institution X on 2026-04-29."                                 |

The Rules tab replaces the existing read-only display at `app/(routes)/admission/counselors/team/_components/rules-tab.tsx` (123 LOC, currently links out to `/admission/settings/assignment-rules`). The existing settings page can stay as a power-user view or be deprecated in a future cleanup PR — out of scope here.

---

## Out of scope

- Multi-tenant rule sharing (each institution manages own rules; no cross-tenant inheritance).
- Rule version history (defer to audit log on `admission_assignment_rules`).
- Rule simulator / preview (would be Phase 8b).
- Bulk-import rules (defer).
- A/B testing of routing rules.
- Reclassification migration of existing `learner_counselor` users (D9 — UI handles it).

---

## Risks + Mitigations

| Risk                                                                                       | Mitigation                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Director creates contradictory rules (e.g., `taxonomy_filter` excludes all counselors).    | Add validator on Rules-tab Save: "this rule would empty the routing pool — confirm?" — runs the rule against current `admission_counselors` snapshot.    |
| Rule precedence conflicts                                                                  | Sort by priority DESC; show "effective rule" preview in UI (gray-out shadowed rows with hover-explanation).                                              |
| Function consumes stale rule cache                                                         | NOTIFY/LISTEN trigger on `admission_assignment_rules` → cron picks up changes within 1 cron run (15 min). No in-memory cache layer.                       |
| RLS on rules table                                                                         | Reuse existing pattern: `is_super_admin() OR is_admin() OR (user_has_permission('admission.counselors.rules.edit') AND role_has_institution_access(institution_id))`. |
| Empty rule pool → silent broken routing                                                    | Default-safe-when-empty fallback to PR #549 hardcoded behavior (this is the keystone safety).                                                            |
| `institution_id` is NOT NULL on the table — system-wide (`applies_to:"all"`) rules nowhere | Allow `institution_id = '00000000-0000-0000-0000-000000000000'` sentinel UUID for system-wide rules; UI hides this row from per-institution filters.     |
| `current_run_assignments` race in concurrent cron runs                                     | `pg_advisory_xact_lock(hashtext('counselor_routing'))` acquired at start of `fn_flush_queued_leads`; cron tickets queue rather than overlap.              |

---

## Sign-off checklist

- [ ] All 9 thrashed decisions match intent
- [ ] Rule schema covers all 5 types correctly
- [ ] Default-safe-when-empty pattern preserves current routing rate
- [ ] UI surface mapping is intuitive for Director
- [ ] Migration path doesn't break production at any step
- [ ] Option A vs Option B for `current_run_assignments` decided
- [ ] Sentinel-UUID approach for system-wide rules acceptable

---

## Out-of-scope: deploy fire / staffing escalation

The 1,316-lead overload on `jeevavarshinis` is a **STAFFING decision** being handled by Director out-of-band (per 2026-04-28 thrash). This spec doc doesn't address it — it provides the infrastructure so future overloads are config-fixable, not the immediate response to today's overload. The infrastructure landing here means the **next** overload (which will happen) is a 5-minute UI edit, not another spec doc.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
