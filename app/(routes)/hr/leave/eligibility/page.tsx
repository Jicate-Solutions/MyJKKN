'use client';

// ============================================================================
// HR — Leave › Eligibility
// ----------------------------------------------------------------------------
// One page, three audiences, because they are the same list read three ways:
//
//   EVERY MEMBER OF STAFF sees which of their institution's leave types need
//   eligibility, where they stand on each, and asks from here (2026-09-21).
//   An institution with no gated type gets one sentence saying so — the tab
//   is on the shell for everybody, so it must always have something true to
//   say.
//
//   APPROVERS see what is waiting on them and decide it. Their authority comes
//   from the leave type's ELIGIBILITY flow ("Who approves eligibility"), or
//   from its leave flow when no eligibility flow is set — never from a
//   permission key — so the queue is whatever RLS returns:
//   fn_is_designated_eligibility_approver is the gate, exactly as it is for a
//   leave application.
//
//   HR sees every grant for their institutions, can record one directly for
//   somebody already doing the thing the leave is for, and can withdraw one.
//
// This did NOT become a tab on /hr/leave/approvals: that page is a filtered
// list over hr_leave_applications rather than a tabbed shell, and bending it
// around a second table would have cost more than it returned.
// ============================================================================

import { useCallback, useState } from 'react';
import { AlertTriangle, Check, GraduationCap, Loader2, Plus, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { TimeOffShell } from '../_components/time-off-shell';
import { RequestEligibilityDialog } from '../_components/request-eligibility-dialog';
import { ClinicalDutyEligibilityCard } from '../_components/clinical-duty-eligibility-card';
import { LeaveDocumentList } from '../_components/leave-document-list';
import { LeaveDocumentViewer } from '../_components/leave-document-viewer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import {
  useCanDecideEligibility,
  useAllLeaveEligibilities,
  useDecideLeaveEligibility,
  usePendingLeaveEligibilities,
  useRequestableGatedTypes,
  useRevokeLeaveEligibility,
  type RequestableGatedType,
} from '@/hooks/hr/use-leave-eligibility';
import { getErrorMessage } from '@/lib/utils';
import {
  LEAVE_ELIGIBILITY_STATUS_LABELS,
  type LeaveEligibilityRow,
} from '@/types/hr-leave-types';
import { GrantEligibilityDialog } from './_components/grant-eligibility-dialog';
import { EligibilityDataTable } from './_components/eligibility-data-table';
import {
  DEFAULT_ELIGIBILITY_FILTERS,
  EligibilityFilters,
  type EligibilityFilterState,
} from './_components/eligibility-filters';
import { STATUS_TONE, type EligibilityTableRow } from './_components/eligibility-status';
import { useEligibilityView } from './_components/eligibility-view';

/**
 * WHO SEES "WAITING ON YOU" WITHOUT BEING NAMED ON A FLOW.
 *
 * The queue is for approvers, not for every member of staff. The database
 * answers "is this caller someone an eligibility request can land on?"
 * (hr_can_decide_eligibility: super admin, named on an eligibility flow, or on
 * the current step of a pending request). These roles are added on top as the
 * people who read the proof by default — so the card is there before the first
 * flow is configured and before the first request arrives. UX only: the rows
 * themselves are RLS-filtered, so a role here with no request on it sees an
 * empty queue, never somebody else's.
 */
const DEFAULT_ELIGIBILITY_APPROVER_ROLES = new Set(['hr_head', 'cao', 'principal']);

/** A stable empty list, so the view hook's memos do not rebuild every render while the query loads. */
const NO_ROWS: LeaveEligibilityRow[] = [];

