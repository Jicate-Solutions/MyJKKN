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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';
import {
  DEFAULT_VALUE,
  cleanForSave,
  parseValue,
  type PerfReviewValue,
} from '@/lib/hr/performance-review-policy';

// ---------------------------------------------------------------------------
// Types + parse
// ---------------------------------------------------------------------------

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
          prepareForSave={cleanForSave}
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

          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">
                A &ldquo;Below&rdquo; in Collegiality needs a written example
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Collegiality is the one area that leaves no record of its own, unlike a
                class taught or a paper published, so it is the easiest to use against
                someone. When ON, a reviewer who rates it Below has to write what the
                rating is based on before they can submit. Turning this OFF lets a Below
                be given with no reason recorded.
              </p>
            </div>
            <Switch
              checked={value.collegiality_below_requires_example}
              onCheckedChange={(c) =>
                onChange({ ...value, collegiality_below_requires_example: c })
              }
              disabled={disabled}
              aria-label="Require a written example for a Below in Collegiality"
            />
          </div>

          {/* ---- How ratings turn into promotion points ------------------ */}
          <div className="md:col-span-2 rounded-md border border-border p-4 space-y-4">
            <div>
              <Label className="text-sm font-semibold">
                How ratings count towards promotion
              </Label>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                The appraisal itself is four words, not a score. Promotion still needs a way
                to order two candidates, and this is it. All Meets comes to 50 out of 100,
                all Exceeds to 100. Team members are never shown this number.
              </p>
            </div>

            <div>
              <div className="text-xs font-medium mb-2">Points per rating</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['exceeds', 'meets', 'below'] as const).map((band) => (
                  <div key={band}>
                    <Label htmlFor={`pts-${band}`} className="text-xs capitalize">
                      {band}
                    </Label>
                    <Input
                      id={`pts-${band}`}
                      type="number"
                      min={0}
                      step="0.5"
                      value={value.rating_points[band]}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          rating_points: {
                            ...value.rating_points,
                            [band]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-2">
                Weight per area — 1 means it counts the same as the others
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['teaching', 'research', 'service', 'collegiality'] as const).map((area) => (
                  <div key={area}>
                    <Label htmlFor={`w-${area}`} className="text-xs capitalize">
                      {area}
                    </Label>
                    <Input
                      id={`w-${area}`}
                      type="number"
                      min={0}
                      step="0.5"
                      value={value.area_weights[area]}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          area_weights: {
                            ...value.area_weights,
                            [area]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
              <div>
                <div className="text-sm font-medium">
                  Leave Collegiality out of the promotion score
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  It is still rated and still discussed at every stage. It just stops moving
                  anyone up or down.
                </p>
              </div>
              <Switch
                checked={value.exclude_collegiality_from_score}
                onCheckedChange={(c) =>
                  onChange({ ...value, exclude_collegiality_from_score: c })
                }
                disabled={disabled}
                aria-label="Exclude Collegiality from the promotion score"
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
              <div>
                <div className="text-sm font-medium">
                  A &ldquo;Below&rdquo; in any counted area stops the increment
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When ON, one Below blocks the increment outright, whatever the score comes
                  to. The reviewer sees this before signing off, and the reason is recorded
                  separately so a blocked increment is never mistaken for a low score.
                </p>
              </div>
              <Switch
                checked={value.below_blocks_increment}
                onCheckedChange={(c) => onChange({ ...value, below_blocks_increment: c })}
                disabled={disabled}
                aria-label="A Below in any counted area stops the increment"
              />
            </div>
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

      <AppraisalChecksEditor value={value} onChange={onChange} disabled={disabled} />

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

// ---------------------------------------------------------------------------
// Checks on the appraisal itself (2026-09-29)
// ---------------------------------------------------------------------------

const CHECK_AREAS = ['teaching', 'research', 'service', 'collegiality'] as const;
const CHECK_BANDS = ['exceeds', 'meets', 'below'] as const;
const BAND_WORD: Record<(typeof CHECK_BANDS)[number], string> = {
  exceeds: 'Exceeds',
  meets: 'Meets',
  below: 'Below',
};

function NumberField({
  id, label, help, value, min, max, disabled, onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: number;
  min: number;
  max?: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        className="mt-1 max-w-[8rem]"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="text-xs text-muted-foreground mt-1">{help}</p>
    </div>
  );
}

/**
 * Settings for the checks that tell HR whether the appraisal measures
 * anything. None of them rates a person or touches pay.
 */
function AppraisalChecksEditor({
  value,
  onChange,
  disabled,
}: {
  value: PerfReviewValue;
  onChange: (next: PerfReviewValue) => void;
  disabled: boolean;
}) {
  return (
    <section className="space-y-4 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">Checks on the appraisal itself</Label>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          An appraisal only earns its cost if it measures something. These settings decide
          when the round page warns that it is not. None of them rates anyone or changes pay.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
        <div>
          <div className="text-sm font-medium">
            A &ldquo;Below&rdquo; first asks what the college did not provide
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            When ON, a head (or second rater) who rates any area Below must first pick what
            was missing — time, training, equipment or materials, clarity of role, workload,
            other — and add a short note. The round page counts what was named most, so HR
            sees what JKKN failed to provide.
          </p>
        </div>
        <Switch
          checked={value.conditions_first_on_below}
          onCheckedChange={(c) => onChange({ ...value, conditions_first_on_below: c })}
          disabled={disabled}
          aria-label="A Below first asks what the college did not provide"
        />
      </div>

      <div className="rounded-md border border-border p-4 space-y-4">
        <div>
          <div className="text-sm font-medium">Do two heads agree?</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            HR can ask a second head to rate an appraisal blind, from the same evidence.
            Below this share of agreement in any area, the round page says the ratings
            should not be used for promotion.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            id="agree-min-pct"
            label="Agreement needed (%)"
            help="Default 70."
            value={value.rater_agreement_min_pct}
            min={0}
            max={100}
            disabled={disabled}
            onChange={(n) => onChange({ ...value, rater_agreement_min_pct: n })}
          />
          <NumberField
            id="agree-min-pairs"
            label="Pairs needed before judging"
            help="Default 5. Fewer, and the page says there are not enough pairs yet."
            value={value.rater_agreement_min_pairs}
            min={1}
            disabled={disabled}
            onChange={(n) => onChange({ ...value, rater_agreement_min_pairs: n })}
          />
        </div>
      </div>

      <div className="rounded-md border border-border p-4 space-y-4">
        <div>
          <div className="text-sm font-medium">Has an area stopped telling people apart?</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Warn when one band holds at least this share of an area, once enough people are
            rated in it.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            id="sat-pct"
            label="Warn at (%)"
            help="Default 80."
            value={value.saturation_warn_pct}
            min={0}
            max={100}
            disabled={disabled}
            onChange={(n) => onChange({ ...value, saturation_warn_pct: n })}
          />
          <NumberField
            id="sat-min"
            label="Only once this many are rated"
            help="Default 10."
            value={value.saturation_min_count}
            min={1}
            disabled={disabled}
            onChange={(n) => onChange({ ...value, saturation_min_count: n })}
          />
        </div>
      </div>

      <div className="rounded-md border border-border p-4 space-y-4">
        <div>
          <div className="text-sm font-medium">Statements under each band</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Short statements a second person could check, one per line — for example
            &ldquo;Took a session for a colleague at least once a term&rdquo;. They are shown
            beside each band on every appraisal form, and reviewers tick the ones the evidence
            supports. Leave them empty and the forms stay as they are.
          </p>
        </div>
        {CHECK_AREAS.map((area) => (
          <div key={area} className="space-y-2">
            <div className="text-xs font-semibold capitalize">{area}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {CHECK_BANDS.map((band) => (
                <div key={band}>
                  <Label htmlFor={`st-${area}-${band}`} className="text-xs">
                    {BAND_WORD[band]}
                  </Label>
                  <Textarea
                    id={`st-${area}-${band}`}
                    rows={3}
                    className="mt-1 text-xs"
                    disabled={disabled}
                    value={value.band_statements[area][band].join('\n')}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        band_statements: {
                          ...value.band_statements,
                          [area]: {
                            ...value.band_statements[area],
                            [band]: e.target.value.split('\n'),
                          },
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
