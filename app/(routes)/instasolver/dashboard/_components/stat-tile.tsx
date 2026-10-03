'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type TileTone = 'default' | 'warning' | 'danger' | 'success';

const TONE_CLASS: Record<TileTone, string> = {
  default: '',
  warning: 'border-amber-200 dark:border-amber-900',
  danger: 'border-red-200 dark:border-red-900',
  success: 'border-emerald-200 dark:border-emerald-900'
};

/** One figure from the dashboard RPC. `value` is passed through, never computed here. */
export function StatTile({
  label,
  value,
  href,
  tone = 'default',
  loading
}: {
  label: string;
  value: number | undefined;
  href?: string;
  tone?: TileTone;
  loading?: boolean;
}) {
  const body = (
    <Card className={cn('h-full transition-colors', href && 'hover:bg-muted/50', TONE_CLASS[tone])}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading || value === undefined ? (
          <Skeleton className="mt-2 h-8 w-12" />
        ) : (
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      {body}
    </Link>
  ) : (
    body
  );
}

export function TileGroup({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
