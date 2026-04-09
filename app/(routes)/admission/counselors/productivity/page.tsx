'use client';

import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useCounselorProductivity } from '@/hooks/admission/use-counselor-productivity';
import type { CounselorProductivityRow } from '@/hooks/admission/use-counselor-productivity';
import {
  Phone,
  PhoneOff,
  MessageCircle,
  TrendingUp,
  Clock,
  RefreshCw,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════════════════

function KPICard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: any;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-0.5">{value}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Hourly Heatmap Cell
// ═══════════════════════════════════════════════════════════════════════════

function HeatmapCell({ value, max }: { value: number; max: number }) {
  const intensity = max > 0 ? value / max : 0;
  const bg =
    intensity === 0
      ? 'bg-muted'
      : intensity < 0.25
        ? 'bg-green-100'
        : intensity < 0.5
          ? 'bg-green-200'
          : intensity < 0.75
            ? 'bg-green-400 text-white'
            : 'bg-green-600 text-white';

  return (
    <div
      className={cn('w-8 h-8 rounded flex items-center justify-center text-[10px] font-medium', bg)}
      title={`${value} actions`}
    >
      {value > 0 ? value : ''}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

function ProductivityContent() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const { isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : selectedInstitutionId;

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const { data, isLoading, dataUpdatedAt } = useCounselorProductivity(institutionId, date);

  const team = data?.team;
  const counselors = data?.counselors || [];

  // Max hourly value for heatmap scaling
  const maxHourly = Math.max(1, ...counselors.flatMap((c) => c.hourly));

  const lastUpdated = dataUpdatedAt
    ? `${Math.round((Date.now() - dataUpdatedAt) / 1000)}s ago`
    : '';

  return (
    <ContentLayout title="Counselor Productivity">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/admission/counselors">Counselors</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Productivity</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header — date picker + refresh indicator */}
      <div className="flex items-center justify-between mt-4 mb-4">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin-slow" />
          Auto-refresh 60s {lastUpdated && `· Updated ${lastUpdated}`}
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4 pb-3"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <KPICard title="Calls Attempted" value={team?.callsAttempted ?? 0} icon={Phone} color="bg-blue-100 text-blue-600" />
          <KPICard title="Connected" value={team?.callsConnected ?? 0} icon={Phone} color="bg-green-100 text-green-600" />
          <KPICard title="Not Connected" value={team?.callsNotConnected ?? 0} icon={PhoneOff} color="bg-red-100 text-red-600" />
          <KPICard title="WhatsApp Sent" value={team?.whatsappSent ?? 0} icon={MessageCircle} color="bg-emerald-100 text-emerald-600" />
          <KPICard title="SMS Sent" value={team?.smsSent ?? 0} icon={MessageCircle} color="bg-violet-100 text-violet-600" />
          <KPICard title="Conversions" value={team?.conversions ?? 0} icon={TrendingUp} color="bg-amber-100 text-amber-600" />
          <KPICard title="Avg Response" value={team?.avgResponseMin ? `${team.avgResponseMin}m` : '-'} icon={Clock} color="bg-cyan-100 text-cyan-600" />
        </div>
      )}

      {/* Per-Counselor Table */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Per-Counselor Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : counselors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No counselors found for this institution.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-4">Counselor</th>
                    <th className="text-right py-2 px-2">Calls</th>
                    <th className="text-right py-2 px-2">Connected</th>
                    <th className="text-right py-2 px-2">WhatsApp</th>
                    <th className="text-right py-2 px-2">SMS</th>
                    <th className="text-right py-2 px-2">Conversions</th>
                    <th className="text-right py-2 px-2">Avg Resp</th>
                    <th className="text-right py-2 pl-2">Avg Call</th>
                  </tr>
                </thead>
                <tbody>
                  {counselors.map((c: CounselorProductivityRow) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">{c.name}</div>
                        {c.designation && <div className="text-xs text-muted-foreground">{c.designation}</div>}
                      </td>
                      <td className="text-right py-2.5 px-2 font-medium">{c.callsAttempted}</td>
                      <td className="text-right py-2.5 px-2">
                        <span className={c.callsConnected > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                          {c.callsConnected}
                        </span>
                      </td>
                      <td className="text-right py-2.5 px-2">{c.whatsappSent}</td>
                      <td className="text-right py-2.5 px-2">{c.smsSent}</td>
                      <td className="text-right py-2.5 px-2">
                        {c.conversions > 0 ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-700">{c.conversions}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="text-right py-2.5 px-2">
                        {c.avgResponseMin > 0 ? `${c.avgResponseMin}m` : '-'}
                      </td>
                      <td className="text-right py-2.5 pl-2">
                        {c.avgCallDuration > 0 ? `${Math.floor(c.avgCallDuration / 60)}m ${c.avgCallDuration % 60}s` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hourly Activity Heatmap */}
      {counselors.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hourly Activity Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1 pr-4 font-normal text-muted-foreground">Counselor</th>
                    {Array.from({ length: 11 }, (_, i) => (
                      <th key={i} className="text-center py-1 px-0.5 font-normal text-muted-foreground w-8">
                        {i + 9 > 12 ? `${i + 9 - 12}p` : i + 9 === 12 ? '12p' : `${i + 9}a`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {counselors.map((c: CounselorProductivityRow) => (
                    <tr key={c.id}>
                      <td className="py-1 pr-4 font-medium truncate max-w-[120px]">{c.name}</td>
                      {c.hourly.map((val: number, i: number) => (
                        <td key={i} className="py-1 px-0.5">
                          <HeatmapCell value={val} max={maxHourly} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </ContentLayout>
  );
}

export default function CounselorProductivityPage() {
  return (
    <PermissionGuard module="admission" action="counselors.view">
      <ProductivityContent />
    </PermissionGuard>
  );
}
