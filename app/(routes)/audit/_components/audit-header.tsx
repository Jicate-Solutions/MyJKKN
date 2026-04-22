// app/(routes)/audit/_components/audit-header.tsx
// Reusable header for cycle-scoped pages: shows cycle name, phase badge, lead auditor.
// Used on /audit/cycles/[id]/* pages.

'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Calendar, UserCircle2 } from 'lucide-react';
import { CyclePhaseBadge } from './cycle-phase-badge';
import type { AuditCycle } from '@/lib/types/audit';

interface AuditHeaderProps {
  cycle: AuditCycle | null | undefined;
  isLoading?: boolean;
  leadAuditorName?: string | null;
  rightSlot?: React.ReactNode;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function AuditHeader({
  cycle,
  isLoading,
  leadAuditorName,
  rightSlot,
}: AuditHeaderProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4">
          <Skeleton className="h-6 w-2/3 mb-3" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!cycle) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Cycle not found.</p>
          <Link href="/audit/cycles" className="inline-block mt-2">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to cycles
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Link
              href="/audit/cycles"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              All cycles
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">
                {cycle.name}
              </h1>
              <CyclePhaseBadge phase={cycle.phase} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(cycle.start_date)} — {formatDate(cycle.end_date)}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserCircle2 className="h-3 w-3" />
                Lead: {leadAuditorName ?? cycle.lead_auditor_id.slice(0, 8)}
              </span>
              {cycle.frameworks.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  Frameworks: {cycle.frameworks.join(' · ')}
                </span>
              )}
            </div>
            {cycle.description && (
              <p className="text-sm text-muted-foreground max-w-2xl">
                {cycle.description}
              </p>
            )}
          </div>
          {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
