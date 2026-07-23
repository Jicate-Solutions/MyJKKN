'use client';

// ============================================================================
// /hr/admin/offboarding — Director's zero-deploy offboarding workflow editor
// ============================================================================
// Workisy parity gap #4 — staff separation workflow.
//
// Standing rule (memory: reference_platform_policies_director_view_pattern.md):
// every policy decision = config-table row + super_admin UI + reader fn.
//
// This page reads/writes ONE row:
//   policy_key  = 'hr.offboarding.workflow_steps'
//   scope_type  = 'global'
//   value       = WorkflowStep[]
//
// Each WorkflowStep is the canonical contract between admin UI here and the
// operational UI at /hr/offboarding. The `key` field is durable (used in
// hr_offboarding_step_completions.step_key); the `name` / `required_role` /
// `auto_advance` / `description` fields can be edited without breaking history.
//
// Defaults (5 steps from Workisy screenshot #4):
//   1. resignation_initiation  Resignation Initiation        staff
//   2. exit_call               Exit Call                     hr_officer
//   3. asset_submission        Asset Submission              hr_officer
//   4. noc                     Confirmation (NOC)            principal
//   5. final_settlement        Final Settlement              hr_officer
//
// Permission: super_admin only (SuperAdminOnly "users" / "manage").
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GripVertical, Plus, RotateCcw, Save, Trash2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { usePermissions } from '@/hooks/use-permissions';

export const navMeta = {
  label: 'Offboarding Workflow',
  icon: 'LogOut',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const POLICY_KEY = 'hr.offboarding.workflow_steps';

interface WorkflowStep {
  key: string;
  name: string;
  required_role: string;
  auto_advance: boolean;
  description: string;
}

interface PolicyRow {
  id: string | null;
  value: WorkflowStep[];
  updated_at: string | null;
}

// The role list a director can pick for "who completes this step".
// Plain-English labels — the director never sees raw role_keys.
const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'staff', label: 'Staff member (themselves)' },
  { value: 'hr_officer', label: 'HR Officer' },
  { value: 'hr_admin', label: 'HR Admin' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'principal', label: 'Principal' },
  { value: 'vice_principal', label: 'Vice Principal' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'accounts', label: 'Accounts / Finance' },
];

const DEFAULT_STEPS: WorkflowStep[] = [
  {
    key: 'resignation_initiation',
    name: 'Resignation Initiation',
    required_role: 'staff',
    auto_advance: true,
    description:
      'Staff member submits the resignation form with reason and recommended last day. Once submitted, the case opens and the next step becomes available for the HR Officer.',
  },
  {
    key: 'exit_call',
    name: 'Exit Call',
    required_role: 'hr_officer',
    auto_advance: false,
    description:
      'HR Officer conducts an exit interview / conversation with the staff member. When complete, the next step opens for the HR Officer.',
  },
  {
    key: 'asset_submission',
    name: 'Asset Submission',
    required_role: 'hr_officer',
    auto_advance: false,
    description:
      'HR Officer confirms all assets (ID card, laptop, keys, library books) have been returned. When complete, the next step opens for the Principal.',
  },
  {
    key: 'noc',
    name: 'Confirmation (NOC)',
    required_role: 'principal',
    auto_advance: false,
    description:
      'Principal issues No-Objection Certificate confirming the staff member can exit. When complete, the next step opens for Accounts / HR Officer.',
  },
  {
    key: 'final_settlement',
    name: 'Final Settlement',
    required_role: 'hr_officer',
    auto_advance: false,
    description:
      'Final salary, gratuity, leave encashment processed. When complete, the case is marked completed and the staff member is offboarded.',
  },
];

// ---------------------------------------------------------------------------
// Page wrapper — gated by super_admin manage permission.
// ---------------------------------------------------------------------------
export default function HrOffboardingWorkflowPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="HR Offboarding Workflow">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Offboarding Workflow' },
          ]}
        />
        <OperationalCasesSummary />
        <OffboardingWorkflowContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

// ---------------------------------------------------------------------------
// Operational Cases Summary — T6.4 extension.
// Adds a director-facing snapshot above the workflow editor:
//   - Counts by separation_type (resignation / retirement / termination / death)
//   - Total F&F net_payable across cases that have a calculation
//   - Filter dropdown narrows the case table by separation_type
//   - Per-case row links to /hr/admin/offboarding/[id]/fnf for the calculator
// ---------------------------------------------------------------------------

type SeparationType = 'resignation' | 'retirement' | 'termination' | 'death';
const SEPARATION_LABELS: Record<SeparationType, string> = {
  resignation: 'Resignation',
  retirement: 'Retirement',
  termination: 'Termination',
  death: 'Death',
};

interface CaseSummaryRow {
  id: string;
  staff_id: string;
  separation_type: SeparationType;
  status: 'open' | 'withdrawn' | 'completed';
  initiated_at: string;
  reason: string;
  current_step_index: number;
  fnf_calculation: { net_payable?: number; approved_at?: string | null } | null;
  staff?: { first_name: string; last_name: string; designation: string } | null;
}

