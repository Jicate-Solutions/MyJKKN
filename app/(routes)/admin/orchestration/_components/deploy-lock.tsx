'use client';

// ONE page-level control for the single global production deploy (corrected
// 2026-08-25). Deploy fires ONE Vercel production deploy hook that rebuilds
// all of `main` and ships it to every college — it is not scoped to a
// module the way Merge is, so it does not belong on a module card. It used
// to render as an enabled "Deploy" button on all 55 module cards, which lied
// twice: it read as per-module, and it stayed enabled even when the deploy
// hook wasn't configured server-side.
//
// This file kept its name (deploy-lock.ts -> .tsx) rather than moving to a
// new filename — it's still the one file guarding against a double-fired
// deploy, just now as the control itself rather than a cross-card lock.
// With a single instance on the page, a plain local `isDeploying` guard
// (same pattern as ModuleCard's own Merge dialog) is enough: the trigger
// button and the dialog's confirm button both disable while a request is
// in flight, so a double-click cannot fire two builds. The old
// useSyncExternalStore cross-component broadcast is gone because there is
// only one component to broadcast to now.
//
// canDeploy is computed server-side in page.tsx from
// process.env.ORCH_VERCEL_DEPLOY_HOOK and passed down as a boolean ONLY —
// never the secret itself. When false, the control renders disabled with
// the real reason instead of lying about its own capability (an hour of a
// prior session was lost to a secret that shipped in a client bundle;
// booleans only, never the value).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Rocket, TriangleAlert } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// The action route fails closed with { ok:false, reason } once past the
// super-admin/confirm gate, but returns { ok:false, error } for the auth/
// validation guards ahead of that — surface whichever is present, verbatim,
// never swallowed. (Mirrors ModuleCard's own extractActionError.)
function extractActionError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const d = data as { reason?: unknown; error?: unknown };
    if (typeof d.reason === 'string' && d.reason.trim()) return d.reason;
    if (typeof d.error === 'string' && d.error.trim()) return d.error;
  }
  return fallback;
}

// Shape of GET /api/admin/orchestration/actions/deploy — kept local rather
// than imported, because the service module is `server-only`.
interface DeployPreview {
  known: boolean;
  aheadBy: number;
  commits: { sha: string; title: string }[];
  reason?: string;
}

interface DeployControlProps {
  // True only when process.env.ORCH_VERCEL_DEPLOY_HOOK is set on the
  // server. Never the hook URL itself.
  canDeploy: boolean;
}

export function DeployControl({ canDeploy }: DeployControlProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetched lazily when the dialog opens, never on page load: it costs a
  // GitHub compare call and is only worth making when someone is actually
  // about to deploy. Purely informational — a failure here shows an honest
  // "couldn't determine" line and leaves Confirm enabled. It must never
  // become a precondition for deploying.
  async function loadPreview() {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/admin/orchestration/actions/deploy');
      const data = (await resp.json().catch(() => null)) as DeployPreview | null;
      if (!resp.ok || !data || typeof data.known !== 'boolean') {
        setPreview({ known: false, aheadBy: 0, commits: [], reason: 'Preview request failed' });
        return;
      }
      setPreview(data);
    } catch {
      setPreview({ known: false, aheadBy: 0, commits: [], reason: 'Preview request failed' });
    } finally {
      setPreviewLoading(false);
    }
  }

  function openDialog() {
    setDeployError(null);
    setDialogOpen(true);
    void loadPreview();
  }

  async function handleConfirm() {
    if (isDeploying) return; // in-flight guard — a double-click cannot fire twice
    setIsDeploying(true);
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
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deploy failed';
      setDeployError(message);
      toast.error(message);
    } finally {
      setIsDeploying(false);
    }
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* wrapper div so the tooltip still shows while the button itself is disabled */}
            <div>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-800 hover:bg-red-50 hover:text-red-900"
                disabled={!canDeploy || isDeploying}
                onClick={openDialog}
              >
                {isDeploying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Rocket className="h-3.5 w-3.5" />
                )}
                Deploy main to production
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {canDeploy
              ? 'Publishes current main to jkkn.ai — every college, one global deploy'
              : 'Deploy is not configured — ORCH_VERCEL_DEPLOY_HOOK is unset'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog open={dialogOpen} onOpenChange={(open) => !isDeploying && setDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-red-600" />
              Deploy main to production
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p className="font-semibold text-red-700">
                  Publishes to the live site jkkn.ai — every college sees it.
                </p>
                <dl className="space-y-1.5">
                  <div>
                    <dt className="inline font-medium text-foreground">Does: </dt>
                    <dd className="inline">
                      Rebuilds and publishes the current <code className="font-mono">main</code> branch — one
                      global production deploy. Not scoped to any single module.
                    </dd>
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
                {/* What would actually ship. The deploy hook rebuilds whatever
                    `main` is right now, so without this the operator fires
                    blind — a commit being deliberately held back looks exactly
                    like nothing pending. This describes the WHOLE deploy, not
                    any one module. */}
                <div className="rounded-md border bg-muted/40 p-2.5">
                  {previewLoading ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Checking what would ship…
                    </p>
                  ) : !preview ? null : !preview.known ? (
                    <p className="text-sm text-muted-foreground">
                      Could not determine what would ship
                      {preview.reason ? ` — ${preview.reason}` : ''}. The deploy can still go ahead.
                    </p>
                  ) : preview.aheadBy === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing new to ship — production already matches{' '}
                      <code className="font-mono">main</code>.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        {preview.aheadBy} commit{preview.aheadBy === 1 ? '' : 's'} will ship —
                        everything on <code className="font-mono">main</code>, across all modules.
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {preview.commits.map((c) => (
                          <li key={c.sha} className="flex gap-2 text-sm text-muted-foreground">
                            <code className="font-mono text-xs">{c.sha.slice(0, 7)}</code>
                            <span className="min-w-0 break-words">{c.title}</span>
                          </li>
                        ))}
                      </ul>
                      {preview.aheadBy > preview.commits.length && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          …and {preview.aheadBy - preview.commits.length} more.
                        </p>
                      )}
                    </>
                  )}
                </div>
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
                void handleConfirm();
              }}
            >
              {isDeploying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Confirm deploy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
