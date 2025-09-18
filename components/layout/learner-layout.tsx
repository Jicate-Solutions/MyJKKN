'use client';

import React, { useState, useEffect } from 'react';
import { LearnerBottomNavigation } from './learner-bottom-navigation';
import { LearnerSidebar } from './learner-sidebar';
import { LearnerHeader } from './learner-header';
import { cn } from '@/lib/utils';

interface LearnerLayoutProps {
  children: React.ReactNode;
}

export default function LearnerLayout({ children }: LearnerLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true); // Default to collapsed

  // Check device type and update on resize
  useEffect(() => {
    const checkDevice = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      // Start with sidebar closed on all devices
      if (mobile) {
        setIsSidebarOpen(false);
      }
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return (
    <div className='relative min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-green-50/20'>
      {/* Background Pattern */}
      <div className='absolute inset-0 opacity-[0.03]'>
        <div className='absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.3),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(255,119,198,0.3),transparent_50%),radial-gradient(circle_at_40%_40%,rgba(120,200,198,0.3),transparent_50%)]' />
      </div>

      {/* Subtle Grid Pattern */}
      <div className='absolute inset-0 opacity-[0.02]'>
        <div className='h-full w-full bg-[linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-[size:20px_20px]' />
      </div>

      {/* Sidebar */}
      <LearnerSidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        isMobile={isMobile}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />

      {/* Layout container - Adjust for desktop sidebar */}
      <div className={cn(
        "flex flex-col min-h-screen transition-all duration-300",
        !isMobile && (isCollapsed ? 'lg:ml-[90px]' : 'lg:ml-72')
      )}>
        {/* Desktop Header */}
        {!isMobile && (
          <LearnerHeader />
        )}

        {/* Main content area */}
        <main
          className={cn(
            'relative flex-1',
            isMobile ? 'pb-24 px-4 pt-4' : 'p-6'
          )}
        >
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <div className='fixed bottom-0 left-0 right-0 z-50'>
          <LearnerBottomNavigation />
        </div>
      )}
    </div>
  );
}
