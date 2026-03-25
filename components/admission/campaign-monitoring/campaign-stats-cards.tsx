'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Megaphone,
  Play,
  CheckCircle2,
  Pause,
  FileEdit,
  Users,
  UserCheck,
  TrendingUp,
} from 'lucide-react';
import type { CampaignStats } from '@/lib/services/admission/campaign-monitoring-service';

interface CampaignStatsCardsProps {
  stats: CampaignStats | null;
  isLoading: boolean;
}

interface StatCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

function StatCard({ title, value, description, icon: Icon, color, bgColor }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32 mt-2" />
      </CardContent>
    </Card>
  );
}

export function CampaignStatsCards({ stats, isLoading }: CampaignStatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Campaigns"
          value={0}
          description="All campaigns"
          icon={Megaphone}
          color="text-blue-600"
          bgColor="bg-blue-100"
        />
        <StatCard
          title="Active Campaigns"
          value={0}
          description="Currently running"
          icon={Play}
          color="text-green-600"
          bgColor="bg-green-100"
        />
        <StatCard
          title="Leads Targeted"
          value={0}
          description="Total reach"
          icon={Users}
          color="text-purple-600"
          bgColor="bg-purple-100"
        />
        <StatCard
          title="Conversion Rate"
          value="0%"
          description="Re-engaged to converted"
          icon={TrendingUp}
          color="text-orange-600"
          bgColor="bg-orange-100"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Primary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Campaigns"
          value={stats.totalCampaigns}
          description={`${stats.activeCampaigns} active, ${stats.completedCampaigns} completed`}
          icon={Megaphone}
          color="text-blue-600"
          bgColor="bg-blue-100"
        />
        <StatCard
          title="Active Campaigns"
          value={stats.activeCampaigns}
          description="Currently running"
          icon={Play}
          color="text-green-600"
          bgColor="bg-green-100"
        />
        <StatCard
          title="Leads Targeted"
          value={stats.totalLeadsTargeted.toLocaleString()}
          description={`${stats.totalLeadsReEngaged.toLocaleString()} re-engaged`}
          icon={Users}
          color="text-purple-600"
          bgColor="bg-purple-100"
        />
        <StatCard
          title="Conversion Rate"
          value={`${stats.conversionRate.toFixed(1)}%`}
          description={`${stats.totalLeadsConverted.toLocaleString()} converted`}
          icon={TrendingUp}
          color="text-orange-600"
          bgColor="bg-orange-100"
        />
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium">{stats.completedCampaigns}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100">
              <Pause className="h-4 w-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium">{stats.pausedCampaigns}</p>
              <p className="text-xs text-muted-foreground">Paused</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100">
              <FileEdit className="h-4 w-4 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium">{stats.draftCampaigns}</p>
              <p className="text-xs text-muted-foreground">Drafts</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <UserCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium">{stats.totalLeadsReEngaged.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Re-engaged</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
