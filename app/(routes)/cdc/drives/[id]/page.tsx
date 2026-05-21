'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Calendar, MapPin, Users, ArrowRight, XCircle } from 'lucide-react';
import { useCdcDrive, useTransitionCdcDrive } from '@/hooks/cdc/use-cdc-drives';
import type { CdcDriveStatus } from '@/types/cdc';
import { CDC_DRIVE_STATE_GRAPH, CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';

const STATUS_BADGE_VARIANT: Record<CdcDriveStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  announced: 'secondary',
  willingness_open: 'default',
  eligibility_locked: 'default',
  attendance_day: 'default',
  results_announced: 'default',
  closed: 'secondary',
  cancelled: 'destructive',
};

export default function CdcDriveDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.drives" action="view">
      <CdcDriveDetailContent {...props} />
    </PermissionGuard>
  );
}

function CdcDriveDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, error } = useCdcDrive(id);
  const transition = useTransitionCdcDrive();

  const [transitionReason, setTransitionReason] = useState('');
  const [pendingStatus, setPendingStatus] = useState<CdcDriveStatus | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <ContentLayout title="Drive">
        <p className="text-sm text-muted-foreground p-6">Loading drive…</p>
      </ContentLayout>
    );
  }

  if (error || !data) {
    return (
      <ContentLayout title="Drive">
        <div className="p-6">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Drive not found'}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/cdc/drives">Back to drives</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const drive = data.data;
  const skipStates = (data.drive_type?.skip_states as string[] | null) ?? null;

  // Compute allowed next states: graph edges, plus walk-in skip-states from announced
  const allowedNext = new Set<CdcDriveStatus>(CDC_DRIVE_STATE_GRAPH[drive.status] ?? []);
  if (skipStates && drive.status === 'announced') {
    skipStates.forEach((s) => {
      if (s === 'results_announced' || s === 'closed') {
        allowedNext.add(s as CdcDriveStatus);
      }
    });
  }

  async function handleTransition(toStatus: CdcDriveStatus) {
    setTransitionError(null);
    try {
      await transition.mutateAsync({
        driveId: id,
        payload: {
          to_status: toStatus,
          reason: transitionReason.trim() || null,
        },
      });
      setPendingStatus(null);
      setTransitionReason('');
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Transition failed');
    }
  }

  return (
    <ContentLayout title={drive.title}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/cdc/drives">Drives</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{drive.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Left: Details */}
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
                <Badge variant={STATUS_BADGE_VARIANT[drive.status]}>
                  {CDC_DRIVE_STATUS_LABELS[drive.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Recruiter:</span>
                <span>{data.recruiter?.name ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Type:</span>
                <span>{data.drive_type?.display_name ?? '—'}</span>
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
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Institutions:</span>
                <span>{drive.institutions.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Rounds:</span>
                <span>{drive.rounds_count}</span>
              </div>
              {drive.expected_package_lpa ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Expected package:</span>
                  <span>{drive.expected_package_lpa} LPA</span>
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
            </CardContent>
          </Card>

          {/* State transition history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status history</CardTitle>
            </CardHeader>
            <CardContent>
              {data.state_transitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No transitions yet. This drive is still in its initial state.
                </p>
              ) : (
                <ol className="space-y-2">
                  {data.state_transitions.map((t) => (
                    <li
                      key={t.id}
                      className="border rounded-md p-3 text-sm flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {t.from_status ? (
                            <>
                              <span>{CDC_DRIVE_STATUS_LABELS[t.from_status]}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            </>
                          ) : null}
                          <Badge variant={STATUS_BADGE_VARIANT[t.to_status]} className="text-xs">
                            {CDC_DRIVE_STATUS_LABELS[t.to_status]}
                          </Badge>
                        </div>
                        {t.reason ? (
                          <p className="text-xs text-muted-foreground mt-1">{t.reason}</p>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(t.transitioned_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: State machine actions + stats */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Willingness submitted</span>
                <span className="font-medium">{data.willingness_count}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Transitions logged</span>
                <span className="font-medium">{data.state_transitions.length}</span>
              </div>
            </CardContent>
          </Card>

          <PermissionGuard module="cdc.drives" action="edit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advance state</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {allowedNext.size === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This drive is in a terminal state. No further transitions are possible.
                </p>
              ) : pendingStatus ? (
                <div className="space-y-3">
                  <p className="text-sm">
                    Move from <strong>{CDC_DRIVE_STATUS_LABELS[drive.status]}</strong> to{' '}
                    <strong>{CDC_DRIVE_STATUS_LABELS[pendingStatus]}</strong>?
                  </p>
                  <div>
                    <Label htmlFor="transition-reason">
                      Reason {pendingStatus === 'cancelled' ? '(required)' : '(optional)'}
                    </Label>
                    <Textarea
                      id="transition-reason"
                      value={transitionReason}
                      onChange={(e) => setTransitionReason(e.target.value)}
                      rows={3}
                      placeholder={
                        pendingStatus === 'cancelled'
                          ? 'Why is this drive being cancelled?'
                          : 'Optional context for the audit trail'
                      }
                    />
                  </div>
                  {transitionError ? (
                    <p className="text-xs text-destructive">{transitionError}</p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleTransition(pendingStatus)}
                      disabled={
                        transition.isPending ||
                        (pendingStatus === 'cancelled' && !transitionReason.trim())
                      }
                      variant={pendingStatus === 'cancelled' ? 'destructive' : 'default'}
                      size="sm"
                    >
                      {transition.isPending ? 'Working…' : 'Confirm'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPendingStatus(null);
                        setTransitionReason('');
                        setTransitionError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.from(allowedNext).map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      onClick={() => setPendingStatus(nextStatus)}
                      variant={nextStatus === 'cancelled' ? 'destructive' : 'default'}
                      size="sm"
                      className="w-full justify-start"
                    >
                      {nextStatus === 'cancelled' ? (
                        <XCircle className="h-4 w-4 mr-2" />
                      ) : (
                        <ArrowRight className="h-4 w-4 mr-2" />
                      )}
                      {CDC_DRIVE_STATUS_LABELS[nextStatus]}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </PermissionGuard>
        </div>
      </div>
    </ContentLayout>
  );
}
