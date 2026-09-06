'use client';

/**
 * Shared display pieces for the tournament-permission flow.
 *
 * Used by BOTH halves of the Director-locked two-party path:
 *   /health/sports/approvals      — the Principal decides
 *   /health/sports/squad-requests — the Physical Director files for a squad
 *
 * Nothing here talks to the database; it renders what the caller already has.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock,
  XCircle,
  Building2,
  CircleDotDashed,
  MinusCircle,
  Plane,
  Users,
  ShieldAlert,
  UserX,
  Ban,
  FilePlus2,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPORT_LEVELS } from '@/types/health-sports';
import type {
  TournamentCollegeApproval,
  TournamentPermissionRecord,
  TournamentSquadMember,
  TournamentStepStatus,
  TournamentVisibleSquadMember,
} from '@/lib/services/health/health-sports-service';

// ---------------------------------------------------------------------------
// Failure reporting
// ---------------------------------------------------------------------------

/**
 * A Supabase/PostgREST failure is a PLAIN OBJECT, not an Error instance, so
 * `err instanceof Error ? err.message : fallback` silently discards it and shows
 * the fallback — which is how a page ends up printing its own title twice and
 * telling the reader nothing. Read the shape directly.
 */
export function readFailure(err: unknown): { message: string; code: string | null } {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown };
    const message = typeof e.message === 'string' && e.message.length > 0 ? e.message : null;
    const code = typeof e.code === 'string' && e.code.length > 0 ? e.code : null;
    if (message) return { message, code };
  }
  if (err instanceof Error && err.message) return { message: err.message, code: null };
  return { message: 'No reason was reported by the server.', code: null };
}

/**
 * Every failure below means exactly one thing here — the migration that makes
 * this a per-college approval has not been applied to this environment:
 *
 *   42703 undefined_column    reading `filed_by_profile_id` before it exists
 *   42P01 undefined_table     reading health_tournament_permission_approvals
 *   42883 undefined_function  calling fn_health_tournament_my_approvals
 *   PGRST202 / PGRST205       PostgREST's own "no such function / relation in
 *                             the schema cache", which is what the browser
 *                             actually receives for the two above
 *   23514 check_violation on  writing a status the CHECK has not been widened
 *         a step*_status      for yet
 *
 * Telling the reader "please try again" for any of them is the silent-failure
 * trap in a new costume: retrying can never succeed, so the message must name
 * the pending database change instead. The codes are the ones the live database
 * actually returned during this PR's validation, not guesses.
 */
export function isSchemaNotApplied(code: string | null, message: string): boolean {
  if (code === '42703' || code === '42P01' || code === '42883') return true;
  if (code === 'PGRST202' || code === 'PGRST205') return true;
  if (/does not exist|schema cache/i.test(message)) return true;
  return (
    (code === '23514' || /check constraint/i.test(message)) &&
    /step[124]_|sports_coordinator_sta|hod_status|pe_director_status|overall_status/i.test(message)
  );
}

/**
 * The database refused the write because of a policy, not because of anything
 * the reader typed.
 *
 * 42501 is Postgres' insufficient_privilege. On this table it means one of two
 * things and never anything else: the caller is not the learner the request is
 * for (the self-service door), or the caller does not hold
 * `health.sports.file_request` (the squad-filing door).
 */
export function isPermissionDenied(code: string | null, message: string): boolean {
  if (code === '42501') return true;
  return /row[- ]level security|permission denied|insufficient privilege/i.test(message);
}

/**
 * Does this text read like Postgres talking, rather than a sentence we wrote?
 *
 * Used as a belt-and-braces filter so a database sentence can never be printed
 * on screen even when the driver hands it over with no `code` attached.
 */
function looksLikeDatabaseProse(message: string): boolean {
  return /violates|row[- ]level security|permission denied|does not exist|duplicate key|null value in column|check constraint|schema cache|relation "|column "|constraint "/i.test(
    message
  );
}

export type FailureKind = 'schema_not_applied' | 'not_permitted' | 'database' | 'app';

