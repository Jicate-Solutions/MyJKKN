'use client';

/**
 * Repositories card — GitHub repos linked to this solution.
 * Capability 1 of the Solutions Hub ↔ intern-repo integration.
 * Spec: specs/solutions-hub-intern-repo-integration-spec-2026-07-11.md
 *
 * The "intern-ready" badge (live protection check) and Build Activity
 * (open PRs, preview links, waiting-days) arrive with Capability 2 —
 * this card is the linkage layer only.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ExternalLink, GitBranch, Plus, Trash2 } from 'lucide-react';
import {
  useLinkSolutionRepo,
  useSolutionRepos,
  useUnlinkSolutionRepo,
} from '@/hooks/solutions/use-solution-repos';

const REPO_FULL_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function SolutionReposCard({ solutionId }: { solutionId: string }) {
  const { data: repos, isLoading, isError } = useSolutionRepos(solutionId);
  const linkRepo = useLinkSolutionRepo(solutionId);
  const unlinkRepo = useUnlinkSolutionRepo(solutionId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleLink = () => {
    const trimmed = repoName.trim();
    if (!REPO_FULL_NAME_PATTERN.test(trimmed)) {
      setFormError('Use the "org/name" format, e.g. Jicate-Solutions/pharmacy-pos');
      return;
    }
    setFormError(null);
    linkRepo.mutate(trimmed, {
      onSuccess: () => {
        setRepoName('');
        setDialogOpen(false);
      },
      onError: (e) => {
        setFormError(e instanceof Error ? e.message : 'Failed to link repository');
      },
    });
  };

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Repositories</CardTitle>
          <CardDescription>GitHub repositories where this solution is built</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Link Repository
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link a GitHub repository</DialogTitle>
              <DialogDescription>
                Enter the repository as org/name. The repo itself is not modified — this only
                records where the solution&apos;s code lives.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="repo-full-name">Repository</Label>
              <Input
                id="repo-full-name"
                placeholder="Jicate-Solutions/pharmacy-pos"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLink()}
              />
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLink} disabled={linkRepo.isPending}>
                {linkRepo.isPending ? 'Linking…' : 'Link'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading repositories…</p>
        ) : isError ? (
          // Decision 6: degrade honestly, never fake data.
          <p className="text-sm text-muted-foreground">
            Can&apos;t load repositories right now — try again shortly.
          </p>
        ) : !repos || repos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No repositories linked. Link one to see where this solution is built.
          </p>
        ) : (
          <div className="space-y-3">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="flex items-start justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a
                      href={`https://github.com/${repo.repo_full_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-medium hover:underline"
                    >
                      {repo.repo_full_name}
                    </a>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                  {repo.shared_with.length > 0 && (
                    // Decision 8: sharing is allowed but must be visible.
                    <p className="mt-1 text-xs text-muted-foreground">
                      Also used by{' '}
                      {repo.shared_with.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ', '}
                          <Link href={`/solutions/${s.id}`} className="underline">
                            {s.title}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Unlink ${repo.repo_full_name}`}
                  disabled={unlinkRepo.isPending}
                  onClick={() => unlinkRepo.mutate(repo.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
