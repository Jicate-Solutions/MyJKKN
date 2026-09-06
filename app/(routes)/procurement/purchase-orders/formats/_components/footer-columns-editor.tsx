'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import type { PoFooterColumnDef } from '@/types/procurement';
import { generateFieldKey } from './slug';

interface FooterColumnsEditorProps {
  columns: PoFooterColumnDef[];
  onChange: (columns: PoFooterColumnDef[]) => void;
}

/** The sample PO footer is always 3 side-by-side groups; keep that fixed shape. */
export const DEFAULT_FOOTER_COLUMNS: PoFooterColumnDef[] = [
  {
    key: 'terms',
    title: 'TERMS & CONDITION',
    fields: [
      { key: 'delivery', label: 'Delivery', source: 'footer_values.delivery' },
      { key: 'warranty', label: 'Warranty', source: 'footer_values.warranty' },
      { key: 'payment', label: 'Payment', source: 'footer_values.payment' },
      { key: 'others', label: 'Others', source: 'footer_values.others' },
    ],
  },
  {
    key: 'enclosure',
    title: 'ENCLOSURE',
    fields: [
      { key: 'cheque_no', label: 'Cheque No/NEFT', source: 'footer_values.cheque_no' },
      { key: 'dated', label: 'Dated', source: 'footer_values.dated' },
      { key: 'bank', label: 'Bank', source: 'footer_values.bank' },
      { key: 'amount', label: 'Amount', source: 'footer_values.amount' },
    ],
  },
  {
    key: 'special_note',
    title: 'SPECIAL NOTE',
    freeText: true,
    source: 'footer_values.special_note',
  },
];

export function FooterColumnsEditor({ columns, onChange }: FooterColumnsEditorProps) {
  const groups = columns.length === 3 ? columns : DEFAULT_FOOTER_COLUMNS;

  const updateGroup = (index: number, updates: Partial<PoFooterColumnDef>) => {
    const updated = [...groups];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const addFieldToGroup = (groupIndex: number) => {
    const group = groups[groupIndex];
    const fields = [...(group.fields || []), { key: '', label: '', source: 'footer_values.' }];
    updateGroup(groupIndex, { fields });
  };

  const updateGroupField = (groupIndex: number, fieldIndex: number, label: string) => {
    const group = groups[groupIndex];
    const key = generateFieldKey(label);
    const fields = [...(group.fields || [])];
    fields[fieldIndex] = { key, label, source: `footer_values.${key}` };
    updateGroup(groupIndex, { fields });
  };

  const removeGroupField = (groupIndex: number, fieldIndex: number) => {
    const group = groups[groupIndex];
    updateGroup(groupIndex, { fields: (group.fields || []).filter((_, i) => i !== fieldIndex) });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-base font-semibold">Footer (3 columns)</Label>
        <p className="text-xs text-muted-foreground">
          Matches the standard PO footer layout: Terms &amp; Condition, Enclosure, Special Note.
          Rename titles or fields per vendor; toggle a group to free text if it should just be a
          paragraph (e.g. Special Note).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {groups.map((group, gi) => (
          <Card key={group.key}>
            <CardHeader className="p-3 pb-0 space-y-2">
              <Input
                value={group.title}
                onChange={(e) => updateGroup(gi, { title: e.target.value })}
                className="font-semibold text-sm"
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!group.freeText}
                  onCheckedChange={(checked) =>
                    updateGroup(gi, {
                      freeText: checked,
                      source: checked ? `footer_values.${group.key}` : undefined,
                    })
                  }
                />
                <Label className="text-xs text-muted-foreground">Free text block</Label>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-2 space-y-2">
              {group.freeText ? (
                <p className="text-xs text-muted-foreground">
                  Rendered as a single free-text paragraph, filled in per PO.
                </p>
              ) : (
                <>
                  {(group.fields || []).map((field, fi) => (
                    <div key={fi} className="flex items-center gap-1.5">
                      <Input
                        placeholder="e.g. Delivery"
                        value={field.label}
                        onChange={(e) => updateGroupField(gi, fi, e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Remove field"
                        onClick={() => removeGroupField(gi, fi)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addFieldToGroup(gi)}
                    className="w-full h-8 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add Field
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
