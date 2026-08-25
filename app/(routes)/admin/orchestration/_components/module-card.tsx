'use client';

// One card per module — spec section 04. Title links to the module's real
// MyJKKN page; the does/output/impact lines make every action self-explaining
// (spec section 05). Run AI and Merge are live here in Phase 2 — Merge opens
// a confirm dialog (spec section 05: "Does · You'll get · Impact") before
// calling its server route at /api/admin/orchestration/actions/merge, which
// is super-admin gated and requires an explicit confirm: true server-side on
// top of this dialog — belt and suspenders, never auto-fired.
//
// Deploy is NOT here (corrected 2026-08-25): it fires ONE global Vercel
// production deploy hook that rebuilds all of `main` and ships it to every
// college — it was never a per-module action, so 55 enabled per-card Deploy
// buttons lied about what the button does. It now lives once, in the page
// header — see `_components/deploy-lock.tsx` and `page.tsx`.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, GitMerge, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { OrchestrationModule, OrchestrationPr } from '@/types/orchestration';

// CI signals go stale faster than the tower's own heartbeat — a green badge
// older than this reads as "stale", never "passing" (spec pain #5: "CI's been
// dark 3 days; stale green badges read as passing").
const CI_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

const STATUS_STYLE: Record<OrchestrationModule['status'], string> = {
  idle: 'bg-muted text-muted-foreground',
  working: 'bg-sky-100 text-sky-800',
  gated: 'bg-emerald-100 text-emerald-800',
  blocked: 'bg-amber-100 text-amber-800',
};

function honestCiLabel(pr: OrchestrationPr): { label: string; className: string } {
  if (!pr.ci_state) return { label: 'no CI', className: 'bg-muted text-muted-foreground' };
  const checkedAt = pr.ci_checked_at ? new Date(pr.ci_checked_at).getTime() : null;
  const isStaleGreen =
    pr.ci_state === 'green' && (checkedAt === null || Date.now() - checkedAt > CI_STALE_THRESHOLD_MS);
  if (isStaleGreen) return { label: 'green (stale)', className: 'bg-amber-100 text-amber-800' };
  if (pr.ci_state === 'green') return { label: 'green', className: 'bg-emerald-100 text-emerald-800' };
  if (pr.ci_state === 'red' || pr.ci_state === 'failed') {
    return { label: pr.ci_state, className: 'bg-red-100 text-red-800' };
  }
  return { label: pr.ci_state, className: 'bg-muted text-muted-foreground' };
}

// TWO vocabularies land in `mergeable`, and only accepting one made this
// button permanently dead in production (2026-08-25):
//   - GraphQL / `gh pr list --json mergeable` writes  MERGEABLE | CONFLICTING | UNKNOWN
//   - the sync cron writes GitHub REST's `mergeable_state`:  clean | unstable |
//     dirty | blocked | unknown
// The cron is the steady-state writer, so the column is normally `clean`, and
// 'CLEAN' !== 'MERGEABLE' meant every card read "No PR here is mergeable yet".
//
// Accept both. `unstable` counts: it means git-mergeable with a non-required
// check failing — still mergeable. `dirty` (conflicts) and `blocked` (required
// review/check missing) do NOT.
//
// This only gates whether the BUTTON is offered. The real safety gate is
// lib/services/orchestration/github-merge.ts, which re-reads the PR live from
// GitHub at click time and refuses unless `mergeable === true` and
// `mergeable_state` is neither 'dirty' nor 'blocked'. A stale or optimistic
// value here can never cause a bad merge.
const MERGEABLE_TOKENS = new Set(['MERGEABLE', 'CLEAN', 'UNSTABLE']);

function isMergeableStatus(pr: OrchestrationPr): boolean {
  return MERGEABLE_TOKENS.has((pr.mergeable ?? '').trim().toUpperCase());
}

// The mockup shows one Merge button per module card, targeting whichever PR
// is actually ready — not a picker. Prefer the oldest ready, non-draft PR
// (it's been waiting longest); fall back to none, which disables the button.
function pickMergeCandidate(prs: OrchestrationPr[]): OrchestrationPr | null {
  const ready = prs.filter((p) => isMergeableStatus(p) && !p.is_draft);
  if (ready.length === 0) return null;
  return [...ready].sort((a, b) => a.number - b.number)[0];
}

// The action routes fail closed with { ok:false, reason } once past the
// super-admin/confirm gate, but return { ok:false, error } for the auth/
// validation guards ahead of that — surface whichever is present, verbatim,
// never swallowed.
function extractActionError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const d = data as { reason?: unknown; error?: unknown };
    if (typeof d.reason === 'string' && d.reason.trim()) return d.reason;
    if (typeof d.error === 'string' && d.error.trim()) return d.error;
  }
  return fallback;
}

interface ModuleCardProps {
  module: OrchestrationModule;
  prs: OrchestrationPr[];
}

