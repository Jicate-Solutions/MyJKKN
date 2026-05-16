'use client';

// app/(routes)/admission/group-dashboard/_components/overview-charts.tsx
//
// Statistics charts for the Overview tab. Two visualizations:
//
//   1. <GroupFunnelChart> — group-wide conversion funnel
//        Leads → Active CRM (engaged) → Applied (in enquiry pipeline) → Enrolled (active learner)
//      Each bar is a horizontal magnitude; the visual cliff between adjacent
//      bars is exactly the drop-off rate at that conversion step.
//
//   2. <InstitutionPerformanceChart> — per-institution grouped bar chart
//        For each institution: Leads / Applied / Enrolled / Rejected
//      Lets the admission director eyeball which campus has the worst
//      Applied→Enrolled conversion (tall Applied bar + short Enrolled bar).
//
// Charting lib: recharts (matches seat-analytics-dashboard.tsx style).

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GroupDashboardData } from '@/types/admission-workflow-config';

// Brand-adjacent palette tuned for the existing dashboard look.
const COLOR_LEADS    = '#94a3b8'; // slate-400
const COLOR_ACTIVE   = '#60a5fa'; // blue-400
const COLOR_APPLIED  = '#a78bfa'; // violet-400
const COLOR_ENROLLED = '#34d399'; // emerald-400
const COLOR_REJECTED = '#f87171'; // red-400

// Compute group-wide active-CRM total (sum across institutions). Not exposed
// in `data.totals`, so we re-aggregate here to keep the chart self-contained.
function getActiveCrmTotal(data: GroupDashboardData): number {
  return data.institutions.reduce((acc, i) => acc + (i.active_crm_leads ?? 0), 0);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Group-wide funnel
// ───────────────────────────────────────────────────────────────────────────

export function GroupFunnelChart({ data }: { data: GroupDashboardData }) {
  const activeCrm = getActiveCrmTotal(data);
  const funnelData = [
    { stage: 'Leads',    count: data.totals.total_leads,    fill: COLOR_LEADS },
    { stage: 'Active',   count: activeCrm,                  fill: COLOR_ACTIVE },
    { stage: 'Applied',  count: data.totals.total_applied,  fill: COLOR_APPLIED },
    { stage: 'Enrolled', count: data.totals.total_enrolled, fill: COLOR_ENROLLED },
  ];

  // Drop-off labels: percent of the previous stage that survived.
  const withDropoff = funnelData.map((row, idx) => ({
    ...row,
    dropoffPct: idx === 0 || funnelData[idx - 1].count === 0
      ? null
      : Math.round((row.count / funnelData[idx - 1].count) * 100),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Group Conversion Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={withDropoff}
            layout="vertical"
            margin={{ top: 4, right: 32, left: 12, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={70} />
            <Tooltip
              formatter={(value: number, _name: string, ctx: any) => {
                const p = ctx?.payload?.dropoffPct;
                return p == null ? [value, 'Count'] : [`${value} (${p}% of prior)`, 'Count'];
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {withDropoff.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          Hover any bar to see what % of the previous stage survived to this stage.
        </p>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Per-institution performance
// ───────────────────────────────────────────────────────────────────────────

export function InstitutionPerformanceChart({ data }: { data: GroupDashboardData }) {
  if (data.institutions.length === 0) return null;

  // Trim long institution names so the X-axis doesn't wrap awkwardly.
  const chartData = data.institutions.map((i) => ({
    name: i.institution_name.length > 18
      ? i.institution_name.slice(0, 16) + '…'
      : i.institution_name,
    fullName: i.institution_name,
    Leads:    i.total_leads,
    Applied:  i.applied,
    Enrolled: i.enrolled,
    Rejected: i.rejected,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Per-Institution Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Leads"    fill={COLOR_LEADS}    radius={[2, 2, 0, 0]} />
            <Bar dataKey="Applied"  fill={COLOR_APPLIED}  radius={[2, 2, 0, 0]} />
            <Bar dataKey="Enrolled" fill={COLOR_ENROLLED} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Rejected" fill={COLOR_REJECTED} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
