// app/(routes)/audit/cycles/new/page.tsx
// 4-step wizard for creating a new audit cycle.
//
// Steps:
//   1. Basics    — name, description, start/end, frameworks
//   2. Scope     — institutions picker (empty = all accessible)
//   3. Snapshot  — preview the parameter catalog that will be frozen at start
//   4. Cosigners — confirm cosigner roles (default cao + ceo)
//
// On submit → useCreateAuditCycle (inserts audit_cycles row in draft phase).
// The parameter snapshot is frozen server-side on draft→in-progress transition
// (see AuditCycleService.transitionPhase). For now this wizard surfaces a preview only.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  AlertCircle,
  Info,
  Inbox,
  Layers,
  Users,
  ClipboardCheck,
  Signature,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useCreateAuditCycle, useSystemParameters } from '@/hooks/audit';
import { filterParametersByFrameworks } from '@/lib/services/audit/framework-filter';
import { cn } from '@/lib/utils';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/audit/cycles',
} as const;


// The bodies a cycle can be audited against. Order: the three JKKN audits
// against by default, then CARRE + IQAC (which own real catalog content), then
// the profession/other bodies.
//
// CARRE and IQAC are here because the freeze now genuinely filters by framework.
// Without a chip to admit them, the 25 CARRE-* parameters and the two org-wide
// checks (LOOP_HEALTH, EXAM_IA_AUDIT) could never enter a cycle again. Both
// org-wide checks also carry a NAAC mapping, so IQAC is for auditing them on
// their own; CARRE is the only way to reach the Culture pillars.
//
// NOTE: DCI / PCI / INC / NCTE / AICTE / QS currently map to ZERO parameters —
// selecting them alone yields an empty cycle. They are offered because the
// bodies are real and the catalog is expected to grow into them (see the
// Compliance Unification Program, sh_accreditation_metrics).
const FRAMEWORK_OPTIONS = [
  'NAAC',
  'NBA',
  'NIRF',
  'CARRE',
  'IQAC',
  'UGC',
  'QS',
  'AICTE',
  'NCTE',
  'DCI',
  'PCI',
  'INC',
];

const COSIGNER_OPTIONS = [
  { value: 'cao', label: 'CAO', description: 'Chief Academic Officer' },
  { value: 'ceo', label: 'CEO', description: 'Chief Executive Officer' },
  { value: 'md_caio', label: 'MD / CAIO', description: 'Managing Director' },
];

const wizardSchema = z
  .object({
    name: z
      .string()
      .min(4, 'Give the cycle a descriptive name (min 4 chars)')
      .max(120, 'Keep the name under 120 characters'),
    description: z.string().optional(),
    start_date: z.string().min(1, 'Start date required'),
    end_date: z.string().min(1, 'End date required'),
    frameworks: z
      .array(z.string())
      .min(1, 'Pick at least one framework'),
    institution_ids: z.array(z.string()),
    cosigner_roles: z
      .array(z.string())
      .min(1, 'Pick at least one cosigner role'),
  })
  .refine((v) => new Date(v.end_date) >= new Date(v.start_date), {
    message: 'End date must be on or after start date',
    path: ['end_date'],
  });

type WizardValues = z.infer<typeof wizardSchema>;

const STEPS = [
  { id: 1, label: 'Basics', icon: ClipboardCheck },
  { id: 2, label: 'Scope', icon: Users },
  { id: 3, label: 'Snapshot', icon: Layers },
  { id: 4, label: 'Cosigners', icon: Signature },
] as const;

function suggestDefaultName(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  // FY Apr–Mar. Qx based on calendar quarter of start date.
  const quarter = Math.floor(month / 3) + 1;
  // Indian FY spans two calendar years
  const fyStart = month >= 3 ? year : year - 1;
  return `Q${quarter} FY${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)} Institutional Audit`;
}

