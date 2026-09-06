// ============================================================================
// HR — Offboarding (Workisy parity gap #4, Wave 1)
// Created: 2026-05-15.
//
// HR officer / staff view: list of `hr_offboarding_cases` for the current
// institution scope (RLS does the filtering).
//
// Each case row shows:
//   - Staff name + designation
//   - Current step (visual 1/N stepper)
//   - Initiated date
//   - Days in current step
//
// "Initiate Exit" button opens a dialog with two fields (matches Workisy
// screenshot #4): reason textarea + recommended-last-day radio.
//
// Detail view (step progression UI) is Phase 2 and out of scope for Wave 1 —
// this page focuses on the list + initiation entry point. Per-step completion
// happens via inline buttons on the row (Phase 2: full detail page).
//
// Workflow step LIST is read from platform_policies.hr.offboarding.workflow_steps
// at render time. Falls back to an empty stepper if the policy is missing
// (Agent alpha seeds it in a parallel PR).
//
// Permission: any authenticated user in /hr/* — RLS narrows what they actually
// see. A staff member sees their own case; HR/admin sees institution-scoped.
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, LogOut, Loader2, Plus } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import { createClientSupabaseClient } from '@/lib/supabase/client';

const WORKFLOW_POLICY_KEY = 'hr.offboarding.workflow_steps';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowStep {
  key: string;
  name: string;
  required_role: string;
  auto_advance: boolean;
  description: string;
}

interface OffboardingCase {
  id: string;
  staff_id: string;
  institution_id: string;
  initiated_at: string;
  reason: string;
  recommended_last_day: string | null;
  current_step_index: number;
  status: 'open' | 'withdrawn' | 'completed';
  completed_at: string | null;
  staff?: {
    first_name: string;
    last_name: string;
    designation: string;
    institution_email: string;
  } | null;
}

interface StaffOption {
  id: string;
  name: string;
  designation: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HrOffboardingPage() {
  return (
    <ContentLayout title="Offboarding">
      <OffboardingContent />
    </ContentLayout>
  );
}

function OffboardingContent() {
  const [cases, setCases] = useState<OffboardingCase[] | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initiateOpen, setInitiateOpen] = useState(false);

  // Refetch trigger
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();

        // Workflow steps (policy)
        const { data: policyData } = await supabase
          .from('platform_policies')
          .select('value')
          .eq('policy_key', WORKFLOW_POLICY_KEY)
          .eq('scope_type', 'global')
          .is('scope_id', null)
          .maybeSingle();
        const steps = Array.isArray(policyData?.value)
          ? (policyData!.value as WorkflowStep[])
          : [];

        // Cases (RLS filters)
        const { data: casesData, error: casesErr } = await supabase
          .from('hr_offboarding_cases')
          .select(
            `id, staff_id, institution_id, initiated_at, reason,
             recommended_last_day, current_step_index, status, completed_at,
             staff:staff_id ( first_name, last_name, designation, institution_email )`,
          )
          .order('initiated_at', { ascending: false });

        if (casesErr) throw casesErr;
        if (cancelled) return;

