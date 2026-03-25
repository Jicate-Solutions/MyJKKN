'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplateStats } from '@/hooks/use-template-stats';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Star,
  TrendingUp,
  Users,
  Calendar,
  Building,
  Award,
  Clock,
  Activity
} from 'lucide-react';

export function TemplateStatsCard() {
  const { isSuperAdmin } = usePermissions();
  const { data: stats, isLoading, error } = useTemplateStats();

  if (isLoading) {
    return (
      <>
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-sm border-0 bg-gradient-to-br from-gray-50 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </>
    );
  }

  if (error || !stats) {
    return (
      <Card className="shadow-sm border-0 bg-gradient-to-br from-red-50 to-white">
        <CardContent className="p-4 md:p-6">
          <div className="text-sm text-muted-foreground text-center">
            Unable to load template statistics
          </div>
        </CardContent>
      </Card>
    );
  }

  const statCards = [
    {
      title: 'Total Templates',
      value: stats.totalTemplates.toString(),
      description: `${stats.activeTemplates} active`,
      icon: Star,
      trend: stats.totalTemplates > 0 ? 'positive' : 'neutral',
      color: 'text-blue-600'
    },
    {
      title: 'Total Usage',
      value: stats.totalUsage.toString(),
      description: `${stats.usageThisMonth} this month`,
      icon: Users,
      trend: stats.usageThisMonth > 0 ? 'positive' : 'neutral',
      color: 'text-green-600'
    },
    {
      title: 'Most Popular',
      value: stats.mostPopularTemplate ? '1' : '0',
      description: stats.mostPopularTemplate?.template_name || 'No templates yet',
      icon: Award,
      trend: 'neutral',
      color: 'text-purple-600'
    },
    {
      title: 'Categories',
      value: stats.categoriesCount.toString(),
      description: `${stats.templatesThisWeek} added this week`,
      icon: Building,
      trend: stats.templatesThisWeek > 0 ? 'positive' : 'neutral',
      color: 'text-orange-600'
    }
  ];

  // If not super admin, show only relevant stats
  const visibleStats = isSuperAdmin ? statCards : statCards.filter((_, index) => index < 3);

  return (
    <>
      {visibleStats.map((stat, index) => {
        const Icon = stat.icon;
        const gradients = [
          'from-blue-500 to-blue-600',
          'from-green-500 to-green-600', 
          'from-purple-500 to-purple-600',
          'from-orange-500 to-orange-600'
        ];
        return (
          <Card key={stat.title} className="shadow-sm border-0 bg-gradient-to-br from-white to-gray-50 hover:shadow-md transition-all duration-200 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs sm:text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg bg-gradient-to-r ${gradients[index]} shadow-sm`}>
                <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1">
                <div className="text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground truncate">
                    {stat.description}
                  </p>
                  {stat.trend === 'positive' && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-green-100 rounded-full">
                      <TrendingUp className="h-2.5 w-2.5 text-green-600" />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Additional insights for super admin - Responsive grid */}
      {isSuperAdmin && (
        <div className="col-span-full grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 mt-4">
          <Card className="shadow-sm border-0 bg-gradient-to-br from-indigo-50 to-white hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-indigo-700">
                <Activity className="h-4 w-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {stats.recentTemplates?.slice(0, 3).map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-2 rounded-lg bg-white/50 border border-indigo-100">
                    <span className="text-sm font-medium truncate text-gray-700">{template.template_name}</span>
                    <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700 border-indigo-200">
                      {template.usage_count || 0} uses
                    </Badge>
                  </div>
                ))}
                {(!stats.recentTemplates || stats.recentTemplates.length === 0) && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No recent template activity
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-0 bg-gradient-to-br from-cyan-50 to-white hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-cyan-700">
                <Calendar className="h-4 w-4" />
                Usage Trends
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/50 border border-cyan-100">
                  <span className="text-sm text-gray-700">This Week</span>
                  <span className="font-bold text-cyan-700">{stats.usageThisWeek}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/50 border border-cyan-100">
                  <span className="text-sm text-gray-700">This Month</span>
                  <span className="font-bold text-cyan-700">{stats.usageThisMonth}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/50 border border-cyan-100">
                  <span className="text-sm text-gray-700">Average per Template</span>
                  <span className="font-bold text-cyan-700">
                    {stats.totalTemplates > 0 
                      ? Math.round((stats.totalUsage / stats.totalTemplates) * 10) / 10
                      : 0
                    }
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}