'use client';

import React from 'react';
import { LearnerBottomNavigation } from './learner-bottom-navigation';
import { cn } from '@/lib/utils';

interface LearnerLayoutProps {
  children: React.ReactNode;
}

export default function LearnerLayout({ children }: LearnerLayoutProps) {
  return (
    <div className='relative min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-green-50/20 lg:px-8'>
      {/* Background Pattern */}
      <div className='absolute inset-0 opacity-[0.03]'>
        <div className='absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.3),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(255,119,198,0.3),transparent_50%),radial-gradient(circle_at_40%_40%,rgba(120,200,198,0.3),transparent_50%)]' />
      </div>

      {/* Subtle Grid Pattern */}
      <div className='absolute inset-0 opacity-[0.02]'>
        <div className='h-full w-full bg-[linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-[size:20px_20px]' />
      </div>

      {/* Main content area */}
      <main className='relative min-h-screen'>{children}</main>

      {/* Bottom navigation - fixed at bottom */}
      <div className='fixed bottom-0 left-0 right-0 z-50'>
        <LearnerBottomNavigation />
      </div>
    </div>
  );
}
