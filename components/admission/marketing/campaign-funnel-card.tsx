'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { CampaignFunnel } from '@/types/admission/campaign';

interface Props {
  funnel: CampaignFunnel | undefined;
  loading?: boolean;
}

const STAGES = [
  { key: 'clicks', label: 'Clicks', rateKey: null as const },
  { key: 'captures', label: 'Captures', rateKey: 'click_to_capture' as const },
  { key: 'qualified', label: 'Qualified', rateKey: 'capture_to_qual' as const },
  { key: 'applied', label: 'Applied', rateKey: 'qual_to_applied' as const },
  { key: 'enrolled', label: 'Enrolled', rateKey: 'applied_to_enrol' as const },
] as const;

export function CampaignFunnelCard({ funnel, loading }: Props) {
  if (loading || !funnel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
            {STAGES.map((s) => (
              <div key={s.key} className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-12 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(
    ...STAGES.map((s) => funnel.stages[s.key as keyof typeof funnel.stages]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funnel — {funnel.attribution_mode}-touch</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
          {STAGES.map((s) => {
            const count =
              funnel.stages[s.key as keyof typeof funnel.stages];
            const rate = s.rateKey ? funnel.rates[s.rateKey] : null;
            const widthPct = maxValue > 0 ? (count / maxValue) * 100 : 0;
            return (
              <div
                key={s.key}
                className="rounded-md border bg-card/50 p-3 space-y-1"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {count.toLocaleString()}
                </p>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                {rate !== null && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    <span aria-hidden="true">↳</span> {rate}% conv.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
