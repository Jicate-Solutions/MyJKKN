'use client';

/** Attendance — donut %, legend, working days, recently missed. */
import { AttendanceRing } from '@/components/parent/attendance-ring';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import { useParentAttendance } from '@/hooks/parent/use-parent-attendance';

const STATUS_LABEL: Record<string, string> = {
  absent: 'Absent',
  on_duty: 'On duty',
};

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto text-sm font-semibold">{value}</span>
    </div>
  );
}

export default function ParentAttendancePage() {
  const { data, isLoading, isError } = useParentAttendance();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Attendance</h1>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : isError || !data ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Couldn’t load attendance. Please try again.
        </Card>
      ) : data.totalClasses === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No attendance has been recorded yet.
        </Card>
      ) : (
        <>
          <Card className="space-y-4 p-5">
            <AttendanceRing
              present={data.present}
              absent={data.absent}
              percentage={data.percentage}
            />
            {!data.isAboveThreshold && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-700">
                Below the {data.threshold}% attendance threshold.
              </p>
            )}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Classes</span>
                <span className="font-semibold">{data.totalClasses}</span>
              </div>
              <LegendDot color="#0b6d41" label="Present" value={data.present} />
              <LegendDot color="#dc2626" label="Absent" value={data.absent} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Recently Missed Days</h2>
            {data.recentMissed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No missed days. 🎉</p>
            ) : (
              <ul className="divide-y divide-black/5 dark:divide-white/10">
                {data.recentMissed.map((m) => (
                  <li key={m.date} className="flex items-center justify-between py-2.5 text-sm">
                    <span>{formatDate(m.date)}</span>
                    <span
                      className={
                        m.status === 'absent'
                          ? 'rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700'
                          : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'
                      }
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
