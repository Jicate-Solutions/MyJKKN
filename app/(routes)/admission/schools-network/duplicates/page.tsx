'use client';

/**
 * Tidy Duplicate Schools — feeder-school merge tool.
 *
 * Feeder-school names are free-typed at admission time, so the same school
 * arrives under several spellings ("GOVT GIRLS HR SEC" vs "GOVERNMENT GIRLS
 * HIGHER SECONDARY"). This page surfaces system-suggested likely-same pairs and
 * lets admission staff confirm a merge. Merges are NON-DESTRUCTIVE and undoable
 * (an alias link, not a delete), so the page stays safe to click through.
 *
 * Gated on `schools_network.schools.edit`.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeftRight,
  GitMerge,
  Link2Off,
  Loader2,
  School,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { toast } from 'sonner';

import {
  listFeederDupes,
  linkFeeders,
  unlinkFeeder,
  type FeederDupeSuggestion,
  type FeederAliasLink,
} from '../_lib/api';
import { NoAccess } from '../_lib/no-access';

const DUPES_KEY = ['schools-network', 'feeder-dupes'] as const;

/** Stable identity for a suggested pair, used for dismiss + pending tracking. */
function pairKey(s: FeederDupeSuggestion): string {
  return `${s.fromKey}|${s.toKey}`;
}

function learners(n: number): string {
  return `${n} learner${n === 1 ? '' : 's'}`;
}

/** One spelling, shown as a quoted name with its learner count. */
function Spelling({ name, count }: { name: string; count: number }) {
  return (
    <div className="min-w-0">
      <div className="font-medium truncate" title={name}>
        &ldquo;{name}&rdquo;
      </div>
      <div className="text-xs text-muted-foreground">{learners(count)}</div>
    </div>
  );
}

