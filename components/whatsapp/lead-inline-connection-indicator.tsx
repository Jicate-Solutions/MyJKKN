'use client';

// components/whatsapp/lead-inline-connection-indicator.tsx
//
// Spec 3 H2.3: Compact inline indicator shown on lead pages near the lead's
// phone number. Filters the existing useByowConnectionHealth() result by the
// lead's department_id and shows a one-line status pill.
//
// Returns null if:
//   - lead has no department_id, OR
//   - no in-scope connection matches that dept (RLS-empty for this dept)
//
// Spec: /specs/byow-platform-v2.md §8 H2.3

import Link from 'next/link';
import { MessageCircle, MessageCircleOff, MessageCircleWarning } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useByowConnectionHealth } from '@/hooks/use-byow-connection-health';

interface Props {
  departmentId: string | null | undefined;
  className?: string;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function LeadInlineConnectionIndicator({ departmentId, className }: Props) {
  const { data, isLoading } = useByowConnectionHealth();

  if (!departmentId || isLoading) return null;

  const conn = (data?.connections ?? []).find((c) => c.department_id === departmentId);
  if (!conn) return null;

  const Icon =
    conn.status === 'ready'
      ? MessageCircle
      : conn.status === 'stale'
        ? MessageCircleWarning
        : MessageCircleOff;

  const colorClass =
    conn.status === 'ready'
      ? 'text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/30'
      : conn.status === 'stale'
        ? 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
        : 'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/30';

  const label =
    conn.status === 'ready'
      ? `Dept WhatsApp · live · last ${formatRelative(conn.last_inbound_at)}`
      : conn.status === 'stale'
        ? `Dept WhatsApp · stale · ${formatRelative(conn.last_inbound_at)}`
        : `Dept WhatsApp · disconnected`;

  const showReconnect = conn.status !== 'ready';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs',
        colorClass,
        className
      )}
      title={`${conn.department_name ?? 'Department'} (${conn.phone_number ?? 'no phone'})`}
    >
      <Icon className='h-3 w-3' />
      <span>{label}</span>
      {showReconnect && (
        <Link
          href='/admission/settings/whatsapp-numbers'
          className='underline ml-1'
        >
          Reconnect
        </Link>
      )}
    </div>
  );
}
