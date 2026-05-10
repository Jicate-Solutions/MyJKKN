'use client';

// app/(routes)/internships/cycles/new/page.tsx
// Create a new internship_posting_cycle (status='draft' by default).

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
import { useCreateCycle } from '@/hooks/internships/useCycles';
import { CollegeSelect } from '../_components/college-select';

interface FormState {
  name: string;
  institution_id: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  total_seats: string;
  notes: string;
}

const INITIAL_STATE: FormState = {
  name: '',
  institution_id: '',
  academic_year: '',
  start_date: '',
  end_date: '',
  total_seats: '',
  notes: '',
};

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/;

export default function NewCyclePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [touched, setTouched] = useState<Record<keyof FormState, boolean>>({
    name: false,
    institution_id: false,
    academic_year: false,
    start_date: false,
    end_date: false,
    total_seats: false,
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

    // Force-mark all fields touched on submit so any pending error surfaces.
    setTouched({
      name: true,
      institution_id: true,
      academic_year: true,
      start_date: true,
      end_date: true,
      total_seats: true,
      notes: true,
    });

    if (hasErrors) return;

    const totalSeats = form.total_seats.trim() ? parseInt(form.total_seats.trim(), 10) : null;

    createCycle.mutate(
      {
        name: form.name.trim(),
        institution_id: form.institution_id,
        academic_year: form.academic_year.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        total_seats: totalSeats,
        notes: form.notes.trim() || null,
        status: 'draft',
        created_by: null,
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
            New cycles start in <strong>Draft</strong>. You can edit fields freely until you
            activate. Activation locks the approval chain, posting type, fee threshold, and
            geofence per the policy spec.
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
                <Label htmlFor="name">
                  Name <Required />
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  onBlur={() => markTouched('name')}
                  placeholder="e.g. CRRI Batch 2026 — Aug intake"
                  disabled={isSubmitting}
                  aria-invalid={touched.name && !!errors.name}
                  aria-describedby="name-error"
                />
                <FieldError id="name-error" show={touched.name} message={errors.name} />
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
                <Label htmlFor="academic_year">
                  Academic year <Required />
                </Label>
                <Input
                  id="academic_year"
                  value={form.academic_year}
                  onChange={(e) => update('academic_year', e.target.value)}
                  onBlur={() => markTouched('academic_year')}
                  placeholder="2026-2027"
                  inputMode="numeric"
                  disabled={isSubmitting}
                  aria-invalid={touched.academic_year && !!errors.academic_year}
                  aria-describedby="academic_year-error"
                />
                <FieldError
                  id="academic_year-error"
                  show={touched.academic_year}
                  message={errors.academic_year}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="total_seats">Total seats</Label>
                <Input
                  id="total_seats"
                  type="number"
                  min={1}
                  value={form.total_seats}
                  onChange={(e) => update('total_seats', e.target.value)}
                  onBlur={() => markTouched('total_seats')}
                  placeholder="Optional"
                  disabled={isSubmitting}
                  aria-invalid={touched.total_seats && !!errors.total_seats}
                  aria-describedby="total_seats-error"
                />
                <FieldError
                  id="total_seats-error"
                  show={touched.total_seats}
                  message={errors.total_seats}
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
                  aria-describedby="start_date-error"
                />
                <FieldError
                  id="start_date-error"
                  show={touched.start_date}
                  message={errors.start_date}
                />
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
                  aria-describedby="end_date-error"
                />
                <FieldError
                  id="end_date-error"
                  show={touched.end_date}
                  message={errors.end_date}
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
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};

  if (!form.name.trim()) errors.name = 'Cycle name is required.';
  if (!form.institution_id) errors.institution_id = 'Select the college this cycle belongs to.';
  if (!form.academic_year.trim()) {
    errors.academic_year = 'Academic year is required.';
  } else if (!ACADEMIC_YEAR_PATTERN.test(form.academic_year.trim())) {
    errors.academic_year = 'Use YYYY-YYYY format, e.g. 2026-2027.';
  }
  if (!form.start_date) errors.start_date = 'Start date is required.';
  if (!form.end_date) errors.end_date = 'End date is required.';
  if (form.start_date && form.end_date && form.end_date <= form.start_date) {
    errors.end_date = 'End date must be after start date.';
  }
  if (form.total_seats.trim()) {
    const n = Number(form.total_seats.trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      errors.total_seats = 'Seats must be a positive whole number.';
    }
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
