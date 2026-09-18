'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowRight,
  Bell,
  Building2,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  MapPin,
  Pencil,
  Users,
  XCircle,
  ClipboardCheck,
} from 'lucide-react';
import {
  useCdcDrive,
  useTransitionCdcDriveWithNotify,
  useUpdateCdcDrive,
  cdcDriveResponsesExportUrl,
} from '@/hooks/cdc/use-cdc-drives';
import { useCdcDriveEligibility } from '@/hooks/cdc/use-cdc-drive-eligibility';
import { DriveEligibilityCard } from './_components/eligibility-card';
import type { CdcDriveStatus } from '@/types/cdc';
import { CDC_DRIVE_STATE_GRAPH, CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';
import { driveCircularOf } from '@/lib/services/cdc/drive-service';
import { DriveStatusBadge, STATUS_BADGE_VARIANT } from '../_components/drive-status-badge';
import { describeTargeting } from '../_components/institution-semester-picker';
import { CircularAttachment } from '../_components/circular-attachment';

const TRANSITION_HINT: Partial<Record<CdcDriveStatus, string>> = {
  announced: 'Coordinators and heads are informed. Learners are not notified yet.',
  willingness_open:
    'Learners in the selected institutions and semesters get a push notification right away and can confirm willingness.',
  eligibility_locked: 'Freezes the willingness list. Learners can no longer change their response.',
  cancelled: 'Everyone who responded is told the drive is cancelled.',
};

export default function CdcDriveDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const router = useRouter();
  const { profile, isLoading: loading } = useAuth();
  // A learner landing on the staff URL (e.g. an old link) is sent to their own
  // view of the drive instead of a permission-denied screen.
  const isLearner = !!profile?.learner_id && profile.role === 'student';
  useEffect(() => {
    if (!loading && isLearner) router.replace(`/cdc/drives/${id}/willingness`);
  }, [loading, isLearner, id, router]);
  if (loading || isLearner) {
    return (
      <ContentLayout title="Drive">
        <p className="text-sm text-muted-foreground p-6">Loading drive…</p>
      </ContentLayout>
    );
  }
  return (
    <PermissionGuard module="cdc.drives" action="view">
      <CdcDriveDetailContent params={props.params} />
    </PermissionGuard>
  );
}

function CdcDriveDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useCdcDrive(id);
  const { data: eligibilityData } = useCdcDriveEligibility(id);
  const transition = useTransitionCdcDriveWithNotify();
  const updateDrive = useUpdateCdcDrive();

  const [transitionReason, setTransitionReason] = useState('');
  const [pendingStatus, setPendingStatus] = useState<CdcDriveStatus | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  // Captured once per mount so the render stays pure (deadline comparison).
  const [loadedAt] = useState(() => Date.now());

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
  const circular = driveCircularOf(drive);
  const skipStates = (data.drive_type?.skip_states as string[] | null) ?? null;
  const editable = drive.status !== 'closed' && drive.status !== 'cancelled';
  const circularEditable = editable;
  const targeting = drive.institution_semesters ?? [];
  const eligibility = data.eligibility;
  const ns = data.notification_summary;
  const deadlinePassed =
    !!drive.willingness_window_close_at && new Date(drive.willingness_window_close_at).getTime() < loadedAt;

  const allowedNext = new Set<CdcDriveStatus>(CDC_DRIVE_STATE_GRAPH[drive.status] ?? []);
  if (skipStates && drive.status === 'announced') {
    skipStates.forEach((s) => {
      if (s === 'results_announced' || s === 'closed') allowedNext.add(s as CdcDriveStatus);
    });
  }

  // The server refuses willingness_open without eligibility criteria (see
  // CdcDriveService.transitionDrive). Mirror that here so the button explains
  // itself instead of failing after the click.
  const hasEligibility =
    (eligibilityData?.data?.program_ids?.length ?? 0) > 0 || (drive.institution_semesters?.length ?? 0) > 0;

  async function handleTransition(toStatus: CdcDriveStatus) {
    setTransitionError(null);
    try {
      const result = await transition.mutateAsync({
        driveId: id,
        payload: { to_status: toStatus, reason: transitionReason.trim() || null },
      });
      setPendingStatus(null);
      setTransitionReason('');
      if (toStatus === 'willingness_open') {
        const n = result.notify;
        if (result.notify_error) {
          toast.error(`Willingness opened, but notifying learners failed: ${result.notify_error}`);
        } else if (!n || n.skipped === 'no_targeting') {
          toast.warning('Willingness opened. No institution/semester audience is set, so no learner was notified.');
        } else if (n.skipped === 'idempotent') {
          toast.info('Willingness opened. Learners were already notified for this drive — no duplicate sent.');
        } else if (n.skipped === 'no_recipients') {
          toast.warning(
            n.already_notified > 0
              ? 'Willingness opened. Every eligible learner had already been notified — nothing re-sent.'
              : 'Willingness opened, but no learners matched the selected institutions and semesters.'
          );
        } else {
          toast.success(
            `Willingness opened. ${n.notified} learner${n.notified === 1 ? '' : 's'} notified` +
              (n.push ? ` · ${n.push.sent} push delivered` : '') +
              (n.unlinked_learners ? ` · ${n.unlinked_learners} without a login skipped` : '')
          );
        }
      } else {
        toast.success(`Drive moved to ${CDC_DRIVE_STATUS_LABELS[toStatus]}`);
      }
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Transition failed');
    }
  }

  async function handleCircularChange(next: ReturnType<typeof driveCircularOf>) {
    try {
      await updateDrive.mutateAsync({ driveId: id, payload: { circular: next } });
      toast.success(next ? 'Circular attached' : 'Circular removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update circular');
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
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 px-5 py-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/80">
                    {data.recruiter?.name ?? 'Recruiter'} · {data.drive_type?.display_name ?? 'Campus drive'}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold leading-tight">{drive.title}</h2>
                  {drive.description ? (
                    <p className="mt-1 text-sm text-white/85 line-clamp-2">{drive.description}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <DriveStatusBadge status={drive.status} className="bg-white/95 text-foreground border-white/60 dark:bg-white/95" />
                  <PermissionGuard module="cdc.drives" action="edit" fallback={null}>
                    {editable ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/cdc/drives/${id}/edit`}>
                          <Pencil className="h-4 w-4 mr-1" /> Edit Drive
                        </Link>
                      </Button>
                    ) : null}
                  </PermissionGuard>
                </div>
              </div>
            </div>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-4 text-sm">
              <FactTile icon={<Building2 className="h-4 w-4" />} tone="emerald" label="Recruiter" value={data.recruiter?.name ?? '—'} />
              <FactTile
                icon={<Clock className="h-4 w-4" />}
                tone={deadlinePassed ? 'rose' : 'amber'}
                label="Willingness deadline"
                value={
                  drive.willingness_window_close_at
                    ? `${new Date(drive.willingness_window_close_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}${deadlinePassed ? ' (passed)' : ''}`
                    : 'No deadline'
                }
              />
              <FactTile
                icon={<Calendar className="h-4 w-4" />}
                tone="sky"
                label="Drive date"
                value={
                  drive.drive_date
                    ? `${drive.drive_date}${drive.drive_start_time ? ` · ${drive.drive_start_time}` : ''}${drive.drive_end_time ? ` – ${drive.drive_end_time}` : ''}`
                    : 'Not set'
                }
              />
              <FactTile
                icon={<MapPin className="h-4 w-4" />}
                tone="violet"
                label={drive.drive_mode === 'off_campus' ? 'Location' : 'Venue'}
                value={
                  <>
                    {drive.venue_label ?? drive.job_location ?? '—'}
                    {drive.location_url ? (
                      <a href={drive.location_url} target="_blank" rel="noopener noreferrer" className="ml-2 underline inline-flex items-center gap-1 text-xs">
                        <ExternalLink className="h-3 w-3" /> map
                      </a>
                    ) : null}
                  </>
                }
              />
              <FactTile
                icon={<Users className="h-4 w-4" />}
                tone="indigo"
                label="Mode · Rounds"
                value={`${{ on_campus: 'On-Campus', off_campus: 'Off-Campus', walk_in: 'Walk-in' }[drive.drive_mode] ?? '—'} · ${drive.rounds_count} round${drive.rounds_count === 1 ? '' : 's'}`}
              />
              <FactTile
                icon={<GraduationCap className="h-4 w-4" />}
                tone="teal"
                label="Role · Package"
                value={`${drive.job_role_title ?? '—'}${drive.expected_package_lpa ? ` · ${drive.expected_package_lpa} LPA` : ''}${drive.job_location ? ` · ${drive.job_location}` : ''}`}
              />
            </CardContent>
          </Card>

          {/* Audience */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Audience
                  </CardTitle>
                  <CardDescription>{describeTargeting(targeting, drive.institutions.length)}</CardDescription>
                </div>
                <PermissionGuard module="cdc.drives" action="edit" fallback={null}>
                  {editable ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/cdc/drives/${id}/edit`}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Link>
                    </Button>
                  ) : null}
                </PermissionGuard>
              </div>
            </CardHeader>
            <CardContent>
              {drive.institutions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No institutions selected.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {drive.institutions.map((instId) => {
                    const entry = targeting.find((t) => t.institution_id === instId);
                    const orders = entry?.semester_orders ?? [];
                    const programCount = entry?.program_ids?.length ?? 0;
                    return (
                      <li key={instId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            <Building2 className="h-3.5 w-3.5" />
                          </span>
                          {data.institution_names[instId] ?? instId}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="font-normal border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
                            {programCount === 0 ? 'All programs' : `${programCount} program${programCount === 1 ? '' : 's'}`}
                          </Badge>
                          {orders.length === 0 ? (
                            <Badge variant="outline" className="font-normal border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">All semesters</Badge>
                          ) : (
                            orders.map((o) => (
                              <Badge key={o} variant="outline" className="font-normal border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                Sem {o}
                              </Badge>
                            ))
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {targeting.length === 0 && drive.institutions.length > 0 ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  No semester targeting is set. Opening willingness will not notify any learner until an
                  audience is defined.
                </p>
              ) : drive.status === 'willingness_open' ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Changing the audience now notifies only newly eligible learners.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Eligibility criteria — the record the notification and the learner
              willingness page both read. */}
          <DriveEligibilityCard driveId={id} canEdit />

          {/* Circular */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Circular
              </CardTitle>
              <CardDescription>Stored in Google Drive. Learners can view or download it from the drive page.</CardDescription>
            </CardHeader>
            <CardContent>
              <PermissionGuard
                module="cdc.drives"
                action="edit"
                fallback={<CircularAttachment value={circular} onChange={() => {}} driveId={id} readOnly />}
              >
                <CircularAttachment
                  value={circular}
                  onChange={handleCircularChange}
                  driveId={id}
                  driveTitle={drive.title}
                  recruiterId={drive.recruiter_id}
                  disabled={updateDrive.isPending}
                  readOnly={!circularEditable}
                />
              </PermissionGuard>
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
                    <li key={t.id} className="border rounded-md p-3 text-sm flex items-start justify-between gap-3">
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
                        {t.reason ? <p className="text-xs text-muted-foreground mt-1">{t.reason}</p> : null}
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

        {/* Right: willingness + state machine */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Willingness</CardTitle>
              <CardDescription>Responses from targeted learners.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <StatTile tone="emerald" value={data.willing_count} label="Willing" />
                <StatTile tone="sky" value={data.willingness_count} label="Total responses" />
              </div>
              <div className="grid gap-2">
                <PermissionGuard module="cdc.drives" action="willingness.view" fallback={null}>
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <Link href={`/cdc/drives/${id}/willingness`}>
                      <GraduationCap className="h-4 w-4 mr-2" /> Assigned learners & willingness
                    </Link>
                  </Button>
                </PermissionGuard>
                <Button asChild variant="outline" size="sm" className="justify-start">
                  <Link href={`/cdc/drives/${id}/responses`}>
                    <Users className="h-4 w-4 mr-2" /> View responses
                  </Link>
                </Button>
                {/* Marking attendance needs the same permission as editing the
                    drive, so the link is guarded the same way the Edit button is.
                    Without this the attendance screen is reachable only by typing
                    the URL — which is the exact failure it was built to fix. */}
                <PermissionGuard module="cdc.drives" action="edit" fallback={null}>
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <Link href={`/cdc/drives/${id}/attendance`}>
                      <ClipboardCheck className="h-4 w-4 mr-2" /> Mark attendance
                    </Link>
                  </Button>
                </PermissionGuard>
                {data.willingness_count > 0 ? (
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <a href={cdcDriveResponsesExportUrl(id)}>
                      <Download className="h-4 w-4 mr-2" /> Download Excel
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="justify-start" disabled title="No submissions yet">
                    <Download className="h-4 w-4 mr-2" /> Download Excel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Notifications
              </CardTitle>
              <CardDescription>
                {ns.last_sent_at
                  ? `Last sent ${new Date(ns.last_sent_at).toLocaleString()}`
                  : 'Learners are notified when willingness opens.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <StatTile tone="indigo" value={ns.sent} label="Notified" />
                <StatTile tone={ns.push_failed > 0 && ns.push_delivered === 0 ? 'rose' : 'violet'} value={ns.push_delivered} label="Push delivered" />
              </div>
              {ns.no_profile || ns.push_failed || ns.no_subscription ? (
                <p className="text-xs text-muted-foreground">
                  {[
                    ns.no_subscription ? `${ns.no_subscription} without push (bell only)` : null,
                    ns.push_failed ? `${ns.push_failed} push failed` : null,
                    ns.no_profile ? `${ns.no_profile} without a login` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
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
                  {Array.from(allowedNext).map((nextStatus) => {
                    const blocked = nextStatus === 'willingness_open' && !hasEligibility;
                    return (
                      <div key={nextStatus} className="space-y-1">
                        <Button
                          onClick={() => setPendingStatus(nextStatus)}
                          variant={nextStatus === 'cancelled' ? 'destructive' : 'default'}
                          size="sm"
                          className="w-full justify-start"
                          disabled={blocked}
                        >
                          {nextStatus === 'cancelled' ? (
                            <XCircle className="h-4 w-4 mr-2" />
                          ) : (
                            <ArrowRight className="h-4 w-4 mr-2" />
                          )}
                          {CDC_DRIVE_STATUS_LABELS[nextStatus]}
                        </Button>
                        {blocked ? (
                          <p className="text-xs text-muted-foreground">
                            Set the eligibility criteria first — without them no learner is
                            notified and none can declare interest.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                  <Button asChild variant="outline" size="sm" className="w-full justify-start">
                    <Link href={`/cdc/drives/${id}/notifications`}>
                      <Bell className="h-4 w-4 mr-2" /> Notification log & diagnosis
                    </Link>
                  </Button>
                </div>
              )}
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
                    {TRANSITION_HINT[pendingStatus] ? (
                      <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">
                        {TRANSITION_HINT[pendingStatus]}
                      </p>
                    ) : null}
                    {pendingStatus === 'willingness_open' && targeting.length === 0 ? (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        No audience is set — nobody will be notified. Edit the audience first.
                      </p>
                    ) : null}
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
                    {transitionError ? <p className="text-xs text-destructive">{transitionError}</p> : null}
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleTransition(pendingStatus)}
                        disabled={transition.isPending || (pendingStatus === 'cancelled' && !transitionReason.trim())}
                        variant={pendingStatus === 'cancelled' ? 'destructive' : 'default'}
                        size="sm"
                      >
                        {transition.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Working…
                          </>
                        ) : pendingStatus === 'willingness_open' ? (
                          'Open & notify learners'
                        ) : (
                          'Confirm'
                        )}
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
                        ) : nextStatus === 'willingness_open' ? (
                          <Bell className="h-4 w-4 mr-2" />
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

// ---------------------------------------------------------------------------
// Small coloured building blocks for the detail page
// ---------------------------------------------------------------------------

type Tone = 'emerald' | 'sky' | 'amber' | 'violet' | 'indigo' | 'teal' | 'rose';

const TONE_ICON: Record<Tone, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

const TONE_TILE: Record<Tone, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
  sky: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100',
  violet: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-100',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100',
  teal: 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/60 dark:text-teal-100',
  rose: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-100',
};

function FactTile({ icon, tone, label, value }: { icon: React.ReactNode; tone: Tone; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${TONE_ICON[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium leading-snug break-words">{value}</p>
      </div>
    </div>
  );
}

function StatTile({ tone, value, label }: { tone: Tone; value: number; label: string }) {
  return (
    <div className={`rounded-md border p-3 ${TONE_TILE[tone]}`}>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  );
}
