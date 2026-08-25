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
import { FreshnessBadge } from './_components/freshness-badge';
import { WaitingQueue } from './_components/waiting-queue';
import { ModuleCard } from './_components/module-card';
import { ActionLog } from './_components/action-log';
import type {
  OrchestrationAction,
  OrchestrationModule,
  OrchestrationPr,
  OrchestrationSessionState,
} from '@/types/orchestration';

const RECENT_ACTIONS_LIMIT = 25;

async function loadOrchestrationData() {
  const supabase = await createClient();

  const [modulesRes, prsRes, actionsRes, sessionRes] = await Promise.all([
    supabase.from('orchestration_modules').select('*').order('title', { ascending: true }),
    supabase.from('orchestration_prs').select('*').order('number', { ascending: false }),
    supabase
      .from('orchestration_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RECENT_ACTIONS_LIMIT),
    supabase.from('orchestration_session_state').select('*').order('last_seen_at', { ascending: false }),
  ]);

  return {
    modules: (modulesRes.data ?? []) as OrchestrationModule[],
    prs: (prsRes.data ?? []) as OrchestrationPr[],
    actions: (actionsRes.data ?? []) as OrchestrationAction[],
    session: (sessionRes.data ?? []) as OrchestrationSessionState[],
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
  const { modules, prs, actions, session } = await loadOrchestrationData();
  const newestHeartbeat = session[0]?.last_seen_at ?? null;
  const readyCount = modules.filter((m) => m.status === 'gated' || m.status === 'idle').length;

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
            <FreshnessBadge lastSeenAt={newestHeartbeat} />
            <span className="text-sm text-muted-foreground">
              {modules.length} module{modules.length === 1 ? '' : 's'} · {readyCount} ready
            </span>
          </div>

          <WaitingQueue modules={modules} />

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

          <ActionLog actions={actions} />
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
