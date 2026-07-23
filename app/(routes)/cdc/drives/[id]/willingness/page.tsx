'use client';

/**
 * T1.1 — Learner-facing willingness declaration page.
 *
 * Reached via the notification dropped by A1 (PR #988) for the 580 learners
 * targeted when a drive transitions to `willingness_open`. URL pattern:
 *   /cdc/drives/[id]/willingness
 *
 * Coordinator detail page at /cdc/drives/[id] is NOT modified.
 *
 * 2026-05-21 — INTENTIONALLY not wrapped in <PermissionGuard module="cdc.drives" action="view">
 *   because this is a learner self-service surface. Students typically lack
 *   cdc.drives.view (that's the coordinator dashboard) but must be able to
 *   respond to the willingness invite they received. Access is enforced at the
 *   RLS layer: the willingness service queries the row keyed on
 *   `learner_id = auth.uid()`, so unauthorized users get a "not eligible" view
 *   instead of data leakage.
 *
 * Behavior matrix:
 *   - drive not willingness_open  → "drive not currently open" message
 *   - learner not eligible        → friendly explainer, no submit buttons
 *   - no existing willingness     → show "I'm in" + "I decline"
 *   - existing status='willing'   → show "You're in" + "Withdraw"
 *   - existing status='withdrawn' → show "You declined" + "Change to I'm in"
 *   - existing status='confirmed' → show locked badge (post-window state)
 */

import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Info,
  MapPin,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import type { LearnerWillingnessSnapshot } from '@/lib/services/cdc/willingness-service';
import type { CdcDriveWillingness } from '@/types/cdc';
import { CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';

const API_BASE = '/api/cdc/drives';

function useLearnerWillingnessSnapshot(driveId: string) {
  return useQuery({
    queryKey: ['cdc-learner-willingness', driveId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/${driveId}/willingness`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to load willingness page (${res.status})`);
      }
      return (await res.json()) as LearnerWillingnessSnapshot;
    },
    enabled: !!driveId,
  });
}

