'use client';

// ============================================================================
// Choose Your Menu policy form (super-admin platform config, P0b)
// ----------------------------------------------------------------------------
// Edits the 9 `mess.choose.*` rows in platform_policies — the exact knobs the
// menu-engagement RPCs read at runtime. Write pattern mirrors
// app/(routes)/campus-living/settings/housekeeping/_components/
// housekeeping-policy-form.tsx: load rows on mount, hold edits as drafts,
// save all dirty rows concurrently with per-row failure isolation (saved rows
// leave the dirty set; failed rows stay dirty for retry), invalidate, toast.
// Zero deploys — the next page load reflects every change.
//
// CRITICAL feature per spec: the live English-consequences panel recomputes
// purely client-side from the CURRENT form state (draft values, not yet saved)
// so the super-admin sees what a change means before committing. This is the
// CARE return-arc made visible to the admin.
//
// Matrix shape: Personalization + Voting are per-tier (jsonb array of tier
// keys); Special-Day + the two feedback knobs are global booleans; options /
// cutoff are numbers. NO Radix Tabs (CFT click-flake) — segmented buttons.
// Spec: specs/choose-your-menu-platform-spec-2026-06-11.md.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  CalendarHeart,
  Check,
  ListChecks,
  Power,
  RotateCcw,
  Save,
  Sparkles,
  ThumbsUp,
  Utensils,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { CHOOSE_MENU_POLICY_KEYS } from '@/lib/services/campus-living/choose-your-menu-policy-keys';
import {
  useMessPlanOptions,
  type MessPlanOption,
} from '@/lib/services/campus-living/mess-plan-options';

// ── Types ──────────────────────────────────────────────────────────────────

/** Raw jsonb value of one platform_policies row. */
type PolicyValue = unknown;

type PolicyRow = {
  policy_key: string;
  value: PolicyValue;
};

/** Number drafts hold '' while the field is cleared — never coerced to 0. */
type NumberDraft = number | '';

/** Editable mirror of the 9 policy values. */
interface FormState {
  masterEnabled: boolean;
  personalizationTiers: string[];
  optionsPerMeal: NumberDraft;
  cutoffHours: NumberDraft;
  votingTiers: string[];
  specialDayEnabled: boolean;
  /** Read-only in P0b — surfaced for transparency, editable in a later PR. */
  proposerRoles: string[];
  feedbackLiveCounts: boolean;
  feedbackRecognition: boolean;
}

const K = CHOOSE_MENU_POLICY_KEYS;

const FIELD_LABELS: Record<string, string> = {
  [K.MASTER_ENABLED]: 'Master switch',
  [K.PERSONALIZATION_ENABLED_TIERS]: 'Personalization tiers',
  [K.PERSONALIZATION_OPTIONS_PER_MEAL]: 'Options per meal',
  [K.PERSONALIZATION_CUTOFF_HOURS]: 'Change cutoff',
  [K.VOTING_ENABLED_TIERS]: 'Voting tiers',
  [K.SPECIAL_DAY_ENABLED]: 'Special-day proposals',
  [K.SPECIAL_DAY_PROPOSER_ROLES]: 'Proposer roles',
  [K.FEEDBACK_LIVE_COUNTS]: 'Live counts',
  [K.FEEDBACK_RECOGNITION]: 'Recognition',
};

/** Ladder = the LIVE mess plans (auto-follow, 2026-06-12); the hook falls
 *  back to the Classic/Premium pair while loading or on read failure. */
function ladderLabel(ladder: MessPlanOption[], key: string): string {
  return ladder.find((t) => t.key === key)?.label ?? key;
}

// ── Value parsing (jsonb → form) ───────────────────────────────────────────

function asNumber(v: PolicyValue, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asBoolean(v: PolicyValue, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Coerce a jsonb value to an array of non-empty strings (tier keys / roles). */
function asStringArray(v: PolicyValue): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  }
  return [];
}

/** Keep tiers in the canonical ladder order so dirty-detection is stable.
 *  Keys not in the ladder (e.g. a category deactivated later) are preserved
 *  at the end so saving never silently drops them. */
function orderTiers(tiers: string[], ladder: MessPlanOption[]): string[] {
  const known = ladder.map((t) => t.key).filter((k) => tiers.includes(k));
  const unknown = tiers.filter((k) => !ladder.some((t) => t.key === k));
  return [...known, ...unknown];
}

