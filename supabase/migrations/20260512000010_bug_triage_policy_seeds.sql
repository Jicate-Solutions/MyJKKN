-- ============================================================================
-- Migration: 20260512000010_bug_triage_policy_seeds
-- PR-A of 4 — Bug Triage Agent runtime-config substrate
-- ============================================================================
-- Seeds 13 platform_policies rows that govern the /fixmyjkkn and /fixallbugs
-- Claude Code skills. Defaults MIRROR current hardcoded skill behavior 1:1 —
-- zero behavioral drift on apply. Skill rewires to call fn_get_policy() at
-- runtime land in PR-C. Admin UI lands in PR-B.
--
-- Substrate table + RLS + resolver functions ship in:
--   20260429000002_platform_policies_substrate.sql
--
-- Idempotent — ON CONFLICT (policy_key, scope_type, COALESCE(scope_id,...))
-- DO NOTHING. Safe to re-apply.
-- ============================================================================

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system) VALUES

-- 1. Master kill switch for both skills.
('bug_triage.is_enabled', 'global', NULL, 'true'::jsonb,
  'Master enable flag for the bug-triage agent (/fixmyjkkn + /fixallbugs). When false, both skills short-circuit at entry. Director-only flip.',
  'boolean', NULL, true),

-- 2. Batch fan-out concurrency.
('bug_triage.batch.max_concurrent_agents', 'global', NULL, '3'::jsonb,
  'Maximum number of parallel subagents the /fixallbugs batch mode can spawn at once (across apps or within one app).',
  'number', NULL, true),

-- 3. Pre-flight visual probe: interactive-flow keywords (probe SKIPPED).
('bug_triage.preflight.interactive_flow_keywords', 'global', NULL,
  '["click","submit","after entering","while typing","on save","when I press"]'::jsonb,
  'Bug-description keywords that mark the bug as interactive-flow. Interactive-flow bugs skip the 10-sec CFT pre-flight probe verdict (cannot be auto-confirmed via static page-render).',
  'array', NULL, true),

-- 4. Pre-flight visual probe: page-load keywords (probe eligible).
('bug_triage.preflight.page_load_keywords', 'global', NULL,
  '["blank","404","shows error","wrong data","crash on load","TypeError on render","route 500s"]'::jsonb,
  'Bug-description keywords that mark the bug as page-load class — eligible for the 10-sec CFT pre-flight probe verdict.',
  'array', NULL, true),

-- 5. Pre-flight visual probe: inconclusive default.
('bug_triage.preflight.inconclusive_default', 'global', NULL, '"still_reproducible"'::jsonb,
  'Verdict when the pre-flight CFT probe is inconclusive (screenshot ambiguous, route timeout, auth gate). Conservative default = still_reproducible → proceed with clone+fix path.',
  'enum', '["still_reproducible","already_fixed","skip"]'::jsonb, true),

-- 6. Diff size cap.
('bug_triage.diff.max_files', 'global', NULL, '15'::jsonb,
  'Maximum number of files a single bug-fix diff can touch before the agent must STOP and surface the blocker (over-broad fix = wrong fix).',
  'number', NULL, true),

-- 7. Fix confidence floor.
('bug_triage.fix.confidence_min', 'global', NULL, '0.7'::jsonb,
  'Minimum self-rated confidence (0.0–1.0) the agent must reach before opening a PR. Below this, the agent must STOP and surface the blocker.',
  'number', NULL, true),

-- 8. Platform auto-merge gate keys (per-Application toggle list).
('bug_triage.platform.auto_merge_gate_keys', 'global', NULL,
  '["auto_merge_eligible"]'::jsonb,
  'For PLATFORM bugs (centralized bug reporter): the per-Application toggle keys an admin must flip true to make a bug auto-merge eligible. Array allows future expansion (e.g. add ci_gates_passing).',
  'array', NULL, true),

-- 9. Danger-zone globs (hard floor on auto-merge).
('bug_triage.danger_zone_globs', 'global', NULL,
  '["**/auth/**","**/middleware*","supabase/migrations/**","**/rls/**","**/policies/**","**/payment*","**/billing*","**/checkout*","**/.env*","vercel.json","**/CLAUDE.md"]'::jsonb,
  'Glob patterns whose presence in a diff disqualifies the bug from auto-merge regardless of any other gate. Hard floor — cannot be bypassed.',
  'array', NULL, true),

-- 10. MyJKKN-specific auto-merge master gate.
-- NOTE: Global scope is HARD-ENFORCED FALSE per /fixmyjkkn standing rule
-- (MyJKKN bugs are PR-only, no auto-merge). An institution-scope override row
-- may exist in the table for future relaxation, but the runtime consumer
-- (PR-C) MUST reject any globally-true value. Do not flip this row to true.
('bug_triage.myjkkn.auto_merge_eligible', 'global', NULL, 'false'::jsonb,
  'MyJKKN auto-merge master gate. HARD-ENFORCED FALSE at global scope per /fixmyjkkn standing rule (MyJKKN bugs are PR-only). Institution-scope overrides allowed in the table but runtime consumer blocks globally-true.',
  'boolean', NULL, true),

-- 11. Allowlist tags (empty = no allowlist).
('bug_triage.allowlist_tags', 'global', NULL, '[]'::jsonb,
  'Optional allowlist of bug-tag strings — only bugs carrying at least one listed tag enter the auto-fix loop. Empty array = no allowlist (every open bug is eligible).',
  'array', NULL, true),

-- 12. Draft PR auto-reviewer (empty = leave to CODEOWNERS).
('bug_triage.draft_pr_reviewer', 'global', NULL, '""'::jsonb,
  'GitHub username to auto-assign as reviewer when the agent opens a PR. Empty string = no auto-assignment (leave to repo CODEOWNERS).',
  'string', NULL, true),

-- 13. Feature-request signal keywords (intake rejection).
('bug_triage.feature_request_signal_keywords', 'global', NULL,
  '["should be able to","needs to be customized","add option for","provide access to","update the list","update the new users"]'::jsonb,
  'Bug-description keywords that signal "feature request masquerading as bug" — when matched, the agent rejects the bug as out-of-scope and routes it to the product backlog instead of attempting a fix.',
  'array', NULL, true)

ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
