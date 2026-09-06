'use client';

/**
 * Rescue Shared-Name Schools — split a generic feeder by home pincode.
 *
 * Some feeder "schools" are ONE row but really MANY different schools that
 * share a generic government name ("G(B)HSS", "GOVERNMENT HIGHER SECONDARY
 * SCHOOL"). They span towns across the state, so they can't be adopted or
 * worked as a single school — and merging them (Tidy Duplicates) would be
 * WRONG, because they aren't spellings of one school.
 *
 * The learner's own home location IS on file. This page splits such a feeder's
 * learners BY HOME PINCODE into candidate groups; an admin ticks the pincodes
 * that are the SAME real school (one school draws from several nearby pincodes)
 * and confirms them into a real, adoptable school. Learners with no pincode go
 * to an "unknown location" bucket for manual sorting.
 *
 * Confirming creates an org-wide school row, so this is admin-only (the server
 * says no with a 403; we render the admin-only screen). Gated schools.edit.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  Check,
  Loader2,
  MapPin,
  School,
  ShieldAlert,
  Split,
  Undo2,
  Users,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { toast } from 'sonner';

import {
  listRescueOverview,
  listSplitCandidates,
  confirmSplit,
  unconfirmSplit,
  type GenericFeeder,
  type SplitCandidate,
  type ConfirmedSplit,
} from '../_lib/rescue-api';
import { NoAccess } from '../_lib/no-access';

const OVERVIEW_KEY = ['schools-network', 'feeder-splits', 'overview'] as const;
function candidatesKey(feeder: string) {
  return ['schools-network', 'feeder-splits', 'candidates', feeder] as const;
}

function learners(n: number): string {
  return `${n} learner${n === 1 ? '' : 's'}`;
}

/** Is this the unknown-location bucket (no home pincode on file)? */
function isUnknown(c: SplitCandidate): boolean {
  return c.pincode === null;
}

function is403(error: unknown): boolean {
  return !!error && (error as { status?: number }).status === 403;
}

