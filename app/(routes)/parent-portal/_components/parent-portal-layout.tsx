'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, Home, Users, CreditCard, MessageSquare } from 'lucide-react';
import { ParentHeader } from './parent-header';
import { useParentDashboard } from '@/hooks/parent-portal';

interface ParentPortalLayoutProps {
  children: React.ReactNode;
}

export function ParentPortalLayout({ children }: ParentPortalLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  // Authentication is handled server-side via httpOnly cookies
  const { data: dashboardData, isLoading, error } = useParentDashboard();

  // Navigation tabs
  const tabs = [
    { label: 'Dashboard', path: '/parent-portal/dashboard', icon: Home },
    { label: 'My Learners', path: '/parent-portal', icon: Users },
    { label: 'Fees', path: '/parent-portal/fees', icon: CreditCard },
    { label: 'Communication', path: '/parent-portal/communication', icon: MessageSquare },
  ];

  // Check authentication status
  useEffect(() => {
    if (!isLoading && error) {
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Authentication') || errorMessage.includes('401')) {
        router.push('/auth/parent/login');
      }
    }
    if (!isLoading) {
      setIsAuthChecked(true);
    }
  }, [isLoading, error, router]);

  const handleLogout = async () => {
    await fetch('/api/parent-portal/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/auth/parent/login');
  };

  const handleViewMessages = () => {
    router.push('/parent-portal/communication');
  };

  const handleViewProfile = () => {
    // TODO: Implement profile page
    router.push('/parent-portal/profile');
  };

  const handleTabClick = (path: string) => {
    router.push(path);
  };

  // Show loading spinner during auth check
  if (!isAuthChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !dashboardData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">Failed to load</p>
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
      {/* Header */}
      <ParentHeader
        parent={dashboardData.parent}
        unreadCount={dashboardData.unread_messages}
        onLogout={handleLogout}
        onViewMessages={handleViewMessages}
        onViewProfile={handleViewProfile}
      />

      {/* Navigation Tabs */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = pathname === tab.path ||
                (tab.path !== '/parent-portal' && pathname.startsWith(tab.path));

              return (
                <button
                  key={tab.path}
                  onClick={() => handleTabClick(tab.path)}
                  className={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
