'use client';

// ============================================================================
// SettingsPanel — Shape B primitive (unordered key-value config).
// Created: 2026-05-07.
//
// For pages that configure a small set of independent settings (e.g.
// counselor routing-config, alert-thresholds, whatsapp-limits). Each setting
// is rendered as a card with:
//   - Plain English label
//   - Plain English explanation of WHAT it does
//   - The input control (number, text, toggle, enum)
//   - Plain English consequence text describing what changes when value changes
//
// Settings are saved together via a single Save button. Pages can group
// related settings with the optional `field.group` to organize the panel.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { SettingsConfig, SettingsField } from './types';

interface SettingsPanelProps {
  config: SettingsConfig;
  /**
   * Current values keyed by field.dbKey. Pages load from their service before
   * mounting and pass via this prop. When values change (e.g., refetch), the
   * panel resyncs.
   */
  values: Record<string, unknown> | null;
  /** Handler invoked when Save is clicked. Receives the FULL current values. */
  onSave: (values: Record<string, unknown>) => Promise<void>;
  /** Optional handler when Reset is clicked. If omitted, Reset reverts to
   *  loaded values without round-tripping the server. */
  onReset?: () => Promise<void>;
}

export function SettingsPanel({
  config,
  values,
  onSave,
  onReset,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(values ?? {});
  const [saving, setSaving] = useState(false);

  // Resync local draft whenever upstream values change.
  useEffect(() => {
    if (values) setDraft(values);
  }, [values]);

  const dirty = useMemo(() => {
    if (!values) return false;
    for (const k of Object.keys(draft)) {
      if (draft[k] !== values[k]) return true;
    }
    return false;
  }, [draft, values]);

  // Group fields if any have a group attribute.
  const grouped = useMemo(() => {
    const g = new Map<string | undefined, SettingsField[]>();
    for (const f of config.fields) {
      const key = f.group;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(f);
    }
    return Array.from(g.entries());
  }, [config.fields]);

  const update = (dbKey: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [dbKey]: value }));
  };

  const handleReset = async () => {
    if (onReset) {
      await onReset();
    } else if (values) {
      setDraft(values);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      toast.success('Settings saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (values === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([groupName, fields], gIdx) => (
        <div key={String(groupName ?? `group-${gIdx}`)} className="space-y-3">
          {groupName && (
            <h3 className="text-sm font-semibold text-muted-foreground">
              {groupName}
            </h3>
          )}
          {fields.map((field) => (
            <SettingCard
              key={field.dbKey}
              field={field}
              value={draft[field.dbKey]}
              onChange={(v) => update(field.dbKey, v)}
            />
          ))}
        </div>
      ))}

      <div className="sticky bottom-4 flex items-center justify-end gap-2 border-t border-border bg-background py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={!dirty || saving}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {config.saveLabel ?? 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SettingCard — one configurable setting (label + explanation + input + consequence).
// ----------------------------------------------------------------------------
interface SettingCardProps {
  field: SettingsField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function SettingCard({ field, value, onChange }: SettingCardProps) {
  const id = `setting-${field.dbKey}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Label htmlFor={id} className="text-base font-semibold">
            {field.label}
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            {field.explanation}
          </p>
          <p className="mt-2 text-xs italic text-muted-foreground">
            {field.consequenceText}
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-56">
          <SettingInput
            id={id}
            field={field}
            value={value}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  );
}

interface SettingInputProps {
  id: string;
  field: SettingsField;
  value: unknown;
  onChange: (v: unknown) => void;
}

function SettingInput({ id, field, value, onChange }: SettingInputProps) {
  switch (field.input.type) {
    case 'number':
      return (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            min={field.input.min}
            max={field.input.max}
            step={field.input.step ?? 1}
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          {field.input.unit && (
            <span className="text-xs text-muted-foreground">{field.input.unit}</span>
          )}
        </div>
      );

    case 'text':
      return (
        <Input
          id={id}
          type="text"
          value={String(value ?? '')}
          placeholder={field.input.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'toggle':
      return (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            {value ? 'On' : 'Off'}
          </span>
          <Switch
            id={id}
            checked={Boolean(value)}
            onCheckedChange={onChange}
          />
        </div>
      );

    case 'enum':
      return (
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.input.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    default:
      return null;
  }
}
