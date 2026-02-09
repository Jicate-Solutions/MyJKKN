'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import type { ServiceFieldType, CreateServiceTypeFieldDto } from '@/types/service-request';

interface FieldBuilderProps {
  fields: CreateServiceTypeFieldDto[];
  onChange: (fields: CreateServiceTypeFieldDto[]) => void;
}

const FIELD_TYPES: { value: ServiceFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'boolean', label: 'Checkbox' },
  { value: 'file', label: 'File Upload' },
];

function generateFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, '_$1');
}

export function FieldBuilder({ fields, onChange }: FieldBuilderProps) {
  const addField = () => {
    const newField: CreateServiceTypeFieldDto = {
      field_key: '',
      field_label: '',
      field_type: 'text',
      is_required: false,
      display_order: fields.length,
    };
    onChange([...fields, newField]);
  };

  const updateField = (index: number, updates: Partial<CreateServiceTypeFieldDto>) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], ...updates };

    // Auto-generate field_key from label
    if (updates.field_label !== undefined) {
      updated[index].field_key = generateFieldKey(updates.field_label);
    }

    onChange(updated);
  };

  const removeField = (index: number) => {
    const updated = fields.filter((_, i) => i !== index);
    // Re-order
    updated.forEach((f, i) => (f.display_order = i));
    onChange(updated);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === fields.length - 1)
    ) {
      return;
    }
    const updated = [...fields];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    updated.forEach((f, i) => (f.display_order = i));
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Form Fields</Label>
        <Button type="button" variant="outline" size="sm" onClick={addField} className="gap-1">
          <Plus className="h-4 w-4" />
          Add Field
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No fields added yet. Click &quot;Add Field&quot; to start building the form.
        </p>
      )}

      {fields.map((field, index) => (
        <FieldRow
          key={index}
          field={field}
          index={index}
          totalFields={fields.length}
          onUpdate={(updates) => updateField(index, updates)}
          onRemove={() => removeField(index)}
          onMove={(dir) => moveField(index, dir)}
        />
      ))}
    </div>
  );
}

function FieldRow({
  field,
  index,
  totalFields,
  onUpdate,
  onRemove,
  onMove,
}: {
  field: CreateServiceTypeFieldDto;
  index: number;
  totalFields: number;
  onUpdate: (updates: Partial<CreateServiceTypeFieldDto>) => void;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
}) {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          {/* Order buttons */}
          <div className="flex flex-col gap-1 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onMove('up')}
              disabled={index === 0}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onMove('down')}
              disabled={index === totalFields - 1}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>

          {/* Field config */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Label */}
            <div className="sm:col-span-4 space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                placeholder="e.g. Full Name"
                value={field.field_label}
                onChange={(e) => onUpdate({ field_label: e.target.value })}
              />
            </div>

            {/* Key (auto-generated, read-only) */}
            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs">Key</Label>
              <Input
                value={field.field_key}
                readOnly
                className="bg-muted text-muted-foreground"
                placeholder="auto-generated"
              />
            </div>

            {/* Type */}
            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={field.field_type}
                onValueChange={(v) => {
                  onUpdate({ field_type: v as ServiceFieldType });
                  if (v === 'select') setShowOptions(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Required + Delete */}
            <div className="sm:col-span-2 flex items-end gap-2">
              <div className="flex items-center gap-1.5 pb-2">
                <Checkbox
                  id={`req-${index}`}
                  checked={field.is_required || false}
                  onCheckedChange={(c) => onUpdate({ is_required: !!c })}
                />
                <Label htmlFor={`req-${index}`} className="text-xs cursor-pointer">
                  Required
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-700"
                onClick={onRemove}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Placeholder */}
            <div className="sm:col-span-6 space-y-1">
              <Label className="text-xs">Placeholder (optional)</Label>
              <Input
                placeholder="Enter placeholder text..."
                value={field.placeholder || ''}
                onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })}
              />
            </div>

            {/* Help text */}
            <div className="sm:col-span-6 space-y-1">
              <Label className="text-xs">Help Text (optional)</Label>
              <Input
                placeholder="Enter help text..."
                value={field.help_text || ''}
                onChange={(e) => onUpdate({ help_text: e.target.value || undefined })}
              />
            </div>

            {/* Default value */}
            <div className="sm:col-span-6 space-y-1">
              <Label className="text-xs">Default Value (optional)</Label>
              <Input
                placeholder="Pre-filled value..."
                value={field.default_value || ''}
                onChange={(e) => onUpdate({ default_value: e.target.value || undefined })}
              />
            </div>

            {/* Options (for select type) */}
            {field.field_type === 'select' && (
              <div className="sm:col-span-12">
                <FieldOptionsEditor
                  options={field.field_options || []}
                  onChange={(opts) => onUpdate({ field_options: opts })}
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldOptionsEditor({
  options,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  onChange: (options: Array<{ label: string; value: string }>) => void;
}) {
  const addOption = () => {
    onChange([...options, { label: '', value: '' }]);
  };

  const updateOption = (index: number, updates: Partial<{ label: string; value: string }>) => {
    const updated = [...options];
    updated[index] = { ...updated[index], ...updates };
    // Auto-generate value from label
    if (updates.label !== undefined) {
      updated[index].value = updates.label.toLowerCase().replace(/\s+/g, '_');
    }
    onChange(updated);
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2 border rounded-md p-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Dropdown Options</Label>
        <Button type="button" variant="outline" size="sm" onClick={addOption} className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" />
          Add Option
        </Button>
      </div>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="Label"
            value={opt.label}
            onChange={(e) => updateOption(i, { label: e.target.value })}
            className="h-8 text-sm"
          />
          <Input
            placeholder="Value"
            value={opt.value}
            readOnly
            className="h-8 text-sm bg-muted w-32"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => removeOption(i)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">No options added.</p>
      )}
    </div>
  );
}
