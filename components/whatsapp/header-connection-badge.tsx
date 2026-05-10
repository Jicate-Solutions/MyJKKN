'use client';

// components/whatsapp/header-connection-badge.tsx
//
// Spec 3 H2.1: Global header WhatsApp connection-health badge.
// Renders a small icon button in the top nav with a status pill (green/yellow/red).
// Click opens a popover listing each in-scope dept WhatsApp connection with status,
// last-inbound timestamp, and Reconnect link if down.
//
// Spec: /specs/byow-platform-v2.md §8 H2.1

import Link from 'next/link';
import { MessageCircle, MessageCircleOff, MessageCircleWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  useByowConnectionHealth,
  deriveOverallPillColor,
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

function StatusDot({ status }: { status: ByowConnection['status'] }) {
  const color =
    status === 'ready'
      ? 'bg-green-500'
      : status === 'stale'
        ? 'bg-yellow-500'
        : 'bg-red-500';
  return <span className={cn('inline-block h-2 w-2 rounded-full', color)} aria-hidden />;
}

function ConnectionRow({ conn }: { conn: ByowConnection }) {
  const lastInbRel = formatRelative(conn.last_inbound_at);
  const lastOutRel = formatRelative(conn.last_outbound_at);
  const showReconnect = conn.status !== 'ready';
  const daysRemaining =
    conn.hours_remaining_before_force_disconnect !== null
      ? Math.max(0, Math.floor(conn.hours_remaining_before_force_disconnect / 24))
      : null;

  return (
    <div className='flex items-start justify-between gap-2 px-3 py-2 hover:bg-muted/50 transition-colors'>
      <div className='flex flex-col gap-0.5 min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <StatusDot status={conn.status} />
          <span className='text-sm font-medium truncate'>
            {conn.department_name ?? 'Unnamed dept'}
          </span>
        </div>
        <span className='text-xs text-muted-foreground truncate'>
          {conn.phone_number ?? '(no phone)'} · in {lastInbRel} / out {lastOutRel}
        </span>
        {showReconnect && daysRemaining !== null && conn.status === 'stale' && (
          <span className='text-xs text-orange-600 dark:text-orange-400'>
            {daysRemaining > 0
              ? `Messages will be lost in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
              : 'Reconnect now to resume'}
          </span>
        )}
      </div>
      {showReconnect && (
        <Link
          href='/admission/settings/whatsapp-numbers'
          className='text-xs text-primary hover:underline whitespace-nowrap'
        >
          Reconnect
        </Link>
      )}
    </div>
  );
}

export function HeaderConnectionBadge() {
  const { data, isLoading } = useByowConnectionHealth();

  // Don't render the badge if user has no in-scope connections (RLS-empty surface).
  if (!isLoading && (data?.summary.total ?? 0) === 0) {
    return null;
  }

  const summary = data?.summary ?? { ready: 0, stale: 0, disconnected: 0, total: 0 };
  const pillColor = deriveOverallPillColor(summary);
  const Icon =
    pillColor === 'red'
      ? MessageCircleOff
      : pillColor === 'yellow'
        ? MessageCircleWarning
        : MessageCircle;

  const dotColorClass =
    pillColor === 'red'
      ? 'bg-red-500'
      : pillColor === 'yellow'
        ? 'bg-yellow-500'
        : pillColor === 'green'
          ? 'bg-green-500'
          : 'bg-gray-400';

  const tooltipLabel =
    pillColor === 'green'
      ? `WhatsApp: ${summary.ready} connection${summary.ready === 1 ? '' : 's'} live`
      : pillColor === 'yellow'
        ? `WhatsApp: ${summary.stale} stale, ${summary.ready} live`
        : pillColor === 'red'
          ? `WhatsApp: ${summary.disconnected} down`
          : 'WhatsApp connections';

  return (
    <TooltipProvider delayDuration={200}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='relative'
                aria-label='Department WhatsApp connection health'
              >
                <Icon className='h-5 w-5' />
                <span
                  className={cn(
                    'absolute top-1 right-1 inline-block h-2 w-2 rounded-full ring-2 ring-background',
                    dotColorClass
                  )}
                  aria-hidden
                />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side='bottom'>{tooltipLabel}</TooltipContent>
        </Tooltip>
        <PopoverContent align='end' className='w-80 p-0'>
          <div className='px-3 py-2'>
            <h3 className='text-sm font-semibold'>Department WhatsApp</h3>
            <p className='text-xs text-muted-foreground'>
              {summary.ready} live · {summary.stale} stale · {summary.disconnected} down
            </p>
          </div>
          <Separator />
          <ScrollArea className='max-h-80'>
            {isLoading ? (
              <div className='px-3 py-4 text-sm text-muted-foreground'>Loading…</div>
            ) : (data?.connections ?? []).length === 0 ? (
              <div className='px-3 py-4 text-sm text-muted-foreground'>
                No connections in your scope.
              </div>
            ) : (
              (data?.connections ?? []).map((c) => (
                <ConnectionRow key={c.id} conn={c} />
              ))
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
