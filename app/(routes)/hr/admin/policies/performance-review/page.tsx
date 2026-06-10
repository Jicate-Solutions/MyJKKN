'use client';

// =====================================================================
// /hr/admin/policies/performance-review — Wave 3 W3-M6a
// =====================================================================
// Backed by `hr.performance_review` (scope=institution, per Director lock).
// Seeded by migrations/20260608_hr_governance_part1_seeds.sql.
// JSONB shape (per specs/hr-policy-jsonb-structures-2026-05-15.md §27):
//   {
//     appraisal_form_distribution_month: string,  // e.g. "June"
//     distribution_on_term_completion: boolean,
//     min_service_months_for_review: number,
//     period_start: string,  // MM-DD
//     period_end: string,    // MM-DD
//     self_appraisal_required: boolean,
//     review_committee: string,
//     final_approver: string,
//     facilitator_grading_doc_ref: string | null
//   }
// =====================================================================

import { Info } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

// ---------------------------------------------------------------------------
// Types + parse
// ---------------------------------------------------------------------------

interface PerfReviewValue {
  appraisal_form_distribution_month: string;
  distribution_on_term_completion: boolean;
  min_service_months_for_review: number;
  period_start: string;
  period_end: string;
  self_appraisal_required: boolean;
  review_committee: string;
  final_approver: string;
  facilitator_grading_doc_ref: string | null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DEFAULT_VALUE: PerfReviewValue = {
  appraisal_form_distribution_month: 'June',
  distribution_on_term_completion: true,
  min_service_months_for_review: 6,
  period_start: '07-01',
  period_end: '06-30',
  self_appraisal_required: true,
  review_committee: 'SEDC',
  final_approver: 'Director',
  facilitator_grading_doc_ref: null,
};

function parseValue(raw: unknown): PerfReviewValue {
  const obj = (raw || {}) as Partial<PerfReviewValue>;
  return {
    appraisal_form_distribution_month: String(
      obj.appraisal_form_distribution_month ?? DEFAULT_VALUE.appraisal_form_distribution_month,
    ),
    distribution_on_term_completion: Boolean(
      obj.distribution_on_term_completion ?? DEFAULT_VALUE.distribution_on_term_completion,
    ),
    min_service_months_for_review: Number(
      obj.min_service_months_for_review ?? DEFAULT_VALUE.min_service_months_for_review,
    ),
    period_start: String(obj.period_start ?? DEFAULT_VALUE.period_start),
    period_end: String(obj.period_end ?? DEFAULT_VALUE.period_end),
    self_appraisal_required: Boolean(
      obj.self_appraisal_required ?? DEFAULT_VALUE.self_appraisal_required,
    ),
    review_committee: String(obj.review_committee ?? DEFAULT_VALUE.review_committee),
    final_approver: String(obj.final_approver ?? DEFAULT_VALUE.final_approver),
    facilitator_grading_doc_ref:
      obj.facilitator_grading_doc_ref != null
        ? String(obj.facilitator_grading_doc_ref)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PerformanceReviewPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Performance Review">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Performance Review' },
          ]}
        />
        <PolicyEditorShell<PerfReviewValue>
          policyKey="hr.performance_review"
          pageTitle="Performance Review"
          pageBlurb="Appraisal cycle, eligibility, review committee, and final approver."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <PerfReviewEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor — appraisal cycle + eligibility + committee/approver
// ---------------------------------------------------------------------------

function PerfReviewEditor({
  value,
  onChange,
  disabled,
}: {
  value: PerfReviewValue;
  onChange: (next: PerfReviewValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-8">
      {/* Cycle */}
      <section className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Appraisal cycle</Label>
          <p className="text-xs text-muted-foreground">
            When forms are distributed and the period the review covers.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="dist-month" className="text-xs">
              Form distribution month
            </Label>
            <Select
              value={value.appraisal_form_distribution_month}
              onValueChange={(v) =>
                onChange({ ...value, appraisal_form_distribution_month: v })
              }
              disabled={disabled}
            >
              <SelectTrigger id="dist-month" className="mt-1">
                <SelectValue placeholder="Pick a month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              The month appraisal forms are sent out to staff each year.
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">Also distribute on term completion</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, appraisal forms also go out when a fixed-term contract ends.
              </p>
            </div>
            <Switch
              checked={value.distribution_on_term_completion}
              onCheckedChange={(c) =>
                onChange({ ...value, distribution_on_term_completion: c })
              }
              disabled={disabled}
              aria-label="Toggle distribution on term completion"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <Label htmlFor="period-start" className="text-xs">
              Review period start (MM-DD)
            </Label>
            <Input
              id="period-start"
              value={value.period_start}
              onChange={(e) => onChange({ ...value, period_start: e.target.value })}
              placeholder="07-01"
              pattern="\\d{2}-\\d{2}"
              disabled={disabled}
              className="mt-1 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              First day of the review period each year. Format: MM-DD.
            </p>
          </div>
          <div>
            <Label htmlFor="period-end" className="text-xs">
              Review period end (MM-DD)
            </Label>
            <Input
              id="period-end"
              value={value.period_end}
              onChange={(e) => onChange({ ...value, period_end: e.target.value })}
              placeholder="06-30"
              pattern="\\d{2}-\\d{2}"
              disabled={disabled}
              className="mt-1 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Last day of the review period. Format: MM-DD.
            </p>
          </div>
        </div>
      </section>

      {/* Eligibility */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Eligibility</Label>
          <p className="text-xs text-muted-foreground">
            Who is reviewed each cycle, and whether they fill in a self-appraisal.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min-months" className="text-xs">
              Minimum service for review (months)
            </Label>
            <Input
              id="min-months"
              type="number"
              min={0}
              max={120}
              value={value.min_service_months_for_review}
              onChange={(e) =>
                onChange({
                  ...value,
                  min_service_months_for_review: Number(e.target.value) || 0,
                })
              }
              disabled={disabled}
              className="mt-1 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Staff who have been employed for fewer than this many months are skipped.
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">Self-appraisal required</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, every reviewed staff member must complete a self-appraisal first.
              </p>
            </div>
            <Switch
              checked={value.self_appraisal_required}
              onCheckedChange={(c) => onChange({ ...value, self_appraisal_required: c })}
              disabled={disabled}
              aria-label="Toggle self-appraisal required"
            />
          </div>
        </div>
      </section>

      {/* Committee + approver */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Committee & approver</Label>
          <p className="text-xs text-muted-foreground">
            Who reviews the appraisal, who gives final sign-off, and the grading reference doc.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="committee" className="text-xs">
              Review committee
            </Label>
            <Input
              id="committee"
              value={value.review_committee}
              onChange={(e) => onChange({ ...value, review_committee: e.target.value })}
              disabled={disabled}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              e.g. SEDC. The body that reviews completed appraisals.
            </p>
          </div>
          <div>
            <Label htmlFor="final-approver" className="text-xs">
              Final approver
            </Label>
            <Input
              id="final-approver"
              value={value.final_approver}
              onChange={(e) => onChange({ ...value, final_approver: e.target.value })}
              disabled={disabled}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The role that gives the final sign-off after the committee.
            </p>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="grading-doc" className="text-xs">
              Facilitator grading doc
            </Label>
            <Input
              id="grading-doc"
              value={value.facilitator_grading_doc_ref ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  facilitator_grading_doc_ref: e.target.value === '' ? null : e.target.value,
                })
              }
              placeholder="https://... (optional grading rubric URL)"
              disabled={disabled}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional link to the grading rubric facilitators use.
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-2 text-xs text-muted-foreground border-t pt-3">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Per Director lock 2026-05-15: every HR policy is per-institution. Changes here only
          affect the selected institution.
        </span>
      </div>
    </div>
  );
}