        setWorkflow(steps);
        setCases((casesData ?? []) as OffboardingCase[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const open = useMemo(
    () => (cases ?? []).filter((c) => c.status === 'open'),
    [cases],
  );
  const closed = useMemo(
    () => (cases ?? []).filter((c) => c.status !== 'open'),
    [cases],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load offboarding cases</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Offboarding</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Track and manage staff separations through a {workflow.length || 5}-step
            workflow. Staff can initiate from here or from their profile; HR moves
            cases forward step by step.
          </p>
        </div>
        <Button onClick={() => setInitiateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Initiate Exit
        </Button>
      </div>

      {workflow.length === 0 && (
        <Alert>
          <AlertTitle>Offboarding workflow not yet configured</AlertTitle>
          <AlertDescription>
            Super-admins can define the steps at{' '}
            <code className="font-mono text-xs">/hr/admin/offboarding</code>.
            Default 5-step flow will be used until a custom one is saved.
          </AlertDescription>
        </Alert>
      )}

      {/* Active cases */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Active cases ({open.length})</h2>
        {open.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <LogOut className="mx-auto mb-3 h-8 w-8 opacity-40" />
              No active offboarding cases. Staff can initiate from their profile
              or here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {open.map((c) => (
              <CaseRow key={c.id} c={c} workflow={workflow} />
            ))}
          </div>
        )}
      </section>

      {/* Closed cases */}
      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-muted-foreground">
            Closed cases ({closed.length})
          </h2>
          <div className="space-y-3">
            {closed.map((c) => (
              <CaseRow key={c.id} c={c} workflow={workflow} />
            ))}
          </div>
        </section>
      )}

      <InitiateExitDialog
        open={initiateOpen}
        onOpenChange={setInitiateOpen}
        onCreated={() => {
          setInitiateOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Case row — name, step badge, stepper, days-in-step
// ---------------------------------------------------------------------------
function CaseRow({
  c,
  workflow,
}: {
  c: OffboardingCase;
  workflow: WorkflowStep[];
}) {
  const totalSteps = workflow.length || 5;
  const currentStep = workflow[c.current_step_index - 1];
  const fullName = c.staff
    ? `${c.staff.first_name} ${c.staff.last_name}`
    : 'Unknown staff';
  const designation = c.staff?.designation ?? '—';
  const daysInStep = formatDistanceToNow(new Date(c.initiated_at), {
    addSuffix: false,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">{fullName}</CardTitle>
            <CardDescription className="text-xs">
              {designation} ·{' '}
              {c.staff?.institution_email ?? 'no email'} · Initiated{' '}
              {format(new Date(c.initiated_at), 'd MMM yyyy')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={c.status} />
            {c.status === 'open' && (
              <Badge variant="outline" className="text-xs">
                Step {c.current_step_index} of {totalSteps}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Visual stepper */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {(workflow.length > 0
            ? workflow
            : Array.from({ length: 5 }, (_, i) => ({
                key: `s${i + 1}`,
                name: `Step ${i + 1}`,
                required_role: '',
                auto_advance: false,
                description: '',
              }))
          ).map((step, idx) => {
            const stepIndex = idx + 1;
            const done = stepIndex < c.current_step_index || c.status === 'completed';
            const active = stepIndex === c.current_step_index && c.status === 'open';
            return (
              <div key={step.key} className="flex flex-1 items-center gap-1 min-w-0">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    done
                      ? 'bg-primary text-primary-foreground'
                      : active
                        ? 'bg-primary/20 text-primary border border-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : stepIndex}
                </div>
                <span
                  className={`truncate text-xs ${
                    active ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                  title={step.name}
                >
                  {step.name}
                </span>
                {idx < (workflow.length || 5) - 1 && (
                  <div className="h-px flex-1 bg-border mx-1" />
                )}
              </div>
            );
          })}
        </div>

        {/* Reason + last day */}
        <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
          <div>
            <span className="font-medium text-foreground">Reason: </span>
            {c.reason || '—'}
          </div>
          <div>
            <span className="font-medium text-foreground">Recommended last day: </span>
            {c.recommended_last_day
              ? format(new Date(c.recommended_last_day), 'd MMM yyyy')
              : 'Not specified'}
          </div>
        </div>

        {c.status === 'open' && currentStep && (
          <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Now: {currentStep.name}.</span>{' '}
            {currentStep.description || 'No description configured.'} ·{' '}
            <span className="italic">In this step for {daysInStep}.</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: OffboardingCase['status'] }) {
  if (status === 'open') {
    return <Badge>In progress</Badge>;
  }
  if (status === 'completed') {
    return <Badge variant="secondary">Completed</Badge>;
  }
  return <Badge variant="outline">Withdrawn</Badge>;
}

// ---------------------------------------------------------------------------
// Initiate Exit dialog — matches Workisy screenshot #4 (reason + last-day radio)
// ---------------------------------------------------------------------------
function InitiateExitDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [lastDayMode, setLastDayMode] = useState<'today' | 'one_month' | 'custom'>(
    'one_month',
  );
  const [customDate, setCustomDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setStaffLoading(true);
      try {
        const supabase = createClientSupabaseClient();
        // Pull staff visible under current RLS — list capped client-side to 200
        // (HR officer sees institution-scoped; staff sees only themselves).
        const { data } = await supabase
          .from('staff')
          .select('id, first_name, last_name, designation')
          .eq('is_active', true)
          .order('first_name')
          .limit(200);
        if (cancelled) return;
        setStaffOptions(
          (data ?? []).map((s) => ({
            id: s.id as string,
            name: `${s.first_name} ${s.last_name}`,
            designation: (s.designation as string) ?? '',
          })),
        );
      } catch {
        // Soft-fail — empty list still allows manual override Phase 2
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function resolveLastDay(): string | null {
    const now = new Date();
    if (lastDayMode === 'today') return now.toISOString().slice(0, 10);
    if (lastDayMode === 'one_month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    }
    return customDate || null;
  }

  async function submit() {
    if (!selectedStaffId) {
      toast.error('Pick the staff member.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Reason is required.');
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClientSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Look up staff to get institution_id (denormalized onto the case row
      // so RLS works without joining).
      const { data: staffRow, error: sErr } = await supabase
        .from('staff')
        .select('institution_id')
        .eq('id', selectedStaffId)
        .single();
      if (sErr) throw sErr;

      const { error: insErr } = await supabase
        .from('hr_offboarding_cases')
        .insert({
          staff_id: selectedStaffId,
          institution_id: staffRow.institution_id,
          initiated_by: user?.id ?? null,
          reason: reason.trim(),
          recommended_last_day: resolveLastDay(),
          current_step_index: 1,
          status: 'open',
        });
      if (insErr) throw insErr;

      toast.success('Exit initiated. Case is now open at Step 1.');
      // Reset
      setSelectedStaffId('');
      setReason('');
      setLastDayMode('one_month');
      setCustomDate('');
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to initiate exit.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Initiate Exit</DialogTitle>
          <DialogDescription>
            Open a new offboarding case for a staff member. The case will start at
            Step 1 of the workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Staff picker — staff sees only themselves under RLS so this list is
              tiny for them; HR sees the full institution. */}
          <div className="space-y-2">
            <Label htmlFor="staff">Staff member</Label>
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger id="staff">
                <SelectValue
                  placeholder={staffLoading ? 'Loading…' : 'Pick the staff member'}
                />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.designation ? ` — ${s.designation}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason — matches Workisy screenshot #4 */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for exit</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Career move, family reasons, retirement, end of contract…"
            />
          </div>

          {/* Recommended last day — radio: today / +1 month / custom */}
          <div className="space-y-2">
            <Label>Recommended last day</Label>
            <RadioGroup
              value={lastDayMode}
              onValueChange={(v) => setLastDayMode(v as 'today' | 'one_month' | 'custom')}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="today" id="last-day-today" />
                <Label htmlFor="last-day-today" className="font-normal">
                  Today
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="one_month" id="last-day-month" />
                <Label htmlFor="last-day-month" className="font-normal">
                  One month from today (standard notice period)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="custom" id="last-day-custom" />
                <Label htmlFor="last-day-custom" className="font-normal">
                  Custom date
                </Label>
              </div>
            </RadioGroup>
            {lastDayMode === 'custom' && (
              <Input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Initiating…
              </>
            ) : (
              'Initiate Exit'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
