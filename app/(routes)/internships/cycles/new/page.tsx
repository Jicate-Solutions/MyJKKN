'use client';

// app/(routes)/internships/cycles/new/page.tsx
// Create a new internship_posting_cycle (status='draft' by default).
//
// Fields aligned to live `internship_posting_cycles` schema (substrate v3):
//   - cycle_name (replaces spec-time `name`)
//   - posting_type, temporal_mode, fee_compliance_threshold, escalate_after_hours
//     all surfaced for explicit Director control rather than relying on DB defaults
//   - academic_year + total_seats removed — neither column exists in live DB
//   - program_ids deferred — needs program multi-select picker (follow-up)

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarRange, Save } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateCycle } from '@/hooks/internships/useCycles';
import { CollegeSelect } from '../_components/college-select';
import type { CyclePostingType, CycleTemporalMode } from '@/lib/services/internships/types';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../../_components/no-access-alert';

interface FormState {
  cycle_name: string;
  institution_id: string;
  start_date: string;
  end_date: string;
  posting_type: CyclePostingType;
  temporal_mode: CycleTemporalMode;
  fee_compliance_threshold: string;
  escalate_after_hours: string;
  notes: string;
}

const INITIAL_STATE: FormState = {
  cycle_name: '',
  institution_id: '',
  start_date: '',
  end_date: '',
  posting_type: 'standard',
  temporal_mode: 'fixed',
  fee_compliance_threshold: '70',
  escalate_after_hours: '72',
  notes: '',
};

const POSTING_TYPE_OPTIONS: { value: CyclePostingType; label: string; helper: string }[] = [
  { value: 'standard', label: 'Standard', helper: 'Routine clinical / supervised industry posting' },
  { value: 'community', label: 'Community', helper: 'Community/rural/PHC outreach posting' },
  { value: 'industrial', label: 'Industrial', helper: 'Industry placement / OJT' },
  { value: 'research', label: 'Research', helper: 'Research project / lab attachment' },
  { value: 'virtual', label: 'Virtual', helper: 'Remote / simulation-based' },
];

const TEMPORAL_MODE_OPTIONS: { value: CycleTemporalMode; label: string; helper: string }[] = [
  { value: 'fixed', label: 'Fixed', helper: 'All learners follow a single window' },
  { value: 'rolling', label: 'Rolling', helper: 'Learners stagger start dates within window' },
  { value: 'batch_aligned', label: 'Batch-aligned', helper: 'Aligns to a specific batch calendar' },
];

