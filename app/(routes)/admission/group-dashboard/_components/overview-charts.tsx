'use client';

// app/(routes)/admission/group-dashboard/_components/overview-charts.tsx
//
// Statistics charts for the Overview tab. Two visualizations:
//
//   1. <GroupFunnelChart> — group-wide lifecycle conversion funnel
//        Leads → Enquiry → Enquiry Submitted → Account → Reserved → Admitted
//      Each bar is a horizontal magnitude; the visual cliff between adjacent
//      bars is exactly the drop-off rate at that lifecycle gate.
//
//   2. <InstitutionPerformanceChart> — per-institution grouped bar chart
//        For each institution: Leads / Enquiry / Reserved / Admitted
//      Lets the admission director eyeball which campus has the worst
//      Enquiry→Admitted conversion (tall Enquiry + short Admitted).
//
// 2026-05-20: Rewired from admission_leads.funnel_stage (Applied/Enrolled)
// to learners_profiles.lifecycle_status counts. Same RPC, new fields.
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

// Brand-adjacent palette aligned with the admission_statuses seed colours.
const COLOR_LEADS              = '#94a3b8'; // slate-400
const COLOR_ENQUIRY            = '#3B82F6'; // blue-500   — entry-point
const COLOR_ENQUIRY_SUBMITTED  = '#A855F7'; // purple-500 — form completed
const COLOR_ACCOUNT            = '#8B5CF6'; // violet-500 — billing gate
const COLOR_RESERVED           = '#0EA5E9'; // sky-500    — universal fees paid
const COLOR_ADMITTED           = '#10B981'; // emerald-500 — threshold cleared (incl. active)
const COLOR_REJECTED           = '#f87171'; // red-400

// ───────────────────────────────────────────────────────────────────────────
// 1. Group-wide lifecycle funnel
// ───────────────────────────────────────────────────────────────────────────

export function GroupFunnelChart({ data }: { data: GroupDashboardData }) {
  const funnelData = [
    { stage: 'Leads',             count: data.totals.total_leads,             fill: COLOR_LEADS },
    { stage: 'Enquiry',           count: data.totals.total_enquiry,           fill: COLOR_ENQUIRY },
    { stage: 'Enquiry Submitted', count: data.totals.total_enquiry_submitted, fill: COLOR_ENQUIRY_SUBMITTED },
    { stage: 'Fees Pending',      count: data.totals.total_account,           fill: COLOR_ACCOUNT },
    { stage: 'Reserved',          count: data.totals.total_reserved,          fill: COLOR_RESERVED },
    { stage: 'Admitted',          count: data.totals.total_admitted,          fill: COLOR_ADMITTED },
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
        <CardTitle className="text-sm font-medium">Group Lifecycle Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={withDropoff}
            layout="vertical"
            margin={{ top: 4, right: 32, left: 12, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={120} />
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
          Hover any bar to see what % of the previous stage survived to this one. Admitted includes active learners.
        </p>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Per-institution lifecycle performance
// ───────────────────────────────────────────────────────────────────────────

export function InstitutionPerformanceChart({ data }: { data: GroupDashboardData }) {
  if (data.institutions.length === 0) return null;

  // Trim long institution names so the X-axis doesn't wrap awkwardly.
  // 2026-05-20: Series rewired from Applied/Enrolled (funnel_stage) to
  // Enquiry/Reserved/Admitted (lifecycle_status). Reserved + Admitted are
  // the two action-relevant lifecycle counts per institution; Enquiry is
  // the inflow signal.
  const chartData = data.institutions.map((i) => ({
    name: i.institution_name.length > 18
      ? i.institution_name.slice(0, 16) + '…'
      : i.institution_name,
    fullName: i.institution_name,
    Leads:    i.total_leads,
    Enquiry:  i.enquiry_count,
    Reserved: i.reserved_count,
    Admitted: i.admitted_count,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Per-Institution Lifecycle</CardTitle>
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
            <Bar dataKey="Enquiry"  fill={COLOR_ENQUIRY}  radius={[2, 2, 0, 0]} />
            <Bar dataKey="Reserved" fill={COLOR_RESERVED} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Admitted" fill={COLOR_ADMITTED} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
