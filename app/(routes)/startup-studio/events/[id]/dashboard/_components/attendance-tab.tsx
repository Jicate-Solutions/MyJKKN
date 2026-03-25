'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { AttendanceSummary } from '@/lib/services/startup-studio/event-analytics-service';

interface Props {
  summary: AttendanceSummary;
}

interface StatCardProps {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}

function StatCard({ label, count, total, colorClass }: StatCardProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        <p className={`text-2xl font-bold ${colorClass}`}>{count}</p>
        <p className="text-xs text-muted-foreground mt-1">{pct}% of teams</p>
      </CardContent>
    </Card>
  );
}

export function AttendanceTab({ summary }: Props) {
  const [activeDay, setActiveDay] = useState<'build_day' | 'demo_day'>('build_day');

  const dayData = activeDay === 'build_day' ? summary.buildDay : summary.demoDay;
  const total = dayData.total;

  const venueData = summary.byVenue
    .filter((v) => v.dayType === activeDay)
    .map((v) => ({
      name: v.venueName.length > 20 ? `${v.venueName.slice(0, 20)}\u2026` : v.venueName,
      Present: v.present,
      Absent: v.absent,
      Late: v.late,
    }));

  return (
    <div className="space-y-6">
      {/* Day Toggle */}
      <div className="flex gap-2">
        <Button
          variant={activeDay === 'build_day' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveDay('build_day')}
        >
          Build Day
        </Button>
        <Button
          variant={activeDay === 'demo_day' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveDay('demo_day')}
        >
          Demo Day
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Present" count={dayData.present} total={total} colorClass="text-green-600 dark:text-green-400" />
        <StatCard label="Absent" count={dayData.absent} total={total} colorClass="text-red-600 dark:text-red-400" />
        <StatCard label="Late" count={dayData.late} total={total} colorClass="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Unmarked" count={dayData.unmarked} total={total} colorClass="text-slate-600 dark:text-slate-400" />
      </div>

      {/* Bar Chart by Venue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance by Venue</CardTitle>
        </CardHeader>
        <CardContent>
          {venueData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              No attendance recorded yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={venueData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={venueData.length > 4 ? -20 : 0}
                  textAnchor={venueData.length > 4 ? 'end' : 'middle'}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Present" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Absent" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Late" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
