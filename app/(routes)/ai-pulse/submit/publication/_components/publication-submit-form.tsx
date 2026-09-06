// app/(routes)/ai-pulse/submit/publication/_components/publication-submit-form.tsx
// ============================================================================
// Publication submit form (client). Loads the submit context (cycle / team /
// deadline / existing submission) from the API, validates the IG URL shape
// client-side, and surfaces the server verification result (reach vs the
// ig_reach_threshold policy, late flag vs ig_post_deadline_hours).
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Instagram,
  Loader2,
  Megaphone,
  Users,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import {
  extractIgShortcode,
  usePublicationSubmitContext,
  useSubmitPublication,
  type PublicationSubmitResult,
} from '@/lib/services/ai-pulse/pulse-impact-service';

interface PublicationSubmitFormProps {
  cycleParam: string;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function PublicationSubmitForm({ cycleParam }: PublicationSubmitFormProps) {
  const { data: ctx, isLoading, error } = usePublicationSubmitContext(cycleParam);
  const submitMutation = useSubmitPublication(cycleParam);

  const [igUrl, setIgUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [appName, setAppName] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicationSubmitResult | null>(null);

  // Prefill from the team's existing submission (one-shot per submission id).
  const existingId = ctx?.existing?.id;
  useEffect(() => {
    if (!ctx?.existing) return;
    const igProof = ctx.existing.proof_urls.find((u) =>
      /instagram\.com/i.test(u)
    );
    if (igProof) setIgUrl(igProof);
    if (ctx.existing.github_url) setGithubUrl(ctx.existing.github_url);
    if (ctx.existing.app_name) setAppName(ctx.existing.app_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load submission details</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!ctx?.cycle) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No active AI Pulse cycle this week — check back when the next cycle
          opens.
        </CardContent>
      </Card>
    );
  }

  if (!ctx.team) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
          <Users className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">You&apos;re not on a team for this cycle yet.</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Publication entries are submitted per team. Ask your Class Incharge
            to add you to a team for{' '}
            <span className="font-medium">{ctx.cycle.name ?? 'this cycle'}</span>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const deadline = ctx.deadline;
  const deadlinePast = deadline?.is_past === true;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setResult(null);

    if (!extractIgShortcode(igUrl)) {
      setClientError(
        'Paste the full Instagram post or reel URL (e.g. https://www.instagram.com/p/ABC123/).'
      );
      return;
    }

    submitMutation.mutate(
      {
        cycle_id: ctx.cycle!.id,
        ig_url: igUrl.trim(),
        github_url: githubUrl.trim() || undefined,
        app_name: appName.trim() || undefined,
      },
      { onSuccess: (res) => setResult(res) }
    );
  };

  return (
    <div className="space-y-4">
      {/* Cycle + deadline strip */}
      <Card>
        <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Megaphone className="h-4 w-4 text-violet-600" aria-hidden />
            <span className="font-medium">{ctx.cycle.name ?? 'AI Pulse cycle'}</span>
            <Badge variant="outline">{ctx.team.team_name ?? 'My team'}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden />
            <span>
              Due {formatDateTime(deadline?.due_at)} (
              {ctx.policies.ig_post_deadline_hours}h after the session)
            </span>
            {deadlinePast && (
              <Badge variant="destructive" className="ml-1">
                Past deadline
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Poller lag notice */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Before you submit</AlertTitle>
        <AlertDescription className="text-xs">
          The post must be on your <strong>department&apos;s official Instagram
          account</strong> (not a personal account) and live for about{' '}
          <strong>1 hour</strong> before submitting — our metrics poller runs
          hourly, so very fresh posts won&apos;t be found yet.
        </AlertDescription>
      </Alert>

      {/* Existing submission */}
      {ctx.existing?.submitted_at && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Already submitted</AlertTitle>
          <AlertDescription className="text-xs">
            Your team submitted on {formatDateTime(ctx.existing.submitted_at)}.
            Submitting again updates the entry.
          </AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Instagram className="h-5 w-5 text-pink-600" aria-hidden />
            Publication entry
          </CardTitle>
          <CardDescription>
            One entry per team per cycle. Reach is tracked automatically against
            the {ctx.policies.ig_reach_threshold}-reach goal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ig-url">
                Instagram post URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ig-url"
                type="url"
                placeholder="https://www.instagram.com/p/ABC123/"
                value={igUrl}
                onChange={(e) => setIgUrl(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="github-url">GitHub repo (optional)</Label>
                <Input
                  id="github-url"
                  type="url"
                  placeholder="https://github.com/your-team/project"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-name">Project name (optional)</Label>
                <Input
                  id="app-name"
                  type="text"
                  placeholder="What did your team build?"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  maxLength={120}
                />
              </div>
            </div>

            {(clientError || submitMutation.error) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {clientError ?? submitMutation.error?.message}
                </AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={submitMutation.isPending}>
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying post…
                </>
              ) : ctx.existing?.submitted_at ? (
                'Update submission'
              ) : (
                'Submit publication'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Verification result */}
      {result && (
        <Card className="border-emerald-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
              Publication recorded
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Verified on{' '}
              <span className="font-medium">
                @{result.ig.account_username ?? 'department account'}
              </span>{' '}
              — posted {formatDateTime(result.ig.posted_at)}.
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <Badge variant={result.ig.reach_met ? 'default' : 'secondary'}>
                Reach: {result.ig.reach ?? 'no snapshot yet'} /{' '}
                {result.ig.reach_threshold}
              </Badge>
              {result.ig.likes !== null && (
                <Badge variant="outline">Likes: {result.ig.likes}</Badge>
              )}
              {result.late && (
                <Badge variant="destructive">Submitted past the deadline</Badge>
              )}
            </p>
            {!result.ig.reach_met && (
              <p className="text-xs text-muted-foreground">
                Reach updates hourly as the poller takes new snapshots — keep
                sharing the post to hit the {result.ig.reach_threshold} goal.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