export function ModuleCard({ module, prs }: ModuleCardProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  // Deploy fires one global hook — disable every card's button, not just
  // this one, while any card's deploy request is in flight.
  const deployInFlight = useDeployInFlight();

  const gatedCount = prs.filter((p) => p.gate_state === 'green' || p.gate_state === 'gated').length;
  const mergeCandidate = pickMergeCandidate(prs);

  async function handleRunAi() {
    setIsRunning(true);
    try {
      const resp = await fetch('/api/admin/orchestration/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleKey: module.key }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        toast.error(data.error ?? 'Run AI failed');
      } else {
        toast.success(data.message ?? `Run AI ${data.status ?? 'requested'} for ${module.title}`);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Run AI failed');
    } finally {
      setIsRunning(false);
    }
  }

  function openMergeDialog() {
    setMergeError(null);
    setMergeDialogOpen(true);
  }

  async function handleMergeConfirm() {
    if (!mergeCandidate) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      const resp = await fetch('/api/admin/orchestration/actions/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prNumber: mergeCandidate.number, confirm: true }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        const message = extractActionError(data, `Merge failed (status ${resp.status})`);
        setMergeError(message);
        toast.error(message);
        return;
      }
      toast.success(`Merged PR #${mergeCandidate.number}`);
      setMergeDialogOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Merge failed';
      setMergeError(message);
      toast.error(message);
    } finally {
      setIsMerging(false);
    }
  }

  function openDeployDialog() {
    setDeployError(null);
    setDeployDialogOpen(true);
  }

  async function handleDeployConfirm() {
    setIsDeploying(true);
    setDeployInFlight(true);
    setDeployError(null);
    try {
      const resp = await fetch('/api/admin/orchestration/actions/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        const message = extractActionError(data, `Deploy failed (status ${resp.status})`);
        setDeployError(message);
        toast.error(message);
        return;
      }
      toast.success(typeof data.reason === 'string' ? data.reason : 'Deploy hook fired');
      setDeployDialogOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deploy failed';
      setDeployError(message);
      toast.error(message);
    } finally {
      setIsDeploying(false);
      setDeployInFlight(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-1.5 text-base">
            {module.module_url ? (
              <a
                href={module.module_url}
                className="inline-flex items-center gap-1 hover:underline"
              >
                {module.title}
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            ) : (
              module.title
            )}
          </CardTitle>
          <Badge variant="outline" className={cn('border-transparent shrink-0', STATUS_STYLE[module.status])}>
            {module.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>
            {prs.length} PR{prs.length === 1 ? '' : 's'} · {gatedCount} gated
          </span>
          {prs.map((p) => {
            const ci = honestCiLabel(p);
            return (
              <Badge key={p.id} variant="outline" className={cn('border-transparent font-mono text-[11px]', ci.className)}>
                #{p.number} {ci.label}
              </Badge>
            );
          })}
        </div>

        {(module.does_text || module.output_text || module.impact_text) && (
          <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
            {module.does_text && (
              <p>
                <span className="font-medium">Run AI: </span>
                {module.does_text}
              </p>
            )}
            {module.output_text && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">You&apos;ll get: </span>
                {module.output_text}
              </p>
            )}
            {module.impact_text && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Impact: </span>
                {module.impact_text}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={handleRunAi} disabled={isRunning}>
            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run AI
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
                    disabled={!mergeCandidate}
                    onClick={openMergeDialog}
                  >
                    <GitMerge className="h-3.5 w-3.5" />
                    Merge{mergeCandidate ? ` #${mergeCandidate.number}` : ''}
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {mergeCandidate
                  ? `Merge PR #${mergeCandidate.number}: ${mergeCandidate.title ?? 'untitled'}`
                  : 'No PR here is mergeable yet'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-800 hover:bg-red-50 hover:text-red-900"
                    disabled={deployInFlight}
                    onClick={openDeployDialog}
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    Deploy
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {deployInFlight ? 'A deploy is already in flight' : 'Publish current main to jkkn.ai'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>

      <AlertDialog open={mergeDialogOpen} onOpenChange={(open) => !isMerging && setMergeDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-emerald-700" />
              Merge PR #{mergeCandidate?.number}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p className="font-medium text-foreground">{mergeCandidate?.title ?? 'Untitled PR'}</p>
                <dl className="space-y-1.5">
                  <div>
                    <dt className="inline font-medium text-foreground">Does: </dt>
                    <dd className="inline">Combines one ready pull request into the main code line.</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">You&apos;ll get: </dt>
                    <dd className="inline">That change joins what the next deploy will ship.</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Impact: </dt>
                    <dd className="inline">
                      <Badge variant="outline" className="mr-1 border-transparent bg-amber-100 text-amber-800">
                        changes code
                      </Badge>
                      Reversible by revert, but it moves main — for {module.title}.
                    </dd>
                  </div>
                </dl>
                {mergeError && (
                  <p className="rounded-md bg-red-50 p-2 text-sm text-red-800" role="alert">
                    {mergeError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMerging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-700 hover:bg-emerald-800"
              disabled={isMerging || !mergeCandidate}
              onClick={(e) => {
                e.preventDefault();
                void handleMergeConfirm();
              }}
            >
              {isMerging && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Confirm merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deployDialogOpen} onOpenChange={(open) => !isDeploying && setDeployDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-red-600" />
              Deploy to production
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p className="font-semibold text-red-700">
                  Publishes to the live site jkkn.ai — every college sees it.
                </p>
                <dl className="space-y-1.5">
                  <div>
                    <dt className="inline font-medium text-foreground">Does: </dt>
                    <dd className="inline">Publishes current main to the live site, jkkn.ai.</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">You&apos;ll get: </dt>
                    <dd className="inline">A new production build; the change reaches users in minutes.</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Impact: </dt>
                    <dd className="inline">
                      <Badge variant="outline" className="mr-1 border-transparent bg-red-100 text-red-800">
                        goes live
                      </Badge>
                      Every college sees it. Blocked if main is broken.
                    </dd>
                  </div>
                </dl>
                {deployError && (
                  <p className="rounded-md bg-red-50 p-2 text-sm text-red-800" role="alert">
                    {deployError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeploying}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-800"
              disabled={isDeploying}
              onClick={(e) => {
                e.preventDefault();
                void handleDeployConfirm();
              }}
            >
              {isDeploying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Confirm deploy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
