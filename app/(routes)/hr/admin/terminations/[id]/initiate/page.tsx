'use client';

// ============================================================================
// /hr/admin/terminations/[id]/initiate — Director-only initiation form (T6.3)
// ============================================================================
// Two-mode page:
//   1. id='new': Director fills the staff selector + grounds + optional
//      disciplinary-case link + approver assignments + notice-waiver flag.
//      Submit creates the hr_offboarding_cases row and redirects to /review.
//   2. id=<uuid>: Page shows "case already initiated" CTA pointing to /review.
//      (Termination cases can't be "re-initiated" — they walk the chain.)
//
// The Director is the only role that should hit this page; we still pin it
// behind super_admin manage permission for consistency with the rest of
// /hr/admin/*.
//
// Companion service: lib/services/hr/termination-service.ts
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Gavel, Loader2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TerminationService,
  APPROVAL_STEP_LABEL,
  CANONICAL_APPROVAL_CHAIN,
  type TerminationApprovalStep,
} from '@/lib/services/hr/termination-service';

interface StaffOption {
  id: string;
  first_name: string;
  last_name: string;
  designation: string | null;
  institution_id: string;
  email: string | null;
}

interface ApproverOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function InitiateTerminationPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="Initiate Termination">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Terminations', href: '/hr/admin/terminations' },
            { label: 'Initiate' },
          ]}
        />
        <InitiateContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function InitiateContent() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  const id = params?.id as string;
  const isNew = id === 'new';

  // Form state
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [approverOptions, setApproverOptions] = useState<ApproverOption[]>([]);
  const [staffId, setStaffId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [grounds, setGrounds] = useState('');
  const [disciplinaryCaseId, setDisciplinaryCaseId] = useState('');
  const [recommendedLastDay, setRecommendedLastDay] = useState('');
  const [noticeWaived, setNoticeWaived] = useState(false);
  const [noticeWaiverReason, setNoticeWaiverReason] = useState('');
  const [approvers, setApprovers] = useState<
    Record<TerminationApprovalStep, string | null>
  >({ sedc: null, legal: null, director: null });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing case redirect — if id is a real uuid (not 'new') the case is
  // already initiated; bounce to /review.
  useEffect(() => {
    if (!isNew && id) {
      router.replace(`/hr/admin/terminations/${id}/review`);
    }
  }, [isNew, id, router]);

  // Load selectable staff + potential approvers.
  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [staffRes, profileRes] = await Promise.all([
          supabase
            .from('staff')
            .select('id, first_name, last_name, designation, institution_id, email')
            .eq('is_active', true)
            .order('first_name', { ascending: true })
            .limit(500),
          supabase
            .from('profiles')
            .select('id, full_name, email')
            .order('full_name', { ascending: true })
            .limit(500),
        ]);

        if (staffRes.error) throw staffRes.error;
        if (profileRes.error) throw profileRes.error;

        if (!cancelled) {
          setStaffOptions((staffRes.data ?? []) as StaffOption[]);
          setApproverOptions((profileRes.data ?? []) as ApproverOption[]);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isNew, supabase]);

  const selectedStaff = useMemo(
    () => staffOptions.find((s) => s.id === staffId) ?? null,
    [staffOptions, staffId],
  );

  const groundsLength = grounds.trim().length;
  const groundsOk = groundsLength > 20 || disciplinaryCaseId.trim().length > 0;
  const canSubmit =
    !submitting &&
    staffId &&
    reason.trim().length > 0 &&
    groundsOk &&
    (!noticeWaived || noticeWaiverReason.trim().length > 0);

  async function handleSubmit() {
    if (!selectedStaff) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await TerminationService.initiateTermination(supabase, {
        staffId: selectedStaff.id,
        institutionId: selectedStaff.institution_id,
        reason: reason.trim(),
        grounds: grounds.trim() || undefined,
        disciplinaryCaseId: disciplinaryCaseId.trim() || null,
        recommendedLastDay: recommendedLastDay || null,
        noticePeriodWaived: noticeWaived,
        noticeWaiverReason: noticeWaived ? noticeWaiverReason.trim() : null,
        approvers,
      });
      toast.success('Termination case initiated. Routed for SEDC review.');
      router.push(`/hr/admin/terminations/${created.id}/review`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isNew) {
    // Brief loading state until the redirect fires.
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to review…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/hr/admin/terminations">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to terminations
          </Link>
        </Button>
      </div>

      <Alert>
        <Gavel className="h-4 w-4" />
        <AlertTitle>Director-only action</AlertTitle>
        <AlertDescription>
          Termination opens a 3-step approval chain (SEDC → Legal → Director).
          You must supply documented grounds (&gt; 20 characters) or link an
          existing disciplinary case. Notice-period waiver requires a reason
          recorded for audit.
        </AlertDescription>
      </Alert>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to initiate termination</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Staff member</CardTitle>
          <CardDescription>
            Choose the active staff record to terminate. RLS narrows this list to
            scope you can see.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <Skeleton className="h-9 w-full max-w-md" />
          ) : (
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                    {s.designation ? ` — ${s.designation}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reason &amp; documented grounds</CardTitle>
          <CardDescription>
            Reason is a short label; grounds is the longer, audit-grade basis.
            Either supply grounds (&gt; 20 chars) directly OR link an existing
            disciplinary case — when linked, grounds will be auto-populated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="reason">Reason (short)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Misconduct following SEDC inquiry"
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="grounds">Documented grounds (&gt; 20 chars)</Label>
            <Textarea
              id="grounds"
              rows={4}
              value={grounds}
              onChange={(e) => setGrounds(e.target.value)}
              placeholder="Narrative basis for termination. Required unless a disciplinary case is linked."
            />
            <p className="text-xs text-muted-foreground">
              {groundsLength} / minimum 21 characters
              {groundsOk ? null : disciplinaryCaseId.trim() ? null : ' (or link a disciplinary case below)'}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="disc-id">Linked disciplinary case ID (optional)</Label>
            <Input
              id="disc-id"
              value={disciplinaryCaseId}
              onChange={(e) => setDisciplinaryCaseId(e.target.value)}
              placeholder="UUID of hr_disciplinary_cases row (when T6.2 is live)"
            />
            <p className="text-xs text-muted-foreground">
              When supplied AND the disciplinary substrate is installed, grounds
              are auto-populated from the case summary, allegations, and decision
              notes.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timing &amp; notice</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="last-day">Recommended last day</Label>
            <Input
              id="last-day"
              type="date"
              className="max-w-xs"
              value={recommendedLastDay}
              onChange={(e) => setRecommendedLastDay(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Waive contractual notice period</p>
              <p className="text-xs text-muted-foreground">
                Default off. Switch on only if the appointment letter or board
                resolution permits immediate effect.
              </p>
            </div>
            <Switch checked={noticeWaived} onCheckedChange={setNoticeWaived} />
          </div>
          {noticeWaived ? (
            <div className="space-y-1">
              <Label htmlFor="waiver-reason">Waiver reason (required)</Label>
              <Textarea
                id="waiver-reason"
                rows={2}
                value={noticeWaiverReason}
                onChange={(e) => setNoticeWaiverReason(e.target.value)}
                placeholder="Basis for skipping the contractual notice period (audit trail)."
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval chain</CardTitle>
          <CardDescription>
            Pre-assign approvers for each step (optional — can be assigned later
            from the review page).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CANONICAL_APPROVAL_CHAIN.map((step) => (
            <div key={step} className="space-y-1">
              <Label>{APPROVAL_STEP_LABEL[step]}</Label>
              <Select
                value={approvers[step] ?? '__none__'}
                onValueChange={(v) =>
                  setApprovers((cur) => ({ ...cur, [step]: v === '__none__' ? null : v }))
                }
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Select approver (or leave unassigned)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {approverOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? p.email ?? p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" asChild>
          <Link href="/hr/admin/terminations">Cancel</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Initiate termination
        </Button>
      </div>
    </div>
  );
}
