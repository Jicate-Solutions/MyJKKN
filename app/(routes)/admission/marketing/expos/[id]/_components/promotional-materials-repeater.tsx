'use client';

// BUG-003146: controlled repeater input for stall promotional materials.
// A "row" = { name, quantity, notes? }. Used inside StallFormDialog.

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { PromotionalMaterial } from '@/types/admission';

interface PromotionalMaterialsRepeaterProps {
  value: PromotionalMaterial[];
  onChange: (value: PromotionalMaterial[]) => void;
  disabled?: boolean;
}

export function PromotionalMaterialsRepeater({
  value,
  onChange,
  disabled = false,
}: PromotionalMaterialsRepeaterProps) {
  const addRow = () => {
    onChange([...value, { name: '', quantity: 0, notes: '' }]);
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<PromotionalMaterial>) => {
    onChange(
      value.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Promotional Materials</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Material
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No promotional materials added yet.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 items-start border rounded-md p-2"
            >
              <div className="col-span-5">
                <Input
                  placeholder="Material name (e.g. Brochure)"
                  value={row.name}
                  onChange={(e) => updateRow(idx, { name: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="Qty"
                  value={Number.isFinite(row.quantity) ? row.quantity : 0}
                  onChange={(e) =>
                    updateRow(idx, {
                      quantity: Number(e.target.value) || 0,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div className="col-span-4">
                <Input
                  placeholder="Notes (optional)"
                  value={row.notes ?? ''}
                  onChange={(e) => updateRow(idx, { notes: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  onClick={() => removeRow(idx)}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
