'use client';

import { Users, UserCheck, Laptop, Building2, FileCheck, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { DashboardKPIs } from '@/lib/services/startup-studio/event-analytics-service';

interface Props {
  kpis: DashboardKPIs;
}

interface KPICardProps {
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

function KPICard({ label, value, subtitle, icon, iconBg, iconColor }: KPICardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>
          </div>
          <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg}`}>
            <div className={iconColor}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsKPICards({ kpis }: Props) {
  const checkInRate =
    kpis.totalTeams > 0 ? Math.round((kpis.checkedInTeams / kpis.totalTeams) * 100) : 0;
  const laptopRate =
    kpis.totalMembers > 0 ? Math.round((kpis.membersWithLaptops / kpis.totalMembers) * 100) : 0;
  const submissionRate =
    kpis.totalTeams > 0 ? Math.round((kpis.submissionsCount / kpis.totalTeams) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <KPICard
        label="Teams Registered"
        value={kpis.totalTeams}
        subtitle={`${kpis.checkedInTeams} checked in (${checkInRate}%)`}
        icon={<Users className="h-4 w-4" />}
        iconBg="bg-blue-100 dark:bg-blue-900/30"
        iconColor="text-blue-600 dark:text-blue-400"
      />
      <KPICard
        label="Total Participants"
        value={kpis.totalMembers}
        subtitle={`${kpis.membersWithLaptops} with laptops (${laptopRate}%)`}
        icon={<UserCheck className="h-4 w-4" />}
        iconBg="bg-green-100 dark:bg-green-900/30"
        iconColor="text-green-600 dark:text-green-400"
      />
      <KPICard
        label="Laptop Coverage"
        value={`${laptopRate}%`}
        subtitle={`${kpis.membersWithLaptops} of ${kpis.totalMembers} members`}
        icon={<Laptop className="h-4 w-4" />}
        iconBg="bg-purple-100 dark:bg-purple-900/30"
        iconColor="text-purple-600 dark:text-purple-400"
      />
      <KPICard
        label="Institutions"
        value={kpis.institutionsCount}
        subtitle="Colleges represented"
        icon={<Building2 className="h-4 w-4" />}
        iconBg="bg-orange-100 dark:bg-orange-900/30"
        iconColor="text-orange-600 dark:text-orange-400"
      />
      <KPICard
        label="Submissions"
        value={kpis.submissionsCount}
        subtitle={`${submissionRate}% of teams submitted`}
        icon={<FileCheck className="h-4 w-4" />}
        iconBg="bg-cyan-100 dark:bg-cyan-900/30"
        iconColor="text-cyan-600 dark:text-cyan-400"
      />
      <KPICard
        label="Check-ins"
        value={kpis.checkedInTeams}
        subtitle={`${checkInRate}% check-in rate`}
        icon={<TrendingUp className="h-4 w-4" />}
        iconBg="bg-pink-100 dark:bg-pink-900/30"
        iconColor="text-pink-600 dark:text-pink-400"
      />
    </div>
  );
}
