'use client';

import { useMemo } from 'react';
import { Pause, Users, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSourceCounselorsWithLoad } from '@/hooks/admission/use-source-counselors-with-load';

interface CounselorTargetPickerProps {
  sourceId: string;
  mode: 'single' | 'multi';
  selectedIds: string[];
  onChange: (next: string[]) => void;
  override: boolean;
}

export function CounselorTargetPicker({
  sourceId,
  mode,
  selectedIds,
  onChange,
  override,
}: CounselorTargetPickerProps) {
  const { data: counselors, isLoading } = useSourceCounselorsWithLoad(sourceId);

  // Render-time filter so flipping the override toggle doesn't refetch.
  const visible = useMemo(
    () => (counselors ?? []).filter((a) => override || !a.is_paused),
    [counselors, override]
  );

  const toggle = (id: string) => {
    if (mode === 'single') {
      onChange([id]);
      return;
    }
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        <Users className="mx-auto mb-1 h-5 w-5 opacity-50" />
        No mapped counselors {override ? '' : '(toggle override to include paused)'}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {mode === 'single' ? 'Assign all to' : `Participants (${selectedIds.length} of ${visible.length} selected)`}
      </Label>
      <div className="space-y-1 rounded-md border p-1">
        {visible.map((a) => {
          const c = a.counselor;
          const checked = selectedIds.includes(a.counselor_id);
          const atCap =
            (c?.current_leads ?? 0) >= (c?.max_leads ?? Number.POSITIVE_INFINITY);

          return (
            <label
              key={a.counselor_id}
              className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <Checkbox checked={checked} onCheckedChange={() => toggle(a.counselor_id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c?.name ?? 'Unknown'}</span>
                  {a.is_paused && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
                      <Pause className="h-2.5 w-2.5" /> Paused
                    </span>
                  )}
                  {atCap && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                      <AlertTriangle className="h-2.5 w-2.5" /> At cap
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {c?.designation ? `${c.designation} · ` : ''}
                  {c?.email}
                </div>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {c?.current_leads ?? 0}
                {c?.max_leads ? ` / ${c.max_leads}` : ''}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