export default function LeaveEligibilityPage() {
  const { profile } = useAuth();
  const { can, isSuperAdmin, userRoles } = usePermissions();
  const ctx = useTimeOffContext();
  const canManage = isSuperAdmin || can('hr.leave.types.manage');

  // THE APPROVER HALF IS FOR APPROVERS ONLY. A plain member of staff sees just
  // the card above; they were never part of this queue and should not be told
  // "nothing is waiting on you". Super admins and the default roles are in
  // regardless; everyone else only when a flow names them or a request sits
  // on their step.
  const { data: canDecide } = useCanDecideEligibility();
  const isDefaultApprover = userRoles.some(
    (r) => r.role_key && DEFAULT_ELIGIBILITY_APPROVER_ROLES.has(r.role_key)
  );
  const showQueue = isSuperAdmin || isDefaultApprover || Boolean(canDecide);
  const pending = usePendingLeaveEligibilities(showQueue);
  // EVERY organisation the caller may read, not just their home one: RLS gives a
  // super admin all of them and an HR Head each institution they have access to.
  const all = useAllLeaveEligibilities(canManage);
  const { viewRows, organizations, leaveTypes } = useEligibilityView(all.data ?? NO_ROWS);

  // Filters live here, not in the URL: the DataTable owns page / search / sort in
  // the query string and a second writer would clobber it.
  const [filters, setFilters] = useState<EligibilityFilterState>(DEFAULT_ELIGIBILITY_FILTERS);
  const handleFilterChange = useCallback(
    (patch: Partial<EligibilityFilterState>) => setFilters((prev) => ({ ...prev, ...patch })),
    [],
  );
  const handleFilterReset = useCallback(() => setFilters(DEFAULT_ELIGIBILITY_FILTERS), []);

  // MY OWN STANDING — every gated type in my institution, approved ones too,
  // so "you already hold this" sits beside "you could ask for that".
  const mine = useRequestableGatedTypes(
    ctx.hrOrgId || undefined,
    ctx.employeeId || undefined,
    true
  );
  const [requestFor, setRequestFor] = useState<RequestableGatedType | null>(null);

  const decide = useDecideLeaveEligibility();
  const revoke = useRevokeLeaveEligibility();

  const [decidingOn, setDecidingOn] = useState<{ row: LeaveEligibilityRow; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [revoking, setRevoking] = useState<LeaveEligibilityRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [granting, setGranting] = useState(false);
  // The HR table's Document column: which row's proof is open in the viewer.
  const [viewingDocsOf, setViewingDocsOf] = useState<LeaveEligibilityRow | null>(null);

  // Row actions handed to the table. Stable, so its columns are not rebuilt on
  // every keystroke in a dialog.
  const handleWithdraw = useCallback((r: EligibilityTableRow) => {
    setRevoking(r);
    setRevokeReason('');
  }, []);

  const submitDecision = async () => {
    if (!decidingOn) return;
    try {
      // The decider is the session on the server; nothing to pass from here.
      await decide.mutateAsync({
        eligibilityId: decidingOn.row.id,
        approve: decidingOn.approve,
        note: note.trim() || null,
      });
      toast.success(decidingOn.approve ? 'Eligibility approved' : 'Eligibility rejected');
      setDecidingOn(null); setNote('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const submitRevoke = async () => {
    if (!revoking || !profile?.id) return;
    try {
      await revoke.mutateAsync({
        eligibilityId: revoking.id,
        reason: revokeReason,
        revokerProfileId: profile.id,
      });
      toast.success('Eligibility withdrawn');
      setRevoking(null); setRevokeReason('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <TimeOffShell title="Eligibility">
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Some leave types are not open to everyone. A team member sends their supporting
              document once, the approvers set under <strong>Who approves eligibility</strong> decide
              it (the leave type&rsquo;s own approvers, if none are set), and from then on the type
              appears in their Apply Leave list and asks for no document again.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setGranting(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Grant eligibility
            </Button>
          )}
        </header>

        {/* ---- My eligibility ------------------------------------------------ */}
        {/* Reads hr_leave_types directly, not the balance view — the view hides
            a gated type until eligibility is approved, which is the one thing
            this card must be able to show. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Leave types that need eligibility
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ctx.isLoading || mine.isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !ctx.hasEmployeeRecord ? (
              <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                Your account is not linked to a team member record, so there is nothing to request here.
              </p>
            ) : mine.error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{getErrorMessage(mine.error)}</AlertDescription>
              </Alert>
            ) : (mine.data ?? []).length === 0 ? (
              <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                None of your institution&rsquo;s leave types require eligibility. Every type you
                can use is already in Apply Leave.
              </p>
            ) : (
              <ul className="space-y-2">
                {(mine.data ?? []).map((g) => (
                  <li
                    key={g.leave_type_id}
                    className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: g.color_code }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{g.leave_type_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.status === 'approved'
                          ? 'You are eligible — this type is in your Apply Leave list.'
                          : g.status === 'pending'
                            ? 'Your request is awaiting approval.'
                            : g.status === 'rejected'
                              ? `Your request was rejected${g.decision_note ? ` — ${g.decision_note}` : ''}.`
                              : g.status === 'revoked'
                                ? 'Your eligibility was withdrawn. You can request it again.'
                                : 'Send the supporting document once; after approval this type appears in Apply Leave.'}
                      </p>
                    </div>
                    {g.status && (
                      <Badge className={STATUS_TONE[g.status]} variant="secondary">
                        {LEAVE_ELIGIBILITY_STATUS_LABELS[g.status]}
                      </Badge>
                    )}
                    {g.status !== 'approved' && g.status !== 'pending' && (
                      <Button size="sm" onClick={() => setRequestFor(g)}>
                        {g.status ? 'Request again' : 'Request eligibility'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {ctx.hasEmployeeRecord && ctx.employeeId && (
          <ClinicalDutyEligibilityCard
            employeeId={ctx.employeeId}
            institutionId={ctx.institutionId || null}
          />
        )}

        {/* ---- Waiting on a decision ---------------------------------------- */}
        {showQueue && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <GraduationCap className="h-5 w-5 text-primary" />
              Waiting on you ({pending.data?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pending.isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : pending.error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{getErrorMessage(pending.error)}</AlertDescription>
              </Alert>
            ) : (pending.data ?? []).length === 0 ? (
              <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                Nothing is waiting on a decision from you.
              </p>
            ) : (
              <ul className="space-y-2">
                {(pending.data ?? []).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-md border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {r.staff_name ?? 'Unnamed'}
                        {r.staff_code && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {r.staff_code}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.leave_type_name ?? 'Leave type'}
                        {r.reason ? ` · ${r.reason}` : ''}
                      </p>
                      {/* THE IN-APP VIEWER, NEVER doc.url. The Drive file is
                          deliberately unshared, so the raw link answers "You
                          need access" to every approver; the proxy behind
                          this list authorises against hr_leave_eligibilities
                          and streams the bytes. Same component as the leave
                          approvals sheet. */}
                      <div className="mt-2">
                        <LeaveDocumentList
                          documents={r.documents}
                          hideWhenEmpty
                          viewerTitle={r.staff_name ?? undefined}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setDecidingOn({ row: r, approve: false }); setNote(''); }}
                      >
                        <X className="mr-1.5 h-4 w-4" />Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => { setDecidingOn({ row: r, approve: true }); setNote(''); }}
                      >
                        <Check className="mr-1.5 h-4 w-4" />Approve
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        )}

        {/* ---- Everything already decided ----------------------------------- */}
        {canManage && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Granted &amp; decided</CardTitle>
              <p className="text-xs text-muted-foreground">
                Every team member&rsquo;s eligibility across the institutions you can access. The
                date range in the table filters the date a request was made.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {all.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : all.error ? (
                // An empty table must never mean "the query failed".
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{getErrorMessage(all.error)}</AlertDescription>
                </Alert>
              ) : (
                <>
                  <EligibilityFilters
                    filters={filters}
                    onChange={handleFilterChange}
                    onReset={handleFilterReset}
                    organizations={organizations}
                    leaveTypes={leaveTypes}
                  />
                  <EligibilityDataTable
                    rows={viewRows}
                    filters={filters}
                    onViewDocs={setViewingDocsOf}
                    onWithdraw={handleWithdraw}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---- Decide ------------------------------------------------------- */}
      <Dialog open={Boolean(decidingOn)} onOpenChange={(v) => { if (!v) setDecidingOn(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decidingOn?.approve ? 'Approve' : 'Reject'} eligibility —{' '}
              {decidingOn?.row.leave_type_name}
            </DialogTitle>
            <DialogDescription>
              {decidingOn?.approve
                ? `${decidingOn?.row.staff_name} will see this leave type in Apply Leave and will not be asked for a document again.`
                : 'Say why, so they know what to send instead. They can request again.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={decidingOn?.approve ? 'Optional note' : 'Reason for rejecting'}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecidingOn(null)}>Cancel</Button>
            <Button
              onClick={submitDecision}
              disabled={decide.isPending || (!decidingOn?.approve && !note.trim())}
            >
              {decide.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {decidingOn?.approve ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Withdraw ------------------------------------------------------ */}
      <Dialog open={Boolean(revoking)} onOpenChange={(v) => { if (!v) setRevoking(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw eligibility</DialogTitle>
            <DialogDescription>
              {revoking?.staff_name} will stop seeing {revoking?.leave_type_name} in Apply Leave.
              Leave they have already had approved is not affected, and neither are requests
              already in flight.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            rows={3}
            placeholder="Why is this being withdrawn?"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={submitRevoke}
              disabled={revoke.isPending || !revokeReason.trim()}
            >
              {revoke.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeaveDocumentViewer
        documents={viewingDocsOf?.documents}
        open={Boolean(viewingDocsOf)}
        onOpenChange={(v) => { if (!v) setViewingDocsOf(null); }}
        title={
          viewingDocsOf
            ? `${viewingDocsOf.staff_name ?? 'Staff'} · ${viewingDocsOf.leave_type_name ?? 'Eligibility'}`
            : undefined
        }
      />

      {requestFor && (
        <RequestEligibilityDialog
          open
          onOpenChange={(v) => { if (!v) setRequestFor(null); }}
          leaveTypeId={requestFor.leave_type_id}
          leaveTypeName={requestFor.leave_type_name}
          employeeId={ctx.employeeId}
          hrOrgId={ctx.hrOrgId}
        />
      )}

      {canManage && (
        <GrantEligibilityDialog
          open={granting}
          onOpenChange={setGranting}
          hrOrgId={ctx.hrOrgId}
          institutionId={ctx.institutionId}
        />
      )}
    </TimeOffShell>
  );
}
