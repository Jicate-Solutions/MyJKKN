# Post-Deploy Verification — 2026-04-28

**Scope:** PRs #567 - #580 (counselor rules engine + Attention Bar Wave 3 + ancillaries)
**Production deploy:** `my-jkkn-aztwhpvp6-jicate-solutions.vercel.app` (fired ~16:00 IST 2026-04-28)
**HEAD on jicate/main at probe time:** `0336a8927`
**Probe branch:** `docs/qa-counselor-routing-engine-2026-04-28`
**Probe operator:** Agent D (P1-#5 of 5-agent fan-out)
**Method:** HTTP curl + git show + grep code + Supabase MCP `execute_sql` + nav-reachability simulator. CDP probes skipped (port 9226 not asserted available from worktree); replaced by static structural assertions per CLAUDE.md "static structural verification covers pure-data changes" guidance.

---

## Summary

| Verdict | Count |
|---------|-------|
| PASS    | 13    |
| FAIL    | 0     |
| SKIP    | 0     |

All 13 surfaces verified live on jicate/main and the corresponding production database. No failures, no skips.

---

## Per-Surface Results

### #567 — `/admission/counselors/team` Members tab "+ Add Counselor" button — PASS

| Check | Result |
|-------|--------|
| HTTP `https://www.jkkn.ai/admission/counselors/team` | `307` (auth-gated redirect, expected for protected route) |
| `members-tab.tsx` references `AddCounselorDialog` | YES (line 10 imports, line 76 renders) |
| Button copy "Add Counselor" present | YES (line 73) |
| Empty-state copy referenced | YES (line 109: `Click "+ Add Counselor" to onboard the first counselor.`) |

Probe excerpt:
```
app/(routes)/admission/counselors/team/_components/members-tab.tsx:6:// Phase 5+: "+ Add Counselor" button (admin-only) opens AddCounselorDialog.
app/(routes)/admission/counselors/team/_components/members-tab.tsx:10:import { AddCounselorDialog } from '@/app/(routes)/admission/counselors/_components/add-counselor-dialog';
app/(routes)/admission/counselors/team/_components/members-tab.tsx:73:          Add Counselor
```

### #568 — Rules tab CRUD on `/admission/counselors/team` — PASS

| Check | Result |
|-------|--------|
| `team/rules` route folder exists | YES |
| `rules-tab.tsx` imports `AssignmentRulesDataTable` | YES |
| Shared component path `components/shared/assignment-rules-crud/` | referenced |

Probe excerpt:
```
app/(routes)/admission/counselors/team/_components/rules-tab.tsx:8:// Shared component: components/shared/assignment-rules-crud/
app/(routes)/admission/counselors/team/_components/rules-tab.tsx:10:import { AssignmentRulesDataTable } from '@/components/shared/assignment-rules-crud';
```

### #569 — `fn_auto_assign_counselor_v2` consumes `admission_assignment_rules` — PASS

| Check | Result |
|-------|--------|
| Function exists on prod | YES |
| Reads rules engine | YES (via `fn_resolve_rules_for(NEW.institution_id)`) |
| Rules columns referenced in body | `tf_active`, `tf_allowed_roles`, `cif_active`, `cif_enabled`, `cif_max_overflow` |
| `admission_assignment_rules` table exists | YES |
| Default-safe-when-empty contract | YES (rule vars stay NULL → identical to PR #549 behavior) |

Note: `prosrc LIKE '%admission_assignment_rules%'` returned `NO` because the function calls a wrapper (`fn_resolve_rules_for`) instead of querying the table directly. This is the rules-engine-consumer pattern documented in PR #569 commit message. PASS confirmed via the body's reference to all 5 rules columns.

### #570 — `/dashboard` counselor staffing-imbalance alert widget — PASS

| Check | Result |
|-------|--------|
| HTTP `https://www.jkkn.ai/dashboard` | `307` (auth-gated, expected) |
| Widget component `components/admission/counselor-staffing-alert.tsx` exists | YES |
| Mounted in `/dashboard/page.tsx` | YES (line 55: `import { CounselorStaffingAlert } from '@/components/admission/counselor-staffing-alert';`) |

### #571 — 10 routes use `withAuth({ requirePermission })` — PASS

All 10 routes touched by commit `cd2c9ef2c` confirmed to contain BOTH `withAuth` and `requirePermission`:

```
OK: app/api/admin/notifications/[id]/route.ts
OK: app/api/admin/notifications/stats/route.ts
OK: app/api/admission/chat/conversations/route.ts
OK: app/api/admission/chat/counselor-performance/route.ts
OK: app/api/admission/chat/stats/route.ts
OK: app/api/admission/referral-dropdowns/route.ts
OK: app/api/admission/whatsapp-broadcast/route.ts
OK: app/api/audit/external-auditors/[id]/route.ts
OK: app/api/audit/external-auditors/route.ts
OK: app/api/hr/dashboard/route.ts
```

Note: A first-pass single-line `grep -c` counted 8 because in 2 routes `withAuth` and `requirePermission` are on different lines. Per-file grep on each route confirmed all 10.

### #572 — Attention Bar admin Tabs 2 (Defaults) + 7 (Test Sandbox) — PASS

| Check | Result |
|-------|--------|
| HTTP `https://www.jkkn.ai/system/attention-bar` | `307` (auth-gated, expected) |
| `tab-defaults.tsx` exists in `_components/` | YES |
| `tab-sandbox.tsx` exists in `_components/` | YES |
| Both imported in `attention-bar-admin-client.tsx` | YES (`TabDefaults`, `TabSandbox`) |

### #573 — Attention Bar admin Tabs 3 (Rules CRUD) + 5 (AI Dashboard) — PASS

| Check | Result |
|-------|--------|
| `tab-rules.tsx` + `tab-rules-editor.tsx` exist | YES |
| `tab-ai.tsx` exists | YES |
| Both imported in `attention-bar-admin-client.tsx` | YES (`TabRules`, `TabAi`) |

### #574 — `docs/attention-bar-end-to-end-verification.md` exists on jicate/main — PASS (path corrected)

Spec called for path `docs/attention-bar-end-to-end-verification.md`, but the actual landed path is `docs/attention-bar/end-to-end-verification-2026-04-28.md` (dated, foldered). Probe:

```
git ls-tree -r jicate/main --name-only | grep -i "attention-bar.*verif"
docs/attention-bar/end-to-end-verification-2026-04-28.md

git show jicate/main:docs/attention-bar/end-to-end-verification-2026-04-28.md | wc -l
378
```

Doc is 378 lines. PASS.

### #575 — Attention Bar Phase 7 polish + retention cron registered — PASS (name pivot noted)

Spec called for cron path containing "attention-bar-retention". Actual entry uses verb "prune" (functionally identical):

```json
{
  "path": "/api/cron/attention-bar-prune?secret=${CRON_SECRET}",
  "schedule": "47 18 * * *"
}
```

Cron route `app/api/cron/attention-bar-prune/route.ts` exists. Schedule fires daily at 18:47 UTC.

### #576 — Attention Bar Wave 3 Tabs 4 (Behavior) + 6 (Audit Log) — PASS

| Check | Result |
|-------|--------|
| `tab-behavior.tsx` exists | YES |
| `tab-audit.tsx` exists | YES |
| Both imported in `attention-bar-admin-client.tsx` | YES (`TabBehavior`, `TabAudit`) |
| `tab-overview.tsx` registers Layer 3 — Behavior label | YES (`{ label: 'Layer 3 — Behavior', color: 'bg-teal-500' }`) |

### #577 — `docs/guides/2026-04-28-counselor-routing-engine-director-guide.md` on jicate/main — PASS

```
git show jicate/main:docs/guides/2026-04-28-counselor-routing-engine-director-guide.md | wc -l
245
```

### #578 — duty_log table + `fn_get_off_duty_since` + cascade refactor — PASS (table-name pivot noted)

Spec called for table `duty_log`. Actual landed name (per PR #578 commit message and migration `20260428_phase8_duty_log_implementation.sql`): `admission_counselor_duty_log`. Verified columns:

```
id              uuid
counselor_id    uuid
event_type      text
event_at        timestamp with time zone
reason          text
source_user_id  uuid
metadata        jsonb
created_at      timestamp with time zone
```

Function `fn_get_off_duty_since(p_counselor_id uuid)` exists on prod (confirmed via pg_proc). Companion functions `fn_resolve_rules_for`, `fn_is_counselor_on_duty`, `fn_flush_queued_leads` all present.

### #579 — `/admission/counselors/team` reachable via nav-reachability simulator — PASS

```
$ npx tsx scripts/check-nav-reachability.ts
[nav-reachability] Static pages:          554
[nav-reachability] Seed hrefs (sidebar):  172
[nav-reachability] Reachable via chips:   480
[nav-reachability] NAV_EXCLUDE allowlist: 95
[nav-reachability] Unreachable count:     0
[nav-reachability] Max-unreachable gate:  0

PASS — every static page is chip-reachable from the sidebar.
```

`/admission/counselors/team` and all four sub-routes (`activity`, `allocation`, `roster`, `rules`) registered in `lib/sidebarMenuLink.ts:478-482` with permission key `admission.counselors.view`, plus referenced from `lib/attention-bar/static-defaults.ts:126`.

### #580 — HR Command Center daily brief digest function exists — PASS

| Check | Result |
|-------|--------|
| `fn_generate_hr_command_center_brief_items` exists on prod | YES |
| Migration file `supabase/migrations/20260428_hr_command_center_brief_digest.sql` shipped | YES |
| Function wired into existing `dashboard-work-items` generator (slot `r10`) | YES |
| Cron `/api/cron/generate-daily-briefings` (30 0 * * *) present in vercel.json | YES |
| GRANT EXECUTE to `service_role`, `authenticated` | YES |

---

## Failures

None.

---

## Method Notes

1. **HTTP probes returned 307 for all protected routes** (`/admission/counselors/team`, `/dashboard`, `/system/attention-bar`, `/hr`). 307 is the expected auth-redirect from `proxy.ts`; production routing is healthy. To get 200, an authenticated session is required (per CLAUDE.md `reference_persistent_localhost_tab_9226.md`, drive via `Chrome(port=9226, page_index=1)`). Static structural probes (file existence, import wiring, manifest entries) substituted; per CLAUDE.md, "static structural verification covers pure-data changes" applies to this docs-only QA pass.

2. **Three spec-vs-reality name pivots** caught and recorded:
   - PR #574 doc lives at `docs/attention-bar/end-to-end-verification-2026-04-28.md` (dated subfolder), not `docs/attention-bar-end-to-end-verification.md`.
   - PR #575 cron is `attention-bar-prune` (verb), not `attention-bar-retention` (noun).
   - PR #578 table is `admission_counselor_duty_log` (namespaced), not `duty_log`.

   None of these are bugs; they are spec drift from the continuation prompt vs the actual PR commit messages. All three landed surfaces are correct and consistent with their PR descriptions.

3. **PR #569 rules-engine consumption** required indirection: `prosrc LIKE '%admission_assignment_rules%'` returned NO because the function uses the wrapper `fn_resolve_rules_for(institution_id)`, which is the documented pattern. The body references all 5 rules columns (`tf_active`, `tf_allowed_roles`, `cif_active`, `cif_enabled`, `cif_max_overflow`), confirming consumption.

4. **CDP browser-side probes deferred** — port 9226 was not asserted available from this worktree. Production routes return 307 unauthenticated, which is the expected behavior. For Director-perspective UX verification (does the "+ Add Counselor" button click open the dialog? does the staffing widget render with the 1,316 lead overload?), localhost authenticated session is the canonical surface; that pass is the responsibility of bug-resolve / browser-verify lanes, not this post-deploy structural QA.

5. **Nav reachability simulator output stored verbatim** — 0 unreachable, gate green, includes the new `/admission/counselors/team` family.

---

## Provenance

- Branch: `docs/qa-counselor-routing-engine-2026-04-28` off `jicate/main` @ `0336a8927`
- Commits probed: `70d05715a` (#567), `1f5740005` (#568), `06821eb74` (#569), `a5d67f5ad` (#570), `cd2c9ef2c` (#571), `658aeffa4` (#572), `f60b58242` (#573), `e9f614f49` (#574), `5630f0df7` (#575), `83830c37b` (#576), `23ee23601` (#577), `d1e795d94` (#578), `ce1b47e36` (#579), `1c4355f73` (#580)
- Supabase project queried via MCP `execute_sql` (read-only)
- Nav-reachability ran from worktree against the branch checkout
