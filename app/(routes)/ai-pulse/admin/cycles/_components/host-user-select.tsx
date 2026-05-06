'use client';
// app/(routes)/ai-pulse/admin/cycles/_components/host-user-select.tsx
// Created: 2026-05-06
// Purpose: Staff dropdown for AI Pulse cycle host. Champion permission gate enforced
//          server-side via RLS on save; client-side filter is best-effort UX.

import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAIPulseHostCandidates } from '@/lib/services/ai-pulse/cycles-service';

interface HostUserSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  id?: string;
}

const NULL_SENTINEL = '__none__';

export function HostUserSelect({
  value,
  onChange,
  disabled,
  id,
}: HostUserSelectProps) {
  const { data: hosts, isLoading } = useAIPulseHostCandidates();

  if (isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }

  const list = hosts || [];

  return (
    <Select
      value={value || NULL_SENTINEL}
      onValueChange={(v) => onChange(v === NULL_SENTINEL ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Choose a host…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NULL_SENTINEL}>— Unassigned —</SelectItem>
        {list.map((h) => (
          <SelectItem key={h.id} value={h.id}>
            {h.full_name || h.email || h.id.slice(0, 8)}
            {h.role ? ` · ${h.role}` : ''}
          </SelectItem>
        ))}
        {list.length === 0 && (
          <SelectItem value={NULL_SENTINEL} disabled>
            No staff candidates available
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
