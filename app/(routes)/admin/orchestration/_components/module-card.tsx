'use client';

// One card per module — spec section 04. Title links to the module's real
// MyJKKN page; the does/output/impact lines make every action self-explaining
// (spec section 05); Run AI is the only live button in Phase 1. Merge and
// Deploy render disabled with a "Phase 2" tooltip and never call anything —
// Phase 1 is read + Run AI only, by hard constraint.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
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

interface ModuleCardProps {
  module: OrchestrationModule;
  prs: OrchestrationPr[];
}

export function ModuleCard({ module, prs }: ModuleCardProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  const gatedCount = prs.filter((p) => p.gate_state === 'green' || p.gate_state === 'gated').length;

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
                  <Button size="sm" variant="outline" disabled>
                    Merge
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>Phase 2 — not wired yet</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button size="sm" variant="outline" disabled>
                    Deploy
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>Phase 2 — not wired yet</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
