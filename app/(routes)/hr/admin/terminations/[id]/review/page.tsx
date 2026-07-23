'use client';

// ============================================================================
// /hr/admin/terminations/[id]/review — SEDC + Legal + Director review (T6.3)
// ============================================================================
// Single page consumed by all three approvers. Each step card is enabled only
// when the previous steps are approved (advanceApprovalChain enforces this on
// the server side too). Reject at any step closes the case.
//
// Permission: super_admin / admin manage permission. RLS narrows visibility;
// the service layer enforces step-order rules.
//
// Companion service: lib/services/hr/termination-service.ts
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Gavel,
  Loader2,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TerminationService,
  APPROVAL_STEP_LABEL,
  type TerminationApprovalChainEntry,
  type TerminationApprovalStep,
  type TerminationApprovalStatus,
  type TerminationCase,
} from '@/lib/services/hr/termination-service';

interface StaffDetail {
  id: string;
  first_name: string;
  last_name: string;
  designation: string | null;
  email: string | null;
  institution_id: string;
}

export default function TerminationReviewPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="Termination Review">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Terminations', href: '/hr/admin/terminations' },
            { label: 'Review' },
          ]}
        />
        <ReviewContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function ReviewContent() {
  const params = useParams();
  const caseId = params?.id as string;
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  const [tcase, setCase] = useState<TerminationCase | null>(null);
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStep, setActionStep] = useState<TerminationApprovalStep | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await TerminationService.getTerminationCase(supabase, caseId);
      if (!t) {
        throw new Error('Termination case not found or not visible under current RLS scope.');
      }
      setCase(t);

      const { data: staffRow, error: staffErr } = await supabase
        .from('staff')
        .select('id, first_name, last_name, designation, email, institution_id')
        .eq('id', t.staff_id)
        .maybeSingle();
      if (staffErr) throw staffErr;
      setStaff((staffRow ?? null) as StaffDetail | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, caseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(step: TerminationApprovalStep, status: 'approved' | 'rejected') {
    setActionStep(step);
    try {
      const updated = await TerminationService.advanceApprovalChain(supabase, {
        caseId,
        step,
        status,
        notes: actionNotes.trim() || null,
      });
      setCase(updated);
      setActionNotes('');
      if (status === 'approved') {
        toast.success(`${APPROVAL_STEP_LABEL[step]} approved.`);
      } else {
        toast.warning(`${APPROVAL_STEP_LABEL[step]} rejected — case withdrawn.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setActionStep(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load case</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!tcase) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/hr/admin/terminations">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to terminations
          </Link>
        </Button>
      </div>

      <CaseSummaryCard tcase={tcase} staff={staff} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Approval Chain
          </CardTitle>
          <CardDescription>
            Approve in order. A reject at any step closes the case (status:
            withdrawn) and is final.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-1">
            <Label htmlFor="notes">Notes for this action</Label>
            <Textarea
              id="notes"
              rows={3}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Optional — recorded against whichever step you act on next."
            />
          </div>

          <div className="space-y-3">
            {tcase.termination_approval_chain.map((entry, i, all) => {
              const canApprove =
                tcase.status === 'open' &&
                entry.status === 'pending' &&
                all.slice(0, i).every((e) => e.status === 'approved');
              return (
                <ChainStepCard
                  key={entry.step}
                  entry={entry}
                  busy={actionStep === entry.step}
                  canAct={canApprove}
                  onApprove={() => act(entry.step, 'approved')}
                  onReject={() => act(entry.step, 'rejected')}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CaseSummaryCard({
  tcase,
  staff,
}: {
  tcase: TerminationCase;
  staff: StaffDetail | null;
}) {
  const staffName = staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown';
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              {staffName}
              <Badge variant="outline">{staff?.designation ?? '—'}</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Termination case initiated{' '}
              {formatDistanceToNow(new Date(tcase.initiated_at), { addSuffix: true })}
              {tcase.recommended_last_day
                ? ` · Last day ${format(new Date(tcase.recommended_last_day), 'PP')}`
                : ''}
            </CardDescription>
          </div>
          <CaseStatusBadge status={tcase.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Reason</p>
          <p>{tcase.reason}</p>
        </div>
        <Separator />
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Documented grounds
          </p>
          <p className="whitespace-pre-wrap">{tcase.termination_grounds ?? '—'}</p>
        </div>
        <Separator />
        <div className="flex flex-wrap gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Legal review
            </p>
            <LegalStatusBadge status={tcase.legal_review_status} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Notice</p>
            {tcase.notice_period_waived ? (
              <Badge variant="destructive">Waived</Badge>
            ) : (
              <Badge variant="outline">Standard</Badge>
            )}
          </div>
          {tcase.metadata?.disciplinary_case_id ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Linked disciplinary case
              </p>
              <code className="rounded bg-muted px-2 py-0.5 text-xs">
                {String(tcase.metadata.disciplinary_case_id)}
              </code>
            </div>
          ) : null}
        </div>
        {tcase.notice_period_waived && tcase.metadata?.termination_notice_waiver_reason ? (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Notice waiver reason
              </p>
              <p className="whitespace-pre-wrap">
                {String(tcase.metadata.termination_notice_waiver_reason)}
              </p>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChainStepCard({
  entry,
  canAct,
  busy,
  onApprove,
  onReject,
}: {
  entry: TerminationApprovalChainEntry;
  canAct: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ChainStepIcon status={entry.status} />
          <div>
            <p className="text-sm font-semibold">
              {APPROVAL_STEP_LABEL[entry.step]}
            </p>
            <p className="text-xs text-muted-foreground">
              {entry.acted_at
                ? `Acted ${formatDistanceToNow(new Date(entry.acted_at), { addSuffix: true })}`
                : 'No action yet'}
            </p>
            {entry.notes ? (
              <p className="mt-2 max-w-xl rounded bg-muted/50 p-2 text-xs">
                {entry.notes}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChainStatusBadge status={entry.status} />
          {canAct ? (
            <>
              <Button size="sm" disabled={busy} onClick={onApprove}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={onReject}
              >
                Reject
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChainStepIcon({ status }: { status: TerminationApprovalStatus }) {
  if (status === 'approved') {
    return <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />;
  }
  if (status === 'rejected') {
    return <XCircle className="mt-0.5 h-5 w-5 text-destructive" />;
  }
  return <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />;
}

function ChainStatusBadge({ status }: { status: TerminationApprovalStatus }) {
  if (status === 'approved') {
    return (
      <Badge variant="outline" className="border-emerald-600 text-emerald-700">
        Approved
      </Badge>
    );
  }
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function CaseStatusBadge({ status }: { status: TerminationCase['status'] }) {
  if (status === 'completed') {
    return <Badge className="bg-emerald-600">Completed</Badge>;
  }
  if (status === 'withdrawn') {
    return <Badge variant="destructive">Withdrawn</Badge>;
  }
  return <Badge variant="secondary">Open</Badge>;
}

function LegalStatusBadge({
  status,
}: {
  status: TerminationCase['legal_review_status'];
}) {
  if (status === 'approved') {
    return (
      <Badge variant="outline" className="border-emerald-600 text-emerald-700">
        Approved
      </Badge>
    );
  }
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
  if (status === 'not_required') return <Badge variant="outline">Not required</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}
