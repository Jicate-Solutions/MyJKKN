'use client';

import { motion } from 'framer-motion';
import { LearnerAnalyticsSection } from './learner-analytics-section';
import { LearnerFacilitatorsSection } from './learner-facilitators-section';
import { LearnerRightSidebar } from './learner-right-sidebar';
import { LearnerWelcomeHeader } from './learner-welcome-header';
import { LearnerQuickActions } from './learner-quick-actions';
import { LearnerProgressWidgets } from './learner-progress-widgets';
import { LearnerSummaryCards } from './learner-summary-cards';
import { LearnerRecentActivity } from './learner-recent-activity';
import { LearnerImageSlider } from './learner-image-slider';
import { FortuneCard } from './fortune-card';
import { FortuneModal } from './fortune-modal';
import { useState } from 'react';

export function LearnerDashboardMain() {
  const [isFortuneModalOpen, setIsFortuneModalOpen] = useState(false);

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-green-50/20 relative'>
      {/* Background Pattern */}
      <div className='absolute inset-0 opacity-[0.03]'>
        <div className='absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.3),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(255,119,198,0.3),transparent_50%),radial-gradient(circle_at_40%_40%,rgba(120,200,198,0.3),transparent_50%)]' />
      </div>

      {/* Content */}
      <div className='relative z-10 space-y-8'>
        {/* Welcome Header */}
        <LearnerWelcomeHeader />

        {/* Image Slider Section */}
        <div className='w-full'>
          <LearnerImageSlider />
        </div>

        {/* Main Content Container */}
        <div className='container mx-auto px-4 sm:px-6 lg:px-4 space-y-6 sm:space-y-8 pb-8'>
          {/* 3. Dashboard Overview Cards */}
          <div className='w-full'>
            <LearnerSummaryCards />
          </div>

          {/* 4. Your Progress Section - Full Width */}
          <div className='w-full'>
            <LearnerProgressWidgets />
          </div>

          {/* 5. Attendance Analytics - Full Width */}
          <div className='w-full'>
            <LearnerAnalyticsSection />
          </div>

          {/* Current Semester Facilitators - Full Width */}
          <div className='w-full'>
            <LearnerFacilitatorsSection />
          </div>

          {/* Recent Activity with Fortune Card & Calendar - 2/1 Grid */}
          <div className='grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8'>
            {/* Recent Activity - Takes 2/3 width */}
            <div className='xl:col-span-2'>
              <LearnerRecentActivity />
            </div>

            {/* Fortune Card & Calendar - Takes 1/3 width */}
            <div className='xl:col-span-1 space-y-6'>
              <FortuneCard onOpenFortune={() => setIsFortuneModalOpen(true)} />
              <LearnerRightSidebar />
            </div>
          </div>

          {/* Quick Actions Section - Moved to Bottom */}
          <div className='w-full'>
            <LearnerQuickActions />
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