function OperationalCasesSummary() {
  const [cases, setCases] = useState<CaseSummaryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SeparationType | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error: qErr } = await supabase
          .from('hr_offboarding_cases')
          .select(
            `id, staff_id, separation_type, status, initiated_at, reason,
             current_step_index, fnf_calculation,
             staff:staff_id ( first_name, last_name, designation )`,
          )
          .order('initiated_at', { ascending: false })
          .limit(50);
        if (qErr) throw qErr;
        if (cancelled) return;
        setCases((data ?? []) as unknown as CaseSummaryRow[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<SeparationType, number> = {
      resignation: 0,
      retirement: 0,
      termination: 0,
      death: 0,
    };
    (cases ?? []).forEach((row) => {
      if (row.separation_type in c) c[row.separation_type] += 1;
    });
    return c;
  }, [cases]);

  const fnfTotal = useMemo(() => {
    return (cases ?? []).reduce(
      (sum, row) => sum + (row.fnf_calculation?.net_payable ?? 0),
      0,
    );
  }, [cases]);

  const filtered = useMemo(() => {
    if (filter === 'all') return cases ?? [];
    return (cases ?? []).filter((row) => row.separation_type === filter);
  }, [cases, filter]);

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-6">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertTitle>Failed to load operational cases</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!cases || cases.length === 0) {
    return null; // Nothing operational yet — keep the page focused on the editor.
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Operational Cases (latest 50)</CardTitle>
            <CardDescription>
              Live snapshot of staff exits. F&amp;F totals are summed from each
              case&apos;s latest calculation. Use the filter to narrow by
              separation type, or open the F&amp;F calculator from any row.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="sep-filter" className="text-xs">
              Filter:
            </Label>
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger id="sep-filter" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="resignation">Resignation</SelectItem>
                <SelectItem value="retirement">Retirement</SelectItem>
                <SelectItem value="termination">Termination</SelectItem>
                <SelectItem value="death">Death</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {(Object.keys(counts) as SeparationType[]).map((k) => (
            <div
              key={k}
              className="rounded-md border bg-muted/30 p-3 text-center"
            >
              <div className="text-2xl font-semibold">{counts[k]}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {SEPARATION_LABELS[k]}
              </div>
            </div>
          ))}
          <div className="rounded-md border bg-primary/10 p-3 text-center">
            <div className="text-2xl font-semibold">
              ₹{Math.round(fnfTotal).toLocaleString('en-IN')}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              F&amp;F net total
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            No cases match the current filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">F&amp;F net</th>
                  <th className="py-2 pr-3">F&amp;F status</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const fnfNet = row.fnf_calculation?.net_payable ?? null;
                  const fnfApproved = row.fnf_calculation?.approved_at ?? null;
                  return (
                    <tr key={row.id} className="border-t">
                      <td className="py-2 pr-3">
                        {row.staff
                          ? `${row.staff.first_name} ${row.staff.last_name}`
                          : 'Unknown staff'}
                        <div className="text-xs text-muted-foreground">
                          {row.staff?.designation ?? ''}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="text-xs">
                          {SEPARATION_LABELS[row.separation_type]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {row.status === 'open' ? (
                          <Badge>In progress · step {row.current_step_index}</Badge>
                        ) : row.status === 'completed' ? (
                          <Badge variant="secondary">Completed</Badge>
                        ) : (
                          <Badge variant="outline">Withdrawn</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {fnfNet !== null
                          ? `₹${Math.round(fnfNet).toLocaleString('en-IN')}`
                          : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {fnfNet === null ? (
                          <span className="text-xs text-muted-foreground">
                            Not calculated
                          </span>
                        ) : fnfApproved ? (
                          <Badge variant="secondary">Approved</Badge>
                        ) : (
                          <Badge variant="outline">Draft</Badge>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/hr/admin/offboarding/${row.id}/fnf`}>
                            F&amp;F <ArrowRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Content — loads the policy row, lets super_admin edit, persists on Save.
// ---------------------------------------------------------------------------
function OffboardingWorkflowContent() {
  const { isSuperAdmin } = usePermissions();
  const [row, setRow] = useState<PolicyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<WorkflowStep[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error: rpcErr } = await supabase
          .from('platform_policies')
          .select('id, value, updated_at')
          .eq('policy_key', POLICY_KEY)
          .eq('scope_type', 'global')
          .is('scope_id', null)
          .maybeSingle();

        if (rpcErr) throw rpcErr;
        if (cancelled) return;

        if (data) {
          const value = Array.isArray(data.value)
            ? (data.value as WorkflowStep[])
            : DEFAULT_STEPS;
          setRow({
            id: data.id,
            value,
            updated_at: data.updated_at,
          });
        } else {
          // No row yet — Agent alpha hasn't seeded it. Render defaults so the
          // director can save the first time from this page. id=null signals
          // "INSERT on save" instead of "UPDATE on save".
          setRow({ id: null, value: DEFAULT_STEPS, updated_at: null });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = draft ?? row?.value ?? DEFAULT_STEPS;

  const dirty = useMemo(() => {
    if (!row) return false;
    if (!draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(row.value);
  }, [row, draft]);

  const canSave = dirty && steps.length > 0 && isSuperAdmin && !saving;

  function updateStep(idx: number, patch: Partial<WorkflowStep>) {
    const next = (draft ?? steps).map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setDraft(next);
  }

  function addStep() {
    const newKey = `custom_step_${Date.now()}`;
    const next: WorkflowStep[] = [
      ...(draft ?? steps),
      {
        key: newKey,
        name: 'New Step',
        required_role: 'hr_officer',
        auto_advance: false,
        description:
          'Describe what happens at this step and what triggers the next one.',
      },
    ];
    setDraft(next);
  }

  function removeStep(idx: number) {
    const next = (draft ?? steps).filter((_, i) => i !== idx);
    setDraft(next);
  }

  function revert() {
    setDraft(null);
  }

  async function save() {
    if (!row) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (row.id) {
        // UPDATE existing
        const { data, error: upErr } = await supabase
          .from('platform_policies')
          .update({
            value: steps,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .select('id, value, updated_at')
          .single();
        if (upErr) throw upErr;
        if (data) {
          setRow({
            id: data.id,
            value: Array.isArray(data.value) ? (data.value as WorkflowStep[]) : steps,
            updated_at: data.updated_at,
          });
        }
      } else {
        // INSERT first time
        const { data, error: insErr } = await supabase
          .from('platform_policies')
          .insert({
            policy_key: POLICY_KEY,
            scope_type: 'global',
            scope_id: null,
            value: steps,
            description:
              'HR offboarding workflow steps. Each entry defines one step in the staff-exit process. Key is durable (used in step completion history); name/role/description can be edited.',
            data_type: 'array',
            is_system: false,
            is_active: true,
            updated_by: user?.id ?? null,
          })
          .select('id, value, updated_at')
          .single();
        if (insErr) throw insErr;
        if (data) {
          setRow({
            id: data.id,
            value: Array.isArray(data.value) ? (data.value as WorkflowStep[]) : steps,
            updated_at: data.updated_at,
          });
        }
      }
      setDraft(null);
      toast.success('Offboarding workflow saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save workflow.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load offboarding workflow</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Alert>
        <AlertTitle>Read-only view</AlertTitle>
        <AlertDescription>
          You can see the current workflow but only super-admins can edit it.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Define the steps every exiting staff member follows</CardTitle>
          <CardDescription>
            These steps appear (in order) on every staff member&apos;s offboarding case.
            Edit step names, who is responsible, and what the next step is. Existing
            cases keep using their step history; only future cases see new steps.
            {row?.updated_at && (
              <span className="ml-2 text-xs">
                Last updated{' '}
                {format(new Date(row.updated_at), 'd MMM yyyy, h:mm a')}.
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {steps.map((step, idx) => (
        <Card key={step.key} className="border-l-4 border-l-primary/50">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-7 w-7 justify-center rounded-full p-0 text-sm">
                {idx + 1}
              </Badge>
              <div>
                <CardTitle className="text-base">{step.name || 'Untitled step'}</CardTitle>
                <CardDescription className="text-xs">key: {step.key}</CardDescription>
              </div>
            </div>
            {steps.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeStep(idx)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`step-name-${idx}`}>Step name</Label>
                <Input
                  id={`step-name-${idx}`}
                  value={step.name}
                  onChange={(e) => updateStep(idx, { name: e.target.value })}
                  placeholder="e.g. Exit Call"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`step-role-${idx}`}>Who completes this step</Label>
                <Select
                  value={step.required_role}
                  onValueChange={(v) => updateStep(idx, { required_role: v })}
                >
                  <SelectTrigger id={`step-role-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`step-desc-${idx}`}>
                What happens at this step (shown on the case page)
              </Label>
              <Textarea
                id={`step-desc-${idx}`}
                value={step.description}
                onChange={(e) => updateStep(idx, { description: e.target.value })}
                rows={3}
                placeholder="When this step is complete, the next step opens for the next role."
              />
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor={`step-auto-${idx}`} className="text-sm">
                  Auto-advance to next step
                </Label>
                <p className="text-xs text-muted-foreground">
                  When ON, completing this step immediately opens the next one. When OFF,
                  HR has to manually move the case forward.
                </p>
              </div>
              <Switch
                id={`step-auto-${idx}`}
                checked={step.auto_advance}
                onCheckedChange={(v) => updateStep(idx, { auto_advance: Boolean(v) })}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={addStep}>
          <Plus className="mr-2 h-4 w-4" /> Add step
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={revert} disabled={!dirty}>
          <RotateCcw className="mr-2 h-4 w-4" /> Revert changes
        </Button>
        <Button onClick={save} disabled={!canSave}>
          <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving…' : 'Save workflow'}
        </Button>
      </div>
    </div>
  );
}
