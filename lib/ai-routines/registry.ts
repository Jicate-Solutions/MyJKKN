// ============================================================================
// AI ROUTINES REGISTRY — merged index + lookup helpers
// ============================================================================
// One curated static registry of every AI/LLM routine in MyJKKN, assembled from
// per-category files (each owned by one discovery agent, non-overlapping). The
// /admin/ai-routines page reads this; the trigger API resolves routines by id.
// ============================================================================

import { type AIRoutine, type RoutineCategoryId } from './types';
import { SCF_ROUTINES } from './scf-session-feedback';
import { FEEDBACK_ADAPTER_ROUTINES } from './feedback-adapters';
import { AI_PULSE_ROUTINES } from './ai-pulse';
import { ADMISSION_AI_ROUTINES } from './admission-ai';
import { INDUCTION_AI_ROUTINES } from './induction-ai';
import { INTAKE_READINESS_ROUTINES } from './intake-readiness';
import { CURRICULUM_AI_ROUTINES } from './curriculum-ai';
import { MISC_AI_ROUTINES } from './misc-ai';
import { LOOP_GOVERNANCE_ROUTINES } from './loop-governance';
import { PLATFORM_OPS_ROUTINES } from './platform-ops';

// ============================================================================
// Orchestration Console — "Run AI" per-module routines
// ============================================================================
// Backs the Orchestration Console's Run AI button (app/api/admin/orchestration
// /run/route.ts, PR #3183 — owned by another agent, not edited here). That
// route resolves a routine by the convention `orchestration-run-ai-<moduleKey>`
// and, when found and safeToManualTrigger, fires it with a bare GET + Bearer
// CRON_SECRET (no query string, no body) — the exact
// app/api/admin/ai-routines/trigger/route.ts pattern. Before this block no
// such entries existed, so every click fell through to the route's honest
// 'queued, nothing fired' path.
//
// One entry per module, each pointing at its own literal cron path under
// app/api/cron/orchestration-run-ai/<moduleKey>/route.ts (a `?moduleKey=`
// query string would silently fail
// __tests__/lib/ai-routines/registry-cron-wiring.test.ts, which resolves a
// /api/cron/ triggerPath to a literal directory on disk).
//
// Rules-based only — never calls Claude. It reads GitHub (PR mergeable_state
// + CI check-runs) and writes only orchestration_actions/orchestration_prs.
// safeToManualTrigger: true on every entry because it only gates + reports;
// it has no merge or deploy path at all, so firing it twice is harmless.
//
// Module keys are the reasonable working set for the console's Phase 1 (no
// seed migration exists yet to read them from) — see
// app/(routes)/admin/orchestration/page.tsx, which renders whatever rows
// orchestration_modules holds with no hardcoded list of its own.
const ORCHESTRATION_MODULES: { key: string; title: string }[] = [
  { key: 'campus-living', title: 'Campus Living' },
  { key: 'referral', title: 'Referral' },
  { key: 'hr', title: 'HR' },
  { key: 'solutions', title: 'Solutions Hub' },
  { key: 'notifications', title: 'Notifications' },
  { key: 'learners-council', title: "Learners' Council" },
  { key: 'accreditation', title: 'Accreditation' },
  { key: 'security', title: 'Security' },
  { key: 'academic', title: 'Academic' },
  { key: 'admissions', title: 'Admissions' },
];

const ORCHESTRATION_RUN_AI_ROUTINES: AIRoutine[] = ORCHESTRATION_MODULES.map(({ key, title }) => ({
  id: `orchestration-run-ai-${key}`,
  name: `Orchestration Console — Run AI (${title})`,
  category: 'platform-ops',
  type: 'cron',
  schedule: "On demand — fired only by the Orchestration Console's Run AI button (no fixed schedule)",
  triggerPath: `/api/cron/orchestration-run-ai/${key}`,
  callsClaude: false,
  featureKey: null,
  featureKeyNote:
    'Rules-based GitHub PR/CI state refresh (REST API) into orchestration_prs; no model involved.',
  whatItDoes: `Refreshes the live mergeable/CI state of every PR already tracked for the "${title}" module: reads the module's tracked PR numbers from orchestration_prs, asks GitHub for each one's current mergeable_state and check-run conclusion, and writes the refreshed values back. Never discovers new PRs on its own (that is the sync route's job) and never merges or deploys anything.`,
  configKnobs: 'Repo is fixed to Jicate-Solutions/MyJKKN; caps at 25 tracked PRs per run.',
  sideEffects:
    'DB writes to orchestration_actions (status transitions + result summary) and orchestration_prs (mergeable/ci_state refresh) only. No notifications, no GitHub writes.',
  safeToManualTrigger: true,
  notes:
    'Auth: Authorization: Bearer <CRON_SECRET> only (constant-time), same pattern as every other /api/cron/* route. Needs a GitHub read token (CRON_GITHUB_TOKEN / GITHUB_TOKEN / GH_TOKEN, falling back to the ORCH_GITHUB_TOKEN the console already uses) with pull-requests:read + checks:read on Jicate-Solutions/MyJKKN; absent token or missing orchestration_* tables both degrade to an honest failed result, never a fabricated success.',
}));

export const AI_ROUTINES: AIRoutine[] = [
  ...SCF_ROUTINES,
  ...FEEDBACK_ADAPTER_ROUTINES,
  ...AI_PULSE_ROUTINES,
  ...ADMISSION_AI_ROUTINES,
  ...INDUCTION_AI_ROUTINES,
  ...INTAKE_READINESS_ROUTINES,
  ...CURRICULUM_AI_ROUTINES,
  ...MISC_AI_ROUTINES,
  ...LOOP_GOVERNANCE_ROUTINES,
  ...PLATFORM_OPS_ROUTINES,
  ...ORCHESTRATION_RUN_AI_ROUTINES,
];

export function getRoutineById(id: string): AIRoutine | undefined {
  return AI_ROUTINES.find((r) => r.id === id);
}

export function routinesByCategory(categoryId: RoutineCategoryId): AIRoutine[] {
  return AI_ROUTINES.filter((r) => r.category === categoryId);
}

/** Count of routines that are safe to fire on demand (for the header summary). */
export function triggerableCount(): number {
  return AI_ROUTINES.filter((r) => r.type === 'cron' && r.safeToManualTrigger).length;
}
