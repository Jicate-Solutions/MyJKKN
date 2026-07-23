'use client';

// =====================================================================
// /hr/admin/policies/promotion-policy — Wave 3 W3-M6b
// =====================================================================
// Backed by `hr.promotion_policy` (scope=institution; classification=major).
// JSONB shape (spec §28):
//   - max_merit_points (number, default 50)
//   - merit_score_formula (string)
//   - sedc_score_normalization_allowed (bool)
//   - delay_lookback_years (number)
//   - api_score_required, seniority_tiebreaker, is_reward_incentive_growth (bool)
//   - qualification_points_max (number, default 10)
//   - qualification_point_scale: { masters_completed, graduation_pg_diploma_min_1yr,
//       diploma_iti_min_1yr, training_per_5_days, book_publication, article_publication }
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

export const navMeta = {
  label: 'Promotion Policy',
  icon: 'TrendingUp',
} as const;

interface PromotionPolicyValue {
  max_merit_points: number;
  merit_score_formula: string;
  sedc_score_normalization_allowed: boolean;
  delay_lookback_years: number;
  api_score_required: boolean;
  seniority_tiebreaker: boolean;
  is_reward_incentive_growth: boolean;
  qualification_points_max: number;
  qualification_point_scale: {
    masters_completed: number;
    graduation_pg_diploma_min_1yr: number;
    diploma_iti_min_1yr: number;
    training_per_5_days: number;
    book_publication: number;
    article_publication: number;
  };
}

const DEFAULT_VALUE: PromotionPolicyValue = {
  max_merit_points: 50,
  merit_score_formula: 'appraisal_score / 10',
  sedc_score_normalization_allowed: true,
  delay_lookback_years: 5,
  api_score_required: true,
  seniority_tiebreaker: true,
  is_reward_incentive_growth: true,
  qualification_points_max: 10,
  qualification_point_scale: {
    masters_completed: 4,
    graduation_pg_diploma_min_1yr: 3,
    diploma_iti_min_1yr: 2,
    training_per_5_days: 1,
    book_publication: 2,
    article_publication: 1,
  },
};

function asNum(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
function asBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}
function asStr(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw : fallback;
}

function parseValue(raw: unknown): PromotionPolicyValue {
  const obj = (raw || {}) as Partial<PromotionPolicyValue>;
  const qps = (obj.qualification_point_scale || {}) as Partial<
    PromotionPolicyValue['qualification_point_scale']
  >;
  return {
    max_merit_points: asNum(obj.max_merit_points, DEFAULT_VALUE.max_merit_points),
    merit_score_formula: asStr(obj.merit_score_formula, DEFAULT_VALUE.merit_score_formula),
    sedc_score_normalization_allowed: asBool(
      obj.sedc_score_normalization_allowed,
      DEFAULT_VALUE.sedc_score_normalization_allowed,
    ),
    delay_lookback_years: asNum(obj.delay_lookback_years, DEFAULT_VALUE.delay_lookback_years),
    api_score_required: asBool(obj.api_score_required, DEFAULT_VALUE.api_score_required),
    seniority_tiebreaker: asBool(obj.seniority_tiebreaker, DEFAULT_VALUE.seniority_tiebreaker),
    is_reward_incentive_growth: asBool(
      obj.is_reward_incentive_growth,
      DEFAULT_VALUE.is_reward_incentive_growth,
    ),
    qualification_points_max: asNum(
      obj.qualification_points_max,
      DEFAULT_VALUE.qualification_points_max,
    ),
    qualification_point_scale: {
      masters_completed: asNum(
        qps.masters_completed,
        DEFAULT_VALUE.qualification_point_scale.masters_completed,
      ),
      graduation_pg_diploma_min_1yr: asNum(
        qps.graduation_pg_diploma_min_1yr,
        DEFAULT_VALUE.qualification_point_scale.graduation_pg_diploma_min_1yr,
      ),
      diploma_iti_min_1yr: asNum(
        qps.diploma_iti_min_1yr,
        DEFAULT_VALUE.qualification_point_scale.diploma_iti_min_1yr,
      ),
      training_per_5_days: asNum(
        qps.training_per_5_days,
        DEFAULT_VALUE.qualification_point_scale.training_per_5_days,
      ),
      book_publication: asNum(
        qps.book_publication,
        DEFAULT_VALUE.qualification_point_scale.book_publication,
      ),
      article_publication: asNum(
        qps.article_publication,
        DEFAULT_VALUE.qualification_point_scale.article_publication,
      ),
    },
  };
}