function rowsToForm(rows: Record<string, PolicyRow>, ladder: MessPlanOption[]): FormState {
  return {
    masterEnabled: asBoolean(rows[K.MASTER_ENABLED]?.value, false),
    personalizationTiers: orderTiers(
      asStringArray(rows[K.PERSONALIZATION_ENABLED_TIERS]?.value),
      ladder
    ),
    optionsPerMeal: asNumber(rows[K.PERSONALIZATION_OPTIONS_PER_MEAL]?.value, 3),
    cutoffHours: asNumber(rows[K.PERSONALIZATION_CUTOFF_HOURS]?.value, 12),
    votingTiers: orderTiers(asStringArray(rows[K.VOTING_ENABLED_TIERS]?.value), ladder),
    specialDayEnabled: asBoolean(rows[K.SPECIAL_DAY_ENABLED]?.value, true),
    proposerRoles: asStringArray(rows[K.SPECIAL_DAY_PROPOSER_ROLES]?.value),
    feedbackLiveCounts: asBoolean(rows[K.FEEDBACK_LIVE_COUNTS]?.value, true),
    feedbackRecognition: asBoolean(rows[K.FEEDBACK_RECOGNITION]?.value, true),
  };
}

/** form → the per-key jsonb values the save writes. */
function formToValues(form: FormState, ladder: MessPlanOption[]): Record<string, PolicyValue> {
  return {
    [K.MASTER_ENABLED]: form.masterEnabled,
    [K.PERSONALIZATION_ENABLED_TIERS]: orderTiers(form.personalizationTiers, ladder),
    [K.PERSONALIZATION_OPTIONS_PER_MEAL]: form.optionsPerMeal,
    [K.PERSONALIZATION_CUTOFF_HOURS]: form.cutoffHours,
    [K.VOTING_ENABLED_TIERS]: orderTiers(form.votingTiers, ladder),
    [K.SPECIAL_DAY_ENABLED]: form.specialDayEnabled,
    // proposerRoles is read-only in P0b — written back unchanged so its row
    // never appears dirty.
    [K.SPECIAL_DAY_PROPOSER_ROLES]: form.proposerRoles,
    [K.FEEDBACK_LIVE_COUNTS]: form.feedbackLiveCounts,
    [K.FEEDBACK_RECOGNITION]: form.feedbackRecognition,
  };
}

