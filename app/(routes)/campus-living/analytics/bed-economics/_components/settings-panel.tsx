'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw, Save, Settings, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { bedEconomicsKeys } from '@/hooks/campus-living/use-bed-economics';
import { BED_ECON_POLICY_KEYS } from './policy-keys';

/**
 * In-page policy settings panel (spec §7.1, Director decision 2026-06-07).
 *
 * Storage stays in platform_policies (the locked platform standard — single
 * registry, fn_get_policy reader). The EDIT surface is this super-admin gear →
 * Sheet on the dashboard itself: each of the 7 bed_econ.* tunables renders
 * beside its English consequence and writes back to the same platform_policies
 * rows (direct .update by policy_key, the telephony-policies precedent). On
 * save we invalidate the bed-economics React Query keys so every metric on the
 * page refetches with the new policy — zero deploys.
 */

type PolicyValue = string | number | boolean | string[];

type PolicyRow = {
  policy_key: string;
  value: PolicyValue;
  data_type: string | null;
  enum_options: string[] | null;
};

// Display metadata for each policy — English consequence per spec §5/§7.1.
const POLICY_META: Record<
  string,
  { label: string; consequence: string }
> = {
  [BED_ECON_POLICY_KEYS.DENOMINATOR]: {
    label: 'Bed-count denominator',
    consequence:
      'Which bed count divides occupancy % and RevPAB. actual_capacity is the conservative real-bed count; capacity is nominal; beds counts hostel_beds rows.',
  },
  [BED_ECON_POLICY_KEYS.INCLUDE_MESS_IN_REVENUE]: {
    label: 'Include mess fees in revenue',
    consequence:
      'When on, mess-category fees count toward billed and potential revenue. Default off keeps revenue metrics to room fees only.',
  },
  [BED_ECON_POLICY_KEYS.OCCUPANCY_TARGET_PCT]: {
    label: 'Occupancy target %',
    consequence:
      'The bed-occupancy % the headline card turns green at. Below 80% of target it goes red.',
  },
  [BED_ECON_POLICY_KEYS.COLLECTION_TARGET_PCT]: {
    label: 'Collection target %',
    consequence: 'The collection % the headline card turns green at.',
  },
  [BED_ECON_POLICY_KEYS.STALE_VACANCY_DAYS]: {
    label: 'Stale-vacancy days',
    consequence:
      'A sellable bed empty for this many days is flagged in the costly-vacancies action panel.',
  },
  [BED_ECON_POLICY_KEYS.HOUSEKEEPING_COST_PER_ROOM_MONTH]: {
    label: 'Housekeeping ₹ / room / month',
    consequence:
      'Monthly housekeeping cost per occupied room. Feeds the consolidation cost-savings estimate.',
  },
  [BED_ECON_POLICY_KEYS.SELLABLE_ROOM_PURPOSES]: {
    label: 'Sellable room purposes',
    consequence:
      'room_purpose values that count as sellable inventory. Defaults to "student"; warden/office/sick rooms are excluded.',
  },
};

// Order the panel renders policies in.
const POLICY_ORDER = [
  BED_ECON_POLICY_KEYS.DENOMINATOR,
  BED_ECON_POLICY_KEYS.INCLUDE_MESS_IN_REVENUE,
  BED_ECON_POLICY_KEYS.OCCUPANCY_TARGET_PCT,
  BED_ECON_POLICY_KEYS.COLLECTION_TARGET_PCT,
  BED_ECON_POLICY_KEYS.STALE_VACANCY_DAYS,
  BED_ECON_POLICY_KEYS.HOUSEKEEPING_COST_PER_ROOM_MONTH,
  BED_ECON_POLICY_KEYS.SELLABLE_ROOM_PURPOSES,
];

