'use client';

// ============================================================================
// AI Model Edit Dialog — change provider+model+spend cap for one feature.
// Captures change_reason → audit log.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AI_PROVIDER_REGISTRY,
  PROVIDER_OPTIONS,
  getProviderRegistry,
  type ModelOption,
} from '@/lib/services/platform/ai-providers';
import { isSafetyJudge, isBelowSonnet } from '@/lib/constants/ai-safety-judge';

interface FeatureRow {
  feature_key: string;
  display_name: string;
  description: string | null;
  provider: string;
  model_id: string;
  fallback_provider: string | null;
  fallback_model_id: string | null;
  monthly_spend_cap_inr: number | null;
  // Registry-sourced governance threaded through from the GET list route.
  // lane === 'max' → the subscription (Max) worker runs this, and that worker
  // is the Claude CLI only (D3). month_to_date_invocations drives the Opus
  // high-volume warning (D4).
  lane?: string | null;
  month_to_date_invocations?: number;
  // UNIFICATION follow-up (2026-07-23): false → this registry job has no model
  // yet (provider/model_id are ''); the dialog runs in "set for the first time"
  // mode (empty picker, POSTs to the upserting PATCH which creates the row).
  model_set?: boolean;
}

// Anthropic's provider id in the AI provider registry (ai-providers.ts) — the
// only provider the subscription (Max) worker can run. Verified against
// AI_PROVIDER_REGISTRY, not guessed.
const MAX_LANE_PROVIDER = 'anthropic';

/**
 * True for the Max subscription lane AND any dedicated Max sub-lane ('max-pdf', …).
 *
 * Sub-lanes exist purely to isolate a runner's claim pool — fn_ai_claim filters
 * on `lane` with no job_type predicate, so two runners sharing a (lane,
 * interactive) pair race for each other's jobs. A sub-lane is still the ₹0
 * Claude CLI worker, so the D3 Anthropic-only lock MUST apply to it as well;
 * matching only the literal 'max' would silently let a sub-lane be pointed at a
 * PAID provider.
 */
const isMaxLaneValue = (lane?: string | null): boolean =>
  lane === 'max' || (typeof lane === 'string' && lane.startsWith('max-'));

interface AiModelEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: FeatureRow | null;
  onSaved: () => void;
}

interface FormState {
  provider: string;
  model_id: string;
  fallback_provider: string;
  fallback_model_id: string;
  monthly_spend_cap_inr: string;
  change_reason: string;
}

function buildFormState(f: FeatureRow | null): FormState {
  // Empty string = a model-less registry job governed for the first time
  // (UNIFICATION follow-up) — treat as unset so the picker forces a fresh pick.
  let provider = f?.provider || 'openai';
  let model_id = f?.model_id ?? '';
  // D3: a Max-lane feature can only run on the subscription Claude worker, so
  // the provider is locked to Anthropic. If a max-lane row is somehow stored on
  // another provider, coerce to Anthropic and clear the model so the picker
  // forces a Claude re-pick.
  if (isMaxLaneValue(f?.lane) && provider !== MAX_LANE_PROVIDER) {
    provider = MAX_LANE_PROVIDER;
    model_id = '';
  }
  // Safety-judge FLOOR: if a safety-critical judge row is somehow stored on a
  // below-Sonnet model (legacy bad data), clear it so the picker forces a valid
  // Sonnet/Opus re-pick instead of silently keeping the sub-floor model.
  if (isSafetyJudge(f?.feature_key) && isBelowSonnet(provider, model_id)) {
    model_id = '';
  }
  return {
    provider,
    model_id,
    fallback_provider: f?.fallback_provider ?? '',
    fallback_model_id: f?.fallback_model_id ?? '',
    monthly_spend_cap_inr: f?.monthly_spend_cap_inr?.toString() ?? '',
    change_reason: '',
  };
}

