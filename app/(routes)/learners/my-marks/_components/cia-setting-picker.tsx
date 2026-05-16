'use client';

/**
 * CIA Setting picker — a Select that lists the student's CIA Settings
 * for the active (session, program). Auto-selected on first render to
 * the most recently updated active setting; the student can override.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings2 } from 'lucide-react';
import type { MyMarksCiaSetting } from '@/types/my-marks';

interface Props {
  settings: MyMarksCiaSetting[];
  selectedId?: string;
  onChange: (id: string) => void;
}

export function CiaSettingPicker({ settings, selectedId, onChange }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Settings2 className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap">Assessment</span>
      </div>
      <Select value={selectedId ?? ''} onValueChange={onChange}>
        <SelectTrigger className="w-full sm:w-[300px] h-9 text-[13px]">
          <SelectValue placeholder="Select an assessment" />
        </SelectTrigger>
        <SelectContent>
          {settings.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              <div className="flex flex-col">
                <span className="font-medium">{s.setting_name}</span>
                {s.exam_session_name && (
                  <span className="text-xs text-muted-foreground">
                    {s.exam_session_name}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
