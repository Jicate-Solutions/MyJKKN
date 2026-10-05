'use client';

import { Loader2, MapPin, Stethoscope } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useClinicalPunch, useMyClinicalToday } from '@/hooks/hr/use-clinical-duty';

const timeIST = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));

const dateLabel = (ymd: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${ymd}T00:00:00+05:30`));

export function ClinicalDutyCard({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useMyClinicalToday(employeeId);
  const punch = useClinicalPunch();

  if (isLoading || !data?.eligible) return null;

  const inPunch = data.punches.find((p) => p.punch_type === 'in');
  const outPunch = data.punches.find((p) => p.punch_type === 'out');
  const done = Boolean(inPunch && outPunch);
  const label = done ? 'Done for today' : inPunch ? 'Punch OUT' : 'Punch IN';

  return (
    <Card className="border-sky-200 dark:border-sky-900">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
          <div className="min-w-0">
            <p className="font-semibold">Clinical duty</p>
            <p className="text-sm text-muted-foreground">{dateLabel(data.date)}</p>
          </div>
        </div>

        {data.sites.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {data.sites.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.name}</span>
                <span className="text-xs text-muted-foreground">({s.radius_m} m radius)</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No duty site is available to you today. Contact HR.
          </p>
        )}

        {data.punches.length > 0 && (
          <ul className="space-y-0.5 text-sm tabular-nums">
            {data.punches.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.punch_type === 'in' ? 'IN' : 'OUT'}</span>{' '}
                {timeIST(p.punched_at)}{' '}
                <span className="text-muted-foreground">· {Math.round(p.distance_m)} m from site</span>
              </li>
            ))}
          </ul>
        )}

        <Button
          className="w-full sm:w-auto"
          disabled={done || punch.isPending || data.sites.length === 0}
          onClick={() => punch.mutate()}
        >
          {punch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {punch.isPending ? 'Getting your location…' : label}
        </Button>

        <p className="text-xs text-muted-foreground">
          Uses your device location; you must be within the duty site.
        </p>
      </CardContent>
    </Card>
  );
}
