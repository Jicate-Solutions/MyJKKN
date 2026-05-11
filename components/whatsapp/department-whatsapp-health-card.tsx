'use client';

// components/whatsapp/department-whatsapp-health-card.tsx
//
// Spec 3 H2.2: Senior Learner / HoD-scope Department WhatsApp Health card.
// Renders on /dashboard for users with in-scope connections (RLS-gated).
// Component returns null if user has zero in-scope connections — empty surface
// = no chrome rendered for irrelevant roles.
//
// H4.x will replace the implicit "RLS gives me rows" check with an explicit
// permission key (whatsapp.connection.view_dept). For now, RLS gating is
// the source of truth.
//
// Spec: /specs/byow-platform-v2.md §8 H2.2 + §8c Senior Learner UI specifics

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useByowConnectionHealth,
  type ByowConnection,
} from '@/hooks/use-byow-connection-health';

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

function StatusPill({ status }: { status: ByowConnection['status'] }) {
  const variant: Record<ByowConnection['status'], { color: string; label: string }> = {
    ready: { color: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30', label: 'Live' },
    stale: { color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30', label: 'Stale' },
    disconnected: { color: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30', label: 'Down' },
  };
  const v = variant[status];
  return (
    <Badge variant='outline' className={cn('border', v.color)}>
      {v.label}
    </Badge>
  );
}

function ConnectionRow({ conn }: { conn: ByowConnection }) {
  const showReconnect = conn.status !== 'ready';
  const daysRemaining =
    conn.hours_remaining_before_force_disconnect !== null
      ? Math.max(0, Math.floor(conn.hours_remaining_before_force_disconnect / 24))
      : null;

  return (
    <div className='flex items-center justify-between gap-3 py-2 border-b border-border last:border-0'>
      <div className='flex flex-col gap-0.5 min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium truncate'>
            {conn.department_name ?? 'Unnamed dept'}
          </span>
          <StatusPill status={conn.status} />
        </div>
        <span className='text-xs text-muted-foreground'>
          {conn.phone_number ?? '(no phone set)'} · in {formatRelative(conn.last_inbound_at)} ·{' '}
          out {formatRelative(conn.last_outbound_at)}
        </span>
        {conn.status === 'stale' && daysRemaining !== null && (
          <span className='text-xs text-orange-600 dark:text-orange-400'>
            {daysRemaining > 0
              ? `Reconnect within ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} or messages will be lost`
              : 'Reconnect now to resume message capture'}
          </span>
        )}
      </div>
      {showReconnect && (
        <Button asChild variant='outline' size='sm'>
          <Link href='/admission/settings/whatsapp-numbers'>Reconnect</Link>
        </Button>
      )}
    </div>
  );
}

export function DepartmentWhatsAppHealthCard() {
  const { data, isLoading } = useByowConnectionHealth();

  // Empty-surface guard: don't render any chrome for users without in-scope
  // connections. This makes the card transparent for the 99% of dashboard
  // users (e.g., learners, parents) who don't have HoD-of-dept access.
  if (!isLoading && (data?.summary.total ?? 0) === 0) {
    return null;
  }

  const summary = data?.summary ?? { ready: 0, stale: 0, disconnected: 0, total: 0 };

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
        <div className='flex items-center gap-2'>
          <MessageCircle className='h-5 w-5 text-muted-foreground' />
          <CardTitle className='text-base'>Department WhatsApp Health</CardTitle>
        </div>
        <CardDescription>
          {summary.ready} live · {summary.stale} stale · {summary.disconnected} down
        </CardDescription>
      </CardHeader>
      <CardContent className='pt-0'>
        {isLoading ? (
          <div className='py-3 text-sm text-muted-foreground'>Loading…</div>
        ) : (
          <div className='flex flex-col'>
            {(data?.connections ?? []).map((c) => (
              <ConnectionRow key={c.id} conn={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
