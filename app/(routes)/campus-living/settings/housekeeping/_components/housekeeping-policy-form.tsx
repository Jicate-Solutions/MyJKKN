'use client';

// ============================================================================
// Housekeeping booking policy form (Director's config surface)
// ----------------------------------------------------------------------------
// Edits the 7 housekeeping.* rows in platform_policies — the exact knobs the
// booking RPCs read at runtime via fn_get_policy. Write pattern mirrors
// app/(routes)/campus-living/analytics/bed-economics/_components/
// settings-panel.tsx: load rows on mount, hold edits as drafts, save all
// dirty rows concurrently with per-row failure isolation (saved rows leave
// the dirty set; failed rows stay dirty for retry), invalidate the booking
// query keys, toast the outcome. Zero deploys — the next page load reflects
// every change.
//
// CRITICAL feature per spec §"Agent D": the live English-consequences panel
// recomputes purely client-side from the CURRENT form state (draft values,
// not yet saved) so the Director sees what a change means before committing.
// Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarRange,
  Clock,
  Power,
  RotateCcw,
  Save,
  Sparkles,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HOUSEKEEPING_POLICY_KEYS } from '@/lib/services/campus-living/housekeeping-policy-keys';
import { housekeepingBookingKeys } from '@/hooks/campus-living/use-housekeeping-bookings';

// ── Types ──────────────────────────────────────────────────────────────────

/** Raw jsonb value of one platform_policies row. */
type PolicyValue = unknown;

type PolicyRow = {
  policy_key: string;
  value: PolicyValue;
};

/** Number drafts hold '' while the field is cleared — never coerced to 0. */
type NumberDraft = number | '';

/** Editable mirror of the 7 policy values. */
interface FormState {
  slotDurationMinutes: NumberDraft;
  windowStart: string;
  windowEnd: string;
  capacityPerSlotPerBlock: NumberDraft;
  bookingAdvanceDays: NumberDraft;
  cancellationCutoffMinutes: NumberDraft;
  quotaStandard: NumberDraft;
  quotaPremium: NumberDraft;
  quotaPremiumPlus: NumberDraft;
  bookingEnabled: boolean;
}

const K = HOUSEKEEPING_POLICY_KEYS;

const FIELD_LABELS: Record<string, string> = {
  [K.SLOT_DURATION_MINUTES]: 'Slot duration',
  [K.SERVICE_WINDOW]: 'Service window',
  [K.CAPACITY_PER_SLOT_PER_BLOCK]: 'Capacity per slot per block',
  [K.BOOKING_ADVANCE_DAYS]: 'Booking advance days',
  [K.CANCELLATION_CUTOFF_MINUTES]: 'Cancellation cutoff',
  [K.WEEKLY_QUOTA_BY_TIER]: 'Weekly quota by tier',
  [K.BOOKING_ENABLED]: 'Booking enabled',
};

// ── Value parsing (jsonb → form) ───────────────────────────────────────────

function asNumber(v: PolicyValue, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asBoolean(v: PolicyValue, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asWindow(v: PolicyValue): { start: string; end: string } {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return {
      start: typeof o.start === 'string' ? o.start.slice(0, 5) : '09:00',
      end: typeof o.end === 'string' ? o.end.slice(0, 5) : '17:00',
    };
  }
  return { start: '09:00', end: '17:00' };
}

function asQuota(v: PolicyValue): Record<string, number> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const num = (x: unknown, d: number) =>
      typeof x === 'number' && Number.isFinite(x) ? x : d;
    return {
      standard: num(o.standard, 0),
      premium: num(o.premium, 2),
      premium_plus: num(o.premium_plus, 5),
    };
  }
  return { standard: 0, premium: 2, premium_plus: 5 };
}

function rowsToForm(rows: Record<string, PolicyRow>): FormState {
  const window = asWindow(rows[K.SERVICE_WINDOW]?.value);
  const quota = asQuota(rows[K.WEEKLY_QUOTA_BY_TIER]?.value);
  return {
    slotDurationMinutes: asNumber(rows[K.SLOT_DURATION_MINUTES]?.value, 10),
    windowStart: window.start,
    windowEnd: window.end,
    capacityPerSlotPerBlock: asNumber(rows[K.CAPACITY_PER_SLOT_PER_BLOCK]?.value, 1),
    bookingAdvanceDays: asNumber(rows[K.BOOKING_ADVANCE_DAYS]?.value, 7),
    cancellationCutoffMinutes: asNumber(
      rows[K.CANCELLATION_CUTOFF_MINUTES]?.value,
      60
    ),
    quotaStandard: quota.standard,
    quotaPremium: quota.premium,
    quotaPremiumPlus: quota.premium_plus,
    bookingEnabled: asBoolean(rows[K.BOOKING_ENABLED]?.value, true),
  };
}

