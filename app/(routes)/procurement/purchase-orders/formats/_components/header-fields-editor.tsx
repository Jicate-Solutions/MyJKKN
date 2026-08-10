'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { PoHeaderFieldDef, PoFieldFormat } from '@/types/procurement';
import { generateFieldKey } from './slug';

interface HeaderFieldsEditorProps {
  fields: PoHeaderFieldDef[];
  onChange: (fields: PoHeaderFieldDef[]) => void;
}

const KNOWN_HEADER_SOURCES: { value: string; label: string; format?: PoFieldFormat }[] = [
  { value: 'po.po_number', label: 'PO Number / Ref No' },
  { value: 'po.created_at', label: 'PO Date', format: 'date' },
  { value: 'po.expected_delivery_date', label: 'Expected Delivery Date', format: 'date' },
  { value: 'po.payment_terms', label: 'Payment Terms' },
  { value: 'supplier.name', label: 'Vendor Name' },
  { value: 'supplier.code', label: 'Vendor Code' },
  { value: 'supplier.gstin', label: 'Vendor GSTIN' },
  { value: 'supplier.email', label: 'Vendor Email' },
];
const CUSTOM_SOURCE = '__custom__';

function isCustomSource(source: string) {
  return source.startsWith('header_values.');
}

export function HeaderFieldsEditor({ fields, onChange }: HeaderFieldsEditorProps) {
  const addField = () => {
    onChange([...fields, { key: '', label: '', source: 'header_values.' }]);
  };

  const updateField = (index: number, updates: Partial<PoHeaderFieldDef>) => {
    const updated = [...fields];
    const current = { ...updated[index], ...updates };
    if (updates.label !== undefined && isCustomSource(current.source)) {
      current.key = generateFieldKey(updates.label);
      current.source = `header_values.${current.key}`;
    }
    updated[index] = current;
    onChange(updated);
  };

  const removeField = (index: number) => onChange(fields.filter((_, i) => i !== index));

  const moveField = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === fields.length - 1)) return;
    const updated = [...fields];
    const swap = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[swap]] = [updated[swap], updated[index]];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Header Fields</Label>
          <p className="text-xs text-muted-foreground">
            Ref No, Date, vendor block, and any vendor-specific reference fields (e.g. Proforma
            Invoice Quotation No., Quotation Date).
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addField} className="gap-1">
          <Plus className="h-4 w-4" />
          Add Field
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No header fields added yet.</p>
      )}

      {fields.map((field, index) => {
        const custom = isCustomSource(field.source);
        return (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1 pt-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Move field up" onClick={() => moveField(index, 'up')} disabled={index === 0}>
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Move field down" onClick={() => moveField(index, 'down')} disabled={index === fields.length - 1}>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-4 space-y-1 min-w-0">
                    <Label className="text-xs">Field Label</Label>
                    <Input
                      placeholder="e.g. Proforma Invoice Quotation No."
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                    />
                  </div>

                  <div className="lg:col-span-6 space-y-1 min-w-0">
                    <Label className="text-xs">Source</Label>
                    <Select
                      value={custom ? CUSTOM_SOURCE : field.source}
                      onValueChange={(v) => {
                        if (v === CUSTOM_SOURCE) {
                          const key = field.key || generateFieldKey(field.label) || 'field';
                          updateField(index, { source: `header_values.${key}`, key, format: undefined });
                        } else {
                          const known = KNOWN_HEADER_SOURCES.find((s) => s.value === v);
                          updateField(index, { source: v, key: v, format: known?.format });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KNOWN_HEADER_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_SOURCE}>
                          Custom field (filled in per PO)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {custom && (
                      <p className="text-[11px] text-muted-foreground truncate">key: {field.source}</p>
                    )}
                  </div>

                  <div className="lg:col-span-2 flex items-end justify-end">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" aria-label="Remove field" onClick={() => removeField(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