export function SettingsPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, PolicyRow>>({});
  const [drafts, setDrafts] = useState<Record<string, PolicyValue>>({});
  const [saving, setSaving] = useState(false);
  const [newPurpose, setNewPurpose] = useState('');

  // Load the 7 policy rows whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error: qErr } = await supabase
          .from('platform_policies')
          .select('policy_key, value, data_type, enum_options')
          .in('policy_key', Object.values(BED_ECON_POLICY_KEYS))
          .eq('scope_type', 'global')
          .is('scope_id', null);
        if (qErr) throw qErr;
        if (cancelled) return;
        const map: Record<string, PolicyRow> = {};
        for (const r of data ?? []) {
          map[r.policy_key] = {
            policy_key: r.policy_key,
            value: r.value as PolicyValue,
            data_type: (r.data_type as string | null) ?? null,
            enum_options: Array.isArray(r.enum_options) ? (r.enum_options as string[]) : null,
          };
        }
        setRows(map);
        setDrafts({});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const dirty = Object.keys(drafts).length > 0;

  // A number field cleared to blank is held as '' (never coerced to 0). Block
  // Save while any such field is empty so an emptied field never writes 0.
  const hasBlankNumber = Object.entries(drafts).some(
    ([key, value]) => rows[key]?.data_type === 'number' && value === '',
  );

  function setDraft(key: string, value: PolicyValue) {
    setDrafts((d) => ({ ...d, [key]: value }));
  }

  function valueFor(key: string): PolicyValue | undefined {
    return key in drafts ? drafts[key] : rows[key]?.value;
  }

  function revert() {
    setDrafts({});
    setNewPurpose('');
  }

  async function save() {
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const updatedAt = new Date().toISOString();

      const updates = Object.entries(drafts);

      // Fire all policy updates concurrently. settled (not Promise.all-throw)
      // so one failure doesn't hide which others succeeded.
      const results = await Promise.all(
        updates.map(async ([key, value]) => {
          const { error: upErr } = await supabase
            .from('platform_policies')
            .update({
              value, // supabase-js JSON-encodes for the JSONB column
              updated_by: user?.id ?? null,
              updated_at: updatedAt,
            })
            .eq('policy_key', key)
            .eq('scope_type', 'global')
            .is('scope_id', null);
          return { key, value, error: upErr };
        }),
      );

      const succeeded = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);

      // Refetch every bed-econ metric so the page reflects whatever saved.
      if (succeeded.length > 0) {
        await queryClient.invalidateQueries({ queryKey: bedEconomicsKeys.all });

        // Update local mirror for the rows that actually saved.
        setRows((prev) => {
          const next = { ...prev };
          for (const { key, value } of succeeded) {
            if (next[key]) next[key] = { ...next[key], value };
          }
          return next;
        });
      }

      // Keep only the failed keys dirty (drop the saved ones) so a retry
      // touches just the ones that still need it — never silent partial state.
      const savedKeys = new Set(succeeded.map((r) => r.key));
      setDrafts((prev) => {
        const next: Record<string, PolicyValue> = {};
        for (const [key, value] of Object.entries(prev)) {
          if (!savedKeys.has(key)) next[key] = value;
        }
        return next;
      });

      if (failed.length === 0) {
        toast.success('Bed-economics policies updated.');
      } else {
        const label = (k: string) => POLICY_META[k]?.label ?? k;
        const failedLabels = failed.map((r) => label(r.key)).join(', ');
        if (succeeded.length > 0) {
          const savedLabels = succeeded.map((r) => label(r.key)).join(', ');
          toast.error(
            `Saved: ${savedLabels}. Failed (still unsaved): ${failedLabels}.`,
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="mr-1.5 h-4 w-4" />
          Settings
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Bed economics settings</SheetTitle>
          <SheetDescription>
            Zero-deploy tunables. Each change writes to platform_policies and the
            metrics refetch on save.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {loading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not load policies</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            POLICY_ORDER.map((key) => {
              const row = rows[key];
              const meta = POLICY_META[key];
              if (!meta) return null;
              if (!row) {
                return (
                  <div key={key} className="rounded-md border border-dashed p-3">
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="mt-1 text-xs text-amber-600">
                      Policy row not seeded — apply the bed-economics migration.
                    </p>
                  </div>
                );
              }
              return (
                <div key={key} className="space-y-2 border-b pb-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {meta.consequence}
                      </p>
                    </div>
                    {/* Boolean → switch, inline on the right. */}
                    {row.data_type === 'boolean' && (
                      <Switch
                        checked={Boolean(valueFor(key))}
                        onCheckedChange={(v) => setDraft(key, v)}
                      />
                    )}
                  </div>

                  {/* Enum → select */}
                  {row.data_type === 'enum' && (
                    <Select
                      value={String(valueFor(key) ?? '')}
                      onValueChange={(v) => setDraft(key, v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(row.enum_options ?? []).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Number → numeric input. A blank field is held as an empty
                      string (not coerced to 0) so clearing a value never
                      silently writes 0; Save is disabled while any number
                      field is blank (see `hasBlankNumber`). */}
                  {row.data_type === 'number' && (
                    <Input
                      type="number"
                      value={String(valueFor(key) ?? '')}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          setDraft(key, '');
                          return;
                        }
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) setDraft(key, n);
                      }}
                      className="w-full"
                    />
                  )}

                  {/* Array → chip editor */}
                  {row.data_type === 'array' && (
                    <ArrayEditor
                      values={(valueFor(key) as string[]) ?? []}
                      input={newPurpose}
                      onInput={setNewPurpose}
                      onChange={(arr) => setDraft(key, arr)}
                    />
                  )}
                  {!['boolean', 'enum', 'number', 'array'].includes(row.data_type) && (
                    /* Unrecognized data_type (edited via the central policies
                       UI?) — degrade to a text editor instead of silently
                       rendering nothing (review finding m2, 2026-06-07). */
                    <Input
                      value={String(valueFor(key) ?? '')}
                      onChange={(e) => setDraft(key, e.target.value)}
                      aria-label="Policy value (raw)"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {!loading && !error && (
          <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4">
            <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={revert}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Revert
            </Button>
            <Button size="sm" disabled={!dirty || saving || hasBlankNumber} onClick={save}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ArrayEditor({
  values,
  input,
  onInput,
  onChange,
}: {
  values: string[];
  input: string;
  onInput: (v: string) => void;
  onChange: (arr: string[]) => void;
}) {
  function add() {
    const v = input.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v || values.includes(v)) {
      onInput('');
      return;
    }
    onChange([...values, v]);
    onInput('');
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 pr-1 text-xs">
            <span className="font-mono">{v}</span>
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded-full p-0.5 hover:bg-destructive/20"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {values.length === 0 && (
          <span className="text-[11px] italic text-muted-foreground">None — every room counts.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Add purpose (e.g. student)"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="h-8 text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!input.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
