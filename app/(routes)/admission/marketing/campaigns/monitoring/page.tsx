'use client';

import Link from 'next/link';
import {
  useCampaigns,
  useCampaignsOverview,
} from '@/hooks/admission/use-campaigns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function CampaignsMonitoringPage() {
  const { data: campaigns } = useCampaigns({ status: 'active' });
  const { data: overview } = useCampaignsOverview();

  return (
    <PermissionGuard module="admission.campaigns" action="view">
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Campaign Monitoring</h1>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-semibold">
                {overview?.total_active ?? '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                Total clicks (30d)
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {(overview?.total_clicks ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                Total captures (30d)
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {(overview?.total_captures ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            {(campaigns ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active campaigns. Create one from the{' '}
                <Link
                  href="/admission/marketing/campaigns"
                  className="underline"
                >
                  Campaigns list
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {(campaigns ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admission/marketing/campaigns/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="ml-2 text-sm text-muted-foreground">
                      ({c.source})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
