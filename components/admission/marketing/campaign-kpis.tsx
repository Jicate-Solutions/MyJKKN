'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { Campaign, CampaignFunnel } from '@/types/admission/campaign';

interface Props {
  campaign: Campaign;
  funnel: CampaignFunnel | undefined;
  spentInr: number;
}

function fmtInr(n: number | null | undefined) {
  return n == null
    ? '—'
    : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function CampaignKPIs({ campaign, funnel, spentInr }: Props) {
  const captures = funnel?.stages.captures ?? 0;
  const enrolled = funnel?.stages.enrolled ?? 0;
  const cpl = captures > 0 ? spentInr / captures : null;
  const cpe = enrolled > 0 ? spentInr / enrolled : null;
  const roiPct =
    campaign.budget_inr && campaign.budget_inr > 0
      ? Math.round(
          ((spentInr - campaign.budget_inr) / campaign.budget_inr) * 100,
        )
      : null;

  const goalEnrolled = campaign.target_enrolled ?? null;
  const enrolledPct =
    goalEnrolled && goalEnrolled > 0
      ? Math.round((enrolled / goalEnrolled) * 100)
      : null;

  const items = [
    { label: 'CPL (Cost / Lead)', value: fmtInr(cpl) },
    { label: 'CPE (Cost / Enrolment)', value: fmtInr(cpe) },
    {
      label: 'Spend vs Budget',
      value:
        roiPct == null ? '—' : `${roiPct > 0 ? '+' : ''}${roiPct}%`,
    },
    {
      label: 'Goal Progress (Enrolled)',
      value:
        enrolledPct == null
          ? '—'
          : `${enrolled}/${goalEnrolled} (${enrolledPct}%)`,
    },
  ];

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.label}>
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{i.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