function TidyDuplicatesContent() {
  const queryClient = useQueryClient();

  // Pairs the user marked "Not the same" — client-side only, no API call.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Which row is mid-flight, so we can spinner just that button.
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [unlinkingKey, setUnlinkingKey] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: DUPES_KEY,
    queryFn: listFeederDupes,
    retry: false, // an admin-only 403 shouldn't retry
  });
  // Merging re-groups org-wide feeder data, so it's admin-only on the server.
  // Rather than replicate role logic here, we let the server say no (403) and
  // show the admin-only screen — branching on the HTTP status the route
  // surfaces, not brittle message text (advisory review LOW). A real admin
  // never hits this; only a non-admin edit-holder the RPC refuses does.
  const isAccessDenied =
    !!error && (error as { status?: number }).status === 403;

  const suggestions = data?.suggestions ?? [];
  const links = data?.links ?? [];
  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(pairKey(s)));

  const linkMutation = useMutation({
    mutationFn: linkFeeders,
    onSuccess: () => {
      toast.success('Schools merged — their learners now count as one.');
      queryClient.invalidateQueries({ queryKey: DUPES_KEY });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not merge these schools');
    },
    onSettled: () => setMergingKey(null),
  });

  const unlinkMutation = useMutation({
    mutationFn: unlinkFeeder,
    onSuccess: () => {
      toast.success('Merge undone.');
      queryClient.invalidateQueries({ queryKey: DUPES_KEY });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not undo this merge');
    },
    onSettled: () => setUnlinkingKey(null),
  });

  function handleMerge(s: FeederDupeSuggestion) {
    if (linkMutation.isPending) return; // re-entry guard against a double-fire
    // Merge the SMALLER-count spelling INTO the LARGER-count one so the
    // dominant (more-used) name becomes the surviving school everywhere.
    const input =
      s.fromCount <= s.toCount
        ? { fromKey: s.fromKey, toKey: s.toKey, fromName: s.fromName, toName: s.toName }
        : { fromKey: s.toKey, toKey: s.fromKey, fromName: s.toName, toName: s.fromName };
    setMergingKey(pairKey(s));
    linkMutation.mutate(input);
  }

  function dismissPair(s: FeederDupeSuggestion) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(pairKey(s));
      return next;
    });
  }

  function handleUnlink(link: FeederAliasLink) {
    setUnlinkingKey(link.fromKey);
    unlinkMutation.mutate(link.fromKey);
  }

  return (
    <div className="space-y-6">
      {/* Plain-English framing so a non-technical user knows this is safe. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Tidy duplicate schools
          </CardTitle>
          <CardDescription>
            Some schools were typed in under different spellings. Confirm the ones
            that are the same and we&apos;ll combine their learners everywhere. This
            is safe and undoable.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Suggestions ------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitMerge className="h-5 w-5" /> Likely duplicates to review
            {!isLoading && visibleSuggestions.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {visibleSuggestions.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : isAccessDenied ? (
            <div className="text-center py-12">
              <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">Administrators only</h3>
              <p className="text-sm text-muted-foreground">
                Merging duplicate schools changes network-wide data, so it&apos;s
                limited to administrators.
              </p>
            </div>
          ) : error ? (
            // A real failure (DB error / suggestions-scan timeout) must NOT fall
            // through to the "list looks tidy" empty state — that would falsely
            // tell an admin there are zero duplicates (advisory review MEDIUM).
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">
                Couldn&apos;t load duplicate suggestions
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {(error as Error).message || 'Something went wrong. Please try again.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: DUPES_KEY })
                }
              >
                Try again
              </Button>
            </div>
          ) : visibleSuggestions.length === 0 ? (
            <div className="text-center py-12">
              <School className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">
                No likely duplicates found
              </h3>
              <p className="text-sm text-muted-foreground">
                The list looks tidy.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleSuggestions.map((s) => {
                const key = pairKey(s);
                const isMerging = mergingKey === key && linkMutation.isPending;
                // Merge folds the smaller-count spelling into the larger one.
                // Use the SAME `<=` comparator as handleMerge so the survivor
                // named here matches what actually merges on an exact tie
                // (advisory review MEDIUM: dialog named the opposite school).
                const keepName = s.fromCount <= s.toCount ? s.toName : s.fromName;
                const foldName = s.fromCount <= s.toCount ? s.fromName : s.toName;
                const keepCount = Math.max(s.fromCount, s.toCount);
                const foldCount = Math.min(s.fromCount, s.toCount);
                return (
                  <div
                    key={key}
                    className="rounded-lg border p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Spelling name={s.fromName} count={s.fromCount} />
                      <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Spelling name={s.toName} count={s.toCount} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Badge variant="outline" className="whitespace-nowrap">
                        {Math.round(s.similarity * 100)}% match
                      </Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" disabled={isMerging}>
                            {isMerging ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <GitMerge className="h-4 w-4 mr-2" />
                            )}
                            Same school — merge
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Combine these two schools?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              &ldquo;{foldName}&rdquo; ({learners(foldCount)}) will be
                              combined into &ldquo;{keepName}&rdquo; ({learners(keepCount)}
                              ). Their learners will count as one school everywhere in
                              the network. You can undo this at any time.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleMerge(s)}>
                              Combine
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dismissPair(s)}
                        disabled={isMerging}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Not the same
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Already-merged links --------------------------------------------- */}
      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2Off className="h-5 w-5" /> Merged schools
            </CardTitle>
            <CardDescription>
              These spellings are already combined. Unlink any that were merged by
              mistake.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {links.map((link) => {
                const isUnlinking =
                  unlinkingKey === link.fromKey && unlinkMutation.isPending;
                return (
                  <div
                    key={link.fromKey}
                    className="rounded-lg border p-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-2 min-w-0 text-sm">
                      <span className="truncate text-muted-foreground" title={link.fromName ?? link.fromKey}>
                        &ldquo;{link.fromName ?? link.fromKey}&rdquo;
                      </span>
                      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium" title={link.toName ?? link.toKey}>
                        &ldquo;{link.toName ?? link.toKey}&rdquo;
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUnlink(link)}
                      disabled={unlinkMutation.isPending}
                    >
                      {isUnlinking ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Link2Off className="h-4 w-4 mr-2" />
                      )}
                      Unlink
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function TidyDuplicatesPage() {
  return (
    <PermissionGuard
      module="schools_network.schools"
      action="edit"
      fallback={<NoAccess what="tidy duplicate schools" />}
    >
      <ContentLayout title="Tidy Duplicate Schools">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/schools-network">
                Schools Network
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Tidy Duplicates</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <TidyDuplicatesContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
