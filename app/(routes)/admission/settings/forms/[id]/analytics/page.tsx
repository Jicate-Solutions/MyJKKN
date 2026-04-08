'use client';

// app/(routes)/admission/settings/forms/[id]/analytics/page.tsx
// Form analytics dashboard — funnel, drop-off, traffic, devices
// Added: 2026-04-08

import { use as usePromise } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useAdmissionForm } from '@/hooks/admission/use-admission-forms';
import {
  useFormAnalyticsSummary,
  useFieldDropOff,
  useFormTrafficSources,
  useFormDeviceBreakdown,
} from '@/hooks/admission/use-form-analytics';
import { ArrowLeft, Eye, MousePointerClick, Send, TrendingUp } from 'lucide-react';

function AnalyticsContent({ formId }: { formId: string }) {
  const { data: form } = useAdmissionForm(formId);
  const { data: summary, isLoading: summaryLoading } = useFormAnalyticsSummary(formId);
  const { data: dropOff = [], isLoading: dropOffLoading } = useFieldDropOff(formId);
  const { data: traffic = [] } = useFormTrafficSources(formId);
  const { data: devices = [] } = useFormDeviceBreakdown(formId);

  const getDropOffColor = (rate: number) => {
    if (rate < 5) return 'text-green-600';
    if (rate < 15) return 'text-amber-600';
    return 'text-red-600';
  };

  const getDropOffBg = (rate: number) => {
    if (rate < 5) return 'bg-green-500';
    if (rate < 15) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <ContentLayout title="Form Analytics">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/settings/forms">Forms</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/admission/settings/forms/${formId}`}>
                  {form?.name || 'Form'}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Analytics</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Link href={`/admission/settings/forms/${formId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Builder
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Analytics: {form?.name || '...'}</h1>
          <p className="text-muted-foreground">
            Conversion funnel, field drop-off, and traffic insights
          </p>
        </div>

        {/* Key metrics */}
        {summaryLoading || !summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              icon={Eye}
              label="Form Views"
              value={summary.total_views}
              color="text-blue-600"
              bg="bg-blue-100 dark:bg-blue-900/30"
            />
            <MetricCard
              icon={MousePointerClick}
              label="Started"
              value={summary.total_starts}
              color="text-amber-600"
              bg="bg-amber-100 dark:bg-amber-900/30"
            />
            <MetricCard
              icon={Send}
              label="Submissions"
              value={summary.total_submissions}
              color="text-green-600"
              bg="bg-green-100 dark:bg-green-900/30"
            />
            <MetricCard
              icon={TrendingUp}
              label="Conversion Rate"
              value={`${summary.overall_conversion_rate}%`}
              color="text-purple-600"
              bg="bg-purple-100 dark:bg-purple-900/30"
            />
          </div>
        )}

        {/* Conversion Funnel */}
        {summary && (
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FunnelStage label="Form Viewed" count={summary.total_views} max={summary.total_views} />
              <FunnelStage
                label="Form Started"
                count={summary.total_starts}
                max={summary.total_views}
                rate={summary.view_to_start_rate}
              />
              <FunnelStage
                label="Form Submitted"
                count={summary.total_submissions}
                max={summary.total_views}
                rate={summary.start_to_submit_rate}
              />
            </CardContent>
          </Card>
        )}

        {/* Field Drop-Off */}
        <Card>
          <CardHeader>
            <CardTitle>Field Drop-Off Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {dropOffLoading ? (
              <Skeleton className="h-40" />
            ) : dropOff.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No interaction data yet. Drop-off appears once users start filling the form.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                  <div className="col-span-5">Field</div>
                  <div className="col-span-2 text-right">Started</div>
                  <div className="col-span-2 text-right">Completed</div>
                  <div className="col-span-3 text-right">Drop-off</div>
                </div>
                {dropOff.map((row) => (
                  <div
                    key={row.field_key}
                    className="grid grid-cols-12 gap-2 text-sm py-2 border-b last:border-0"
                  >
                    <div className="col-span-5 truncate">{row.field_label}</div>
                    <div className="col-span-2 text-right">{row.started}</div>
                    <div className="col-span-2 text-right">{row.completed}</div>
                    <div className={`col-span-3 text-right font-medium ${getDropOffColor(row.drop_off_rate)}`}>
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${getDropOffBg(row.drop_off_rate)}`}
                            style={{ width: `${Math.min(row.drop_off_rate, 100)}%` }}
                          />
                        </div>
                        {row.drop_off_rate}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Traffic Sources & Devices */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Traffic Sources</CardTitle>
            </CardHeader>
            <CardContent>
              {traffic.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {traffic.map((src) => (
                    <div key={src.source}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize">{src.source.replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground">
                          {src.count} ({src.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${src.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Device Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {devices.map((d) => (
                    <div key={d.device_type}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize">{d.device_type}</span>
                        <span className="text-muted-foreground">
                          {d.count} ({d.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${d.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: any;
  label: string;
  value: number | string;
  color: string;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelStage({
  label,
  count,
  max,
  rate,
}: {
  label: string;
  count: number;
  max: number;
  rate?: number;
}) {
  const width = max > 0 ? Math.max((count / max) * 100, 2) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {count.toLocaleString()}
          {rate !== undefined && ` · ${rate}% from previous`}
        </span>
      </div>
      <div className="h-6 bg-muted rounded overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export default function FormAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = usePromise(params);
  return (
    <AdmissionErrorBoundary>
      <PermissionGuard module="admission" action="view">
        <AnalyticsContent formId={id} />
      </PermissionGuard>
    </AdmissionErrorBoundary>
  );
}
