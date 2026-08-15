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
import type { PoItemColumnDef, PoFieldAlign, PoFieldFormat } from '@/types/procurement';
import { generateFieldKey } from './slug';

interface ItemColumnsEditorProps {
  columns: PoItemColumnDef[];
  onChange: (columns: PoItemColumnDef[]) => void;
}

const KNOWN_ITEM_SOURCES: { value: string; label: string }[] = [
  { value: 'row_index', label: 'S.No (row number)' },
  { value: 'item.item_name', label: 'Item Name' },
  { value: 'item.item_spec', label: 'Specification' },
  { value: 'item.ordered_quantity', label: 'Quantity' },
  { value: 'item.unit_label', label: 'Unit' },
  { value: 'item.unit_price', label: 'Rate / Unit Price' },
  { value: 'item.line_total', label: 'Amount' },
  { value: 'item.received_quantity', label: 'Received Qty' },
];
const CUSTOM_SOURCE = '__custom__';

function isCustomSource(source: string) {
  return source.startsWith('item_extra.');
}

export function ItemColumnsEditor({ columns, onChange }: ItemColumnsEditorProps) {
  const addColumn = () => {
    onChange([
      ...columns,
      { key: '', label: '', source: 'item_extra.', align: 'left' as PoFieldAlign },
    ]);
  };

  const updateColumn = (index: number, updates: Partial<PoItemColumnDef>) => {
    const updated = [...columns];
    const current = { ...updated[index], ...updates };
    if (updates.label !== undefined && isCustomSource(current.source)) {
      current.key = generateFieldKey(updates.label);
      current.source = `item_extra.${current.key}`;
    }
    updated[index] = current;
    onChange(updated);
  };

  const removeColumn = (index: number) => onChange(columns.filter((_, i) => i !== index));

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === columns.length - 1)) return;
    const updated = [...columns];
    const swap = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[swap]] = [updated[swap], updated[index]];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Item Table Columns</Label>
          <p className="text-xs text-muted-foreground">
            The line-item table on the PO document. Order here is the print order.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addColumn} className="gap-1">
          <Plus className="h-4 w-4" />
          Add Column
        </Button>
      </div>

      {columns.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No columns added yet. Add the columns this vendor&apos;s PO needs (e.g. HSN/SAC, GST%, MRP, ISBN).
        </p>
      )}

      {columns.map((col, index) => {
        const custom = isCustomSource(col.source);
        return (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1 pt-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Move column up" onClick={() => moveColumn(index, 'up')} disabled={index === 0}>
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Move column down" onClick={() => moveColumn(index, 'down')} disabled={index === columns.length - 1}>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-3 space-y-1">
                    <Label className="text-xs">Column Label</Label>
                    <Input
                      placeholder="e.g. HSN/SAC"
                      value={col.label}
                      onChange={(e) => updateColumn(index, { label: e.target.value })}
                    />
                  </div>

                  <div className="lg:col-span-4 space-y-1 min-w-0">
                    <Label className="text-xs">Source</Label>
                    <Select
                      value={custom ? CUSTOM_SOURCE : col.source}
                      onValueChange={(v) => {
                        if (v === CUSTOM_SOURCE) {
                          const key = col.key || generateFieldKey(col.label) || 'field';
                          updateColumn(index, { source: `item_extra.${key}`, key });
                        } else {
                          updateColumn(index, { source: v, key: v });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KNOWN_ITEM_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_SOURCE}>
                          Custom field (HSN, GST%, MRP, ISBN, ...)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {custom && (
                      <p className="text-[11px] text-muted-foreground truncate">key: {col.source}</p>
                    )}
                  </div>

                  <div className="lg:col-span-2 space-y-1">
                    <Label className="text-xs">Align</Label>
                    <Select
                      value={col.align || 'left'}
                      onValueChange={(v) => updateColumn(index, { align: v as PoFieldAlign })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="lg:col-span-2 space-y-1">
                    <Label className="text-xs">Format</Label>
                    <Select
                      value={col.format || 'none'}
                      onValueChange={(v) =>
                        updateColumn(index, { format: v === 'none' ? undefined : (v as PoFieldFormat) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Plain text</SelectItem>
                        <SelectItem value="currency">Currency</SelectItem>
                        <SelectItem value="percent">Percent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="lg:col-span-1 flex items-end justify-end">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" aria-label="Remove column" onClick={() => removeColumn(index)}>
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
