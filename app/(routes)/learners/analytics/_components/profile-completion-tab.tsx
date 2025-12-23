// ============================================
// PROFILE COMPLETION TAB - COMPREHENSIVE
// ============================================
// Created: 2025-01-23
// Purpose: Profile completion analysis, missing fields, completion tiers
// Charts: Completion funnel, missing fields bar chart, tier pie chart
// ============================================

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ListChecks
} from 'lucide-react';
import type { LearnerDashboardStats, LearnerDashboardFilters } from '@/types/learner-dashboard';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface ProfileCompletionTabProps {
  data: LearnerDashboardStats;
  filters: LearnerDashboardFilters;
}

// Chart color palette
const CHART_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f43f5e'  // rose
];

// Tier colors
const TIER_COLORS = {
  excellent: '#22c55e',  // green
  good: '#3b82f6',       // blue
  needsWork: '#eab308',  // yellow
  critical: '#ef4444'    // red
};

export function ProfileCompletionTab({ data, filters }: ProfileCompletionTabProps) {
  const { profileCompletion } = data;

  // Calculate completion percentage
  const completionRate = profileCompletion.completionRate;

  // Prepare missing fields data for chart
  const missingFieldsData = [
    {
      name: 'College Email',
      count: profileCompletion.missingCollegeEmail,
      percentage: (profileCompletion.missingCollegeEmail / profileCompletion.totalProfiles) * 100
    },
    {
      name: 'Academic Year',
      count: profileCompletion.missingAcademicYear,
      percentage: (profileCompletion.missingAcademicYear / profileCompletion.totalProfiles) * 100
    },
    {
      name: 'Semester',
      count: profileCompletion.missingSemester,
      percentage: (profileCompletion.missingSemester / profileCompletion.totalProfiles) * 100
    },
    {
      name: 'Section',
      count: profileCompletion.missingSection,
      percentage: (profileCompletion.missingSection / profileCompletion.totalProfiles) * 100
    }
  ].filter(field => field.count > 0);

  // Prepare completion tiers data for pie chart
  const tierData = [
    {
      name: 'Excellent (100%)',
      value: profileCompletion.excellent,
      color: TIER_COLORS.excellent,
      percentage: (profileCompletion.excellent / profileCompletion.totalProfiles) * 100
    },
    {
      name: 'Good (80-99%)',
      value: profileCompletion.good,
      color: TIER_COLORS.good,
      percentage: (profileCompletion.good / profileCompletion.totalProfiles) * 100
    },
    {
      name: 'Needs Work (50-79%)',
      value: profileCompletion.needsWork,
      color: TIER_COLORS.needsWork,
      percentage: (profileCompletion.needsWork / profileCompletion.totalProfiles) * 100
    },
    {
      name: 'Critical (<50%)',
      value: profileCompletion.critical,
      color: TIER_COLORS.critical,
      percentage: (profileCompletion.critical / profileCompletion.totalProfiles) * 100
    }
  ].filter(tier => tier.value > 0);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-1">{payload[0].payload.name}</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Count:</span>
            <span className="font-medium">{payload[0].value.toLocaleString()}</span>
            <Badge variant="secondary" className="text-xs">
              {payload[0].payload.percentage.toFixed(1)}%
            </Badge>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Overall Completion Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {completionRate.toFixed(1)}%
            </div>
            <Progress value={completionRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {profileCompletion.completeProfiles.toLocaleString()} of {profileCompletion.totalProfiles.toLocaleString()} complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Complete Profiles</CardTitle>
            <UserCheck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{profileCompletion.completeProfiles.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              100% profile completion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Incomplete Profiles</CardTitle>
            <XCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{profileCompletion.incompleteProfiles.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Missing required fields
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Activation</CardTitle>
            <TrendingUp className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {profileCompletion.awaitingActivation.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Complete & ready for activation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Awaiting Activation Alert */}
      {profileCompletion.awaitingActivation > 0 && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
                  {profileCompletion.awaitingActivation} Profile{profileCompletion.awaitingActivation > 1 ? 's' : ''} Ready for Activation
                </h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                  These profiles have all required information and are ready to be activated.
                  Review and activate them from the learner profiles page.
                </p>
              </div>
              <Button variant="outline" size="sm" className="flex-shrink-0">
                View Profiles
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion Tiers & Missing Fields Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Completion Tiers */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-blue-600" />
              <CardTitle>Completion Tiers</CardTitle>
            </div>
            <CardDescription>
              Profile completion quality distribution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tierData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ percent }) => (percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '')}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tierData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value, entry: any) => (
                    <span className="text-sm">
                      {value}: {entry.payload.value.toLocaleString()}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Tier List */}
            <div className="mt-4 border-t pt-4 space-y-2">
              {tierData.map((tier) => (
                <div key={tier.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: tier.color }}
                    />
                    <span>{tier.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tier.value.toLocaleString()}</span>
                    <Badge variant="secondary" className="text-xs">
                      {tier.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Missing Fields Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle>Missing Fields Breakdown</CardTitle>
            </div>
            <CardDescription>
              Most commonly missing required fields
            </CardDescription>
          </CardHeader>
          <CardContent>
            {missingFieldsData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={missingFieldsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {missingFieldsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Missing Fields List */}
                <div className="mt-4 border-t pt-4 space-y-2">
                  {missingFieldsData.map((field, index) => (
                    <div key={field.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span>{field.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{field.count.toLocaleString()}</span>
                        <Badge variant="secondary" className="text-xs">
                          {field.percentage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 mb-2 text-green-500" />
                  <p>No missing fields!</p>
                  <p className="text-sm mt-2">All profiles have complete required fields</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profile Completion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Completion Funnel</CardTitle>
          <CardDescription>
            Step-by-step completion breakdown by required fields
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Step 1: College Email */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">College Email</span>
                <span className="text-muted-foreground">
                  {(profileCompletion.totalProfiles - profileCompletion.missingCollegeEmail).toLocaleString()} / {profileCompletion.totalProfiles.toLocaleString()}
                </span>
              </div>
              <Progress
                value={((profileCompletion.totalProfiles - profileCompletion.missingCollegeEmail) / profileCompletion.totalProfiles) * 100}
                className="h-3"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {(((profileCompletion.totalProfiles - profileCompletion.missingCollegeEmail) / profileCompletion.totalProfiles) * 100).toFixed(1)}% complete
                </span>
                {profileCompletion.missingCollegeEmail > 0 && (
                  <span className="text-orange-600">
                    {profileCompletion.missingCollegeEmail.toLocaleString()} missing
                  </span>
                )}
              </div>
            </div>

            {/* Step 2: Academic Year */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Academic Year</span>
                <span className="text-muted-foreground">
                  {(profileCompletion.totalProfiles - profileCompletion.missingAcademicYear).toLocaleString()} / {profileCompletion.totalProfiles.toLocaleString()}
                </span>
              </div>
              <Progress
                value={((profileCompletion.totalProfiles - profileCompletion.missingAcademicYear) / profileCompletion.totalProfiles) * 100}
                className="h-3"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {(((profileCompletion.totalProfiles - profileCompletion.missingAcademicYear) / profileCompletion.totalProfiles) * 100).toFixed(1)}% complete
                </span>
                {profileCompletion.missingAcademicYear > 0 && (
                  <span className="text-orange-600">
                    {profileCompletion.missingAcademicYear.toLocaleString()} missing
                  </span>
                )}
              </div>
            </div>

            {/* Step 3: Semester */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Semester</span>
                <span className="text-muted-foreground">
                  {(profileCompletion.totalProfiles - profileCompletion.missingSemester).toLocaleString()} / {profileCompletion.totalProfiles.toLocaleString()}
                </span>
              </div>
              <Progress
                value={((profileCompletion.totalProfiles - profileCompletion.missingSemester) / profileCompletion.totalProfiles) * 100}
                className="h-3"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {(((profileCompletion.totalProfiles - profileCompletion.missingSemester) / profileCompletion.totalProfiles) * 100).toFixed(1)}% complete
                </span>
                {profileCompletion.missingSemester > 0 && (
                  <span className="text-orange-600">
                    {profileCompletion.missingSemester.toLocaleString()} missing
                  </span>
                )}
              </div>
            </div>

            {/* Step 4: Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Section</span>
                <span className="text-muted-foreground">
                  {(profileCompletion.totalProfiles - profileCompletion.missingSection).toLocaleString()} / {profileCompletion.totalProfiles.toLocaleString()}
                </span>
              </div>
              <Progress
                value={((profileCompletion.totalProfiles - profileCompletion.missingSection) / profileCompletion.totalProfiles) * 100}
                className="h-3"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {(((profileCompletion.totalProfiles - profileCompletion.missingSection) / profileCompletion.totalProfiles) * 100).toFixed(1)}% complete
                </span>
                {profileCompletion.missingSection > 0 && (
                  <span className="text-orange-600">
                    {profileCompletion.missingSection.toLocaleString()} missing
                  </span>
                )}
              </div>
            </div>

            {/* Final: Complete Profiles */}
            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Complete Profiles (All Fields)</span>
                <span className="text-green-600">
                  {profileCompletion.completeProfiles.toLocaleString()} / {profileCompletion.totalProfiles.toLocaleString()}
                </span>
              </div>
              <Progress
                value={completionRate}
                className="h-4"
              />
              <div className="flex justify-between text-xs">
                <span className="text-green-600 font-medium">
                  {completionRate.toFixed(1)}% complete
                </span>
                {profileCompletion.incompleteProfiles > 0 && (
                  <span className="text-muted-foreground">
                    {profileCompletion.incompleteProfiles.toLocaleString()} incomplete
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
          <CardDescription>
            Actions to improve profile completion rates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {profileCompletion.missingCollegeEmail > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/10">
                <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {profileCompletion.missingCollegeEmail} learner{profileCompletion.missingCollegeEmail > 1 ? 's' : ''} missing college email
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Contact these learners to provide their institutional email addresses
                  </p>
                </div>
              </div>
            )}

            {profileCompletion.missingAcademicYear > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/10">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                    {profileCompletion.missingAcademicYear} learner{profileCompletion.missingAcademicYear > 1 ? 's' : ''} missing academic year
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                    Assign learners to the appropriate academic year
                  </p>
                </div>
              </div>
            )}

            {profileCompletion.critical > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/10">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900 dark:text-red-100">
                    {profileCompletion.critical} profile{profileCompletion.critical > 1 ? 's' : ''} in critical state (&lt;50% complete)
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                    Prioritize these profiles for immediate data completion
                  </p>
                </div>
              </div>
            )}

            {profileCompletion.awaitingActivation > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/10">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    {profileCompletion.awaitingActivation} profile{profileCompletion.awaitingActivation > 1 ? 's' : ''} ready for activation
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    Review and activate these complete profiles to update their lifecycle status
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