/**
 * What kind of failure this is, so the screen can say something a reader can
 * act on instead of quoting the driver.
 *
 * `app` is the only kind whose message is safe to print: it is a sentence this
 * codebase wrote (for example "Select at least one participating learner before
 * filing."). Everything else is the database talking and is summarised instead.
 */
export function classifyFailure(code: string | null, message: string): FailureKind {
  if (isSchemaNotApplied(code, message)) return 'schema_not_applied';
  if (isPermissionDenied(code, message)) return 'not_permitted';
  if (code || looksLikeDatabaseProse(message)) return 'database';
  return 'app';
}

/**
 * A write failed. Say what happened in plain English.
 *
 * A raw driver sentence — `42501: new row violates row-level security policy
 * for table "health_tournament_permissions"` — is not a message, it is a leak:
 * it names an internal table, tells the reader nothing they can do, and invites
 * a retry that can only fail again. The real reason goes to the console for
 * support (CLAUDE.md #27 — explicit, never silent, and never raw).
 *
 * `notPermitted` is the caller's own wording for who this surface is for, since
 * only the caller knows which of the two doors the reader is standing at.
 */
export function SubmitFailureAlert({
  err,
  whatHappened = 'Nothing was submitted.',
  notPermitted,
}: {
  err: unknown;
  /** What did NOT happen, in the caller's own words. */
  whatHappened?: string;
  /** Shown when the database refused on permission grounds. */
  notPermitted?: React.ReactNode;
}) {
  const { message, code } = readFailure(err);
  const kind = classifyFailure(code, message);

  return (
    <Alert className="border-red-200 bg-red-50">
      <AlertCircle className="h-4 w-4 text-red-600" />
      <AlertDescription className="space-y-1 text-xs text-red-900">
        <p className="font-medium">{whatHappened}</p>
        {kind === 'schema_not_applied' ? (
          <p>
            This feature is not switched on in this environment yet — the database
            change behind it has not been applied. Nobody has done anything wrong.
            Ask an administrator to apply the pending change.
          </p>
        ) : kind === 'not_permitted' ? (
          <>
            <p>
              Your account is not allowed to file this kind of request, so the save was
              refused before anything was written.
            </p>
            {notPermitted ?? (
              <p>
                Ask an administrator which door applies to you, or contact the Physical
                Director if this is a squad travelling to a tournament.
              </p>
            )}
          </>
        ) : kind === 'app' ? (
          <p>{message}</p>
        ) : (
          <p>
            The database refused this and gave a reason we cannot translate. Nothing
            was saved. Tell an administrator when this happened — the full reason is in
            the browser console and in the server log.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function FailureNotice({
  heading,
  err,
  onRetry,
}: {
  heading: string;
  err: unknown;
  onRetry?: () => void;
}) {
  const { message, code } = readFailure(err);
  const schemaPending = isSchemaNotApplied(code, message);

  return (
    <Alert
      className={
        schemaPending ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
      }
    >
      <AlertCircle
        className={`h-4 w-4 ${schemaPending ? 'text-amber-600' : 'text-red-600'}`}
      />
      <AlertTitle className={schemaPending ? 'text-amber-900' : 'text-red-900'}>
        {schemaPending ? 'This feature is not switched on yet' : heading}
      </AlertTitle>
      <AlertDescription
        className={`space-y-2 ${schemaPending ? 'text-amber-900' : 'text-red-900'}`}
      >
        {schemaPending ? (
          <p className="text-sm">
            The database change for the two-party tournament approval has not been
            applied to this environment, so there is nothing to read yet. Nobody has
            done anything wrong and no request has been lost — an administrator needs
            to apply the pending migration.
          </p>
        ) : (
          <p className="text-sm">{message}</p>
        )}
        <p className="text-xs opacity-80">
          Reported by the server{code ? ` as ${code}` : ''}: {message}
        </p>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function levelLabel(level: string): string {
  return SPORT_LEVELS.find((l) => l.value === level)?.label ?? level;
}

export function dateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const from = new Date(start).toLocaleDateString('en-IN', opts);
  const to = new Date(end).toLocaleDateString('en-IN', { ...opts, year: 'numeric' });
  return start === end ? to : `${from} — ${to}`;
}

export function learnerName(
  learner: TournamentPermissionRecord['learners_profiles']
): string {
  if (!learner) return 'Learner record unavailable';
  const name = [learner.first_name, learner.last_name].filter(Boolean).join(' ').trim();
  return name || 'Unnamed learner';
}

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

export function OverallStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-green-100 text-green-700 border-green-200',
    // D13 — its own colour, never green. Some colleges said yes and some said
    // no; showing this as "Approved" is the over-report the state exists to
    // prevent.
    partially_approved: 'bg-orange-100 text-orange-700 border-orange-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
    completed: 'bg-blue-100 text-blue-700 border-blue-200',
    // D10 — never styled as approved or rejected. A called-off trip is its own
    // state: the approval it was given is still real, it simply did not happen.
    cancelled: 'bg-slate-200 text-slate-600 border-slate-300',
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
  };
  const label: Record<string, string> = {
    approved: 'Approved',
    partially_approved: 'Some colleges approved',
    rejected: 'Rejected',
    completed: 'Completed',
    cancelled: 'Cancelled',
    pending: 'Awaiting approval',
  };
  return (
    <Badge className={cn('text-xs hover:bg-inherit', map[status] ?? map.pending)}>
      {label[status] ?? 'Awaiting approval'}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// D6 — the per-college approval strip
// ---------------------------------------------------------------------------

/**
 * Who has decided, and who is still being waited on — by college.
 *
 * A mixed-college squad needs one line per participating college, because each
 * Principal decides only their own learners and the trip is approved only when
 * all of them have. A single "Principal: pending" chip cannot say "Pharmacy
 * approved, Nursing has not answered", which is the thing the person filing
 * actually needs to know.
 *
 * D9 — the waiting line always NAMES who is being waited on. It never counts
 * down to an automatic approval, because there is no such thing here.
 */
export function CollegeApprovalStrip({
  approvals,
  onNudge,
  nudgingId,
}: {
  approvals: TournamentCollegeApproval[];
  onNudge?: (a: TournamentCollegeApproval) => void;
  nudgingId?: string | null;
}) {
  if (!approvals || approvals.length === 0) {
    return (
      <Alert className="border-amber-200 bg-amber-50">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-900">No college could be identified as the approver</AlertTitle>
        <AlertDescription className="text-sm text-amber-900">
          None of the learners on this request has a college recorded, so there is nobody
          to ask. This request will stay pending — it is deliberately NOT approved
          automatically. Ask an administrator to check the learner records.
        </AlertDescription>
      </Alert>
    );
  }

  const waiting = approvals.filter((a) => a.status === 'pending');

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-400">
        Approval by college — every college must approve its own learners
      </p>
      <div className="space-y-1.5">
        {approvals.map((a) => (
          <div
            key={a.approval_id}
            className={cn(
              'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2',
              a.status === 'approved'
                ? 'border-green-200 bg-green-50'
                : a.status === 'rejected'
                  ? 'border-red-200 bg-red-50'
                  : 'border-amber-200 bg-amber-50'
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <StepIcon status={a.status} />
              <span className="truncate text-xs font-medium text-slate-700">
                {a.institution_name ?? 'Unnamed college'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-[10px] uppercase tracking-wide',
                  a.status === 'approved'
                    ? 'text-green-700'
                    : a.status === 'rejected'
                      ? 'text-red-600'
                      : 'text-amber-700'
                )}
              >
                {a.status === 'pending' ? 'Waiting for the Principal' : a.status}
              </span>
              {a.status === 'pending' && onNudge ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-[11px]"
                  disabled={nudgingId === a.approval_id}
                  onClick={() => onNudge(a)}
                >
                  <BellRing className="h-3 w-3" />
                  {a.last_nudged_at ? 'Remind again' : 'Send reminder'}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {waiting.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Waiting for the Principal of{' '}
          {waiting.map((a) => a.institution_name ?? 'an unnamed college').join(', ')}. Nothing
          is approved until they decide — a reminder is the only way to move this along.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The approval path, honestly.
 *
 * Only the Principal step is a decision. The three steps nobody decides render
 * as "Not required" — greyed and struck through — so no one reads them as work
 * still pending, and nothing ever displays an approval that was never given.
 */
export function ApprovalPath({ perm }: { perm: TournamentPermissionRecord }) {
  const steps: { label: string; status: TournamentStepStatus; decisive: boolean }[] = [
    { label: 'Sports Coordinator', status: perm.step1_sports_coordinator_status, decisive: false },
    { label: 'Head of Department', status: perm.step2_hod_status, decisive: false },
    { label: 'Principal', status: perm.step3_principal_status, decisive: true },
    { label: 'PE Director', status: perm.step4_pe_director_status, decisive: false },
  ];

  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-2">
        Approval path — the Principal decides
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {steps.map((step) => {
          const notRequired = step.status === 'not_required';
          // D13 — its own colour, never the green of 'approved' and never the
          // amber of 'pending': the colleges have all answered, they simply did
          // not agree.
          const partial = step.status === 'partially_approved';
          return (
            <div
              key={step.label}
              className={cn(
                'rounded-lg border px-2 py-2 text-center',
                notRequired
                  ? 'border-dashed border-slate-200 bg-slate-50'
                  : partial
                    ? 'border-orange-200 bg-orange-50'
                    : step.status === 'approved'
                      ? 'border-green-200 bg-green-50'
                      : step.status === 'rejected'
                        ? 'border-red-200 bg-red-50'
                        : 'border-amber-200 bg-amber-50'
              )}
            >
              <div className="mb-1 flex justify-center">
                <StepIcon status={step.status} />
              </div>
              <p
                className={cn(
                  'text-xs font-medium leading-tight',
                  notRequired
                    ? 'text-slate-400 line-through'
                    : partial
                      ? 'text-orange-700'
                      : step.status === 'approved'
                        ? 'text-green-700'
                        : step.status === 'rejected'
                          ? 'text-red-600'
                          : 'text-amber-700'
                )}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {notRequired ? 'Not required' : partial ? 'Some approved' : step.status}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: TournamentStepStatus }) {
  if (status === 'not_required')
    return <MinusCircle className="h-4 w-4 text-slate-300" />;
  if (status === 'approved')
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  // D13 — a half-filled mark, not a tick. Some colleges' learners travel and
  // some do not, and a tick here would say the whole squad was cleared.
  if (status === 'partially_approved')
    return <CircleDotDashed className="h-4 w-4 text-orange-500" />;
  if (status === 'rejected') return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

// ---------------------------------------------------------------------------
// Squad roster
// ---------------------------------------------------------------------------

/**
 * Every participant, named. Accreditation needs per-learner participation, so
 * each member is listed with their own learner id present in the data — never
 * summarised as a headcount.
 */
export function SquadRoster({
  members,
  scoped,
}: {
  members: (TournamentSquadMember | TournamentVisibleSquadMember)[];
  /** True when the list was scoped to the viewer's own college (D6). */
  scoped?: boolean;
}) {
  if (!members || members.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No squad recorded — this request covers the nominated learner only.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <Users className="h-3.5 w-3.5" />
        {scoped ? 'Your college on this squad' : 'Squad'} — {members.length}{' '}
        {members.length === 1 ? 'learner' : 'learners'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <span
            key={m.learner_id}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {m.name}
            {m.roll_number ? (
              <span className="ml-1 text-slate-400">{m.roll_number}</span>
            ) : null}
            {m.sport ? <span className="ml-1 text-emerald-600">· {m.sport}</span> : null}
          </span>
        ))}
      </div>
      {scoped ? (
        <p className="mt-1.5 text-[11px] text-slate-400">
          You are shown your own college&apos;s learners only. Other colleges on this squad
          are approved by their own Principals.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One request, read-only
// ---------------------------------------------------------------------------

export function RequestCard({
  perm,
  actions,
  approvals,
  squad,
  squadScoped,
  onNudge,
  nudgingId,
}: {
  perm: TournamentPermissionRecord;
  actions?: React.ReactNode;
  /** D6 — one row per participating college. Omit to fall back to the legacy strip. */
  approvals?: TournamentCollegeApproval[];
  /** D6 — the roster the viewer is allowed to see. Omit to show the stored roster. */
  squad?: TournamentVisibleSquadMember[];
  squadScoped?: boolean;
  onNudge?: (a: TournamentCollegeApproval) => void;
  nudgingId?: string | null;
}) {
  const cancelled = Boolean(perm.cancelled_at);
  return (
    <Card className={cancelled ? 'opacity-90' : undefined}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {perm.tournament_name}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span>{perm.sport}</span>
              <span className="text-slate-300">·</span>
              <span>{levelLabel(perm.tournament_level)}</span>
              <span className="text-slate-300">·</span>
              <span>{dateRange(perm.start_date, perm.end_date)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Nominated learner: {learnerName(perm.learners_profiles)}
              {perm.learners_profiles?.roll_number
                ? ` (${perm.learners_profiles.roll_number})`
                : ''}
            </p>
          </div>
          <OverallStatusBadge status={perm.overall_status} />
        </div>

        {/* D14 — the OUTSIDE body that runs the event. An accreditation reviewer
            asks exactly this, so it is shown as its own line rather than left
            inside the justification prose. Absent means it is held at JKKN. */}
        {perm.host_institution ? (
          <div className="flex items-start gap-2 rounded-lg bg-violet-50 p-2.5">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
            <p className="text-xs text-violet-900">
              Hosted by {perm.host_institution}
            </p>
          </div>
        ) : null}

        {perm.travel_required ? (
          <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-2.5">
            <Plane className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
            <p className="text-xs text-sky-900">
              Travel required{perm.travel_details ? ` — ${perm.travel_details}` : ''}
            </p>
          </div>
        ) : null}

        {perm.justification ? (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Justification</p>
            <p className="text-xs text-slate-700">{perm.justification}</p>
          </div>
        ) : null}

        {cancelled ? (
          <div className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-100 p-2.5">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <p className="text-xs text-slate-700">
              <span className="font-medium">This trip was called off.</span> The record and
              its approval trail are kept as evidence, but it counts for nothing in
              participation or accreditation. It can be put back on if the trip is back on.
              {perm.cancellation_reason ? ` Reason: ${perm.cancellation_reason}` : ''}
            </p>
          </div>
        ) : null}

        <SquadRoster members={squad ?? perm.team_members ?? []} scoped={squadScoped} />

        {approvals ? (
          <CollegeApprovalStrip
            approvals={approvals}
            onNudge={cancelled ? undefined : onNudge}
            nudgingId={nudgingId}
          />
        ) : (
          <ApprovalPath perm={perm} />
        )}

        {perm.step3_notes ? (
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="mb-0.5 text-xs font-medium text-slate-400">Principal&apos;s note</p>
            <p className="text-xs text-slate-700">{perm.step3_notes}</p>
          </div>
        ) : null}

        {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Explicit failures (CLAUDE.md #27 — never a silent redirect)
// ---------------------------------------------------------------------------

/**
 * Shown instead of an empty page when the signed-in user lacks the permission
 * this surface needs. Names the permission and who to ask, so the first click
 * explains itself rather than bouncing to a dashboard.
 */
export function NoAccessNotice({
  permissionKey,
  purpose,
}: {
  permissionKey: string;
  purpose: string;
}) {
  return (
    <Alert className="border-amber-200 bg-amber-50">
      <ShieldAlert className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-900">You do not have access to this page</AlertTitle>
      <AlertDescription className="space-y-2 text-amber-900">
        <p className="text-sm">
          {purpose} needs the permission{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">{permissionKey}</code>,
          which none of your roles currently grants.
        </p>
        <p className="text-sm">
          Ask an administrator to grant it in Role Management. Nothing is wrong with
          your account — this page is simply not part of your role yet.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href="/health/dashboard">Back to Health &amp; Wellness</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Sports Profile is a LEARNER's page, and its request form files a request for
 * the signed-in learner alone. Someone who files for other people — the
 * Physical Director — has no learner record of their own, so that form can only
 * ever be refused for them. Send them to the desk that is actually theirs
 * rather than letting them fill in a form that cannot succeed.
 */
export function SquadFilingDoorNotice({ heading }: { heading?: string }) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/60">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2.5">
          <FilePlus2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {heading ?? 'File tournament permission at the squad desk'}
            </p>
            <p className="mt-1 text-xs text-emerald-900/80">
              Sports Profile holds one learner&apos;s own sports record, and its request
              form files for that learner only. You file for other people, so your desk
              is Squad Tournament Requests: enter the tournament once, list every
              learner going, and it becomes ONE request. The Principal of each
              participating college then approves their own learners.
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/health/sports/squad-requests">
            Go to Squad Tournament Requests
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Neither a learner nor a filer. Say who this page is for and who to ask, so
 * the reader is not left guessing at a page that will never do anything for
 * them (CLAUDE.md #27 — explicit, never a silent bounce).
 */
export function NotALearnerNotice() {
  return (
    <Alert className="border-slate-200 bg-slate-50">
      <Info className="h-4 w-4 text-slate-500" />
      <AlertTitle className="text-slate-800">
        Sports Profile belongs to a learner
      </AlertTitle>
      <AlertDescription className="space-y-2 text-slate-600">
        <p className="text-sm">
          This page shows one learner&apos;s own sports record — their sports, coach,
          scholarship and credits — and your account is not linked to a learner record,
          so there is nothing here to show. Nothing is wrong with your account.
        </p>
        <p className="text-sm">
          Filing permission for a tournament works two ways and only two ways: a learner
          requests for themselves from this page, or the Physical Director files one
          request covering a whole squad. If a squad needs permission, ask the Physical
          Director to file it. If you should be able to file for a squad yourself, ask an
          administrator to grant{' '}
          <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">
            health.sports.file_request
          </code>{' '}
          in Role Management.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href="/health/dashboard">Back to Health &amp; Wellness</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Shown when the surface loads but the data door is shut — for example a squad
 * picker whose role cannot read learner records. A blank list would look like
 * "there is nobody"; this says what actually happened.
 */
export function EmptyBecauseNoDataAccess({
  what,
  permissionKeys,
}: {
  what: string;
  permissionKeys: string[];
}) {
  return (
    <Alert className="border-slate-200 bg-slate-50">
      <UserX className="h-4 w-4 text-slate-500" />
      <AlertTitle className="text-slate-800">No {what} could be read</AlertTitle>
      <AlertDescription className="text-slate-600">
        <p className="text-sm">
          This is a permission result, not an empty campus. Reading {what} needs one
          of: {permissionKeys.map((k) => (
            <code key={k} className="mx-0.5 rounded bg-slate-200 px-1 py-0.5 text-xs">
              {k}
            </code>
          ))}
          . Ask an administrator to grant one in Role Management.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** Shown when a required approver role has nobody in it. */
export function NoApproverNotice({ roleLabel }: { roleLabel: string }) {
  return (
    <Alert className="border-red-200 bg-red-50">
      <ShieldAlert className="h-4 w-4 text-red-600" />
      <AlertTitle className="text-red-900">No one can approve these requests</AlertTitle>
      <AlertDescription className="text-red-900">
        <p className="text-sm">
          The {roleLabel} role currently has no holder with approval permission, so
          filed requests would wait indefinitely with nobody able to act. Contact an
          administrator to assign the role before filing.
        </p>
      </AlertDescription>
    </Alert>
  );
}
