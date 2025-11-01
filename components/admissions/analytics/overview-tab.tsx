'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  UserCheck,
  TrendingUp
} from 'lucide-react';
import { AdmissionDashboardAnalytics } from '@/types/admission';

interface OverviewTabProps {
  data: AdmissionDashboardAnalytics['overview'];
  metadata: AdmissionDashboardAnalytics['metadata'];
}

export function OverviewTab({ data, metadata }: OverviewTabProps) {
  const stats = [
    {
      title: 'Total Applications',
      value: data.total.toLocaleString(),
      icon: Users,
      description: 'All time applications',
      color: 'text-blue-600'
    },
    {
      title: 'Pending',
      value: data.pending.toLocaleString(),
      icon: Clock,
      description: `${((data.pending / data.total) * 100).toFixed(1)}% of total`,
      color: 'text-yellow-600'
    },
    {
      title: 'Approved',
      value: data.approved.toLocaleString(),
      icon: CheckCircle,
      description: `${((data.approved / data.total) * 100).toFixed(1)}% of total`,
      color: 'text-green-600'
    },
    {
      title: 'Rejected',
      value: data.rejected.toLocaleString(),
      icon: XCircle,
      description: `${((data.rejected / data.total) * 100).toFixed(1)}% of total`,
      color: 'text-red-600'
    },
    {
      title: 'Waitlisted',
      value: data.waitlisted.toLocaleString(),
      icon: AlertCircle,
      description: `${((data.waitlisted / data.total) * 100).toFixed(1)}% of total`,
      color: 'text-orange-600'
    },
    {
      title: 'Enrolled',
      value: data.enrolled.toLocaleString(),
      icon: UserCheck,
      description: `${((data.enrolled / data.total) * 100).toFixed(1)}% of total`,
      color: 'text-purple-600'
    },
    {
      title: 'Conversion Rate',
      value: `${data.conversionRate.toFixed(1)}%`,
      icon: TrendingUp,
      description: 'Approved + Enrolled / Total',
      color: 'text-indigo-600'
    },
    {
      title: 'Avg. Processing Time',
      value: `${data.avgProcessingDays.toFixed(1)} days`,
      icon: Clock,
      description: 'From application to decision',
      color: 'text-cyan-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Application Processing</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Applications:</span>
                    <span className="font-medium">{data.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed:</span>
                    <span className="font-medium">
                      {(data.approved + data.rejected + data.enrolled).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pending Review:</span>
                    <span className="font-medium">{data.pending.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">On Waitlist:</span>
                    <span className="font-medium">{data.waitlisted.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Performance Metrics</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conversion Rate:</span>
                    <span className="font-medium text-green-600">
                      {data.conversionRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approval Rate:</span>
                    <span className="font-medium">
                      {((data.approved / data.total) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rejection Rate:</span>
                    <span className="font-medium">
                      {((data.rejected / data.total) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg. Processing:</span>
                    <span className="font-medium">
                      {data.avgProcessingDays.toFixed(1)} days
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="space-y-3 pt-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Application Status Distribution</span>
                  <span className="text-muted-foreground">
                    {data.total.toLocaleString()} total
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden flex">
                  <div
                    className="bg-green-600 h-2.5 transition-all"
                    style={{ width: `${(data.approved / data.total) * 100}%` }}
                    title={`Approved: ${data.approved}`}
                  />
                  <div
                    className="bg-purple-600 h-2.5 transition-all"
                    style={{ width: `${(data.enrolled / data.total) * 100}%` }}
                    title={`Enrolled: ${data.enrolled}`}
                  />
                  <div
                    className="bg-yellow-600 h-2.5 transition-all"
                    style={{ width: `${(data.pending / data.total) * 100}%` }}
                    title={`Pending: ${data.pending}`}
                  />
                  <div
                    className="bg-orange-600 h-2.5 transition-all"
                    style={{ width: `${(data.waitlisted / data.total) * 100}%` }}
                    title={`Waitlisted: ${data.waitlisted}`}
                  />
                  <div
                    className="bg-red-600 h-2.5 transition-all"
                    style={{ width: `${(data.rejected / data.total) * 100}%` }}
                    title={`Rejected: ${data.rejected}`}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-600 rounded-sm" />
                    Approved
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-purple-600 rounded-sm" />
                    Enrolled
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-600 rounded-sm" />
                    Pending
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-orange-600 rounded-sm" />
                    Waitlisted
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-600 rounded-sm" />
                    Rejected
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