export default function PromotionPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Policy — Promotion Policy">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Promotion policy
            affects pay-impacting decisions and is classified as a major
            policy.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Policy — Promotion Policy">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Promotion Policy' },
          ]}
        />
        <PolicyEditorShell<PromotionPolicyValue>
          policyKey="hr.promotion_policy"
          pageTitle="Promotion Policy"
          pageBlurb="Merit-based promotion scoring. Candidates earn up to max_merit_points from their appraisal (via merit_score_formula) plus qualification_points_max from credentials (per the scale below). Seniority breaks ties; API score required."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <PromotionEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function PromotionEditor({
  value,
  onChange,
  disabled,
}: {
  value: PromotionPolicyValue;
  onChange: (next: PromotionPolicyValue) => void;
  disabled: boolean;
}) {
  function updateScale<K extends keyof PromotionPolicyValue['qualification_point_scale']>(
    key: K,
    n: number,
  ) {
    onChange({
      ...value,
      qualification_point_scale: {
        ...value.qualification_point_scale,
        [key]: n,
      },
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <Label className="text-sm font-semibold">Merit scoring</Label>
          <p className="text-xs text-muted-foreground">
            How appraisal performance maps to merit points.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Max merit points</Label>
            <Input
              type="number"
              value={value.max_merit_points}
              onChange={(e) =>
                onChange({ ...value, max_merit_points: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              min={0}
              max={1000}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Merit score formula</Label>
            <Input
              value={value.merit_score_formula}
              onChange={(e) => onChange({ ...value, merit_score_formula: e.target.value })}
              disabled={disabled}
              placeholder="appraisal_score / 10"
            />
            <p className="text-xs text-muted-foreground">
              Plain-text rule. Engine interprets standard variables like
              appraisal_score.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Delay lookback (years)</Label>
            <Input
              type="number"
              value={value.delay_lookback_years}
              onChange={(e) =>
                onChange({ ...value, delay_lookback_years: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              min={0}
              max={20}
            />
            <p className="text-xs text-muted-foreground">
              How many past years count toward promotion-delay calculations.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Toggles</Label>
        </div>
        <ToggleRow
          label="SEDC score normalisation allowed"
          help="When on, scores from the Staff Evaluation & Development Cell may be normalised across appraisers."
          checked={value.sedc_score_normalization_allowed}
          onChange={(v) =>
            onChange({ ...value, sedc_score_normalization_allowed: v })
          }
          disabled={disabled}
        />
        <ToggleRow
          label="API score required"
          help="When on, Academic Performance Indicator score is mandatory for promotion eligibility."
          checked={value.api_score_required}
          onChange={(v) => onChange({ ...value, api_score_required: v })}
          disabled={disabled}
        />
        <ToggleRow
          label="Seniority tiebreaker"
          help="When on, tied candidates are ranked by length of service."
          checked={value.seniority_tiebreaker}
          onChange={(v) => onChange({ ...value, seniority_tiebreaker: v })}
          disabled={disabled}
        />
        <ToggleRow
          label="Reward incentive growth"
          help="When on, promotion is framed as a reward for incremental growth (not just absolute performance)."
          checked={value.is_reward_incentive_growth}
          onChange={(v) => onChange({ ...value, is_reward_incentive_growth: v })}
          disabled={disabled}
        />
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Qualification points</Label>
          <p className="text-xs text-muted-foreground">
            Credentials add up to max points (default {value.qualification_points_max}).
            Each row is the points earned for that credential.
          </p>
        </div>
        <div className="space-y-1 max-w-xs">
          <Label className="text-xs">Qualification points max (cap)</Label>
          <Input
            type="number"
            value={value.qualification_points_max}
            onChange={(e) =>
              onChange({
                ...value,
                qualification_points_max: Number(e.target.value) || 0,
              })
            }
            disabled={disabled}
            min={0}
            max={100}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ScaleRow
            label="Masters completed"
            value={value.qualification_point_scale.masters_completed}
            onChange={(n) => updateScale('masters_completed', n)}
            disabled={disabled}
          />
          <ScaleRow
            label="Graduation / PG diploma (min 1 yr)"
            value={value.qualification_point_scale.graduation_pg_diploma_min_1yr}
            onChange={(n) => updateScale('graduation_pg_diploma_min_1yr', n)}
            disabled={disabled}
          />
          <ScaleRow
            label="Diploma / ITI (min 1 yr)"
            value={value.qualification_point_scale.diploma_iti_min_1yr}
            onChange={(n) => updateScale('diploma_iti_min_1yr', n)}
            disabled={disabled}
          />
          <ScaleRow
            label="Training (per 5 days)"
            value={value.qualification_point_scale.training_per_5_days}
            onChange={(n) => updateScale('training_per_5_days', n)}
            disabled={disabled}
          />
          <ScaleRow
            label="Book publication"
            value={value.qualification_point_scale.book_publication}
            onChange={(n) => updateScale('book_publication', n)}
            disabled={disabled}
          />
          <ScaleRow
            label="Article publication"
            value={value.qualification_point_scale.article_publication}
            onChange={(n) => updateScale('article_publication', n)}
            disabled={disabled}
          />
        </div>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
    </div>
  );
}

function ScaleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        disabled={disabled}
        min={0}
        max={100}
      />
    </div>
  );
}