export default function NewAuditCyclePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  // Scope mode for step 2. Default 'one' → a new audit targets a SINGLE college
  // (Director decision). 'all' is the secondary, opt-in combined-audit path
  // where institution_ids resolves to [] (all accessible via RLS).
  const [scopeMode, setScopeMode] = useState<'one' | 'all'>('one');

  const {
    institutions,
    loading: institutionsLoading,
  } = useInstitutionsWithAccess();

  const { data: systemParams, isLoading: paramsLoading } = useSystemParameters();

  const createCycle = useCreateAuditCycle();

  const today = new Date();
  const defaultStart = today.toISOString().slice(0, 10);
  const defaultEnd = new Date(
    today.getFullYear(),
    today.getMonth() + 3,
    today.getDate(),
  )
    .toISOString()
    .slice(0, 10);

  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      name: suggestDefaultName(),
      description: '',
      start_date: defaultStart,
      end_date: defaultEnd,
      // CARRE is default-ON deliberately. NAAC+NBA+NIRF cover 38 parameters and
      // CARRE the other 25, so this default freezes all 63 — exactly what every
      // cycle froze before the freeze started filtering. Dropping CARRE from the
      // default would have silently removed the Culture pillars from every new
      // institutional cycle (and they hold the only attestations logged so far).
      frameworks: ['NAAC', 'NBA', 'NIRF', 'CARRE'],
      institution_ids: [],
      cosigner_roles: ['cao', 'ceo'],
    },
    mode: 'onChange',
  });

  const values = form.watch();

  async function handleSubmit() {
    if (!profile?.id) {
      form.setError('root', {
        message: 'Your session has no profile. Re-login and try again.',
      });
      return;
    }
    try {
      const created = await createCycle.mutateAsync({
        name: values.name,
        description: values.description?.trim() ? values.description : null,
        frameworks: values.frameworks,
        start_date: values.start_date,
        end_date: values.end_date,
        lead_auditor_id: profile.id,
        institution_ids:
          values.institution_ids.length === 0 ? null : values.institution_ids,
        cosigner_roles: values.cosigner_roles,
      });
      router.push(`/audit/cycles/${created.id}`);
    } catch (e) {
      form.setError('root', {
        message:
          (e as Error)?.message ??
          'Could not create cycle. Check permissions and try again.',
      });
    }
  }

  async function handleNext() {
    let valid = true;
    if (step === 1) {
      valid = await form.trigger([
        'name',
        'start_date',
        'end_date',
        'frameworks',
      ]);
    } else if (step === 2) {
      // One-college mode requires exactly one institution. All-colleges mode
      // has no requirement (empty array = all accessible). The zod schema keeps
      // institution_ids as an unconstrained string[]; the mode gate lives here.
      if (scopeMode === 'one' && values.institution_ids.length !== 1) {
        form.setError('institution_ids', {
          type: 'manual',
          message: 'Pick one college to audit',
        });
        valid = false;
      } else {
        form.clearErrors('institution_ids');
        valid = true;
      }
    } else if (step === 4) {
      valid = await form.trigger(['cosigner_roles']);
    }
    if (!valid) return;
    if (step === 4) {
      await handleSubmit();
      return;
    }
    setStep((s) => ((s + 1) as 1 | 2 | 3 | 4));
  }

  function handleBack() {
    if (step === 1) {
      router.push('/audit/cycles');
      return;
    }
    setStep((s) => ((s - 1) as 1 | 2 | 3 | 4));
  }

  return (
    <ContentLayout title="New Audit Cycle">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'Cycles', href: '/audit/cycles' },
          { label: 'New', href: '/audit/cycles/new' },
        ]}
      />

      <div className="space-y-6 max-w-4xl">
        {/* Step indicator */}
        <Card>
          <CardContent className="pt-6">
            <ol className="flex flex-wrap items-center gap-2">
              {STEPS.map((s, idx) => {
                const Icon = s.icon;
                const complete = step > s.id;
                const current = step === s.id;
                return (
                  <li key={s.id} className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
                        complete &&
                          'border-emerald-300 bg-emerald-100 text-emerald-800',
                        current &&
                          'border-primary bg-primary text-primary-foreground',
                        !complete &&
                          !current &&
                          'border-muted-foreground/30 text-muted-foreground',
                      )}
                    >
                      {complete ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        current ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {s.label}
                    </span>
                    {idx < STEPS.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />
                    )}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {/* Step body */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {STEPS.find((s) => s.id === step)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <StepBasics form={form} />
            )}
            {step === 2 && (
              <StepScope
                form={form}
                institutions={institutions}
                isLoading={institutionsLoading}
                scopeMode={scopeMode}
                setScopeMode={setScopeMode}
              />
            )}
            {step === 3 && (
              <StepSnapshot
                frameworks={values.frameworks}
                systemParams={systemParams}
                isLoading={paramsLoading}
              />
            )}
            {step === 4 && <StepCosigners form={form} values={values} />}
          </CardContent>
        </Card>

        {/* Error */}
        {form.formState.errors.root && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            <p className="text-destructive">
              {form.formState.errors.root.message}
            </p>
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={createCycle.isPending}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={handleNext} disabled={createCycle.isPending}>
            {step === 4 ? (
              createCycle.isPending ? (
                'Creating…'
              ) : (
                <>
                  Create cycle
                  <Check className="ml-2 h-4 w-4" />
                </>
              )
            ) : (
              <>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          The cycle is created in <strong>draft</strong> phase. The parameter
          catalog snapshot will be frozen automatically when you move it to{' '}
          <strong>in-progress</strong> from the cycle detail page. You can edit
          the scope and cosigners until then.
        </p>

        <Link
          href="/audit/cycles"
          className="inline-block text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to cycles list
        </Link>
      </div>
    </ContentLayout>
  );
}

// ============================================================================
// Step 1 — Basics
// ============================================================================
function StepBasics({
  form,
}: {
  form: ReturnType<typeof useForm<WizardValues>>;
}) {
  const values = form.watch();
  const errors = form.formState.errors;

  function toggleFramework(fw: string) {
    const next = values.frameworks.includes(fw)
      ? values.frameworks.filter((f) => f !== fw)
      : [...values.frameworks, fw];
    form.setValue('frameworks', next, { shouldValidate: true });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name">Cycle name</Label>
        <Input id="name" {...form.register('name')} className="mt-1" />
        {errors.name && (
          <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="description">
          Description <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="description"
          {...form.register('description')}
          className="mt-1"
          rows={3}
          placeholder="Purpose, peer-visit context, Aassaan mock-visit notes…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="start_date">Start date</Label>
          <Input
            id="start_date"
            type="date"
            {...form.register('start_date')}
            className="mt-1"
          />
          {errors.start_date && (
            <p className="text-xs text-destructive mt-1">
              {errors.start_date.message}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="end_date">End date</Label>
          <Input
            id="end_date"
            type="date"
            {...form.register('end_date')}
            className="mt-1"
          />
          {errors.end_date && (
            <p className="text-xs text-destructive mt-1">
              {errors.end_date.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label>Frameworks covered</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Attestations for parameters mapped to these bodies will be surfaced
          during this cycle. Pick the bodies you are auditing against.
        </p>
        <div className="flex flex-wrap gap-2">
          {FRAMEWORK_OPTIONS.map((fw) => {
            const active = values.frameworks.includes(fw);
            return (
              <button
                key={fw}
                type="button"
                onClick={() => toggleFramework(fw)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                )}
              >
                {fw}
              </button>
            );
          })}
        </div>
        {errors.frameworks && (
          <p className="text-xs text-destructive mt-2">
            {errors.frameworks.message as string}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Step 2 — Scope
// ============================================================================
function StepScope({
  form,
  institutions,
  isLoading,
  scopeMode,
  setScopeMode,
}: {
  form: ReturnType<typeof useForm<WizardValues>>;
  institutions: Array<{ id: string; name: string; counselling_code: string }>;
  isLoading: boolean;
  scopeMode: 'one' | 'all';
  setScopeMode: (mode: 'one' | 'all') => void;
}) {
  const values = form.watch();
  const errors = form.formState.errors;
  const selectedId = values.institution_ids[0] ?? '';

  function handleModeChange(mode: 'one' | 'all') {
    setScopeMode(mode);
    if (mode === 'all') {
      // All-colleges → empty array (resolved to all accessible at runtime).
      form.setValue('institution_ids', [], { shouldValidate: false });
      form.clearErrors('institution_ids');
    } else {
      // One-college → keep at most the first previously-chosen college.
      const first = values.institution_ids[0];
      form.setValue('institution_ids', first ? [first] : [], {
        shouldValidate: false,
      });
    }
  }

  function selectInstitution(id: string) {
    form.setValue('institution_ids', [id], { shouldValidate: true });
    form.clearErrors('institution_ids');
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle — new audits default to ONE college */}
      <RadioGroup
        value={scopeMode}
        onValueChange={(v) => handleModeChange(v as 'one' | 'all')}
        className="grid gap-2 sm:grid-cols-2"
      >
        <label
          htmlFor="scope-mode-one"
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/40',
            scopeMode === 'one' && 'border-primary bg-primary/5',
          )}
        >
          <RadioGroupItem value="one" id="scope-mode-one" className="mt-0.5" />
          <div>
            <div className="font-medium">
              One college{' '}
              <span className="text-[10px] text-muted-foreground">
                (default)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Audit a single college. Recommended for most cycles.
            </p>
          </div>
        </label>
        <label
          htmlFor="scope-mode-all"
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/40',
            scopeMode === 'all' && 'border-primary bg-primary/5',
          )}
        >
          <RadioGroupItem value="all" id="scope-mode-all" className="mt-0.5" />
          <div>
            <div className="font-medium">All colleges</div>
            <p className="text-xs text-muted-foreground">
              Combined audit across every college you can access.
            </p>
          </div>
        </label>
      </RadioGroup>

      {scopeMode === 'all' ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950">
          <p className="flex items-start gap-2">
            <Info className="h-4 w-4 flex-shrink-0 text-blue-600" />
            <span>
              This cycle will audit{' '}
              <strong>all institutions you have access to</strong> (resolved at
              runtime via RLS). Switch to <strong>One college</strong> to lock
              the cycle to a single college instead.
            </span>
          </p>
        </div>
      ) : (
        <>
          <div className="text-xs">
            {selectedId ? (
              <span>
                <strong>1</strong> college selected
              </span>
            ) : (
              <span className="text-muted-foreground">
                Pick one college to audit.
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : institutions.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center text-xs text-muted-foreground">
              <Inbox className="h-6 w-6 mb-2" />
              <p>No institutions accessible to your account.</p>
            </div>
          ) : (
            <RadioGroup
              value={selectedId}
              onValueChange={selectInstitution}
              className="max-h-80 gap-0 divide-y overflow-y-auto rounded-md border"
            >
              {institutions.map((inst) => {
                const checked = selectedId === inst.id;
                return (
                  <label
                    key={inst.id}
                    htmlFor={`scope-inst-${inst.id}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40',
                      checked && 'bg-primary/5',
                    )}
                  >
                    <RadioGroupItem
                      value={inst.id}
                      id={`scope-inst-${inst.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{inst.name}</div>
                      {inst.counselling_code && (
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {inst.counselling_code}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
          )}

          {errors.institution_ids && (
            <p className="text-xs text-destructive">
              {errors.institution_ids.message as string}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Step 3 — Parameter-snapshot preview
// ============================================================================
function StepSnapshot({
  frameworks,
  systemParams,
  isLoading,
}: {
  frameworks: string[];
  systemParams: Array<{ code: string; name: string; parameter_group: number; framework_mapping: Record<string, string> }> | undefined;
  isLoading: boolean;
}) {
  // Same predicate the freeze uses (AuditCycleService.transitionPhase) — this
  // preview's count IS what will be frozen. It used to be a private copy here
  // while the freeze filtered nothing, so the preview and reality disagreed.
  const relevant = filterParametersByFrameworks(systemParams ?? [], frameworks);

  const byGroup = relevant.reduce<Record<number, typeof relevant>>((acc, p) => {
    const g = p.parameter_group;
    if (!acc[g]) acc[g] = [];
    acc[g]!.push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950">
        <p className="flex items-start gap-2">
          <Info className="h-4 w-4 flex-shrink-0 text-amber-700" />
          <span>
            This preview shows parameters currently in the master catalog that
            are mapped to your chosen frameworks. The actual snapshot is
            <strong> frozen server-side</strong> the moment you move the cycle
            to <strong>in-progress</strong> — any catalog edits before that will
            be captured; edits after are not retro-applied.
          </span>
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : relevant.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center text-xs text-muted-foreground">
          <Inbox className="h-6 w-6 mb-2" />
          <p>No parameters in the catalog are mapped to your chosen frameworks.</p>
          <p>Add mappings from the parameter settings page before starting the cycle.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">
              {relevant.length} parameters will be frozen
            </Badge>
            {Object.entries(byGroup).map(([g, list]) => (
              <Badge key={g} variant="secondary">
                Group {g}: {list.length}
              </Badge>
            ))}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border divide-y text-xs">
            {relevant.slice(0, 50).map((p) => (
              <div
                key={p.code}
                className="flex items-start gap-3 px-3 py-2"
              >
                <span className="font-mono text-[11px] text-muted-foreground w-40 flex-shrink-0">
                  {p.code}
                </span>
                <span className="flex-1">{p.name}</span>
                <span className="flex flex-wrap gap-1 flex-shrink-0">
                  {Object.keys(p.framework_mapping ?? {}).map((k) => (
                    <Badge
                      key={k}
                      variant="outline"
                      className="text-[10px] uppercase"
                    >
                      {k}
                    </Badge>
                  ))}
                </span>
              </div>
            ))}
            {relevant.length > 50 && (
              <div className="px-3 py-2 text-center text-[11px] text-muted-foreground">
                + {relevant.length - 50} more parameters not shown
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Step 4 — Cosigner confirmation
// ============================================================================
function StepCosigners({
  form,
  values,
}: {
  form: ReturnType<typeof useForm<WizardValues>>;
  values: WizardValues;
}) {
  const errors = form.formState.errors;
  function toggle(role: string) {
    const next = values.cosigner_roles.includes(role)
      ? values.cosigner_roles.filter((r) => r !== role)
      : [...values.cosigner_roles, role];
    form.setValue('cosigner_roles', next, { shouldValidate: true });
  }

  const hasNAACorNBA =
    values.frameworks.includes('NAAC') || values.frameworks.includes('NBA');

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950">
        <p className="flex items-start gap-2">
          <Info className="h-4 w-4 flex-shrink-0 text-blue-600" />
          <span>
            NAAC/NBA-mapped attestations require BOTH <strong>CAO</strong> and{' '}
            <strong>CEO</strong> cosignatures by policy. The database enforces
            this constraint — attestations without both sign-offs are rejected.
          </span>
        </p>
      </div>

      <div className="space-y-2">
        {COSIGNER_OPTIONS.map((opt) => {
          const checked = values.cosigner_roles.includes(opt.value);
          const mandatory =
            hasNAACorNBA && (opt.value === 'cao' || opt.value === 'ceo');
          return (
            <label
              key={opt.value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted/40',
                checked && 'border-primary bg-primary/5',
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(opt.value)}
                disabled={mandatory}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{opt.label}</span>
                  {mandatory && (
                    <Badge variant="outline" className="text-[10px]">
                      Required for NAAC/NBA
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {opt.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      {errors.cosigner_roles && (
        <p className="text-xs text-destructive">
          {errors.cosigner_roles.message as string}
        </p>
      )}

      {/* Summary preview */}
      <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
        <div className="font-medium">Review before creating</div>
        <div>
          <strong>Name:</strong> {values.name}
        </div>
        <div>
          <strong>Dates:</strong> {values.start_date} → {values.end_date}
        </div>
        <div>
          <strong>Frameworks:</strong> {values.frameworks.join(', ') || '—'}
        </div>
        <div>
          <strong>Institutions:</strong>{' '}
          {values.institution_ids.length === 0
            ? 'All accessible (resolved at runtime)'
            : `${values.institution_ids.length} selected`}
        </div>
        <div>
          <strong>Cosigners:</strong>{' '}
          {values.cosigner_roles.map((r) => r.toUpperCase()).join(', ') || '—'}
        </div>
      </div>
    </div>
  );
}
