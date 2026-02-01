'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useParentDashboard } from '@/hooks/parent-portal';
import {
  useParentCommunications,
  useMarkCommunicationRead,
} from '@/hooks/parent-portal';
import { useSubmitNPSResponse } from '@/hooks/stakeholder-nps';
import { ensureArray, ensureNumber } from '@/lib/utils/validation';
import { ParentHeader } from './parent-header';
import { DashboardOverview } from './dashboard-overview';
import { LearnerCard } from './learner-card';
import { CommunicationList } from './communication-list';
import { NPSSurveyPrompt } from './nps-survey-prompt';
import type { NPSSurvey } from '@/types/stakeholder-nps';

// For demo purposes - in production, this would come from auth context
const DEMO_PARENT_ID = 'demo-parent-id';

export function ParentPortalClient() {
  const router = useRouter();
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  const [activeSurvey, setActiveSurvey] = useState<NPSSurvey | null>(null);

  // Authentication is now handled server-side via httpOnly cookies
  // The dashboard hook will automatically validate the session
  const { data: dashboardData, isLoading, error } = useParentDashboard();

  // Check authentication status
  useEffect(() => {
    if (!isLoading && error) {
      // If error is 401, redirect to login
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Authentication') || errorMessage.includes('401')) {
        router.push('/auth/parent/login');
      }
    }
    if (!isLoading) {
      setIsAuthChecked(true);
    }
  }, [isLoading, error, router]);

  // Get institution_id from parent profile
  const institutionId = dashboardData?.parent?.institution_id || '';

  const { data: communications } = useParentCommunications({
    institution_id: institutionId,
    limit: 5,
  });

  const { mutate: markRead } = useMarkCommunicationRead();
  const { submit: submitNPS } = useSubmitNPSResponse();

  // Show survey prompt if there are pending surveys
  useEffect(() => {
    // SAFETY: Ensure pending_surveys is an array
    const pendingSurveys = ensureArray(dashboardData?.pending_surveys, []);

    if (pendingSurveys.length > 0 && !activeSurvey) {
      // Show the first pending survey after a short delay
      const timer = setTimeout(() => {
        setActiveSurvey(pendingSurveys[0]);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [dashboardData?.pending_surveys, activeSurvey]);

  const handleLogout = async () => {
    // Call logout endpoint to revoke session
    await fetch('/api/parent-portal/auth/logout', {
      method: 'POST',
      credentials: 'include', // Include cookies
    });
    router.push('/auth/parent/login');
  };

  const handleViewMessages = () => {
    router.push('/parent-portal/communication');
  };

  const handleViewProfile = () => {
    // TODO: Implement profile page
    toast.success('Profile settings coming soon');
  };

  const handleViewLearnerDetails = (learnerId: string) => {
    router.push(`/parent-portal/learner/${learnerId}`);
  };

  const handleMarkRead = (id: string) => {
    markRead({ id });
  };

  const handleSurveySubmit = (surveyId: string, score: number, feedback: string) => {
    if (dashboardData?.parent?.id) {
      submitNPS(
        {
          survey_id: surveyId,
          respondent_id: dashboardData.parent.id,
          respondent_type: 'parent',
          nps_score: score,
          additional_feedback: feedback,
        },
        {
          onSuccess: () => {
            toast.success('Thank you for your feedback!');
            setActiveSurvey(null);
          },
        }
      );
    }
  };

  if (!isAuthChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-sm text-primary underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ParentHeader
        parent={dashboardData.parent}
        unreadCount={dashboardData.unread_messages}
        onLogout={handleLogout}
        onViewMessages={handleViewMessages}
        onViewProfile={handleViewProfile}
      />

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Welcome */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome back, {dashboardData.parent.name.split(' ')[0]}!
          </h2>
          <p className="text-gray-600">
            Here&apos;s an overview of your children&apos;s progress.
          </p>
        </div>

        {/* Overview Stats */}
        <DashboardOverview data={dashboardData} />

        {/* Main Content */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Learner Cards */}
          <div className="lg:col-span-2">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Your Children
            </h3>
            <div className="space-y-4">
              {/* SAFETY: Ensure learners is always an array */}
              {ensureArray(dashboardData.learners, []).length === 0 ? (
                <div className="rounded-lg border border-dashed bg-white p-8 text-center">
                  <p className="text-gray-500">No learners linked yet</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Contact the institution to link your children to your
                    account
                  </p>
                </div>
              ) : (
                ensureArray(dashboardData.learners, []).map((learnerData) => (
                  <LearnerCard
                    key={learnerData.learner.id}
                    data={learnerData}
                    onViewDetails={handleViewLearnerDetails}
                  />
                ))
              )}
            </div>
          </div>

          {/* Communications */}
          <div>
            <CommunicationList
              communications={ensureArray(communications?.data, []) as any}
              onMarkRead={handleMarkRead}
              onViewAll={handleViewMessages}
            />
          </div>
        </div>
      </main>

      {/* NPS Survey Prompt */}
      {activeSurvey && (
        <NPSSurveyPrompt
          survey={activeSurvey}
          open={!!activeSurvey}
          onClose={() => setActiveSurvey(null)}
          onSubmit={handleSurveySubmit}
        />
      )}
    </div>
  );
}
