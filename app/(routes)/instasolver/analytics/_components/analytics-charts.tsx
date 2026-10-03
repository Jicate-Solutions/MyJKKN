'use client';

// Charts for the analytics screen. Every series is the RPC's own output; the
// only work done here is naming (status / severity labels come from
// lib/instasolver/constants.ts) and colouring.

import { format, parseISO } from 'date-fns';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import {
  ISSUE_STATUS_META,
  SEVERITY_META,
  TONE_CHART_COLOUR
} from '@/lib/instasolver/constants';
import type { Analytics, IssueStatus, Severity } from '@/types/instasolver';

function ChartCard({
  title,
  description,
  empty,
  children
}: {
  title: string;
  description?: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Nothing reported in this period.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

const CHART_CLASS = 'aspect-auto h-64 w-full';

export function TimelineChart({ data }: { data: Analytics['timeline'] }) {
  const config: ChartConfig = {
    reported: { label: 'Reported', color: TONE_CHART_COLOUR.warning },
    completed: { label: 'Completed', color: TONE_CHART_COLOUR.success }
  };
  const rows = data.map((d) => ({ ...d, label: format(parseISO(d.date), 'dd MMM') }));
  return (
    <ChartCard
      title="Reported and completed over time"
      description="Issues raised each day against issues finished each day"
      empty={rows.every((r) => r.reported === 0 && r.completed === 0)}
    >
      <ChartContainer config={config} className={CHART_CLASS}>
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend />
          <Area
            type="monotone"
            dataKey="reported"
            name="Reported"
            stroke={TONE_CHART_COLOUR.warning}
            fill={TONE_CHART_COLOUR.warning}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="completed"
            name="Completed"
            stroke={TONE_CHART_COLOUR.success}
            fill={TONE_CHART_COLOUR.success}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function StatusMixChart({ data }: { data: Analytics['by_status'] }) {
  const rows = data.map((d) => {
    const meta = ISSUE_STATUS_META[d.label as IssueStatus];
    return {
      name: meta?.label ?? d.label,
      total: d.total,
      fill: TONE_CHART_COLOUR[meta?.tone ?? 'neutral']
    };
  });
  const config: ChartConfig = { total: { label: 'Issues' } };
  return (
    <ChartCard title="Status mix" description="Where the issues raised in this period stand now" empty={rows.length === 0}>
      <ChartContainer config={config} className={CHART_CLASS}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <Pie data={rows} dataKey="total" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.fill} />
            ))}
          </Pie>
          <Legend />
        </PieChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function SeverityChart({ data }: { data: Analytics['by_severity'] }) {
  const rows = data.map((d) => {
    const meta = SEVERITY_META[d.label as Severity];
    return { name: meta?.label ?? d.label, total: d.total, fill: TONE_CHART_COLOUR[meta?.tone ?? 'neutral'] };
  });
  const config: ChartConfig = { total: { label: 'Issues' } };
  return (
    <ChartCard title="By severity" description="How serious reporters said the fault was" empty={rows.length === 0}>
      <ChartContainer config={config} className={CHART_CLASS}>
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="total" radius={4}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function CategoryChart({ data }: { data: Analytics['by_category'] }) {
  const config: ChartConfig = { total: { label: 'Issues', color: TONE_CHART_COLOUR.info } };
  return (
    <ChartCard title="By category" description="Issues raised per category" empty={data.length === 0}>
      <ChartContainer config={config} className={`${CHART_CLASS} !h-auto`} style={{ height: Math.max(180, data.length * 34 + 30) }}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={120} tickLine={false} axisLine={false} interval={0} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="total" fill={TONE_CHART_COLOUR.info} radius={4} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function InstitutionChart({ data }: { data: Analytics['by_institution'] }) {
  const config: ChartConfig = {
    total: { label: 'Reported', color: TONE_CHART_COLOUR.warning },
    completed: { label: 'Completed', color: TONE_CHART_COLOUR.success }
  };
  return (
    <ChartCard
      title="By institution"
      description="Issues raised and issues completed at each institution"
      empty={data.length === 0}
    >
      <ChartContainer config={config} className={`${CHART_CLASS} !h-auto`} style={{ height: Math.max(200, data.length * 52 + 40) }}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={140} tickLine={false} axisLine={false} interval={0} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend />
          <Bar dataKey="total" name="Reported" fill={TONE_CHART_COLOUR.warning} radius={4} />
          <Bar dataKey="completed" name="Completed" fill={TONE_CHART_COLOUR.success} radius={4} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
