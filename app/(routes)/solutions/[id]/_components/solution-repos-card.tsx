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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ExternalLink, GitBranch, Plus, Trash2, X } from 'lucide-react';
import {
  useBulkLinkRepos,
  useSolutionRepos,
  useUnlinkSolutionRepo,
} from '@/hooks/solutions/use-solution-repos';

const REPO_FULL_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function SolutionReposCard({ solutionId }: { solutionId: string }) {
  const { data: repos, isLoading, isError } = useSolutionRepos(solutionId);
  const bulkLink = useBulkLinkRepos(solutionId);
  const unlinkRepo = useUnlinkSolutionRepo(solutionId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [repoName, setRepoName] = useState('');
  // Multi-select staging: user adds org/name entries, then checks the ones to link.
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ linked: number; skipped: number; invalid: number } | null>(null);

  const alreadyLinked = new Set((repos ?? []).map((r) => r.repo_full_name));
  const selectedNames = candidates.filter((n) => selected[n]);

  const resetDialog = () => {
    setRepoName('');
    setCandidates([]);
    setSelected({});
    setFormError(null);
    setSummary(null);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetDialog();
  };

  const addCandidate = () => {
    const trimmed = repoName.trim();
    if (!REPO_FULL_NAME_PATTERN.test(trimmed)) {
      setFormError('Use the "org/name" format, e.g. Jicate-Solutions/pharmacy-pos');
      return;
    }
    if (candidates.includes(trimmed)) {
      setFormError('That repository is already in the list.');
      return;
    }
    setFormError(null);
    setSummary(null);
    setCandidates((prev) => [...prev, trimmed]);
    setSelected((prev) => ({ ...prev, [trimmed]: true }));
    setRepoName('');
  };

  const removeCandidate = (name: string) => {
    setCandidates((prev) => prev.filter((n) => n !== name));
    setSelected((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleLink = () => {
    if (selectedNames.length === 0) {
      setFormError('Select at least one repository to link.');
      return;
    }
    setFormError(null);
    bulkLink.mutate(selectedNames, {
      onSuccess: (res) => {
        setSummary({
          linked: res.linked.length,
          skipped: res.skipped.length,
          invalid: res.invalid.length,
        });
        // Clear the staging list; the linked repos now show in the card below.
        setCandidates([]);
        setSelected({});
        setRepoName('');
      },
      onError: (e) => {
        setFormError(e instanceof Error ? e.message : 'Failed to link repositories');
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
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Link Repository
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link GitHub repositories</DialogTitle>
              <DialogDescription>
                Add repositories as org/name, then select the ones to link. The repos themselves
                are not modified — this only records where the solution&apos;s code lives.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label htmlFor="repo-full-name">Repository</Label>
                <div className="flex gap-2">
                  <Input
                    id="repo-full-name"
                    placeholder="Jicate-Solutions/pharmacy-pos"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCandidate();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={addCandidate}>
                    Add
                  </Button>
                </div>
                {formError && <p className="text-sm text-destructive">{formError}</p>}
              </div>

              {candidates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {selectedNames.length} of {candidates.length} selected
                  </p>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                    {candidates.map((name) => (
                      <div key={name} className="flex items-center gap-2 rounded px-1 py-1">
                        <Checkbox
                          id={`cand-${name}`}
                          checked={!!selected[name]}
                          onCheckedChange={(v) =>
                            setSelected((prev) => ({ ...prev, [name]: v === true }))
                          }
                        />
                        <label
                          htmlFor={`cand-${name}`}
                          className="min-w-0 flex-1 cursor-pointer truncate text-sm"
                        >
                          {name}
                          {alreadyLinked.has(name) && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              already linked
                            </span>
                          )}
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${name}`}
                          onClick={() => removeCandidate(name)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary && (
                <p className="text-sm text-muted-foreground">
                  Linked {summary.linked}
                  {summary.skipped > 0 && ` · ${summary.skipped} already linked`}
                  {summary.invalid > 0 && ` · ${summary.invalid} invalid`}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                {summary ? 'Done' : 'Cancel'}
              </Button>
              <Button
                onClick={handleLink}
                disabled={bulkLink.isPending || selectedNames.length === 0}
              >
                {bulkLink.isPending
                  ? 'Linking…'
                  : selectedNames.length > 1
                    ? `Link ${selectedNames.length} repositories`
                    : 'Link'}
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
