'use client';
// app/(routes)/ai-pulse/admin/cycles/_components/featured-tool-select.tsx
// Created: 2026-05-06
// Purpose: Dropdown of active featured tools for AI Pulse cycle edit. Reads from
//          ai_pulse_featured_tools master (PR #644).

import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAIPulseFeaturedTools } from '@/lib/services/ai-pulse/cycles-service';

interface FeaturedToolSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  id?: string;
}

const NULL_SENTINEL = '__none__';

export function FeaturedToolSelect({
  value,
  onChange,
  disabled,
  id,
}: FeaturedToolSelectProps) {
  const { data: tools, isLoading } = useAIPulseFeaturedTools();

  if (isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }

  const active = (tools || []).filter((t) => t.is_active);
  const inactive = (tools || []).filter((t) => !t.is_active);

  return (
    <Select
      value={value || NULL_SENTINEL}
      onValueChange={(v) => onChange(v === NULL_SENTINEL ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Choose a featured tool…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NULL_SENTINEL}>— None —</SelectItem>
        {active.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
            {t.vendor ? ` · ${t.vendor}` : ''}
          </SelectItem>
        ))}
        {inactive.length > 0 && (
          <>
            {inactive.map((t) => (
              <SelectItem key={t.id} value={t.id} disabled>
                {t.name}
                {t.vendor ? ` · ${t.vendor}` : ''} (inactive)
              </SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
