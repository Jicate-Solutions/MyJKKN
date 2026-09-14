'use client';

/**
 * /campus-living/gate-passes/[id] — where the warden actually decides.
 *
 * Three things a decision needs, all on one screen:
 *
 *   1. WHO is asking — the full learner record, auto-fetched. Nothing here is
 *      retyped by the learner or the warden: roll number, institution, degree,
 *      department, programme, semester, section, academic year and the hostel
 *      they live in all come off the learner profile.
 *   2. A WAY TO CHECK — the parent's number as a tap-to-call link, and a
 *      control that records the call so the next person can see it happened.
 *   3. THE DECISION — approve or reject, each behind a confirmation, with a
 *      rejection reason the learner will read.
 *
 * The page this replaced showed a name, an email and four raw ISO timestamps.
 */

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bed,
  Building2,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileText,
  GraduationCap,
  Loader2,
  LogIn,
  MapPin,
  Paperclip,
  PhoneCall,
  User,
  Users,
  X,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useApproveGatePass,
  useGatePassDetail,
  useRecordParentCall,
  useRejectGatePass,
  useReturnGatePass,
} from '@/hooks/campus-living/use-gate-passes';
import { GATE_PASS_STATUS_CONFIG, formatMoment } from '../_components/columns';
import type { GatePassContactNumber, GatePassDetail } from '@/types/campus-living';

/** A labelled value that renders an em dash rather than an empty cell. */
function Field({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium">
        {value === null || value === undefined || value === '' ? '—' : value}
      </p>
    </div>
  );
}

/**
 * The timeline, built from real timestamps only.
 *
 * Approval and rejection now carry their own `approved_at` / `rejected_at` —
 * before the rebuild they recorded only WHO, so the timeline could not date
 * them and deliberately left them out rather than dating them from
 * `updated_at`, which the row's trigger moves on every single write.
 */