export function AiModelEditDialog({
  open,
  onOpenChange,
  feature,
  onSaved,
}: AiModelEditDialogProps) {
  const [form, setForm] = useState<FormState>(buildFormState(null));
  const [saving, setSaving] = useState(false);
  // D4: the Director must tick a box before saving an Opus model on a
  // high-volume job. Reset on each open so the ack is fresh per dialog session.
  const [opusConfirmed, setOpusConfirmed] = useState(false);

  useEffect(() => {
    if (open && feature) {
      setForm(buildFormState(feature));
      setOpusConfirmed(false);
    }
  }, [open, feature]);

  // Any change to the chosen model clears a stale Opus acknowledgement.
  useEffect(() => {
    setOpusConfirmed(false);
  }, [form.model_id]);

  // D3: when the feature runs on the free (Max) lane, the provider is locked to
  // Anthropic (the subscription worker is the Claude CLI only).
  const isMaxLane = isMaxLaneValue(feature?.lane);
  const providerOptions = useMemo(
    () => (isMaxLane ? PROVIDER_OPTIONS.filter((p) => p.value === MAX_LANE_PROVIDER) : PROVIDER_OPTIONS),
    [isMaxLane],
  );

  // D4: warn (do not block) when an Opus model is chosen for a job that already
  // ran a lot this month.
  const monthlyInvocations = feature?.month_to_date_invocations ?? 0;
  const isOpusHighVolume =
    form.model_id.toLowerCase().includes('opus') && monthlyInvocations >= 100;

  // Safety-judge FLOOR: this feature must never run below Sonnet. Hide
  // below-Sonnet models from the picker (offer only Sonnet/Opus). Same
  // isBelowSonnet predicate the PATCH route enforces server-side.
  const isSafetyJudgeFeature = isSafetyJudge(feature?.feature_key);

  const providerModels = useMemo<ModelOption[]>(() => {
    let models = getProviderRegistry(form.provider)?.models ?? [];
    // Claude picks are restricted to the always-latest family aliases
    // (Sonnet/Opus/Fable). Haiku and pinned dated versions are not selectable —
    // every Anthropic job rides "latest" so it auto-follows new releases. The
    // concrete ids stay in the registry only for historical label/pricing lookup.
    // Non-Anthropic providers (the voice tasks) keep their full model list.
    //
    // Fable added 2026-08-06 when all eight bug.* jobs moved onto it. It was
    // already running in production via a direct database write before this
    // list knew about it — which is precisely the state this filter exists to
    // prevent, because a row holding an unlisted model renders with no matching
    // option and is silently rewritten to Sonnet the next time anyone saves it.
    if (form.provider === 'anthropic') {
      models = models.filter(
        (m) => m.id === 'sonnet' || m.id === 'opus' || m.id === 'fable',
      );
    }
    if (!isSafetyJudgeFeature) return models;
    return models.filter((m) => !isBelowSonnet(form.provider, m.id));
  }, [form.provider, isSafetyJudgeFeature]);

  const fallbackProviderModels = useMemo<ModelOption[]>(() => {
    if (!form.fallback_provider) return [];
    return getProviderRegistry(form.fallback_provider)?.models ?? [];
  }, [form.fallback_provider]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!feature) return;

    if (!form.model_id) {
      toast.error('Pick a model for the selected provider.');
      return;
    }
    if (!form.change_reason || form.change_reason.trim().length < 3) {
      toast.error('Tell us briefly WHY you are changing this — at least 3 characters.');
      return;
    }

    const cap = form.monthly_spend_cap_inr.trim() === '' ? null : Number(form.monthly_spend_cap_inr);
    if (cap !== null && (!Number.isFinite(cap) || cap < 0)) {
      toast.error('Spend cap must be a non-negative number, or leave blank for no cap.');
      return;
    }

    const fallback_provider = form.fallback_provider.trim() || null;
    const fallback_model_id = form.fallback_model_id.trim() || null;
    if (fallback_provider && !fallback_model_id) {
      toast.error('Pick a fallback model or clear the fallback provider.');
      return;
    }

    // D4: warn+confirm only — the checkbox already gates the Save button; this
    // is defense in depth in case Save is triggered another way.
    if (isOpusHighVolume && !opusConfirmed) {
      toast.error('Please confirm you want Opus for this high-volume job.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/ai-models/${encodeURIComponent(feature.feature_key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          model_id: form.model_id,
          fallback_provider,
          fallback_model_id,
          monthly_spend_cap_inr: cap,
          change_reason: form.change_reason.trim(),
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }

      toast.success(
        `${feature.display_name} ${feature.model_set === false ? 'model set' : 'updated'}.`,
      );
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {feature
              ? feature.model_set === false
                ? `Set a model: ${feature.display_name}`
                : `Edit: ${feature.display_name}`
              : 'Edit AI model'}
          </DialogTitle>
          <DialogDescription>
            Pick which provider and model run this feature. The change takes effect within
            60 seconds (or sooner — the cache invalidates immediately on save).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Provider */}
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={form.provider} onValueChange={(v) => { update('provider', v); update('model_id', ''); }}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="Pick provider" />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isMaxLane && (
              <p className="text-xs text-muted-foreground">
                Free (Max) worker runs Claude only.
              </p>
            )}
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model_id">Model</Label>
            <Select value={form.model_id} onValueChange={(v) => update('model_id', v)}>
              <SelectTrigger id="model_id">
                <SelectValue placeholder="Pick a model" />
              </SelectTrigger>
              <SelectContent>
                {providerModels.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.model_id && (
              <p className="text-xs text-muted-foreground">
                {providerModels.find((m) => m.id === form.model_id)?.notes ?? 'Reference pricing in the registry — actual cost is recorded per call.'}
              </p>
            )}
            {isSafetyJudgeFeature && (
              <p className="text-xs text-muted-foreground">
                Safety-critical judge — cannot run below Sonnet.
              </p>
            )}
          </div>

          {/* D4: Opus-on-a-busy-job warning. Warn + require an explicit tick,
              but never block the save. */}
          {isOpusHighVolume && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This job ran {monthlyInvocations.toLocaleString('en-IN')} times this month.
                  Opus is expensive and can slow the shared free worker — are you sure?
                </span>
              </div>
              <label className="flex items-center gap-2 pl-6 text-xs text-amber-800 dark:text-amber-200">
                <Checkbox
                  checked={opusConfirmed}
                  onCheckedChange={(v) => setOpusConfirmed(v === true)}
                  aria-label="Confirm using Opus for this high-volume job"
                />
                Yes, use Opus for this high-volume job.
              </label>
            </div>
          )}

          {/* Spend cap */}
          <div className="space-y-2">
            <Label htmlFor="monthly_spend_cap_inr">Monthly spend cap (INR)</Label>
            <Input
              id="monthly_spend_cap_inr"
              type="number"
              min="0"
              step="100"
              placeholder="Leave blank for no cap"
              value={form.monthly_spend_cap_inr}
              onChange={(e) => update('monthly_spend_cap_inr', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Soft cap — surfaced in the table when exceeded. Hard enforcement happens in the consumer service.
            </p>
          </div>

          {/* Fallback provider/model — optional */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fallback_provider">Fallback provider (optional)</Label>
              <Select
                value={form.fallback_provider || '__none__'}
                onValueChange={(v) => {
                  const next = v === '__none__' ? '' : v;
                  update('fallback_provider', next);
                  update('fallback_model_id', '');
                }}
              >
                <SelectTrigger id="fallback_provider">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {PROVIDER_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback_model_id">Fallback model</Label>
              <Select
                value={form.fallback_model_id || '__none__'}
                onValueChange={(v) => update('fallback_model_id', v === '__none__' ? '' : v)}
                disabled={!form.fallback_provider}
              >
                <SelectTrigger id="fallback_model_id">
                  <SelectValue placeholder={form.fallback_provider ? 'Pick fallback' : '—'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {fallbackProviderModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Change reason — required for audit log */}
          <div className="space-y-2">
            <Label htmlFor="change_reason">Why are you changing this? *</Label>
            <Textarea
              id="change_reason"
              placeholder="e.g. Switching to Gemini Flash to cut briefing cost from ₹3500 to ₹500/mo."
              rows={3}
              value={form.change_reason}
              onChange={(e) => update('change_reason', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Captured in the audit log. Helps future-you remember why this swap was made.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || (isOpusHighVolume && !opusConfirmed)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
