TASK: Merge two pending PRs, then build the TypeScript + service + hooks layers for the HR Recruitment Need Signal computation engine

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase project ref `kvizhngldtiuufknvehv` (production)
SPEC: specs/hr-recruitment-need-signal-2026-05-24.md

CURRENT STATE:
- PR #1069 (MERGED): Foundation substrate — 7 master tables + 2 ALTER TABLEs + 8 regulatory body seeds + RLS. 448 LOC SQL. Applied to prod.
- PR #1071 (OPEN, all CI green, MERGEABLE): Signal + operational tables — 7 tables (signal_inputs, signal_cache, signal_suppressions, escalations, user_visits, signal_snapshots, faculty_workload) + 11 platform_policies rows + storage bucket. 279 LOC SQL. Already applied to prod via Management API.
- PR #1072 (OPEN, all CI green, MERGEABLE): Signal computation RPC — orchestrator fn_compute_recruitment_signal + 7 input plugin functions (2 live: sanctioned_gap + SFR; 5 stubs). Custom type hr_signal_input_result. 461 LOC SQL. Already applied to prod via Management API. All 8 functions SECURITY DEFINER.
- Database substrate fully deployed to production (all 3 PRs' SQL applied). Code just needs merging into main.
- Spec is complete: 53 decisions locked across /myjkkn-module (38q) + /assumption-thrash (15q).

WHAT NEEDS TO HAPPEN:
1. Merge PR #1071 (one-click, Director approved — migrations already applied to prod)
2. Merge PR #1072 (one-click, same — migrations already applied to prod)
3. Pull latest main after merges
4. Build PR 4 — TypeScript types + service layer:
   - Types: `types/hr-recruitment-need.ts` — TypeScript interfaces matching the 7 tables from PRs #1069/#1071 + the `hr_signal_input_result` custom type + `hr_recruitment_signal_cache` row type
   - Service: `lib/services/hr/recruitment-need/signal-service.ts` — wraps the 8 RPCs via supabase.rpc() calls. Include methods for reading/writing signal_suppressions, signal_snapshots, and escalations.
5. Build PR 5 — React Query hooks:
   - `hooks/hr/recruitment-need/use-recruitment-signal.ts` — useQuery wrapping the orchestrator RPC with 1hr staleTime (Decision F1.3), force-refresh mutation, per-institution + per-program queries
   - Hooks for suppressions CRUD, escalation list, snapshot history
6. Build PR 6 — Start the `/hr/intelligence` route shell with tab navigation (HR Intelligence super-module container; Recruitment Need Signal is tab 1 of 15)

KEY DECISIONS (from this session):
- Architecture (AT.5): 1 orchestrator + 7 replaceable plugin functions. Each input function has signature `(p_institution_id uuid, p_program_id uuid DEFAULT NULL) RETURNS hr_signal_input_result`. TypeScript service must mirror this pattern.
- Signal shape (F1.1): Composite score 0-100 for sorting + per-input R/A/G for drill-down. Cache row includes both.
- Missing data (F1.2): Block entire signal row ("insufficient_data") until ALL 7 inputs available. 5 stubs currently return insufficient_data — this is expected.
- Freshness (F1.3): Compute-on-read + 1hr cache + force-refresh button. React Query staleTime=3600000.
- Composite weights (F1.6): Director-tunable via platform_policies rows (keys: `hr_recruitment.weight_<input_key>`). Default 14.29 each (100/7).
- Override (F1.9): Snooze N months with reason, stored in signal_suppressions table. UI must show suppressed signals distinctly.
- HR Intelligence super-module: Single route `/hr/intelligence` with tabbed sections. Recruitment Need Signal is tab 1 of 15 Tier A features.
- PM module: Separate initiative at `/pm` or `/projects` (Tier B, ~80 PRs). Spec not started. Do NOT mix with HR Intelligence.
- Director directive: "All should be app features, not templates" — no downloadable-template shortcut.
- All functions are SECURITY DEFINER with `SET search_path = public, extensions`.

MUST-READ FILES:
- specs/hr-recruitment-need-signal-2026-05-24.md — full spec with 53 decisions + gap audit + strategic expansion (416 lines)
- supabase/migrations/20260525100000_hr_recruitment_need_signal_rpc.sql (on branch feat/hr-recruitment-need-rpc) — all 8 function signatures + return types needed for TypeScript wrappers
- supabase/migrations/20260524000000_hr_recruitment_need_foundation.sql (on jicate/main after #1069 merge) — table schemas for TypeScript type definitions

CONSTRAINTS:
- Migrations apply via Supabase Management API, never `supabase db push`. Use `~/.supabase/access-token` for Bearer auth.
- PRs must be one-click mergeable for Director (Ready state, all CI green, visual proof or skip label).
- Production target is `jicate/main` (Jicate-Solutions/MyJKKN). Push to jicate remote only.
- Dev server port: verify with `lsof -i :3000 -i :3104` — documented as 3104 but typically binds to 3000.
- Commit after every Write (per memory feedback_commit_after_every_write.md).
- Run `scripts/check-permission-audit-coverage.ts` locally before push if adding new routes under `/hr/intelligence`.

VERIFY BY:
- `gh pr view 1071 --json state` and `gh pr view 1072 --json state` — should be MERGED after steps 1-2
- After PR 4: `npx tsc --noEmit` on the new types + service files (or CI PR-scoped check)
- After PR 5: hooks compile, React Query cache keys match service layer
- After PR 6: `/hr/intelligence` route loads with tab shell
