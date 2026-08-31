// ============================================================================
// ORCHESTRATION CONSOLE (Super-Admin) — Phase 1
// ============================================================================
// The in-app UI for the AI orchestration ("tower") session: a super-admin
// page that mirrors what the tower is doing across every module — status,
// tracked PRs, honest CI, blocked decisions — plus one live action, Run AI.
//
// Phase 1 is the READ layer + Run AI only. No Merge, no Deploy — those are
// Phase 2, wired only once this read layer has earned trust in daily use
// (spec section 10, "Build plan"). Merge/Deploy buttons render disabled with
// a "Phase 2" tooltip and call nothing.
//
// Full spec: artifacts/orchestration-console-spec.html
//
// Data: reads the four orchestration_* tables directly via the caller's own
// Supabase session (RLS enforces super_admin — see the migration). The
// SuperAdminOnly wrapper is a second, client-side layer for the render
// itself; the real gate is RLS + this page's own server-side query running
// under the visitor's session, plus every mutating route re-checking
// super_admin independently.
// ============================================================================

export const navMeta = { label: 'Orchestration', icon: 'LayoutDashboard' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { createClient } from '@/lib/supabase/server';
import { evaluateDirectorSignals } from '@/lib/services/orchestration/director-signals';
import { FreshnessBadge } from './_components/freshness-badge';
import { WaitingQueue } from './_components/waiting-queue';
import { ModuleCard } from './_components/module-card';
import { ActionLog } from './_components/action-log';
import { DeployControl } from './_components/deploy-lock';
import type {
  DirectorSignal,
  OrchestrationAction,
  OrchestrationModule,
  OrchestrationPr,
  OrchestrationSessionState,
} from '@/types/orchestration';

const RECENT_ACTIONS_LIMIT = 25;

// Resolves each action's actor_id (auth.users/profiles id) to a display
// name, batched in one query — never one lookup per row. A missing profile
// or a null actor_id is left out of the map on purpose: the action-log
// renders "unknown" for anything not in this map rather than guessing a
// name, since an unattributable action must look unattributable.
async function fetchActorNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorIds: Array<string | null>
): Promise<Map<string, string>> {
  const unique = [...new Set(actorIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();

  const { data } = await supabase.from('profiles').select('id, full_name').in('id', unique);

  const names = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
    if (row.full_name) names.set(row.id, row.full_name);
  }
  return names;
}

async function loadOrchestrationData() {
  const supabase = await createClient();

  // Computed Director signals run alongside the existing four table reads —
  // they're independent live-query evaluations against the same RLS-scoped
  // client, not a dependency of anything else here, so they belong in the
  // same Promise.all as everything else this page already loads in parallel.
  const [modulesRes, prsRes, actionsRes, sessionRes, signals] = await Promise.all([
    supabase.from('orchestration_modules').select('*').order('title', { ascending: true }),
    supabase.from('orchestration_prs').select('*').order('number', { ascending: false }),
    supabase
      .from('orchestration_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RECENT_ACTIONS_LIMIT),
    supabase.from('orchestration_session_state').select('*').order('last_seen_at', { ascending: false }),
    evaluateDirectorSignals(supabase),
  ]);

  const actions = (actionsRes.data ?? []) as OrchestrationAction[];
  const actorNames = await fetchActorNames(
    supabase,
    actions.map((a) => a.actor_id)
  );

  return {
    modules: (modulesRes.data ?? []) as OrchestrationModule[],
    prs: (prsRes.data ?? []) as OrchestrationPr[],
    actions,
    actorNames,
    session: (sessionRes.data ?? []) as OrchestrationSessionState[],
    signals: signals as DirectorSignal[],
  };
}

function Fallback() {
  return (
    <ContentLayout title="Orchestration">
      <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        This page is restricted to super administrators. It mirrors the AI orchestration
        session&apos;s state across every module and can run the AI — locked tight because it
        touches every module on the platform.
      </div>
    </ContentLayout>
  );
}

export default async function OrchestrationPage() {
  const { modules, prs, actions, actorNames, session, signals } = await loadOrchestrationData();
  const newestHeartbeat = session[0]?.last_seen_at ?? null;
  const readyCount = modules.filter((m) => m.status === 'gated' || m.status === 'idle').length;

  // Read server-side only, never sent to the client — the DeployControl
  // component below gets a plain boolean, never this env var's value.
  const canDeploy = Boolean(process.env.ORCH_VERCEL_DEPLOY_HOOK);

  const prsByModule = new Map<string, OrchestrationPr[]>();
  for (const pr of prs) {
    const key = pr.module_key ?? '';
    const list = prsByModule.get(key) ?? [];
    list.push(pr);
    prsByModule.set(key, list);
  }

  return (
    <SuperAdminOnly fallback={<Fallback />}>
      <ContentLayout title="Orchestration Console">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <FreshnessBadge lastSeenAt={newestHeartbeat} />
              <span className="text-sm text-muted-foreground">
                {modules.length} module{modules.length === 1 ? '' : 's'} · {readyCount} ready
              </span>
            </div>
            {/* One global production deploy for all of `main` — not a
                per-module action, so it lives here once, not on every
                module card. See _components/deploy-lock.tsx. */}
            <DeployControl canDeploy={canDeploy} />
          </div>

          <WaitingQueue modules={modules} signals={signals} />

          {modules.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No modules yet. The tower session writes rows into{' '}
              <code className="rounded bg-muted px-1 py-0.5">orchestration_modules</code> as it observes the
              fleet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {modules.map((m) => (
                <ModuleCard key={m.id} module={m} prs={prsByModule.get(m.key) ?? []} />
              ))}
            </div>
          )}

          <ActionLog actions={actions} actorNames={actorNames} />
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
