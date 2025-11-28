'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  UserCheck,
  TrendingUp,
  UserPlus,
  GraduationCap,
  Activity
} from 'lucide-react';
import { AdmissionDashboardAnalytics } from '@/types/admission';

interface OverviewTabProps {
  data: AdmissionDashboardAnalytics['overview'];
  metadata: AdmissionDashboardAnalytics['metadata'];
}

export function OverviewTab({ data, metadata }: OverviewTabProps) {
  // Combined Total Section
  const combinedStats = [
    {
      title: 'Combined Total',
      value: data.combinedTotal.toLocaleString(),
      icon: Users,
      description: 'All admissions + direct students',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Onboarded (Active)',
      value: data.onboarded.toLocaleString(),
      icon: UserCheck,
      description: `${data.onboardingRate.toFixed(1)}% of students`,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50'
    },
    {
      title: 'Direct Students',
      value: data.directStudents.toLocaleString(),
      icon: UserPlus,
      description: 'Added without admission',
      color: 'text-sky-600',
      bgColor: 'bg-sky-50'
    },
    {
      title: 'Onboarding Rate',
      value: `${data.onboardingRate.toFixed(1)}%`,
      icon: TrendingUp,
      description: 'Active / Total students',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
    }
  ];

  // Admission Pipeline Section
  const pipelineStats = [
    {
      title: 'Total Applications',
      value: data.totalAdmissions.toLocaleString(),
      icon: GraduationCap,
      description: 'From admissions table',
      color: 'text-violet-600'
    },
    {
      title: 'Pending',
      value: data.pending.toLocaleString(),
      icon: Clock,
      description: `${data.totalAdmissions > 0 ? ((data.pending / data.totalAdmissions) * 100).toFixed(1) : 0}% of applications`,
      color: 'text-yellow-600'
    },
    {
      title: 'Approved',
      value: data.approved.toLocaleString(),
      icon: CheckCircle,
      description: `${data.totalAdmissions > 0 ? ((data.approved / data.totalAdmissions) * 100).toFixed(1) : 0}% of applications`,
      color: 'text-green-600'
    },
    {
      title: 'Rejected',
      value: data.rejected.toLocaleString(),
      icon: XCircle,
      description: `${data.totalAdmissions > 0 ? ((data.rejected / data.totalAdmissions) * 100).toFixed(1) : 0}% of applications`,
      color: 'text-red-600'
    },
    {
      title: 'Waitlisted',
      value: data.waitlisted.toLocaleString(),
      icon: AlertCircle,
      description: `${data.totalAdmissions > 0 ? ((data.waitlisted / data.totalAdmissions) * 100).toFixed(1) : 0}% of applications`,
      color: 'text-orange-600'
    },
    {
      title: 'Enrolled',
      value: data.enrolled.toLocaleString(),
      icon: UserCheck,
      description: `${data.totalAdmissions > 0 ? ((data.enrolled / data.totalAdmissions) * 100).toFixed(1) : 0}% of applications`,
      color: 'text-purple-600'
    }
  ];

  // Performance metrics
  const performanceStats = [
    {
      title: 'Conversion Rate',
      value: `${data.conversionRate.toFixed(1)}%`,
      icon: TrendingUp,
      description: '(Approved + Enrolled) / Applications',
      color: 'text-indigo-600'
    },
    {
      title: 'Avg. Processing Time',
      value: `${data.avgProcessingDays.toFixed(1)} days`,
      icon: Clock,
      description: 'Application to decision',
      color: 'text-cyan-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Combined Analytics Section */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          Combined Overview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {combinedStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className={stat.bgColor}>
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
      </div>

      {/* Admission Pipeline Section */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-violet-600" />
          Admission Pipeline
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelineStats.map((stat) => {
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
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {performanceStats.map((stat) => {
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

      {/* Summary Card with Progress Bars */}
      <Card>
        <CardHeader>
          <CardTitle>Enrollment Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Combined Statistics</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Combined Total:
                    </span>
                    <span className="font-medium">
                      {data.combinedTotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      From Admissions:
                    </span>
                    <span className="font-medium">
                      {data.totalAdmissions.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Direct Students:
                    </span>
                    <span className="font-medium">
                      {data.directStudents.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Total Students:
                    </span>
                    <span className="font-medium">
                      {data.totalStudents.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Onboarding Status</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Onboarded (Active):
                    </span>
                    <span className="font-medium text-emerald-600">
                      {data.onboarded.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Onboarding Rate:
                    </span>
                    <span className="font-medium">
                      {data.onboardingRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Pending Profile:
                    </span>
                    <span className="font-medium text-amber-600">
                      {data.pendingProfile.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Admission Conversion:
                    </span>
                    <span className="font-medium">
                      {data.conversionRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="space-y-3 pt-4">
              {/* Admission Status Distribution */}
              {data.totalAdmissions > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Admission Status Distribution</span>
                    <span className="text-muted-foreground">
                      {data.totalAdmissions.toLocaleString()} applications
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden flex">
                    <div
                      className="bg-green-600 h-2.5"
                      style={{
                        width: `${(data.approved / data.totalAdmissions) * 100}%`
                      }}
                      title={`Approved: ${data.approved}`}
                    />
                    <div
                      className="bg-purple-600 h-2.5"
                      style={{
                        width: `${(data.enrolled / data.totalAdmissions) * 100}%`
                      }}
                      title={`Enrolled: ${data.enrolled}`}
                    />
                    <div
                      className="bg-yellow-600 h-2.5"
                      style={{
                        width: `${(data.pending / data.totalAdmissions) * 100}%`
                      }}
                      title={`Pending: ${data.pending}`}
                    />
                    <div
                      className="bg-orange-600 h-2.5"
                      style={{
                        width: `${(data.waitlisted / data.totalAdmissions) * 100}%`
                      }}
                      title={`Waitlisted: ${data.waitlisted}`}
                    />
                    <div
                      className="bg-red-600 h-2.5"
                      style={{
                        width: `${(data.rejected / data.totalAdmissions) * 100}%`
                      }}
                      title={`Rejected: ${data.rejected}`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground mt-2">
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
              )}

              {/* Student Onboarding Distribution */}
              {data.totalStudents > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Student Onboarding Status</span>
                    <span className="text-muted-foreground">
                      {data.totalStudents.toLocaleString()} students
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden flex">
                    <div
                      className="bg-emerald-600 h-2.5"
                      style={{ width: `${data.onboardingRate}%` }}
                      title={`Onboarded: ${data.onboarded}`}
                    />
                    <div
                      className="bg-gray-400 h-2.5"
                      style={{ width: `${100 - data.onboardingRate}%` }}
                      title={`Not Active: ${data.totalStudents - data.onboarded}`}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-emerald-600 rounded-sm" />
                      Onboarded (Active)
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-gray-400 rounded-sm" />
                      Not Active
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
