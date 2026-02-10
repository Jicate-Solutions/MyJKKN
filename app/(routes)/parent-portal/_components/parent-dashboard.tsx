'use client';

import { useRouter } from 'next/navigation';
import { Loader2, Users, Calendar, CreditCard, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useParentDashboard } from '@/hooks/parent-portal';
import { ensureArray } from '@/lib/utils/validation';
import { LearnerCard } from './learner-card';
import { DashboardOverview } from './dashboard-overview';
import { SkillProgressionSection } from './skill-progression-section';

export function ParentDashboardClient() {
  const router = useRouter();
  const { data: dashboardData, isLoading, error } = useParentDashboard();

  const handleViewLearnerDetails = (learnerId: string) => {
    router.push(`/parent-portal/learner/${learnerId}`);
  };

  const handleViewAllFees = () => {
    router.push('/parent-portal/fees');
  };

  const handleViewMessages = () => {
    router.push('/parent-portal/communication');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-sm text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">Failed to load dashboard</p>
          <p className="mt-1 text-sm text-gray-500">
            {error?.message || 'An error occurred'}
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-4"
            variant="outline"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const learners = ensureArray(dashboardData.learners, []);

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {dashboardData.parent.name?.split(' ')[0] || 'Parent'}!
        </h1>
        <p className="mt-1 text-gray-600">
          Here&apos;s an overview of your children&apos;s progress and activities.
        </p>
      </div>

      {/* Overview Stats */}
      <DashboardOverview data={dashboardData} />

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer transition-all hover:shadow-md" onClick={() => handleViewMessages()}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-blue-100 p-3">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Messages</p>
              <p className="text-xs text-gray-500">View communications</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-all hover:shadow-md" onClick={() => handleViewAllFees()}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-green-100 p-3">
              <CreditCard className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Fee Payments</p>
              <p className="text-xs text-gray-500">Manage fees</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-all hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-purple-100 p-3">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Events</p>
              <p className="text-xs text-gray-500">Upcoming activities</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-all hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-full bg-orange-100 p-3">
              <Users className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">My Children</p>
              <p className="text-xs text-gray-500">{learners.length} linked</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Learner Cards */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Your Children</h2>
          {learners.length > 0 && (
            <p className="text-sm text-gray-500">{learners.length} learner{learners.length !== 1 ? 's' : ''}</p>
          )}
        </div>

        <div className="space-y-4">
          {learners.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-gray-400" />
                <p className="mt-4 text-lg font-medium text-gray-600">
                  No learners linked yet
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Contact your institution to link your children to your account
                </p>
              </CardContent>
            </Card>
          ) : (
            learners.map((learnerData) => (
              <LearnerCard
                key={learnerData.learner.id}
                data={learnerData}
                onViewDetails={handleViewLearnerDetails}
              />
            ))
          )}
        </div>
      </div>

      {/* Skills & Growth per Learner */}
      {learners.length > 0 && learners.map((learnerData) => (
        <SkillProgressionSection
          key={`skills-${learnerData.learner.id}`}
          learnerId={learnerData.learner.id}
          learnerName={`${learnerData.learner.first_name} ${learnerData.learner.last_name}`}
        />
      ))}

      {/* Recent Activity */}
      {dashboardData.recent_activities && dashboardData.recent_activities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboardData.recent_activities.slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="rounded-full bg-gray-100 p-2">
                    <Calendar className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {activity.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {activity.created_at ? new Date(activity.created_at).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
