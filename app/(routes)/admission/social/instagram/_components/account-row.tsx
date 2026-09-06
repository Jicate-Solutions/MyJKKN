'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Eye } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { IgAccount, IgAccountStatus } from '@/services/instagram-service';

const STATUS_BADGE: Record<
  IgAccountStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  active: { label: 'Active', variant: 'default' },
  dormant: { label: 'Dormant', variant: 'secondary' },
  disconnected: { label: 'Disconnected', variant: 'destructive' },
  error: { label: 'Error', variant: 'destructive' },
};

function healthColor(score: number): string {
  if (score >= 75) return 'bg-green-500 dark:bg-green-400';
  if (score >= 50) return 'bg-yellow-500 dark:bg-yellow-400';
  if (score >= 25) return 'bg-orange-500 dark:bg-orange-400';
  return 'bg-red-500 dark:bg-red-400';
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

interface AccountRowProps {
  account: IgAccount;
}

export function AccountRow({ account }: AccountRowProps) {
  const status = STATUS_BADGE[account.status] ?? STATUS_BADGE.error;

  return (
    <TableRow>
      {/* Username */}
      <TableCell className="font-medium">
        <a
          href={`https://instagram.com/${account.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:underline"
        >
          @{account.username}
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </a>
      </TableCell>

      {/* Institution */}
      <TableCell className="text-sm">{account.institution_name}</TableCell>

      {/* Department */}
      <TableCell className="text-sm text-muted-foreground">
        {account.department_name ?? '—'}
      </TableCell>

      {/* Account Type */}
      <TableCell>
        <Badge variant="outline" className="capitalize text-xs">
          {account.account_type}
        </Badge>
      </TableCell>

      {/* Followers */}
      <TableCell className="text-right tabular-nums">
        {fmt(account.followers_count)}
      </TableCell>

      {/* Last Post */}
      <TableCell className="text-sm text-muted-foreground">
        {relativeTime(account.last_post_at)}
      </TableCell>

      {/* Last Polled */}
      <TableCell className="text-sm text-muted-foreground">
        {relativeTime(account.last_polled_at)}
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge variant={status.variant} className="text-xs">
          {status.label}
        </Badge>
      </TableCell>

      {/* Health Score */}
      <TableCell>
        <div className="flex items-center gap-2 min-w-[80px]">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${healthColor(account.health_score)}`}
              style={{ width: `${account.health_score}%` }}
            />
          </div>
          <span className="text-xs tabular-nums w-7 text-right">
            {account.health_score}
          </span>
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell>
        <Link href={`/admission/social/instagram/${account.id}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Eye className="h-4 w-4" />
            <span className="sr-only">View details</span>
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}
