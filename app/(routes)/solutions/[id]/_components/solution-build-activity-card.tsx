'use client';

/**
 * Build Activity card — live GitHub state for the repos linked to a solution.
 * Capability 2 of the Solutions Hub ↔ intern-repo integration.
 * Spec: specs/solutions-hub-intern-repo-integration-spec-2026-07-11.md
 *
 * Decision 9: each open PR shows how long it has waited for review; amber at
 * 3+ days — the reviewer's delay is as visible as the intern's.
 * Decision 10: the intern-ready badge comes from a live protection check.
 * Decisions 5/6: broken repos and GitHub outages are stated, never hidden.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  GitPullRequest,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSolutionRepoActivity } from '@/hooks/solutions/use-repo-activity';
import type { CiState } from '@/lib/services/solutions/repo-activity-service';

function CiIcon({ ci }: { ci: CiState }) {
  if (ci === 'pass') return <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="CI passing" />;
  if (ci === 'fail') return <XCircle className="h-4 w-4 text-destructive" aria-label="CI failing" />;
  if (ci === 'pending') return <CircleDashed className="h-4 w-4 animate-spin text-muted-foreground" aria-label="CI running" />;
  return <CircleDashed className="h-4 w-4 text-muted-foreground" aria-label="no CI" />;
}

export function SolutionBuildActivityCard({ solutionId }: { solutionId: string }) {
  const { data, isLoading, isError } = useSolutionRepoActivity(solutionId);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Build Activity</CardTitle>
        <CardDescription>Live from GitHub — open pull requests, checks, and previews</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking GitHub…</p>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Can&apos;t reach GitHub right now — try again shortly.
          </p>
        ) : data && !data.configured ? (
          <p className="text-sm text-muted-foreground">
            GitHub access is not configured. An admin must set{' '}
            <code className="rounded bg-muted px-1">GITHUB_SOLUTIONS_HUB_TOKEN</code> in the server
            environment to enable live build activity.
          </p>
        ) : !data || data.repos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No repositories linked — link one above to see build activity.
          </p>
        ) : (
          <div className="space-y-5">
            {data.repos.map((repo) => (
              <div key={repo.repo_full_name}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{repo.repo_full_name}</span>
                  {repo.repo_missing ? (
                    <Badge variant="destructive">repo no longer exists — fix or unlink</Badge>
                  ) : repo.intern_ready === true ? (
                    <Badge variant="outline" className="gap-1 border-green-600 text-green-700">
                      <ShieldCheck className="h-3 w-3" /> intern-ready
                    </Badge>
                  ) : repo.intern_ready === false ? (
                    <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700">
                      <ShieldAlert className="h-3 w-3" /> not intern-ready
                    </Badge>
                  ) : null}
                </div>

                {repo.error ? (
                  <p className="text-sm text-muted-foreground">
                    Can&apos;t reach GitHub for this repository right now.
                  </p>
                ) : repo.repo_missing ? null : (
                  <>
                    {repo.open_prs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No open pull requests.</p>
                    ) : (
                      <div className="space-y-2">
                        {repo.open_prs.map((pr) => (
                          <div
                            key={pr.number}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 ${
                              pr.waiting_days >= 3 ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : ''
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <GitPullRequest className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <a
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-sm font-medium hover:underline"
                              >
                                #{pr.number} {pr.title}
                              </a>
                              {pr.draft && <Badge variant="secondary">draft</Badge>}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{pr.author}</span>
                              <CiIcon ci={pr.ci} />
                              {pr.preview_url && (
                                <a
                                  href={pr.preview_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 hover:underline"
                                >
                                  preview <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              <span className={pr.waiting_days >= 3 ? 'font-medium text-amber-700' : ''}>
                                waiting {pr.waiting_days} {pr.waiting_days === 1 ? 'day' : 'days'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {repo.last_shipped && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last shipped:{' '}
                        <a
                          href={repo.last_shipped.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          #{repo.last_shipped.number} {repo.last_shipped.title}
                        </a>{' '}
                        on {format(new Date(repo.last_shipped.merged_at), 'dd MMM yyyy')}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
