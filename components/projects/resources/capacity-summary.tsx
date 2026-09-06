'use client';

/**
 * CapacitySummary — headline stats row above the resource table (F5).
 *
 * Cards: total members, total assigned hours, over-allocated count.
 */

import { Users, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { MemberCapacity } from '@/lib/services/projects/resource-service';

interface CapacitySummaryProps {
  items: MemberCapacity[];
}

export function CapacitySummary({ items }: CapacitySummaryProps) {
  const totalMembers = items.length;
  const totalAssignedHours = items.reduce((sum, i) => sum + i.assignedHours, 0);
  const overAllocatedCount = items.filter((i) => i.isOverAllocated).length;

  const stats = [
    {
      icon: Users,
      label: 'Members',
      value: totalMembers,
      sub: null,
      accent: 'text-foreground',
    },
    {
      icon: Clock,
      label: 'Total Assigned Hrs',
      value: totalAssignedHours.toFixed(1) + 'h',
      sub: 'sum of task estimated_hours',
      accent: 'text-foreground',
    },
    {
      icon: AlertTriangle,
      label: 'Over-Allocated',
      value: overAllocatedCount,
      sub: overAllocatedCount > 0 ? 'needs attention' : 'all within capacity',
      accent: overAllocatedCount > 0 ? 'text-destructive' : 'text-emerald-600',
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map(({ icon: Icon, label, value, sub, accent }) => (
        <Card key={label}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
              <Icon className={`h-4 w-4 ${accent}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-xl font-semibold ${accent}`}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
