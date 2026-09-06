// app/(routes)/ai-pulse/submit/domain-sync/_components/domain-sync-submit-form.tsx
// ============================================================================
// Domain-Sync submit form (client). Loads the submit context (cycle / team /
// deadline / existing submission) from the API, then upserts the team's
// artifact record. Deadline is policy-driven
// (ai_pulse_policies.domain_sync_deadline_offset_days vs cycle start).
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
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
import { Textarea } from '@/components/ui/textarea';

import {
  useDomainSyncSubmitContext,
  useSubmitDomainSync,
  type DomainSyncSubmitResult,
} from '@/lib/services/ai-pulse/pulse-impact-service';

interface DomainSyncSubmitFormProps {
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

export function DomainSyncSubmitForm({ cycleParam }: DomainSyncSubmitFormProps) {
  const { data: ctx, isLoading, error } = useDomainSyncSubmitContext(cycleParam);
  const submitMutation = useSubmitDomainSync(cycleParam);

  const [appName, setAppName] = useState('');
  const [description, setDescription] = useState('');
  const [solutionSummary, setSolutionSummary] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linksText, setLinksText] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [result, setResult] = useState<DomainSyncSubmitResult | null>(null);

  // Prefill from the team's existing submission (one-shot per submission id).
  const existingId = ctx?.existing?.id;
  useEffect(() => {
    if (!ctx?.existing) return;
    if (ctx.existing.app_name) setAppName(ctx.existing.app_name);
    if (ctx.existing.description) setDescription(ctx.existing.description);
    if (ctx.existing.solution_summary) {
      setSolutionSummary(ctx.existing.solution_summary);
    }
    if (ctx.existing.github_url) setGithubUrl(ctx.existing.github_url);
    const nonIgLinks = ctx.existing.proof_urls.filter(
      (u) => !/instagram\.com/i.test(u)
    );
    if (nonIgLinks.length > 0) setLinksText(nonIgLinks.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
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
            Domain-sync artifacts are submitted per team. Ask your Class
            Incharge to add you to a team for{' '}
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

    if (description.trim().length < 20) {
      setClientError(
        'Describe what your team applied this week (at least a couple of sentences).'
      );
      return;
    }

    const proofUrls = linksText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    submitMutation.mutate(
      {
        cycle_id: ctx.cycle!.id,
        app_name: appName.trim(),
        description: description.trim(),
        solution_summary: solutionSummary.trim() || undefined,
        github_url: githubUrl.trim() || undefined,
        proof_urls: proofUrls,
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
            <Send className="h-4 w-4 text-sky-600" aria-hidden />
            <span className="font-medium">{ctx.cycle.name ?? 'AI Pulse cycle'}</span>
            <Badge variant="outline">{ctx.team.team_name ?? 'My team'}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden />
            <span>
              Due {formatDateTime(deadline?.due_at)} (
              {ctx.policies.domain_sync_deadline_offset_days} days after the
              session)
            </span>
            {deadlinePast && (
              <Badge variant="destructive" className="ml-1">
                Past deadline
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

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
          <CardTitle className="text-base">Domain-Sync artifact</CardTitle>
          <CardDescription>
            One entry per team per cycle — what you applied from this
            week&apos;s session to your own domain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ds-title">
                Artifact title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ds-title"
                type="text"
                placeholder="e.g. AI-assisted patient intake checklist"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                maxLength={120}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ds-description">
                What did your team apply this week?{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ds-description"
                placeholder="Describe the problem in your domain, what you tried with the featured tool, and what happened."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ds-solution">Solution summary (optional)</Label>
              <Textarea
                id="ds-solution"
                placeholder="A short 1-2 line summary of the outcome."
                value={solutionSummary}
                onChange={(e) => setSolutionSummary(e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ds-github">GitHub repo (optional)</Label>
                <Input
                  id="ds-github"
                  type="url"
                  placeholder="https://github.com/your-team/project"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ds-links">Artifact links (one per line)</Label>
                <Textarea
                  id="ds-links"
                  placeholder={'https://docs.google.com/…\nhttps://drive.google.com/…'}
                  value={linksText}
                  onChange={(e) => setLinksText(e.target.value)}
                  rows={3}
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
                  Saving…
                </>
              ) : ctx.existing?.submitted_at ? (
                'Update submission'
              ) : (
                'Submit domain-sync'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Alert className="border-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>Domain-sync recorded</AlertTitle>
          <AlertDescription className="text-xs">
            Your team&apos;s artifact is saved for this cycle.
            {result.late &&
              ' Note: this submission landed past the deadline and will show as late.'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