function RescueContent() {
  const queryClient = useQueryClient();

  const [selectedFeeder, setSelectedFeeder] = useState<string | null>(null);
  // Only REAL pincodes are selectable — the unknown bucket is never confirmable.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: listRescueOverview,
    retry: false, // an admin-only 403 shouldn't retry
  });

  const candidates = useQuery({
    queryKey: candidatesKey(selectedFeeder ?? ''),
    queryFn: () => listSplitCandidates(selectedFeeder as string),
    enabled: !!selectedFeeder,
    retry: false,
  });

  const feeders = overview.data?.feeders ?? [];
  const splits = overview.data?.splits ?? [];
  const candidateRows = candidates.data?.candidates ?? [];
  // A 403 from EITHER RPC means admin-only — route both to the admin-only screen
  // (not just overview), so a candidates 403 doesn't fall through to the generic
  // "Could not load pincode groups" and mask the real permission cause.
  const accessDenied = is403(overview.error) || is403(candidates.error);

  // The groups the admin has ticked (real, still-unclaimed pincodes only). The
  // `!alreadyConfirmed` guard matters after a refetch: a pincode another admin
  // just confirmed must drop out of the submission even if it's still in
  // `checked` — otherwise a stale tick would feed a duplicate-claim confirm.
  const selectedGroups = useMemo(
    () =>
      candidateRows.filter(
        (c) => c.pincode !== null && !c.alreadyConfirmed && checked.has(c.pincode)
      ),
    [candidateRows, checked]
  );
  const selectedLearners = selectedGroups.reduce((s, g) => s + g.learnerCount, 0);
  // The dominant (largest) ticked group seeds the default name + district.
  const dominant = useMemo(
    () =>
      selectedGroups.reduce<SplitCandidate | null>(
        (best, g) => (best === null || g.learnerCount > best.learnerCount ? g : best),
        null
      ),
    [selectedGroups]
  );

  const confirmMutation = useMutation({
    mutationFn: confirmSplit,
    onSuccess: () => {
      toast.success('School record created — you can now adopt and track it.');
      setDialogOpen(false);
      setChecked(new Set());
      queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
      if (selectedFeeder) {
        queryClient.invalidateQueries({ queryKey: candidatesKey(selectedFeeder) });
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not create the school');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: unconfirmSplit,
    onSuccess: () => {
      toast.success('Split undone.');
      queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
      if (selectedFeeder) {
        queryClient.invalidateQueries({ queryKey: candidatesKey(selectedFeeder) });
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not undo this split');
    },
    onSettled: () => setUnlinkingId(null),
  });

  function pickFeeder(f: GenericFeeder) {
    setSelectedFeeder(f.schoolName);
    setChecked(new Set()); // reset ticks when switching feeders
  }

  function toggle(pincode: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(pincode)) next.delete(pincode);
      else next.add(pincode);
      return next;
    });
  }

  function openConfirmDialog() {
    if (!selectedFeeder || selectedGroups.length === 0) return;
    const town = dominant?.town?.trim();
    setName(town ? `${selectedFeeder} — ${town}` : selectedFeeder);
    setDistrict(dominant?.district?.trim() ?? '');
    setDialogOpen(true);
  }

  function submitConfirm() {
    if (!selectedFeeder) return;
    if (!name.trim()) {
      toast.error('Give the school a name');
      return;
    }
    confirmMutation.mutate({
      genericKey: selectedFeeder,
      pincodes: selectedGroups.map((g) => g.pincode as string),
      name: name.trim(),
      district: district.trim() || null,
    });
  }

  // ── Admin-only + hard-error gates (mirror Tidy Duplicates) ─────────────────
  if (accessDenied) {
    return (
      <div className="text-center py-16">
        <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-1">Administrators only</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Rescuing shared-name schools creates network-wide school records, so
          it&apos;s limited to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plain-English framing so a non-technical user knows what this does. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Split className="h-5 w-5 text-primary" /> Rescue shared-name schools
          </CardTitle>
          <CardDescription>
            Some &ldquo;schools&rdquo; are really many different schools that share a
            generic name (like &ldquo;G(B)HSS&rdquo;), so they can&apos;t be adopted as
            one. Pick a feeder on the left, then tick the home-pincode groups that are
            the same real school and turn them into a school you can actually work.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* LEFT — generic feeders to split ------------------------------------ */}
        <Card className="lg:sticky lg:top-4 self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <School className="h-5 w-5" /> Feeders to split
              {!overview.isLoading && feeders.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {feeders.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              These span many home pincodes — a sign they&apos;re several schools
              under one name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overview.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : overview.error ? (
              <div className="text-center py-10">
                <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  {(overview.error as Error).message || 'Something went wrong.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY })}
                >
                  Try again
                </Button>
              </div>
            ) : feeders.length === 0 ? (
              <div className="text-center py-10">
                <Check className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No shared-name feeders need splitting right now.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {feeders.map((f) => {
                  const active = selectedFeeder === f.schoolName;
                  return (
                    <button
                      key={f.schoolName}
                      type="button"
                      onClick={() => pickFeeder(f)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        active
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="font-medium truncate" title={f.schoolName}>
                        {f.schoolName}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {learners(f.learnerCount)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {f.distinctPincodes} pincodes
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT — pincode candidate groups for the picked feeder ------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5" /> Home-pincode groups
            </CardTitle>
            <CardDescription>
              {selectedFeeder
                ? 'Tick the pincode groups that are the SAME real school, then confirm them as one.'
                : 'Pick a feeder on the left to see its home-pincode groups.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedFeeder ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <School className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                Nothing selected yet.
              </div>
            ) : candidates.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : candidates.error ? (
              <div className="text-center py-10">
                <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  {(candidates.error as Error).message || 'Could not load pincode groups.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    queryClient.invalidateQueries({
                      queryKey: candidatesKey(selectedFeeder),
                    })
                  }
                >
                  Try again
                </Button>
              </div>
            ) : candidateRows.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No pincode groups found for this feeder.
              </div>
            ) : (
              <div className="space-y-2">
                {candidateRows.map((c) => {
                  const unknown = isUnknown(c);
                  const key = c.pincode ?? '__unknown__';
                  const disabled = unknown || c.alreadyConfirmed;
                  const isChecked = !unknown && !!c.pincode && checked.has(c.pincode);
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        disabled
                          ? 'opacity-70'
                          : 'cursor-pointer hover:bg-muted/50'
                      } ${isChecked ? 'border-primary bg-primary/5' : ''}`}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={disabled}
                        onCheckedChange={() => c.pincode && toggle(c.pincode)}
                        aria-label={
                          unknown ? 'Unknown location (not selectable)' : `Pincode ${c.pincode}`
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {unknown ? 'Unknown location' : c.pincode}
                          </span>
                          {c.alreadyConfirmed && (
                            <Badge variant="outline" className="text-xs">
                              <Check className="h-3 w-3 mr-1" /> Done
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {unknown
                            ? 'No home pincode on file — sort these manually.'
                            : [c.town, c.district].filter(Boolean).join(', ') ||
                              'Location not recorded'}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {learners(c.learnerCount)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
          {selectedFeeder && candidateRows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
              <p className="text-sm text-muted-foreground">
                {selectedGroups.length > 0
                  ? `${selectedGroups.length} group${
                      selectedGroups.length === 1 ? '' : 's'
                    } · ${learners(selectedLearners)}`
                  : 'Tick one or more pincode groups.'}
              </p>
              <Button
                size="sm"
                disabled={selectedGroups.length === 0}
                onClick={openConfirmDialog}
              >
                <Split className="h-4 w-4 mr-2" /> Confirm as one school
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Confirmed splits ---------------------------------------------------- */}
      {splits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5" /> Schools rescued so far
            </CardTitle>
            <CardDescription>
              Each of these was carved out of a shared-name feeder. Unlink one if
              it was confirmed by mistake.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {splits.map((s: ConfirmedSplit) => {
                const isUnlinking = unlinkingId === s.id && unlinkMutation.isPending;
                return (
                  <div
                    key={s.id}
                    className="rounded-lg border p-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate" title={s.confirmedName ?? ''}>
                        {s.confirmedName ?? '(unnamed school)'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[s.district, `${s.pincodes.length} pincode${s.pincodes.length === 1 ? '' : 's'}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={unlinkMutation.isPending}
                      onClick={() => {
                        setUnlinkingId(s.id);
                        unlinkMutation.mutate(s.id);
                      }}
                    >
                      {isUnlinking ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4 mr-2" />
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

      {/* Name-the-school dialog --------------------------------------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this school</DialogTitle>
            <DialogDescription>
              Combining {selectedGroups.length} pincode group
              {selectedGroups.length === 1 ? '' : 's'} ({learners(selectedLearners)}) into
              one real, adoptable school. This creates a new school record you can undo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="split-name">School name</Label>
              <Input
                id="split-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. G(B)HSS — Rasipuram"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="split-district">District</Label>
              <Input
                id="split-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. Namakkal"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={confirmMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitConfirm} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create school
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RescueSchoolsPage() {
  return (
    <PermissionGuard
      module="schools_network.schools"
      action="edit"
      fallback={<NoAccess what="rescue shared-name schools" />}
    >
      <ContentLayout title="Rescue Shared-Name Schools">
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
              <BreadcrumbPage>Rescue Shared-Name Schools</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <RescueContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
