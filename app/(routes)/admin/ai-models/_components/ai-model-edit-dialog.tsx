'use client';

// ============================================================================
// AI Model Edit Dialog — change provider+model+spend cap for one feature.
// Captures change_reason → audit log.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

interface FeatureRow {
  feature_key: string;
  display_name: string;
  description: string | null;
  provider: string;
  model_id: string;
  fallback_provider: string | null;
  fallback_model_id: string | null;
  monthly_spend_cap_inr: number | null;
}

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
  return {
    provider: f?.provider ?? 'openai',
    model_id: f?.model_id ?? '',
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

  useEffect(() => {
    if (open && feature) setForm(buildFormState(feature));
  }, [open, feature]);

  const providerModels = useMemo<ModelOption[]>(() => {
    return getProviderRegistry(form.provider)?.models ?? [];
  }, [form.provider]);

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

      toast.success(`${feature.display_name} updated.`);
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
          <DialogTitle>{feature ? `Edit: ${feature.display_name}` : 'Edit AI model'}</DialogTitle>
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
                {PROVIDER_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          </div>

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
          <div className="grid grid-cols-2 gap-3">
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
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
