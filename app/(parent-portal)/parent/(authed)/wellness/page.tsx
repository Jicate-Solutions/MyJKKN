'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { HeartPulse } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useParentWellness } from '@/hooks/parent/use-parent-features';

function Metric({ label, value }: { label: string; value?: string | number }) {
  if (value == null || value === '') return null;
  return (
    <div className="rounded-lg bg-black/5 px-3 py-2 text-center dark:bg-white/5">
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export default function WellnessPage() {
  const { data, isLoading } = useParentWellness();
  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Wellness</h1>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <HeartPulse className="mx-auto mb-2 h-6 w-6 text-[#0b6d41]" />
          No wellness records yet.
        </Card>
      ) : (
        items.map((w) => (
          <Card key={w.id} className="space-y-3 p-4">
            {w.recordDate && (
              <p className="text-xs font-medium text-muted-foreground">{formatDate(w.recordDate)}</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Height (cm)" value={w.heightCm} />
              <Metric label="Weight (kg)" value={w.weightKg} />
              <Metric label="BMI" value={w.bmi} />
              <Metric label="Vision L" value={w.visionLeft} />
              <Metric label="Vision R" value={w.visionRight} />
            </div>
            {w.remarks && <p className="text-sm text-muted-foreground">{w.remarks}</p>}
          </Card>
        ))
      )}
    </div>
  );
}
