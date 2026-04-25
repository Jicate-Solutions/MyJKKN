'use client';

// Evidence Required editor / viewer for audit parameters.
//
// Renders an array of EvidenceRequirementItem rows. Each row has a label,
// required flag, optional mime-type whitelist, and optional description.
// Two modes:
//   - read-only  (used on parameter detail page)
//   - editable   (used inside parameter-form-dialog)
//
// Design: flat rows with inline add/remove. Keeps JSONB shape stable with the
// service layer (evidence_required: EvidenceRequirementItem[]).

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Plus, Trash2, FileText } from 'lucide-react';
import type { EvidenceRequirementItem } from '@/lib/types/audit';

const MIME_OPTIONS: { label: string; value: string }[] = [
  { label: 'PDF', value: 'application/pdf' },
  { label: 'JPG', value: 'image/jpeg' },
  { label: 'PNG', value: 'image/png' },
  { label: 'DOCX', value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { label: 'XLSX', value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { label: 'CSV', value: 'text/csv' }
];

const MIME_LABEL_BY_VALUE: Record<string, string> = MIME_OPTIONS.reduce(
  (acc, m) => ({ ...acc, [m.value]: m.label }),
  {}
);

interface EvidenceRequiredListProps {
  value: EvidenceRequirementItem[];
  /** Omit `onChange` to render read-only. */
  onChange?: (next: EvidenceRequirementItem[]) => void;
  /** Shown when value is empty. */
  emptyMessage?: string;
}

export function EvidenceRequiredList({
  value,
  onChange,
  emptyMessage = 'No evidence items configured.'
}: EvidenceRequiredListProps) {
  const readOnly = !onChange;

  const updateItem = (index: number, patch: Partial<EvidenceRequirementItem>) => {
    if (!onChange) return;
    const next = value.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  };

  const removeItem = (index: number) => {
    if (!onChange) return;
    onChange(value.filter((_, i) => i !== index));
  };

  const addItem = () => {
    if (!onChange) return;
    onChange([
      ...value,
      { label: '', required: true, mime_types: [] }
    ]);
  };

  if (readOnly && value.length === 0) {
    return <p className='text-sm text-muted-foreground'>{emptyMessage}</p>;
  }

  return (
    <div className='space-y-2'>
      {value.map((item, index) => (
        <div
          key={index}
          className='flex items-start gap-2 p-3 rounded-md border bg-muted/20'
        >
          <FileText className='h-4 w-4 text-muted-foreground mt-2 flex-shrink-0' />

          <div className='flex-1 space-y-2'>
            {readOnly ? (
              <div className='flex items-center gap-2 flex-wrap'>
                <span className='text-sm font-medium'>{item.label || '(unnamed)'}</span>
                {item.required ? (
                  <Badge variant='default' className='text-xs'>
                    Required
                  </Badge>
                ) : (
                  <Badge variant='outline' className='text-xs'>
                    Optional
                  </Badge>
                )}
                {item.mime_types && item.mime_types.length > 0 && (
                  <div className='flex gap-1 flex-wrap'>
                    {item.mime_types.map((m) => (
                      <Badge key={m} variant='secondary' className='text-xs font-mono'>
                        {MIME_LABEL_BY_VALUE[m] ?? m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <Input
                  placeholder='Evidence label (e.g., CO-PO mapping sheet)'
                  value={item.label}
                  onChange={(e) => updateItem(index, { label: e.target.value })}
                />
                <div className='flex items-center gap-3 flex-wrap'>
                  <label className='flex items-center gap-2 text-sm'>
                    <Checkbox
                      checked={item.required}
                      onCheckedChange={(checked) =>
                        updateItem(index, { required: !!checked })
                      }
                    />
                    Required
                  </label>
                  <MimeTypesEditor
                    value={item.mime_types ?? []}
                    onChange={(next) => updateItem(index, { mime_types: next })}
                  />
                </div>
              </>
            )}

            {item.description && readOnly && (
              <p className='text-xs text-muted-foreground'>{item.description}</p>
            )}
          </div>

          {!readOnly && (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={() => removeItem(index)}
              className='flex-shrink-0'
              aria-label='Remove evidence item'
            >
              <Trash2 className='h-4 w-4 text-destructive' />
            </Button>
          )}
        </div>
      ))}

      {!readOnly && (
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={addItem}
          className='w-full'
        >
          <Plus className='h-4 w-4 mr-2' />
          Add evidence item
        </Button>
      )}
    </div>
  );
}

// ---- internal helpers ----

function MimeTypesEditor({
  value,
  onChange
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (mime: string) => {
    if (value.includes(mime)) {
      onChange(value.filter((m) => m !== mime));
    } else {
      onChange([...value, mime]);
    }
  };

  const labels =
    value.length === 0
      ? 'Allowed file types'
      : value
          .map((m) => MIME_LABEL_BY_VALUE[m] ?? m)
          .join(', ');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type='button' variant='outline' size='sm'>
          {labels}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-56' align='start'>
        <div className='space-y-2'>
          <div className='text-xs font-medium text-muted-foreground'>
            Allowed file types
          </div>
          {MIME_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className='flex items-center gap-2 text-sm cursor-pointer'
            >
              <Checkbox
                checked={value.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