function useDeclareWillingness(driveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (intent: 'willing' | 'decline') => {
      const res = await fetch(`${API_BASE}/${driveId}/willingness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Declaration failed');
      }
      return (await res.json()).data as CdcDriveWillingness;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-learner-willingness', driveId] });
    },
  });
}

export default function CdcDriveWillingnessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: snapshot, isLoading, error } = useLearnerWillingnessSnapshot(id);
  const declare = useDeclareWillingness(id);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <ContentLayout title="Drive willingness">
        <p className="text-sm text-muted-foreground p-6">Loading…</p>
      </ContentLayout>
    );
  }

  if (error || !snapshot) {
    return (
      <ContentLayout title="Drive willingness">
        <div className="p-6">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load this drive'}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const { drive, eligibility, recruiter, drive_type, willingness, is_eligible, is_window_open } =
    snapshot;

  async function handleDeclare(intent: 'willing' | 'decline') {
    setSubmitError(null);
    try {
      await declare.mutateAsync(intent);
      toast.success(
        intent === 'willing'
          ? "You're in. Good luck."
          : 'Noted — you declined this drive.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save your response';
      setSubmitError(msg);
      toast.error(msg);
    }
  }

  // What the action card should render — purely a function of state.
  const currentStatus = willingness?.status ?? null;
  const showInitialButtons = is_window_open && is_eligible && !currentStatus;
  const showWithdrawButton = is_window_open && is_eligible && currentStatus === 'willing';
  const showOptInAgainButton =
    is_window_open && is_eligible && currentStatus === 'withdrawn';
  const isLocked = currentStatus === 'confirmed' || currentStatus === 'no_show';

  return (
    <ContentLayout title={drive.title}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Drive willingness</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Left: Drive details */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{drive.title}</CardTitle>
                  {drive.description ? (
                    <p className="text-sm text-muted-foreground mt-1">{drive.description}</p>
                  ) : null}
                </div>
                <Badge variant={is_window_open ? 'default' : 'secondary'}>
                  {CDC_DRIVE_STATUS_LABELS[drive.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Recruiter:</span>
                <span>{recruiter?.name ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Type:</span>
                <span>{drive_type?.display_name ?? '—'}</span>
              </div>
              {drive.drive_date ? (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Date:</span>
                  <span>
                    {drive.drive_date}
                    {drive.drive_start_time ? ` · ${drive.drive_start_time}` : ''}
                    {drive.drive_end_time ? ` – ${drive.drive_end_time}` : ''}
                  </span>
                </div>
              ) : null}
              {drive.venue_label ? (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Venue:</span>
                  <span>{drive.venue_label}</span>
                </div>
              ) : null}
              {drive.job_role_title ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Role:</span>
                  <span>{drive.job_role_title}</span>
                </div>
              ) : null}
              {drive.job_location ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Location:</span>
                  <span>{drive.job_location}</span>
                </div>
              ) : null}
              {drive.expected_package_lpa ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Expected package:</span>
                  <span>{drive.expected_package_lpa} LPA</span>
                </div>
              ) : recruiter?.package_band_min_lpa || recruiter?.package_band_max_lpa ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Package band:</span>
                  <span>
                    {recruiter.package_band_min_lpa ?? '—'}–
                    {recruiter.package_band_max_lpa ?? '—'} LPA
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Eligibility criteria */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eligibility</CardTitle>
            </CardHeader>
            <CardContent>
              {!eligibility ? (
                <p className="text-sm text-muted-foreground">
                  Eligibility criteria have not been published for this drive yet.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <span className="font-medium">Programs accepted:</span>{' '}
                    {eligibility.program_ids.length} program(s)
                  </li>
                  {eligibility.min_cgpa != null ? (
                    <li>
                      <span className="font-medium">Minimum CGPA:</span> {eligibility.min_cgpa}
                    </li>
                  ) : null}
                  {eligibility.min_semester != null ? (
                    <li>
                      <span className="font-medium">Minimum semester:</span>{' '}
                      {eligibility.min_semester}
                    </li>
                  ) : null}
                  {eligibility.max_arrears != null ? (
                    <li>
                      <span className="font-medium">Maximum arrears:</span>{' '}
                      {eligibility.max_arrears}
                    </li>
                  ) : null}
                  {eligibility.allowed_genders && eligibility.allowed_genders.length > 0 ? (
                    <li>
                      <span className="font-medium">Allowed:</span>{' '}
                      {eligibility.allowed_genders.join(', ')}
                    </li>
                  ) : null}
                  <li>
                    <span className="font-medium">Passed-out learners allowed:</span>{' '}
                    {eligibility.passed_out_allowed ? 'Yes' : 'No'}
                  </li>
                  {eligibility.additional_notes ? (
                    <li className="pt-2 text-muted-foreground">
                      {eligibility.additional_notes}
                    </li>
                  ) : null}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Declaration / status panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your response</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Window closed */}
              {!is_window_open ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>This drive is not open for willingness right now.</AlertTitle>
                  <AlertDescription>
                    Current status: {CDC_DRIVE_STATUS_LABELS[drive.status]}. You cannot declare
                    or change your response.
                  </AlertDescription>
                </Alert>
              ) : null}

              {/* Window open, but learner not eligible */}
              {is_window_open && !is_eligible ? (
                <Alert>
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Not eligible</AlertTitle>
                  <AlertDescription>
                    {!eligibility
                      ? 'Eligibility criteria have not been configured for this drive yet.'
                      : "Your program is not in this drive's eligibility list."}
                  </AlertDescription>
                </Alert>
              ) : null}

              {/* Existing willingness — show current state */}
              {currentStatus ? (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    {currentStatus === 'willing' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : currentStatus === 'withdrawn' ? (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    )}
                    <span className="font-medium">
                      {currentStatus === 'willing'
                        ? "You're in"
                        : currentStatus === 'withdrawn'
                          ? 'You declined this drive'
                          : currentStatus === 'confirmed'
                            ? 'Confirmed (locked)'
                            : currentStatus === 'no_show'
                              ? 'Marked as no-show'
                              : currentStatus}
                    </span>
                  </div>
                  {willingness?.declared_at ? (
                    <p className="text-xs text-muted-foreground">
                      Last updated: {new Date(willingness.declared_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Primary actions */}
              {showInitialButtons ? (
                <div className="grid gap-2">
                  <Button
                    onClick={() => handleDeclare('willing')}
                    disabled={declare.isPending}
                    size="lg"
                    className="w-full"
                  >
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    I'm in
                  </Button>
                  <Button
                    onClick={() => handleDeclare('decline')}
                    disabled={declare.isPending}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    I decline
                  </Button>
                </div>
              ) : null}

              {showWithdrawButton ? (
                <Button
                  onClick={() => handleDeclare('decline')}
                  disabled={declare.isPending}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Withdraw
                </Button>
              ) : null}

              {showOptInAgainButton ? (
                <Button
                  onClick={() => handleDeclare('willing')}
                  disabled={declare.isPending}
                  size="sm"
                  className="w-full"
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Change to "I'm in"
                </Button>
              ) : null}

              {isLocked ? (
                <p className="text-xs text-muted-foreground">
                  This response has been locked by the placement team. Contact the coordinator
                  if you need to change it.
                </p>
              ) : null}

              {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
