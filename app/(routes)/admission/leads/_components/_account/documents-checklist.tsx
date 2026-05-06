'use client';
import { useEffect, useMemo, useState } from 'react';
import type { AccountTransitionDocumentEntry } from '@/types/admission';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  requiredDocTypes: string[];
  onChange: (entries: AccountTransitionDocumentEntry[]) => void;
  onValidityChange?: (valid: boolean) => void;
}

const VIA_OPTIONS = [
  { value: 'physical', label: 'Physical' },
  { value: 'email', label: 'Email' },
  { value: 'upload', label: 'Upload' },
] as const;

type EntryState = {
  checked: boolean;
  received_via?: string;
  document_ref?: string;
};

export function DocumentsChecklist({
  requiredDocTypes,
  onChange,
  onValidityChange,
}: Props) {
  const [entries, setEntries] = useState<Record<string, EntryState>>({});

  // Initialize state when requiredDocTypes changes
  useEffect(() => {
    setEntries((prev) => {
      const next: Record<string, EntryState> = {};
      for (const dt of requiredDocTypes) {
        next[dt] = prev[dt] ?? { checked: false };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(requiredDocTypes)]);

  // Compute output + validity
  const output: AccountTransitionDocumentEntry[] = useMemo(
    () =>
      Object.entries(entries)
        .filter(([, v]) => v.checked && v.received_via)
        .map(([dt, v]) => ({
          doc_type: dt,
          received_via: v.received_via as 'physical' | 'email' | 'upload',
          document_ref: v.document_ref,
        })),
    [entries],
  );

  const allRequiredOk = useMemo(
    () =>
      requiredDocTypes.every((dt) => {
        const e = entries[dt];
        return e?.checked && e?.received_via;
      }),
    [entries, requiredDocTypes],
  );

  useEffect(() => {
    onChange(output);
  }, [output, onChange]);

  useEffect(() => {
    onValidityChange?.(allRequiredOk);
  }, [allRequiredOk, onValidityChange]);

  return (
    <div className="space-y-2">
      {requiredDocTypes.map((dt) => {
        const e = entries[dt] ?? { checked: false };
        return (
          <div key={dt} className="flex items-center gap-3">
            <Checkbox
              checked={e.checked}
              onCheckedChange={(checked) =>
                setEntries((s) => ({
                  ...s,
                  [dt]: { ...s[dt], checked: !!checked },
                }))
              }
            />
            <span className="w-40 text-sm font-medium capitalize">
              {dt.replace(/_/g, ' ')}
            </span>
            {e.checked && (
              <>
                <Select
                  value={e.received_via}
                  onValueChange={(v) =>
                    setEntries((s) => ({
                      ...s,
                      [dt]: { ...s[dt], received_via: v },
                    }))
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Via…" />
                  </SelectTrigger>
                  <SelectContent>
                    {VIA_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  placeholder="Reference (optional)"
                  value={e.document_ref ?? ''}
                  onChange={(ev) =>
                    setEntries((s) => ({
                      ...s,
                      [dt]: { ...s[dt], document_ref: ev.target.value },
                    }))
                  }
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
