'use client';

// Generic add/edit dialog for a reference catalog row. Fields render from the
// registry's columns_config (text / textarea / number / boolean / select / fk);
// the server side re-validates every field against its own allowlist, so this
// form is a convenience layer, not the security boundary.
//
// select → fixed options stored in the registry config
// fk     → options fetched from fn_reference_catalog_fk_options (target table
//          resolved server-side from the registry, never client-supplied)

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  ReferenceCatalogService,
  type ReferenceCatalogMeta,
  type ReferenceCatalogRow,
  type ReferenceFieldConfig,
  type ReferenceFieldOption,
} from '@/lib/services/reference/reference-catalog-service';

// Radix SelectItem must never have an empty value — sentinel for "cleared".
const NONE = '__none__';

interface ReferenceRowFormDialogProps {
  meta: ReferenceCatalogMeta;
  /** null = create */
  row: ReferenceCatalogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function editableFields(meta: ReferenceCatalogMeta): ReferenceFieldConfig[] {
  return meta.columns_config.filter((f) => f.editable !== false);
}

export function ReferenceRowFormDialog({
  meta,
  row,
  open,
  onOpenChange,
  onSaved,
}: ReferenceRowFormDialogProps) {
  const fields = editableFields(meta);
  const isEdit = row !== null;

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [fkOptions, setFkOptions] = useState<Record<string, ReferenceFieldOption[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, unknown> = {};
    for (const f of fields) {
      initial[f.key] = row?.[f.key] ?? (f.type === 'boolean' ? false : '');
    }
    if (isEdit) initial.is_active = row?.is_active ?? true;
    setValues(initial);

    // fetch dropdown options for every fk field once per open
    const fkFields = fields.filter((f) => f.type === 'fk');
    if (fkFields.length > 0) {
      Promise.all(
        fkFields.map((f) =>
          ReferenceCatalogService.getFkOptions(meta.catalog_key, f.key)
            .then((opts) => [f.key, opts] as const)
            .catch((err: Error) => {
              toast.error(err.message);
              return [f.key, [] as ReferenceFieldOption[]] as const;
            })
        )
      ).then((entries) => setFkOptions(Object.fromEntries(entries)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id, meta.catalog_key]);

  const setValue = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    for (const f of fields) {
      const v = String(values[f.key] ?? '');
      if (f.required && (v.trim() === '' || v === NONE)) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    try {
      // send only meaningful values so column defaults apply on create
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        const v = values[f.key];
        if (f.type === 'boolean') {
          payload[f.key] = Boolean(v);
        } else if (f.type === 'number') {
          if (String(v ?? '').trim() !== '') payload[f.key] = Number(v);
        } else if (f.type === 'select' || f.type === 'fk') {
          if (v === NONE || v === '') {
            if (isEdit) payload[f.key] = null;
          } else if (v !== undefined) {
            payload[f.key] = v;
          }
        } else if (String(v ?? '').trim() !== '' || isEdit) {
          payload[f.key] = v;
        }
      }
      if (isEdit) payload.is_active = Boolean(values.is_active);

      await ReferenceCatalogService.upsertRow(meta.catalog_key, row?.id ?? null, payload);
      toast.success(isEdit ? `Updated ${meta.display_name}` : `Added to ${meta.display_name}`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const renderChoice = (f: ReferenceFieldConfig, options: ReferenceFieldOption[]) => {
    const raw = String(values[f.key] ?? '');
    return (
      <Select
        value={raw === '' ? undefined : raw}
        onValueChange={(v) => setValue(f.key, v)}
      >
        <SelectTrigger id={`ref-field-${f.key}`}>
          <SelectValue placeholder="— Select —" />
        </SelectTrigger>
        <SelectContent>
          {!f.required && <SelectItem value={NONE}>— None —</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${meta.display_name}` : `New ${meta.display_name}`}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this entry. Entries cannot be deleted — deactivate instead.'
              : `Add a new entry to ${meta.display_name}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              {f.type === 'boolean' ? (
                <div className="flex items-center justify-between">
                  <Label htmlFor={`ref-field-${f.key}`}>{f.label}</Label>
                  <Switch
                    id={`ref-field-${f.key}`}
                    checked={Boolean(values[f.key])}
                    onCheckedChange={(checked) => setValue(f.key, checked)}
                  />
                </div>
              ) : (
                <>
                  <Label htmlFor={`ref-field-${f.key}`}>
                    {f.label}
                    {f.required && <span className="ml-0.5 text-destructive">*</span>}
                  </Label>
                  {f.type === 'select' ? (
                    renderChoice(f, f.options ?? [])
                  ) : f.type === 'fk' ? (
                    renderChoice(f, fkOptions[f.key] ?? [])
                  ) : f.type === 'textarea' ? (
                    <Textarea
                      id={`ref-field-${f.key}`}
                      value={String(values[f.key] ?? '')}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      rows={3}
                    />
                  ) : (
                    <Input
                      id={`ref-field-${f.key}`}
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={String(values[f.key] ?? '')}
                      onChange={(e) => setValue(f.key, e.target.value)}
                    />
                  )}
                </>
              )}
            </div>
          ))}

          {isEdit && (
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <Label htmlFor="ref-field-is-active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive entries stay in the database but disappear from forms.
                </p>
              </div>
              <Switch
                id="ref-field-is-active"
                checked={Boolean(values.is_active)}
                onCheckedChange={(checked) => setValue('is_active', checked)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