export default function NewCyclePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [touched, setTouched] = useState<Record<keyof FormState, boolean>>({
    cycle_name: false,
    institution_id: false,
    start_date: false,
    end_date: false,
    posting_type: false,
    temporal_mode: false,
    fee_compliance_threshold: false,
    escalate_after_hours: false,
    notes: false,
  });

  const createCycle = useCreateCycle();

  const errors = useMemo(() => validate(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const markTouched = (key: keyof FormState) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    setTouched({
      cycle_name: true,
      institution_id: true,
      start_date: true,
      end_date: true,
      posting_type: true,
      temporal_mode: true,
      fee_compliance_threshold: true,
      escalate_after_hours: true,
      notes: true,
    });

    if (hasErrors) return;

    createCycle.mutate(
      {
        cycle_name: form.cycle_name.trim(),
        institution_id: form.institution_id,
        start_date: form.start_date,
        end_date: form.end_date,
        posting_type: form.posting_type,
        temporal_mode: form.temporal_mode,
        fee_compliance_threshold: Number(form.fee_compliance_threshold) || 70,
        escalate_after_hours: Number(form.escalate_after_hours) || 72,
        notes: form.notes.trim() || null,
        status: 'draft',
      },
      {
        onSuccess: (cycle) => {
          router.push(`/internships/cycles/${cycle.id}`);
        },
      }
    );
  };

  const isSubmitting = createCycle.isPending;

  return (
    <PermissionGuard module="internship.cycles" action="create" fallback={<NoAccessAlert />}>
    <ContentLayout title="Create posting cycle">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/internships">Internships</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/internships/cycles">Cycles</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>New</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <CalendarRange className="h-6 w-6 text-orange-600" />
            Create posting cycle
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            New cycles start in <strong>Draft</strong>. You can edit fields freely until you submit
            for approval. Approval locks the structural fields per Decision #4 of the spec.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/internships/cycles">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to cycles
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Cycle details</CardTitle>
            <CardDescription>
              All fields marked <span aria-hidden>*</span> are required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldRow>
              <div className="space-y-1.5">
                <Label htmlFor="cycle_name">
                  Cycle name <Required />
                </Label>
                <Input
                  id="cycle_name"
                  value={form.cycle_name}
                  onChange={(e) => update('cycle_name', e.target.value)}
                  onBlur={() => markTouched('cycle_name')}
                  placeholder="e.g. CRRI Batch 2026 — Aug intake"
                  disabled={isSubmitting}
                  aria-invalid={touched.cycle_name && !!errors.cycle_name}
                  aria-describedby="cycle_name-error"
                />
                <FieldError id="cycle_name-error" show={touched.cycle_name} message={errors.cycle_name} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="college">
                  College <Required />
                </Label>
                <CollegeSelect
                  value={form.institution_id}
                  onChange={(v) => {
                    update('institution_id', v);
                    markTouched('institution_id');
                  }}
                  triggerClassName="w-full"
                  ariaLabel="College"
                  disabled={isSubmitting}
                />
                <FieldError
                  id="college-error"
                  show={touched.institution_id}
                  message={errors.institution_id}
                />
              </div>
            </FieldRow>

            <FieldRow>
              <div className="space-y-1.5">
                <Label htmlFor="start_date">
                  Start date <Required />
                </Label>
                <Input
                  id="start_date"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => update('start_date', e.target.value)}
                  onBlur={() => markTouched('start_date')}
                  disabled={isSubmitting}
                  aria-invalid={touched.start_date && !!errors.start_date}
                />
                <FieldError id="start_date-error" show={touched.start_date} message={errors.start_date} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="end_date">
                  End date <Required />
                </Label>
                <Input
                  id="end_date"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => update('end_date', e.target.value)}
                  onBlur={() => markTouched('end_date')}
                  disabled={isSubmitting}
                  aria-invalid={touched.end_date && !!errors.end_date}
                />
                <FieldError id="end_date-error" show={touched.end_date} message={errors.end_date} />
              </div>
            </FieldRow>

            <FieldRow>
              <div className="space-y-1.5">
                <Label htmlFor="posting_type">Posting type</Label>
                <Select
                  value={form.posting_type}
                  onValueChange={(v) => update('posting_type', v as CyclePostingType)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="posting_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSTING_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.helper}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="temporal_mode">Temporal mode</Label>
                <Select
                  value={form.temporal_mode}
                  onValueChange={(v) => update('temporal_mode', v as CycleTemporalMode)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="temporal_mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPORAL_MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.helper}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FieldRow>

            <FieldRow>
              <div className="space-y-1.5">
                <Label htmlFor="fee_compliance_threshold">Fee compliance threshold (%)</Label>
                <Input
                  id="fee_compliance_threshold"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.fee_compliance_threshold}
                  onChange={(e) => update('fee_compliance_threshold', e.target.value)}
                  onBlur={() => markTouched('fee_compliance_threshold')}
                  disabled={isSubmitting}
                  aria-invalid={touched.fee_compliance_threshold && !!errors.fee_compliance_threshold}
                />
                <FieldError
                  id="fee_compliance_threshold-error"
                  show={touched.fee_compliance_threshold}
                  message={errors.fee_compliance_threshold}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="escalate_after_hours">Escalate after (hours)</Label>
                <Input
                  id="escalate_after_hours"
                  type="number"
                  min={1}
                  value={form.escalate_after_hours}
                  onChange={(e) => update('escalate_after_hours', e.target.value)}
                  onBlur={() => markTouched('escalate_after_hours')}
                  disabled={isSubmitting}
                  aria-invalid={touched.escalate_after_hours && !!errors.escalate_after_hours}
                />
                <FieldError
                  id="escalate_after_hours-error"
                  show={touched.escalate_after_hours}
                  message={errors.escalate_after_hours}
                />
              </div>
            </FieldRow>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Optional internal notes — visible to coordinators on the cycle detail page."
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            {createCycle.error && (
              <Alert variant="destructive">
                <AlertTitle>Could not create cycle</AlertTitle>
                <AlertDescription>{(createCycle.error as Error).message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 flex max-w-3xl items-center justify-end gap-2">
          <Button asChild variant="outline" disabled={isSubmitting}>
            <Link href="/internships/cycles">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-1.5">
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Creating…' : 'Create cycle'}
          </Button>
        </div>
      </form>
    </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};

  if (!form.cycle_name.trim()) errors.cycle_name = 'Cycle name is required.';
  if (!form.institution_id) errors.institution_id = 'Select the college this cycle belongs to.';
  if (!form.start_date) errors.start_date = 'Start date is required.';
  if (!form.end_date) errors.end_date = 'End date is required.';
  if (form.start_date && form.end_date && form.end_date <= form.start_date) {
    errors.end_date = 'End date must be after start date.';
  }

  const threshold = Number(form.fee_compliance_threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    errors.fee_compliance_threshold = 'Enter a value between 0 and 100.';
  }

  const escalateHours = Number(form.escalate_after_hours);
  if (!Number.isFinite(escalateHours) || !Number.isInteger(escalateHours) || escalateHours < 1) {
    errors.escalate_after_hours = 'Must be a positive whole number.';
  }

  return errors;
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Required() {
  return (
    <span aria-hidden className="text-destructive">
      *
    </span>
  );
}

function FieldError({
  id,
  show,
  message,
}: {
  id: string;
  show: boolean;
  message: string | undefined;
}) {
  if (!show || !message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}
