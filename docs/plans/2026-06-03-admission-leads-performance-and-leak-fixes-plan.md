# Admission Leads — Performance & Cross-User Leak Fixes

**Date:** 2026-06-03
**Module:** `app/(routes)/admission/leads`, `app/api/admission/leads/*`, `lib/services/admission/*`, `hooks/admission/*`, RLS on `admission_leads` / `admission_lead_activities`
**Driver:** 4 user-reported bugs — (1) counselor sees others' leads on hard refresh → "Lead Not Found" on click, (2) slow comment/note save, (3) slow list/detail load & refresh, (4) poor overall UX/perf.

Diagnosis was done by a 10-agent read-only workflow (5 deep-dives + 5 adversarial verifiers). The verifiers corrected several first-pass overstatements; this plan reflects the **verified** picture.

## Confirmed decisions
- **Scope:** All 5 phases, shipped as staged PRs (check-in between phases).
- **Service-worker fix breadth:** all `/api/*` → `NetworkOnly` (not just admission) — the leak is latent in every module.
- **Comments fix:** server `SECURITY DEFINER` RPC + optimistic UI.
- **List count:** keep exact total, make it fast via composite indexes (not approximate/keyset).

## Verified root-cause summary
- **Bug 1 is application-layer, not data.** `assigned_counselor_id`/`counselor_id` are 100% consistent; no user maps to >1 counselor row. The leak is the **Serwist service worker** caching `/api/*` by URL only (no auth/Vary), serving a stale/foreign body on hard refresh when the slow list trips the 10s `networkTimeoutSeconds`; logout never purges Cache Storage. The detail route's per-row 404 is the *safety net* catching the leaked row.
- **Proven invariant:** a correctly-scoped strict-counselor list row can never 404 on detail ⇒ a 404 proves the list row came from cache, not the user's live scope.
- **Slow load is the serial prelude + count(\*), not the data query.** The paged data query is a ~2ms index walk; `count:'exact'` is the only full seq scan. The list/detail routes make ~8–10 sequential Supabase round-trips before data (incl. `user_roles` queried 3×).
- **Slow comments are dominated by the client round-trip + invalidate cycle**, not DB work: `createActivity` does 3 serial trips (auth.getUser + INSERT + a heavy RLS `admission_leads` UPDATE), no optimistic update, then a ~5–6 SELECT invalidation fan-out, plus a 2nd RLS UPDATE from the score write-on-read effect.
- **Client list bypasses React Query** (no cache/dedup/staleTime); refetches on `visibilitychange`, on an app-wide `admission-leads-changed` event, and per filter click. Detail page fires ~15+ requests on mount (dialog-only dropdown queries fire eagerly; their `enabled: x!==''` guard is a no-op because they're passed `undefined`), and all 5 Radix tabs render eagerly.
- **DB/RLS:** no index on `assigned_counselor_id` (unindexed FK; hurts cold-cache deep pages + count); `user_has_permission` is VOLATILE (should be STABLE) and `auth.uid()` is called bare; redundant duplicate permissive expo SELECT policy. **Correction:** `role_has_institution_access` per-row cost hits the *office/allowlist* path, not strict counselors (policy branch-5 subsumes the strict branch).
- **Security flag (needs decision):** `adm_leads_select`/`update` branch-5 is **ungated** — any authenticated user assigned to a lead can read/update it, bypassing the 2026-05-11 allowlist lockdown.

---

## Phase A — Stop the cross-user leak (Bug 1) · risk LOW · ships first
- **A1** `app/sw.ts`: change the generic `/api/.*` handler `NetworkFirst` → `NetworkOnly` (order before other rules preserved; `/api/auth/*` already NetworkOnly). Load-bearing fix — Serwist NetworkFirst ignores `Cache-Control`.
- **A2** `lib/api-helpers/no-store-response.ts` (new) + both leads routes: return all responses with `Cache-Control: private, no-store` + `Vary: Cookie` (defense-in-depth).
- **A3** `hooks/use-auth-provider.tsx`: `caches.delete('api-cache')` on `SIGNED_OUT` and on cross-user `SIGNED_IN` (guard `'caches' in window`; only `api-cache`, never precache/next-static — avoids the SW refresh-loop the pwa-provider warns about).
- *(A4 — unify list/detail visibility into one shared module — moved to Phase B to avoid double-touching the routes.)*

## Phase B — Collapse server round-trips + unify visibility (Bug 1 structural + Bug 3) · risk MED
- **B1** `fn_admission_lead_scope(p_user_id)` SECURITY DEFINER RPC → `{can_view, is_super, is_strict, is_global, my_counselor_id, institution_id}`; delegates to existing `_user_in_admission_lead_allowlist` / `_user_is_strict_counselor` helpers (single source of truth) and folds in the `profiles` read. ~9 hops → ~3 in both routes.
- **B2 (was A4)** `lib/api-helpers/admission-lead-visibility.ts` (new): `resolveLeadAccess()` + `applyLeadVisibility(query, access, {excludeReferral})` + `canSeeLead(access, row, {excludeReferral})`, shared by list + detail, differing only by `excludeReferral` (preserve BUG-003956: list `true`, detail `false`). Make the institution clamp **additive** (fixes latent L-3).
- **B3** Embed `program:programs!program_id(...)` (LEFT join) in the list select — drop the programs round-trip.
- **B4** `count:'exact'` kept but made sargable; switch list count to use the new composite indexes (B6).
- **B5** `lib/retry.ts`: add optional transient-only `shouldRetry` predicate; pass it from the scope/allowlist helpers; remove route×helper retry nesting.
- **B6** Composite indexes `idx_admission_leads_(assigned_counselor_id|counselor_id, created_at DESC, id)` built `CONCURRENTLY`; clears unindexed-FK advisor.
- **Guards:** keep allowlist (2026-05-11) + strict-counselor (2026-05-22 revert) semantics; keep detail's referral carve-out (BUG-003956); keep 416 page-clamp (BUG-003967) and `created_at`+`id` stable sort (BUG-004117..123).

## Phase C — Client refetch storms + hook fan-out (Bug 3/4) · risk MED
- **C1** Convert the list to React Query (`queryClient.fetchQuery` keyed on full params **incl. resolved counselor scope**) — list→detail→back becomes a cache hit. Keep `institution_id||undefined`, `?page` reset, 416 clamp, stable sort.
- **C2** Staleness-gate (or drop) `visibilitychange`; switch `admission-leads-changed` → `invalidateQueries`; debounce filter changes (~250–300ms; one batched URL update — feedback_searchparams_cascade_filter_multiple_replace_clobbers).
- **C3** Lazy-mount detail tabs via `?tab=`; gate dialog-only dropdown queries on `enabled: showXDialog`; defer non-Activity-tab data hooks (comm history, cascade, WA status). ~15+ on-mount requests → ~3–4.
- **C4** Fold consultant attributions into the list query (LEFT join); cache program-counts.

## Phase D — Make comments instant (Bug 2) · risk MED
- **D1** Optimistic `onMutate` for `createActivity` (rollback on error).
- **D2** `create_lead_activity(...)` SECURITY DEFINER RPC: INSERT + `last_activity_at`/`last_contact_at` bump + `created_by`/`auth.uid()` server-side in one hop (removes 2 of 3 trips + heavy RLS UPDATE). Preserve contact-type gate (last_contact_at only for call/email/meeting/sms/whatsapp).
- **D3** Drop dead `lead-timeline` invalidation; derive `useActivityStats` from the timeline cache; add `staleTime`; `setQueryData` to skip the immediate refetch.
- **D4** Remove score write-on-read: dirty-check guard now → move scoring to the activity/message-insert write path (trigger/RPC); detail READS `lead.score`. Keep `/admission/leads/work` Kanban + AI fields populated; keep 50/50 weighting + thresholds.
- **D5** Guard `update_counselor_current_leads` on `(counselor_id IS NOT DISTINCT FROM OLD AND funnel_stage IS NOT DISTINCT FROM OLD)` (NOT counselor_id-only).
- **D6** Composite index `admission_lead_activities(lead_id, created_at DESC)`.

## Phase E — DB/RLS hardening (lower urgency, higher blast radius) · risk MED–HIGH
- **E1** `user_has_permission` VOLATILE → STABLE + wrap `auth.uid()` as `(SELECT auth.uid())` in the 4 `admission_leads` policies + `adm_lead_activities_all`. Isolated migration + broad permission smoke test (super-admin / no-perm / multi-role).
- **E2** Drop redundant `leads_select_expo_team_member` SELECT policy (subsumed by `adm_leads_select`).
- **E3 (decision-gated)** `role_has_institution_access` → InitPlan-able `institution_id = ANY(<stable no-arg set>)` for the office path (must mirror semantics exactly — drift class in memory); and the **branch-5 ungated-owner security** question.

## Verification per phase
- `mcp__ide__getDiagnostics` on every touched file (strict mode off; build doesn't typecheck).
- `npm run check:*` gates when routes/permissions/menus change.
- DB changes: re-run `EXPLAIN (ANALYZE, BUFFERS)` and `get_advisors`; commit real migration bodies to `supabase/migrations/` + mirror `supabase/setup/` (no `SELECT 1;`).
- Exercise as a **non-super-admin counselor**: confirm leads render, comment saves instantly, hard-refresh shows only own leads, detail opens. There is no test suite — no "tests pass" claims.
