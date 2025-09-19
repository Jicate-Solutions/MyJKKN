'use client';

import { motion } from 'framer-motion';
import { LearnerStatsOverview } from './learner-stats-overview';
import { LearnerAnalyticsSection } from './learner-analytics-section';
import { LearnerFacilitatorsSection } from './learner-facilitators-section';
import { LearnerRightSidebar } from './learner-right-sidebar';
import { LearnerWelcomeHeader } from './learner-welcome-header';
import { FortuneCard } from './fortune-card';
import { FortuneModal } from './fortune-modal';
import { useState } from 'react';

export function LearnerDashboardMain() {
  const [isFortuneModalOpen, setIsFortuneModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-green-50/20 relative">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.3),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(255,119,198,0.3),transparent_50%),radial-gradient(circle_at_40%_40%,rgba(120,200,198,0.3),transparent_50%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 space-y-8">
        {/* Welcome Header */}
        <LearnerWelcomeHeader />

        {/* Main Content */}
        <div className="px-6 space-y-8">

          {/* Main Content Grid - 2 Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Left Column - Stats, Analytics and Facilitators */}
            <div className="lg:col-span-3 space-y-8">
              <LearnerStatsOverview />
              <LearnerAnalyticsSection />
              <LearnerFacilitatorsSection />
            </div>

            {/* Right Column - Fortune Card, Course Activities, Calendar, Notice Board */}
            <div className="lg:col-span-1 space-y-6">
              <FortuneCard onOpenFortune={() => setIsFortuneModalOpen(true)} />
              <LearnerRightSidebar />
            </div>
          </div>
        </div>

        {/* Fortune Modal */}
        <FortuneModal
          isOpen={isFortuneModalOpen}
          onClose={() => setIsFortuneModalOpen(false)}
        />
      </div>
    </div>
  );
}