/** form → the per-key jsonb values the save writes. */
function formToValues(form: FormState): Record<string, PolicyValue> {
  return {
    [K.SLOT_DURATION_MINUTES]: form.slotDurationMinutes,
    [K.SERVICE_WINDOW]: { start: form.windowStart, end: form.windowEnd },
    [K.CAPACITY_PER_SLOT_PER_BLOCK]: form.capacityPerSlotPerBlock,
    [K.BOOKING_ADVANCE_DAYS]: form.bookingAdvanceDays,
    [K.CANCELLATION_CUTOFF_MINUTES]: form.cancellationCutoffMinutes,
    [K.WEEKLY_QUOTA_BY_TIER]: {
      standard: form.quotaStandard,
      premium: form.quotaPremium,
      premium_plus: form.quotaPremiumPlus,
    },
    [K.BOOKING_ENABLED]: form.bookingEnabled,
  };
}

/** Stable deep-equal for the small jsonb shapes used here. */
function valueEquals(a: PolicyValue, b: PolicyValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Consequence math (pure, client-side) ───────────────────────────────────

function timeToMinutes(t: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes;
}

interface Consequences {
  windowValid: boolean;
  windowMinutes: number;
  slotsPerDay: number;
  leftoverMinutes: number;
  cleaningsPerBlockPerDay: number;
}

function computeConsequences(form: FormState): Consequences | null {
  if (
    form.slotDurationMinutes === '' ||
    form.capacityPerSlotPerBlock === '' ||
    form.slotDurationMinutes <= 0 ||
    form.capacityPerSlotPerBlock < 0
  ) {
    return null;
  }
  const startM = timeToMinutes(form.windowStart);
  const endM = timeToMinutes(form.windowEnd);
  if (startM === null || endM === null) return null;
  const windowMinutes = endM - startM;
  if (windowMinutes <= 0) {
    return {
      windowValid: false,
      windowMinutes,
      slotsPerDay: 0,
      leftoverMinutes: 0,
      cleaningsPerBlockPerDay: 0,
    };
  }
  const slotsPerDay = Math.floor(windowMinutes / form.slotDurationMinutes);
  const leftoverMinutes = windowMinutes % form.slotDurationMinutes;
  return {
    windowValid: true,
    windowMinutes,
    slotsPerDay,
    leftoverMinutes,
    cleaningsPerBlockPerDay: slotsPerDay * form.capacityPerSlotPerBlock,
  };
}

function quotaSentence(label: string, quota: NumberDraft): string {
  if (quota === '' || quota <= 0) {
    return `${label} residents cannot book (they keep the regular block cleaning rounds).`;
  }
  return `${label} residents get ${quota} included cleaning${quota === 1 ? '' : 's'} per week.`;
}

// ── Number input helper ────────────────────────────────────────────────────

function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  id: string;
  label: string;
  value: NumberDraft;
  onChange: (v: NumberDraft) => void;
  suffix?: string;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          min={min}
          value={value === '' ? '' : String(value)}
          onChange={(e) => {
            // A cleared field is held as '' (never coerced to 0); Save is
            // blocked while any number field is blank — bed-econ precedent.
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

// ── Main form ──────────────────────────────────────────────────────────────

export function HousekeepingPolicyForm() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  /** Last-known saved values per key (the rollback / dirty baseline). */
  const [savedValues, setSavedValues] = useState<Record<string, PolicyValue>>({});
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the 7 policy rows on mount (bed-econ panel load pattern).
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
        const initialForm = rowsToForm(map);
        setForm(initialForm);
        // Baseline = the form's canonical encoding of what's in the DB, so
        // dirty-detection compares like with like.
        const baseline: Record<string, PolicyValue> = {};
        const encoded = formToValues(initialForm);
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
  }, []);

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  // Dirty keys = encoded form values that differ from the saved baseline.
  // Keys whose rows are missing are never saved (update would match 0 rows).
  const dirtyKeys = useMemo(() => {
    if (!form) return [] as string[];
    const encoded = formToValues(form);
    return Object.values(K).filter(
      (key) =>
        key in savedValues && !valueEquals(encoded[key], savedValues[key])
    );
  }, [form, savedValues]);

  const hasBlankNumber =
    !!form &&
    [
      form.slotDurationMinutes,
      form.capacityPerSlotPerBlock,
      form.bookingAdvanceDays,
      form.cancellationCutoffMinutes,
      form.quotaStandard,
      form.quotaPremium,
      form.quotaPremiumPlus,
    ].some((v) => v === '');

  const hasInvalidWindow =
    !!form &&
    (() => {
      const s = timeToMinutes(form.windowStart);
      const e = timeToMinutes(form.windowEnd);
      return s === null || e === null || e <= s;
    })();

  const dirty = dirtyKeys.length > 0;

  function revert() {
    if (!form) return;
    // Rebuild the form from the saved baseline (round-trip through the
    // same encoders so the state matches exactly).
    const rows: Record<string, PolicyRow> = {};
    for (const [key, value] of Object.entries(savedValues)) {
      rows[key] = { policy_key: key, value };
    }
    setForm(rowsToForm(rows));
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
      const encoded = formToValues(form);

      // Fire all dirty-row updates concurrently; per-row failure isolation
      // (one failure never hides which others saved) — bed-econ save().
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
        // The RPCs read these rows live — refetch every booking surface.
        await queryClient.invalidateQueries({
          queryKey: housekeepingBookingKeys.all,
        });
        setSavedValues((prev) => {
          const next = { ...prev };
          for (const { key, value } of succeeded) next[key] = value;
          return next;
        });
      }

      if (failed.length === 0) {
        toast.success('Housekeeping booking policies updated.');
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
        <AlertTitle>Could not load housekeeping policies</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (!form) return null;

  const consequences = computeConsequences(form);

  return (
    <div className="space-y-6">
      {missingKeys.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some policy rows are not seeded yet</AlertTitle>
          <AlertDescription>
            Missing: {missingKeys.map((k) => FIELD_LABELS[k] ?? k).join(', ')}.
            Apply the housekeeping slot-booking migration first — unseeded
            values shown here are defaults and cannot be saved.
          </AlertDescription>
        </Alert>
      )}

      {/* Master kill-switch — prominent at the top */}
      <Card
        className={
          form.bookingEnabled
            ? 'border-green-300 bg-green-50/50'
            : 'border-red-300 bg-red-50/50'
        }
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`rounded-lg p-2 ${
                  form.bookingEnabled ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                <Power
                  className={`h-5 w-5 ${
                    form.bookingEnabled ? 'text-green-700' : 'text-red-700'
                  }`}
                />
              </div>
              <div>
                <p className="font-semibold">
                  Slot booking is {form.bookingEnabled ? 'ON' : 'OFF'}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {form.bookingEnabled
                    ? 'Entitled residents can book cleaning slots. Turning this off (and saving) pauses all new bookings.'
                    : 'Booking is OFF — residents see “Housekeeping slot booking is temporarily paused”. Existing bookings stay on the staff board.'}
                </p>
              </div>
            </div>
            <Switch
              checked={form.bookingEnabled}
              onCheckedChange={(v) => patch({ bookingEnabled: v })}
              aria-label="Master booking switch"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Slots & daily window */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-primary" />
                Slots &amp; daily window
              </CardTitle>
              <CardDescription>
                How long each cleaning slot is, when the team works, and how
                many rooms a block can clean in parallel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberField
                id="slot-duration"
                label="Slot duration"
                suffix="minutes"
                min={1}
                value={form.slotDurationMinutes}
                onChange={(v) => patch({ slotDurationMinutes: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="window-start">Window starts</Label>
                  <Input
                    id="window-start"
                    type="time"
                    value={form.windowStart}
                    onChange={(e) => patch({ windowStart: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="window-end">Window ends</Label>
                  <Input
                    id="window-end"
                    type="time"
                    value={form.windowEnd}
                    onChange={(e) => patch({ windowEnd: e.target.value })}
                  />
                </div>
              </div>
              <NumberField
                id="capacity"
                label="Capacity per slot per block"
                suffix="cleanings at once"
                min={0}
                value={form.capacityPerSlotPerBlock}
                onChange={(v) => patch({ capacityPerSlotPerBlock: v })}
              />
            </CardContent>
          </Card>

          {/* Booking rules */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="h-4 w-4 text-primary" />
                Booking rules
              </CardTitle>
              <CardDescription>
                How far ahead residents can book and how late they can cancel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberField
                id="advance-days"
                label="Booking advance window"
                suffix="days ahead"
                min={0}
                value={form.bookingAdvanceDays}
                onChange={(v) => patch({ bookingAdvanceDays: v })}
              />
              <NumberField
                id="cutoff"
                label="Cancellation cutoff"
                suffix="minutes before slot"
                min={0}
                value={form.cancellationCutoffMinutes}
                onChange={(v) => patch({ cancellationCutoffMinutes: v })}
              />
            </CardContent>
          </Card>

          {/* Weekly quota by tier */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Included cleanings per week, by tier
              </CardTitle>
              <CardDescription>
                0 means that tier cannot book slots (those residents keep the
                regular block cleaning rounds). Which ROOM CATEGORY sits in
                which tier is set per category under Settings &rarr; Categories
                (&ldquo;Entitlement Tier&rdquo;) &mdash; today Premium Room and
                Premium Room + AC are Premium, Premium Plus Room is Premium
                Plus, and Classic / Deluxe are Standard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <NumberField
                  id="quota-standard"
                  label="Standard"
                  min={0}
                  value={form.quotaStandard}
                  onChange={(v) => patch({ quotaStandard: v })}
                />
                <NumberField
                  id="quota-premium"
                  label="Premium"
                  min={0}
                  value={form.quotaPremium}
                  onChange={(v) => patch({ quotaPremium: v })}
                />
                <NumberField
                  id="quota-premium-plus"
                  label="Premium Plus"
                  min={0}
                  value={form.quotaPremiumPlus}
                  onChange={(v) => patch({ quotaPremiumPlus: v })}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live English consequences — recomputes from form state as it changes */}
        <Card className="h-fit lg:sticky lg:top-4 border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              What these settings mean
            </CardTitle>
            <CardDescription>
              Recalculates live as you change values — including unsaved edits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm leading-relaxed">
              {!form.bookingEnabled && (
                <li className="rounded-md border border-red-200 bg-red-50 p-3 font-medium text-red-800">
                  Booking is OFF — residents see “temporarily paused”. None of
                  the settings below take effect until it is turned back on.
                </li>
              )}
              {hasBlankNumber ? (
                <li className="text-amber-700">
                  Fill in the blank number field(s) to see the full picture.
                </li>
              ) : consequences === null ? (
                <li className="text-amber-700">
                  Enter a slot duration of at least 1 minute and valid window
                  times to see the full picture.
                </li>
              ) : !consequences.windowValid ? (
                <li className="text-red-700 font-medium">
                  The window end ({form.windowEnd}) must be after the start (
                  {form.windowStart}) — no slots exist right now.
                </li>
              ) : (
                <>
                  <li>
                    <span className="font-medium">
                      {String(form.slotDurationMinutes)}-minute slots
                    </span>{' '}
                    from {form.windowStart} to {form.windowEnd} →{' '}
                    <span className="font-semibold">
                      {consequences.slotsPerDay} slots per block per day
                    </span>
                    {consequences.leftoverMinutes > 0 && (
                      <span className="text-muted-foreground">
                        {' '}
                        (the last {consequences.leftoverMinutes} minutes of the
                        window are unused — they don&apos;t fit a full slot)
                      </span>
                    )}
                    .
                  </li>
                  <li>
                    Capacity {String(form.capacityPerSlotPerBlock)} →{' '}
                    <span className="font-semibold">
                      up to {consequences.cleaningsPerBlockPerDay} cleanings per
                      block per day
                    </span>
                    {form.capacityPerSlotPerBlock === 0 && (
                      <span className="text-red-700 font-medium">
                        {' '}
                        — capacity 0 means nobody can book anything
                      </span>
                    )}
                    .
                  </li>
                  <li>{quotaSentence('Premium', form.quotaPremium)}</li>
                  <li>{quotaSentence('Premium Plus', form.quotaPremiumPlus)}</li>
                  <li>{quotaSentence('Standard', form.quotaStandard)}</li>
                  <li>
                    Residents can book{' '}
                    {form.bookingAdvanceDays === 0 ? (
                      <span className="font-medium">today only</span>
                    ) : (
                      <>
                        up to{' '}
                        <span className="font-medium">
                          {String(form.bookingAdvanceDays)} day
                          {form.bookingAdvanceDays === 1 ? '' : 's'} ahead
                        </span>
                      </>
                    )}
                    .
                  </li>
                  <li>
                    {form.cancellationCutoffMinutes === 0 ? (
                      <>Cancellations are allowed right up to the slot start.</>
                    ) : (
                      <>
                        Cancellations close{' '}
                        <span className="font-medium">
                          {String(form.cancellationCutoffMinutes)} minutes before
                        </span>{' '}
                        the slot starts.
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
          disabled={!dirty || saving || hasBlankNumber || hasInvalidWindow}
          onClick={save}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