function buildTimeline(detail: GatePassDetail) {
  const { pass, approverName, rejectorName, parentConfirmedByName } = pass_and_names(detail);
  const events: { icon: React.ReactNode; label: string; at: string; by: string }[] = [];

  if (pass.created_at) {
    events.push({
      icon: <FileText className="h-4 w-4 text-purple-600" />,
      label: pass.reason ? 'Request raised' : 'Pass created at the desk',
      at: pass.created_at,
      by: pass.reason ? 'Learner' : 'Hostel office',
    });
  }
  if (pass.parent_confirmed_at) {
    events.push({
      icon: <PhoneCall className="h-4 w-4 text-sky-600" />,
      label: `Parent called${pass.parent_confirmed_number ? ` on ${pass.parent_confirmed_number}` : ''}`,
      at: pass.parent_confirmed_at,
      by: parentConfirmedByName ?? 'Warden',
    });
  }
  if (pass.approved_at) {
    events.push({
      icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
      label: 'Approved',
      at: pass.approved_at,
      by: approverName ?? 'Warden',
    });
  }
  if (pass.rejected_at) {
    events.push({
      icon: <Ban className="h-4 w-4 text-red-600" />,
      label: 'Rejected',
      at: pass.rejected_at,
      by: rejectorName ?? 'Warden',
    });
  }
  if (pass.out_time) {
    events.push({
      icon: <DoorOpen className="h-4 w-4 text-blue-600" />,
      label: 'Left campus',
      at: pass.out_time,
      by: pass.gate_security_out ? 'Gate security' : 'Not recorded',
    });
  }
  if (pass.actual_return) {
    events.push({
      icon: <LogIn className="h-4 w-4 text-green-600" />,
      label: 'Returned to campus',
      at: pass.actual_return,
      by: pass.gate_security_in ? 'Gate security' : 'Not recorded',
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function pass_and_names(detail: GatePassDetail) {
  return {
    pass: detail.pass,
    approverName: detail.approverName,
    rejectorName: detail.rejectorName,
    parentConfirmedByName: detail.parentConfirmedByName,
  };
}

export default function GatePassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();

  const { data: detail, isLoading } = useGatePassDetail(id);
  const approve = useApproveGatePass();
  const reject = useRejectGatePass();
  const recordCall = useRecordParentCall();
  const returnPass = useReturnGatePass();

  const canDecide = isSuperAdmin || canAccess('campus_living.gate_passes', 'approve');
  const canEdit = isSuperAdmin || canAccess('campus_living.gate_passes', 'edit');

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [callTarget, setCallTarget] = useState<GatePassContactNumber | null>(null);

  const timeline = useMemo(() => (detail ? buildTimeline(detail) : []), [detail]);

  if (isLoading) {
    return (
      <ContentLayout title="Gate Pass">
        <div className="mt-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 lg:col-span-2" />
            <Skeleton className="h-72" />
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (!detail) {
    return (
      <ContentLayout title="Gate Pass">
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">This gate pass could not be opened</p>
            <p className="mt-1 text-sm text-muted-foreground">
              It may have been deleted, or it belongs to an institution you cannot see.
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/campus-living/gate-passes">Back to gate passes</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const { pass, learner, leaveType, contacts } = detail;
  const statusCfg = GATE_PASS_STATUS_CONFIG[pass.status] ?? {
    label: pass.status,
    variant: 'outline' as const,
  };
  const isPending = pass.status === 'requested';
  const title = pass.pass_number ?? 'Gate Pass Request';

  async function handleApprove() {
    if (!profile?.id) return;
    try {
      await approve.mutateAsync({ id, approverId: profile.id });
    } catch {
      // the mutation's onError toast reports it
    } finally {
      setApproveOpen(false);
    }
  }

  async function handleReject() {
    if (!profile?.id || !rejectReason.trim()) return;
    try {
      await reject.mutateAsync({ id, rejectedBy: profile.id, reason: rejectReason.trim() });
    } catch {
      // same
    } finally {
      setRejectOpen(false);
      setRejectReason('');
    }
  }

  async function confirmCallRecorded() {
    if (!profile?.id || !callTarget) return;
    try {
      await recordCall.mutateAsync({ id, userId: profile.id, number: callTarget.number });
    } catch {
      // same
    } finally {
      setCallTarget(null);
    }
  }

  return (
    <ContentLayout title="Gate Pass">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Gate Passes', href: '/campus-living/gate-passes' },
          { label: title },
        ]}
      />

      <div className="mt-4 space-y-6">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href="/campus-living/gate-passes">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{title}</h1>
                <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                {leaveType && (
                  <Badge
                    variant="outline"
                    style={{ borderColor: leaveType.color_code, color: leaveType.color_code }}
                  >
                    {leaveType.leave_type_name}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {learner?.full_name ?? 'Learner record unavailable'}
                {learner?.roll_number ? ` · ${learner.roll_number}` : ''}
              </p>
            </div>
          </div>

          {/* A returned pass is closed; an active one can still be closed by
              hand when the learner came back without scanning. */}
          {canEdit && (pass.status === 'active' || pass.status === 'overdue') && (
            <Button
              onClick={() => profile?.id && returnPass.mutate({ id, securityId: profile.id })}
              disabled={returnPass.isPending}
            >
              {returnPass.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Record return by hand
            </Button>
          )}
        </div>

        {/* A rejected pass says why, at the top, where it cannot be missed. */}
        {pass.status === 'rejected' && pass.rejection_reason && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
            <Ban className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">Request rejected</p>
              <p className="text-sm text-red-700 dark:text-red-300">{pass.rejection_reason}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* ── Who is asking ──────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4" />
                  Learner
                </CardTitle>
                <CardDescription>
                  Read from the learner profile — nothing here was typed into the request.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {learner ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      {learner.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote learner photo, next/image adds nothing here
                        <img
                          src={learner.photo_url}
                          alt={learner.full_name}
                          className="h-20 w-20 shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border bg-muted">
                          <User className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold">{learner.full_name}</p>
                        <p className="font-mono text-sm text-muted-foreground">
                          {learner.roll_number ?? 'No roll number'}
                        </p>
                        {learner.lifecycle_status && learner.lifecycle_status !== 'active' && (
                          <Badge variant="destructive" className="mt-1 capitalize">
                            {learner.lifecycle_status.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-3">
                      <Field label="Institution" value={learner.institution_name} icon={Building2} />
                      <Field label="Degree" value={learner.degree_name} icon={GraduationCap} />
                      <Field label="Department" value={learner.department_name} />
                      <Field label="Programme" value={learner.programme_name} />
                      <Field label="Semester" value={learner.semester_name} />
                      <Field label="Section" value={learner.section_name} />
                      <Field label="Academic year" value={learner.academic_year_name} />
                      <Field label="Year of study" value={learner.year_of_study} />
                      <Field
                        label="Hostel"
                        value={[learner.block_name, learner.room_number, learner.bed_number]
                          .filter(Boolean)
                          .join(' · ')}
                        icon={Bed}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    The learner record could not be read. The request itself is still shown
                    below.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── What they asked for ────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">The request</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <Field
                    label="Type"
                    value={leaveType?.leave_type_name ?? 'Unspecified'}
                    icon={FileText}
                  />
                  <Field label="Destination" value={pass.destination} icon={MapPin} />
                  <Field
                    label="Mode of transport"
                    value={pass.transport_mode}
                    icon={Car}
                  />
                  <Field
                    label="Person accompanying"
                    value={pass.accompanying_person ?? 'Travelling alone'}
                    icon={Users}
                  />
                  <Field
                    label="Planned out"
                    value={formatMoment(pass.planned_out_at)}
                    icon={CalendarClock}
                  />
                  <Field
                    label="Due back"
                    value={formatMoment(pass.expected_return)}
                    icon={Clock}
                  />
                </div>

                {pass.reason && (
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Reason given</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{pass.reason}</p>
                  </div>
                )}

                {pass.attachment_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={pass.attachment_url} target="_blank" rel="noreferrer">
                      <Paperclip className="mr-2 h-4 w-4" />
                      Open supporting document
                    </a>
                  </Button>
                )}

                <div className="grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-3">
                  <Field label="Left campus at" value={formatMoment(pass.out_time)} />
                  <Field label="Returned at" value={formatMoment(pass.actual_return)} />
                  <Field
                    label="Parent notified by gate"
                    value={pass.parent_notified ? 'Yes' : 'No'}
                  />
                </div>
              </CardContent>
            </Card>

            {/* ── Timeline ───────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What has happened</CardTitle>
              </CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                  <div className="space-y-4">
                    {timeline.map((e, i) => (
                      <div key={`${e.label}-${e.at}`} className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                            {e.icon}
                          </div>
                          {i < timeline.length - 1 && <div className="h-6 w-0.5 bg-muted" />}
                        </div>
                        <div className="flex-1 pb-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{e.label}</p>
                            <p className="text-xs text-muted-foreground">{formatMoment(e.at)}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">By: {e.by}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Sidebar: call, then decide ─────────────────────────── */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PhoneCall className="h-4 w-4" />
                  Call the parent
                </CardTitle>
                <CardDescription>
                  Tap a number to dial. Record the call so the next person can see it
                  happened.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No phone number is on file for this learner.
                  </p>
                ) : (
                  contacts.map((c) => (
                    <div
                      key={`${c.label}-${c.number}`}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">{c.label}</p>
                        <a
                          href={`tel:${c.number.replace(/\s+/g, '')}`}
                          className="block truncate font-mono text-sm font-medium text-primary hover:underline"
                        >
                          {c.number}
                        </a>
                      </div>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0"
                          onClick={() => setCallTarget(c)}
                        >
                          Spoke to them
                        </Button>
                      )}
                    </div>
                  ))
                )}

                {pass.parent_confirmed_at && (
                  <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Called {pass.parent_confirmed_number ?? ''} on{' '}
                      {formatMoment(pass.parent_confirmed_at)}
                      {detail.parentConfirmedByName ? ` by ${detail.parentConfirmedByName}` : ''}.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {canDecide && isPending && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your decision</CardTitle>
                  <CardDescription>
                    The learner sees the outcome, and a rejection reason, in My Hostel.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button className="w-full" onClick={() => setApproveOpen(true)}>
                    <Check className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => {
                      setRejectReason('');
                      setRejectOpen(true);
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </CardContent>
              </Card>
            )}

            {canDecide && !isPending && (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  This request has already been decided — it is now{' '}
                  <strong>{statusCfg.label.toLowerCase()}</strong>.
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">At the gate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Once approved, the learner scans their MyJKKN QR at the gate. The out and in
                  times record themselves — there is no separate pass QR to print or carry.
                </p>
                <Field label="Recorded out by" value={pass.gate_security_out ? 'Gate security' : null} />
                <Field label="Recorded in by" value={pass.gate_security_in ? 'Gate security' : null} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Approve confirmation ───────────────────────────────────── */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this gate pass?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <strong>{learner?.full_name ?? 'This learner'}</strong> will be allowed out to{' '}
                  <strong>{pass.destination}</strong>, due back{' '}
                  {formatMoment(pass.expected_return)}.
                </p>
                {pass.parent_confirmed_at ? (
                  <p className="text-green-700 dark:text-green-400">
                    A parent was called on {formatMoment(pass.parent_confirmed_at)}.
                  </p>
                ) : (
                  <p className="text-amber-700 dark:text-amber-400">
                    No parent call has been recorded. You can still approve.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approve.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={approve.isPending}>
              {approve.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reject, reason required ────────────────────────────────── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this request</DialogTitle>
            <DialogDescription>
              {learner?.full_name ?? 'The learner'} reads this reason, so say what would
              change your answer.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || reject.isPending}
            >
              {reject.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record the call ────────────────────────────────────────── */}
      <AlertDialog open={!!callTarget} onOpenChange={(o) => !o && setCallTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record this call?</AlertDialogTitle>
            <AlertDialogDescription>
              This records that you spoke to the {callTarget?.label.toLowerCase()} on{' '}
              {callTarget?.number}. It is stored against the request so anyone reviewing it
              later can see the parent was contacted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recordCall.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCallRecorded} disabled={recordCall.isPending}>
              {recordCall.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PhoneCall className="mr-2 h-4 w-4" />
              )}
              Record it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
