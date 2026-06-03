'use client';

// ============================================
// PolicyField — reusable policy row editor
// ============================================
// Renders a single policy key as a labeled input with:
// - Current value display
// - Draft editing
// - Dirty detection (triggers cascade preview)
// - Save/reset controls
// ============================================

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Save, RotateCcw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InternshipPolicyService } from '@/lib/services/admin/internship-policy-service';
import { CascadePreview } from '@/components/shared/cascade-preview/CascadePreview';
import type { CascadePreviewData, ProposedChange } from '@/components/shared/cascade-preview/types';

export type FieldType = 'number' | 'boolean' | 'text';

export interface PolicyFieldConfig {
  key: string;
  label: string;
  description: string;
  type: FieldType;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

interface PolicyFieldProps {
  config: PolicyFieldConfig;
  currentValue: unknown;
  updatedAt?: string;
  onSaved?: () => void;
}

export function PolicyField({ config, currentValue, updatedAt, onSaved }: PolicyFieldProps) {
  const [draft, setDraft] = useState<string>(
    config.type === 'boolean' ? String(Boolean(currentValue)) : String(currentValue ?? '')
  );
  const [boolDraft, setBoolDraft] = useState<boolean>(Boolean(currentValue));
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<CascadePreviewData | null>(null);

  const isDirty =
    config.type === 'boolean'
      ? boolDraft !== Boolean(currentValue)
      : draft.trim() !== String(currentValue ?? '');

  const getProposedChange = (): ProposedChange => ({
    key: config.key,
    label: config.label,
    currentValue,
    proposedValue: config.type === 'boolean' ? boolDraft : (config.type === 'number' ? parseFloat(draft) : draft.trim()),
    unit: config.unit,
  });

  const handlePreview = async () => {
    const change = getProposedChange();
    // Show panel immediately with loading state
    setPreviewData({ consequences: [], computedAt: new Date().toISOString(), isLoading: true });
    setPreviewOpen(true);
    // Fetch consequences
    const result = await InternshipPolicyService.computeCascadePreview([change]);
    setPreviewData(result);
  };

  const handleSave = async () => {
    const change = getProposedChange();
    setSaving(true);
    setPreviewOpen(false);

    const res = await InternshipPolicyService.upsert(config.key, change.proposedValue);
    setSaving(false);

    if (!res.ok) {
      toast.error(res.error || 'Save failed');
      return;
    }
    toast.success(`${config.label} updated`);
    onSaved?.();
  };

  const handleReset = () => {
    setDraft(String(currentValue ?? ''));
    setBoolDraft(Boolean(currentValue));
    setPreviewOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
              <CardDescription className="text-xs mt-0.5 font-mono text-muted-foreground/70">
                {config.key}
              </CardDescription>
            </div>
            {isDirty && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 flex-shrink-0">
                Unsaved
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
        </CardHeader>

        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            {config.type === 'boolean' ? (
              <div className="flex items-center gap-3">
                <Switch
                  id={`policy-${config.key}`}
                  checked={boolDraft}
                  onCheckedChange={(val) => setBoolDraft(val)}
                  disabled={saving}
                />
                <Label htmlFor={`policy-${config.key}`} className="text-sm">
                  {boolDraft ? 'Enabled' : 'Disabled'}
                </Label>
              </div>
            ) : (
              <div className="flex-1 min-w-[180px] max-w-[280px]">
                <Label
                  htmlFor={`policy-${config.key}`}
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Value{config.unit ? ` (${config.unit})` : ''}
                </Label>
                <Input
                  id={`policy-${config.key}`}
                  type={config.type === 'number' ? 'number' : 'text'}
                  min={config.min}
                  max={config.max}
                  step={config.step ?? 1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={saving}
                  className="mt-1"
                />
              </div>
            )}

            <div className="flex gap-2">
              {isDirty && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={saving}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                onClick={handlePreview}
                disabled={saving || !isDirty}
                className="gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>

          {updatedAt && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last updated {new Date(updatedAt).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Cascade preview panel */}
      <CascadePreview
        open={previewOpen}
        proposedChanges={[getProposedChange()]}
        previewData={previewData}
        scope="platform"
        onConfirm={handleSave}
        onCancel={() => setPreviewOpen(false)}
        isSaving={saving}
      />
    </>
  );
}