/** Stable deep-equal for the small jsonb shapes used here. */
function valueEquals(a: PolicyValue, b: PolicyValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Plain-English helpers (pure, client-side) ──────────────────────────────

/** Join plan labels into prose: "Classic, Premium" / "all tiers". */
function tierPhrase(tiers: string[], ladder: MessPlanOption[]): string {
  const ordered = orderTiers(tiers, ladder);
  if (ordered.length === 0) return 'no tiers';
  if (ladder.every((t) => ordered.includes(t.key))) return 'all tiers';
  return ordered.map((k) => ladderLabel(ladder, k)).join(', ');
}

/** Plan keys NOT in the given set (for "the rest see the fixed menu"). */
function excludedTierLabels(tiers: string[], ladder: MessPlanOption[]): string {
  const ordered = orderTiers(tiers, ladder);
  const rest = ladder.map((t) => t.key).filter((k) => !ordered.includes(k));
  return rest.map((k) => ladderLabel(ladder, k)).join(', ');
}

// ── Tier segmented control (no Radix Tabs — CFT click-flake) ────────────────

function TierMatrix({
  legend,
  options,
  selected,
  onToggle,
  disabled,
}: {
  legend: string;
  options: MessPlanOption[];
  selected: string[];
  onToggle: (tierKey: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{legend}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((tier) => {
          const on = selected.includes(tier.key);
          return (
            <button
              key={tier.key}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onToggle(tier.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {on && <Check className="h-3.5 w-3.5" />}
              {tier.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Number input helper ────────────────────────────────────────────────────

function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  min = 0,
  disabled,
}: {
  id: string;
  label: string;
  value: NumberDraft;
  onChange: (v: NumberDraft) => void;
  suffix?: string;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          min={min}
          disabled={disabled}
          value={value === '' ? '' : String(value)}
          onChange={(e) => {
            // A cleared field is held as '' (never coerced to 0); Save is
            // blocked while any number field is blank — housekeeping precedent.
            if (e.target.value === '') {
              onChange('');
              return;
            }
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-full"
        />
        {suffix && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Toggle row helper ──────────────────────────────────────────────────────

function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  ariaLabel,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={ariaLabel} />
    </div>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────

export function ChooseYourMenuPolicyForm() {
  const queryClient = useQueryClient();
  const { options: planOptions } = useMessPlanOptions();
  // Re-encode the baseline when the live ladder settles (keys signature) so
  // dirty-detection always compares like-with-like orderings.
  const ladderSig = planOptions.map((t) => t.key).join(',');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  /** Last-known saved values per key (the rollback / dirty baseline). */
  const [savedValues, setSavedValues] = useState<Record<string, PolicyValue>>({});
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the 9 policy rows on mount (housekeeping load pattern).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('platform_policies')
          .select('policy_key, value')
          .in('policy_key', Object.values(K))
          .eq('scope_type', 'global')
          .is('scope_id', null);
        if (error) throw error;
        if (cancelled) return;
        const map: Record<string, PolicyRow> = {};
        for (const r of data ?? []) {
          map[r.policy_key] = {
            policy_key: r.policy_key,
            value: r.value as PolicyValue,
          };
        }
        const missing = Object.values(K).filter((key) => !(key in map));
        setMissingKeys(missing);
        const initialForm = rowsToForm(map, planOptions);
        setForm(initialForm);
        // Baseline = the form's canonical encoding of what's in the DB, so
        // dirty-detection compares like with like.
        const baseline: Record<string, PolicyValue> = {};
        const encoded = formToValues(initialForm, planOptions);
        for (const key of Object.values(K)) {
          if (key in map) baseline[key] = encoded[key];
        }
        setSavedValues(baseline);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladderSig]);

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  function toggleTier(field: 'personalizationTiers' | 'votingTiers', tierKey: string) {
    setForm((f) => {
      if (!f) return f;
      const current = f[field];
      const next = current.includes(tierKey)
        ? current.filter((k) => k !== tierKey)
        : orderTiers([...current, tierKey], planOptions);
      return { ...f, [field]: next };
    });
  }

  // Dirty keys = encoded form values that differ from the saved baseline.
  // Keys whose rows are missing are never saved (update would match 0 rows).
  const dirtyKeys = useMemo(() => {
    if (!form) return [] as string[];
    const encoded = formToValues(form, planOptions);
    return Object.values(K).filter(
      (key) => key in savedValues && !valueEquals(encoded[key], savedValues[key])
    );
  }, [form, savedValues, planOptions]);

  const hasBlankNumber =
    !!form && [form.optionsPerMeal, form.cutoffHours].some((v) => v === '');

  const dirty = dirtyKeys.length > 0;

  function revert() {
    if (!form) return;
    // Rebuild the form from the saved baseline (round-trip through the same
    // encoders so the state matches exactly).
    const rows: Record<string, PolicyRow> = {};
    for (const [key, value] of Object.entries(savedValues)) {
      rows[key] = { policy_key: key, value };
    }
    setForm(rowsToForm(rows, planOptions));
  }

  async function save() {
    if (!form || dirtyKeys.length === 0) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const updatedAt = new Date().toISOString();
      const encoded = formToValues(form, planOptions);

      // Fire all dirty-row updates concurrently; per-row failure isolation
      // (one failure never hides which others saved) — housekeeping save().
      const results = await Promise.all(
        dirtyKeys.map(async (key) => {
          const { error } = await supabase
            .from('platform_policies')
            .update({
              value: encoded[key],
              updated_by: user?.id ?? null,
              updated_at: updatedAt,
            })
            .eq('policy_key', key)
            .eq('scope_type', 'global')
            .is('scope_id', null);
          return { key, value: encoded[key], error };
        })
      );

      const succeeded = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);

      if (succeeded.length > 0) {
        // The RPCs read these rows live — drop any cached policy reads so the
        // resident surfaces refetch the new config.
        await queryClient.invalidateQueries({ queryKey: ['mess', 'choose'] });
        await queryClient.invalidateQueries({ queryKey: ['platform-policies'] });
        setSavedValues((prev) => {
          const next = { ...prev };
          for (const { key, value } of succeeded) next[key] = value;
          return next;
        });
      }

      if (failed.length === 0) {
        toast.success('Choose Your Menu settings updated.');
      } else {
        const label = (k: string) => FIELD_LABELS[k] ?? k;
        const failedLabels = failed.map((r) => label(r.key)).join(', ');
        if (succeeded.length > 0) {
          const savedLabels = succeeded.map((r) => label(r.key)).join(', ');
          toast.error(
            `Saved: ${savedLabels}. Failed (still unsaved): ${failedLabels}.`
          );
        } else {
          const firstMsg = failed[0].error?.message ?? 'unknown error';
          toast.error(`Save failed for ${failedLabels}: ${firstMsg}`);
        }
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load Choose Your Menu policies</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (!form) return null;

  const personalizationOn = form.personalizationTiers.length > 0;
  const votingOn = form.votingTiers.length > 0;

  return (
    <div className="space-y-6">
      {missingKeys.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some policy rows are not seeded yet</AlertTitle>
          <AlertDescription>
            Missing: {missingKeys.map((k) => FIELD_LABELS[k] ?? k).join(', ')}.
            Apply the Choose Your Menu P0 substrate migration first — unseeded
            values shown here are defaults and cannot be saved.
          </AlertDescription>
        </Alert>
      )}

      {/* Master kill-switch — prominent at the top */}
      <Card
        className={
          form.masterEnabled
            ? 'border-green-300 bg-green-50/50'
            : 'border-red-300 bg-red-50/50'
        }
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`rounded-lg p-2 ${
                  form.masterEnabled ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                <Power
                  className={`h-5 w-5 ${
                    form.masterEnabled ? 'text-green-700' : 'text-red-700'
                  }`}
                />
              </div>
              <div>
                <p className="font-semibold">
                  Choose Your Menu is {form.masterEnabled ? 'ON' : 'OFF'}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {form.masterEnabled
                    ? 'Residents see the menu-engagement features per the tier and mode settings below. Turning this off (and saving) hides the whole feature.'
                    : 'OFF → the whole Choose Your Menu feature is hidden from residents. None of the mode settings below take effect until you turn this on.'}
                </p>
              </div>
            </div>
            <Switch
              checked={form.masterEnabled}
              onCheckedChange={(v) => patch({ masterEnabled: v })}
              aria-label="Master Choose Your Menu switch"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Mode A — Personalization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Utensils className="h-4 w-4 text-primary" />
                Personalization — swap a meal
              </CardTitle>
              <CardDescription>
                Pick which tiers can swap a planned meal for one of a few
                curated alternatives, and the rules around it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TierMatrix
                legend="Enabled for tiers"
                options={planOptions}
                selected={form.personalizationTiers}
                onToggle={(k) => toggleTier('personalizationTiers', k)}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="options-per-meal"
                  label="Options per meal"
                  suffix="choices"
                  min={1}
                  value={form.optionsPerMeal}
                  onChange={(v) => patch({ optionsPerMeal: v })}
                  disabled={!personalizationOn}
                />
                <NumberField
                  id="cutoff-hours"
                  label="Change cutoff"
                  suffix="hours before"
                  min={0}
                  value={form.cutoffHours}
                  onChange={(v) => patch({ cutoffHours: v })}
                  disabled={!personalizationOn}
                />
              </div>
            </CardContent>
          </Card>

          {/* Mode B — Voting */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ThumbsUp className="h-4 w-4 text-primary" />
                Voting — thumbs up/down dishes
              </CardTitle>
              <CardDescription>
                Pick which tiers can vote dishes up or down to shape future
                menus.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TierMatrix
                legend="Enabled for tiers"
                options={planOptions}
                selected={form.votingTiers}
                onToggle={(k) => toggleTier('votingTiers', k)}
              />
            </CardContent>
          </Card>

          {/* Mode C — Special-day */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarHeart className="h-4 w-4 text-primary" />
                Special-day proposals
              </CardTitle>
              <CardDescription>
                Festival and occasion menu proposals (one switch for the whole
                platform).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow
                icon={<CalendarHeart className="h-4 w-4" />}
                title={`Special-day proposals are ${
                  form.specialDayEnabled ? 'ON' : 'OFF'
                }`}
                desc={
                  form.specialDayEnabled
                    ? 'Authorised staff can propose festival menus for review.'
                    : 'No one can propose special-day menus.'
                }
                checked={form.specialDayEnabled}
                onChange={(v) => patch({ specialDayEnabled: v })}
                ariaLabel="Special-day proposals switch"
              />
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm text-muted-foreground">
                    Who can propose
                  </Label>
                  <Badge variant="outline" className="text-[10px]">
                    Read-only — editable later
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.proposerRoles.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      No proposer roles set.
                    </span>
                  ) : (
                    form.proposerRoles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {role.replace(/_/g, ' ')}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feedback / return-arc */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                The return-arc — how residents see their input land
              </CardTitle>
              <CardDescription>
                Closing the loop is the point: show residents their input
                counts and ping them when it reaches the menu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ToggleRow
                icon={<ListChecks className="h-4 w-4" />}
                title="Live counts"
                desc="Residents see their own votes and choices tally live."
                checked={form.feedbackLiveCounts}
                onChange={(v) => patch({ feedbackLiveCounts: v })}
                ariaLabel="Live counts switch"
              />
              <ToggleRow
                icon={<Bell className="h-4 w-4" />}
                title="Recognition"
                desc="Ping a resident when a dish they backed lands on the menu."
                checked={form.feedbackRecognition}
                onChange={(v) => patch({ feedbackRecognition: v })}
                ariaLabel="Recognition switch"
              />
            </CardContent>
          </Card>
        </div>

        {/* Live English consequences — recomputes from form state as it changes */}
        <Card className="h-fit lg:sticky lg:top-4 border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              What residents will experience
            </CardTitle>
            <CardDescription>
              Recalculates live as you change values — including unsaved edits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm leading-relaxed">
              {!form.masterEnabled ? (
                <li className="rounded-md border border-red-200 bg-red-50 p-3 font-medium text-red-800">
                  Choose Your Menu is OFF — residents see nothing. None of the
                  settings below take effect until the master switch is on.
                </li>
              ) : (
                <>
                  {/* Personalization */}
                  <li>
                    {personalizationOn ? (
                      <>
                        <span className="font-medium">Personalization is ON</span>{' '}
                        for{' '}
                        <span className="font-semibold">
                          {tierPhrase(form.personalizationTiers, planOptions)}
                        </span>{' '}
                        — those residents can swap up to{' '}
                        <span className="font-semibold">
                          {hasBlankNumber || form.optionsPerMeal === ''
                            ? '—'
                            : String(form.optionsPerMeal)}{' '}
                          option
                          {form.optionsPerMeal === 1 ? '' : 's'}
                        </span>{' '}
                        per meal
                        {form.cutoffHours !== '' && (
                          <>
                            {' '}
                            until{' '}
                            <span className="font-semibold">
                              {form.cutoffHours === 0
                                ? 'right up to'
                                : `${form.cutoffHours}h before`}
                            </span>{' '}
                            a meal
                          </>
                        )}
                        .
                        {excludedTierLabels(form.personalizationTiers, planOptions) && (
                          <span className="text-muted-foreground">
                            {' '}
                            {excludedTierLabels(form.personalizationTiers, planOptions)}{' '}
                            residents see the fixed menu.
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-medium">
                          Personalization is OFF
                        </span>{' '}
                        — every resident sees the fixed menu (no meal swaps).
                      </>
                    )}
                  </li>

                  {/* Voting */}
                  <li>
                    {votingOn ? (
                      <>
                        <span className="font-medium">Voting is ON</span> for{' '}
                        <span className="font-semibold">
                          {tierPhrase(form.votingTiers, planOptions)}
                        </span>{' '}
                        — those residents can vote dishes up or down.
                      </>
                    ) : (
                      <>
                        <span className="font-medium">Voting is OFF</span> — no
                        one can vote on dishes.
                      </>
                    )}
                  </li>

                  {/* Special-day */}
                  <li>
                    {form.specialDayEnabled ? (
                      <>
                        <span className="font-medium">
                          Special-day proposals are ON
                        </span>{' '}
                        — authorised staff (
                        {form.proposerRoles.length > 0
                          ? form.proposerRoles
                              .map((r) => r.replace(/_/g, ' '))
                              .join(', ')
                          : 'no roles set'}
                        ) can propose festival menus.
                      </>
                    ) : (
                      <>
                        <span className="font-medium">
                          Special-day proposals are OFF.
                        </span>
                      </>
                    )}
                  </li>

                  {/* Feedback / return-arc */}
                  <li>
                    {form.feedbackLiveCounts && form.feedbackRecognition ? (
                      <>
                        <span className="font-medium">
                          Live counts and recognition are ON
                        </span>{' '}
                        — residents see their votes tally live and get a ping
                        when a dish they backed lands on the menu.
                      </>
                    ) : form.feedbackLiveCounts ? (
                      <>
                        <span className="font-medium">Live counts are ON</span>{' '}
                        (residents see their tally live), but{' '}
                        <span className="font-medium">recognition is OFF</span>{' '}
                        — no ping when their dish is scheduled.
                      </>
                    ) : form.feedbackRecognition ? (
                      <>
                        <span className="font-medium">Recognition is ON</span>{' '}
                        (residents get a ping when their dish lands), but{' '}
                        <span className="font-medium">live counts are OFF</span>{' '}
                        — they don&apos;t see a running tally.
                      </>
                    ) : (
                      <>
                        <span className="font-medium">
                          Live counts and recognition are both OFF
                        </span>{' '}
                        — residents give input but get no visible feedback (the
                        loop doesn&apos;t close).
                      </>
                    )}
                  </li>
                </>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {dirty && (
          <span className="mr-auto text-sm text-muted-foreground">
            {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}
          </span>
        )}
        <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={revert}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Revert
        </Button>
        <Button
          size="sm"
          disabled={!dirty || saving || hasBlankNumber}
          onClick={save}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
