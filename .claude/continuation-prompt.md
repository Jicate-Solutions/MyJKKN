TASK: Rebuild HR Sprint 6 (Command Center Dashboard) TypeScript code — 10 files, ~1100 LOC.
The DB foundation is LIVE on production. The spec has 28 locked decisions. Previous build's
code was silently wiped by a working-tree revert event. This time, commit after every Write.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase project ref `kvizhngldtiuufknvehv` (production). MCP is connected.
SPEC: /Users/omm/PROJECTS/MyJKKN/specs/myjkkn-hr-sprint-06-plan.md (28 decisions + file plan + architecture)
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt

CURRENT STATE:
- Sprint 1 + 2 + 3 + unification merged + deployed (PRs #163, #165, #167, #175, #176, #182)
- Sprint 6 DB: `hr_dashboard_access_log` table + realtime publication LIVE on prod
- Sprint 6 code: NOT IN REPO — wiped by working-tree hook around midnight Apr 15/16
- `/hr/page.tsx` currently at Sprint 1 stub (131 lines), compiles cleanly
- Branch: omm-dev (diverged 720+ commits from jicate/main — use /ship-myjkkn translator pattern)
- `hr_leave_types` is a compat VIEW on `leave_types WHERE scope='staff'` (cleanup deferred — safe to leave)

WHAT NEEDS TO HAPPEN:

Per spec §"File plan", create these 10 files. Commit after EVERY new file Write (atomic, per memory feedback_commit_after_every_write.md):

1. `types/hr-dashboard.ts` — KPI/Quadrant/HRDashboardPayload types + REALTIME_INVALIDATION_MAP
2. `lib/services/hr/dashboard-service.ts` — HRDashboardService with 4 HR-Officer quadrants + 4 Director quadrants + institution-grid + banners
3. `hooks/hr/use-hr-dashboard.ts` — useHRDashboard (React Query + Supabase channel subs) + logDashboardAccess helper
4. `app/api/hr/dashboard/route.ts` — GET loads payload
5. `app/api/hr/dashboard/access-log/route.ts` — POST audit log entries
6. `features/hr/dashboard/kpi-card.tsx` — reusable KPI card (value + overdue + delta + drill-down)
7. `features/hr/dashboard/quadrant-card.tsx` — quadrant container with partial-failure rendering
8. `features/hr/dashboard/banners.tsx` — today-holiday + FY-end prompt banners
9. `features/hr/dashboard/institution-grid.tsx` — 11-institution card grid for super admin
10. REWRITE `app/(routes)/hr/page.tsx` (Sprint 1 stub → Sprint 6 live dashboard)

After EACH file: `git add <path> && git commit -m "wip(hr/s6): <filename>" --no-verify`

After all 10: `npx tsc --noEmit`, ship via `/ship-myjkkn`, deploy via `/deploy-myjkkn`.

CONSTRAINTS & RULES:
- ALWAYS use translator pattern (/ship-myjkkn) for production PRs — never push omm-dev to main
- NEVER delete anything pre-session (all pre-existing tables and code untouched)
- After EACH new-file Write: git add + git commit --no-verify immediately
- NEVER batch file writes — atomic commit per write is the ONLY way to survive the revert hook
- Respect decision #16 (role-adapted: HR Officer operational, Director strategic)
- Respect decision #17 (super admin sees 11-institution grid, toggle to rolled-up)
- Respect decision #18 (per-KPI audit logging via hr_dashboard_access_log table — already live)
- Respect decision #19 (per-quadrant error isolation — 3 work + 1 error card)
- Respect decision #21 (Supabase realtime subscriptions for cross-tab invalidation)

KEY FILES TO READ FIRST:
- /Users/omm/PROJECTS/MyJKKN/specs/myjkkn-hr-sprint-06-plan.md — THE spec
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_commit_after_every_write.md — commit discipline
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_hr_sprint6_db_state.md — what's live vs not
- /Users/omm/PROJECTS/MyJKKN/lib/services/hr/leave-service.ts — pattern reference for service structure
- /Users/omm/PROJECTS/MyJKKN/hooks/hr/use-leave.ts — pattern reference for hook structure
- /Users/omm/PROJECTS/MyJKKN/app/(routes)/hr/policies/page.tsx — pattern reference for Sprint 2 route structure

APPROACH:
1. Read the spec end-to-end before writing any code
2. Create each of 10 files sequentially, committing after each
3. After all 10 on disk + committed: `npx tsc --noEmit` to verify
4. Ship via `/ship-myjkkn` (worktree from jicate/main + copy + PR)
5. After user merges: `/deploy-myjkkn` + browser-verify via jkkn-ai session

QUALITY BAR:
- /hr renders 4 quadrants with live data (not Sprint 1 stub)
- Super admin sees 11 institution mini-dashboards
- Role toggle visible in header
- One quadrant failure shows error card, others still render
- Refresh button works; updated-timestamp visible
- Today's holiday banner visible if applicable
- hr_dashboard_access_log rows appear per KPI rendered (verify via SQL)

DO NOT:
- Touch /academic/* routes (learner leave module untouched)
- Modify existing HR tables (only query them)
- Drop the `hr_leave_types` compat VIEW (separate follow-up)
- Attempt to restore lost files from stashes — they're not there, rebuild from spec

VERIFY BY:
- npx tsc --noEmit returns 0 errors on HR Sprint 6 files
- curl -I https://www.jkkn.ai/hr → 307
- curl -sI https://www.jkkn.ai/api/hr/dashboard → 401
- jkkn-ai browser shows 4 quadrants + header role toggle + banners if relevant
- SELECT COUNT(*) FROM hr_dashboard_access_log after 1 dashboard view → should be >= 4
