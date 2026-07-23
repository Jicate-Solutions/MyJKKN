'use client';

/**
 * CIA Setting picker — a Select that lists the session's CIA settings (e.g.
 * "PG Theory CIA" vs "Lab CIA"). Auto-selected to the first; the student can
 * override. Fed from the aggregate cia-view payload (session.settings[]).
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings2 } from 'lucide-react';
import type { CiaViewSetting } from '@/types/my-marks';

interface Props {
  settings: CiaViewSetting[];
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
            <SelectItem key={s.setting_id} value={s.setting_id}>
              <span className="font-medium">
                {s.setting_name ?? 'CIA Assessment'}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
