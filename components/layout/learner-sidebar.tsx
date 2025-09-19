'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Calendar,
  LayoutDashboard,
  Megaphone,
  User,
  Menu,
  X,
  GraduationCap,
  CreditCard,
  ChevronLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from '@/components/ui/tooltip';
import Link from 'next/link';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
}

interface LearnerSidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isMobile: boolean;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
}

export function LearnerSidebar({
  isOpen,
  setIsOpen,
  isMobile,
  isCollapsed = false,
  setIsCollapsed
}: LearnerSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems: NavItem[] = [
    {
      icon: Home,
      label: 'Home',
      href: '/learner',
      active: pathname === '/learner'
    },
    {
      icon: Calendar,
      label: 'Attendance',
      href: '/learner/attendance',
      active: pathname.startsWith('/learner/attendance')
    },
    {
      icon: CreditCard,
      label: 'Billing',
      href: '/learner/billing',
      active: pathname.startsWith('/learner/billing')
    },
    {
      icon: LayoutDashboard,
      label: 'Apps',
      href: '/learner/apps',
      active: pathname.startsWith('/learner/apps'),
      badge: 2
    },
    {
      icon: Megaphone,
      label: 'Notifications',
      href: '/learner/notify',
      active: pathname.startsWith('/learner/notify')
    },
    {
      icon: User,
      label: 'Profile',
      href: '/learner/profile',
      active: pathname.startsWith('/learner/profile')
    }
  ];

  const handleNavigation = (href: string) => {
    router.push(href);
    // Auto-close sidebar after navigation on mobile
    if (isMobile) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen transition-[width,transform] ease-in-out duration-300',
          'bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-md dark:shadow-zinc-800',
          // Mobile behavior - slide in/out
          isMobile && (isOpen ? 'translate-x-0' : '-translate-x-full'),
          // Desktop behavior - always visible but collapsible width
          !isMobile && 'translate-x-0',
          // Width based on collapsed state
          !isMobile && (isCollapsed ? 'w-[90px]' : 'w-72'),
          // Mobile width
          isMobile && 'w-72'
        )}
      >
        {/* Desktop Toggle Button */}
        {!isMobile && setIsCollapsed && (
          <div className="absolute top-[12px] -right-[16px] z-20 bg-background">
            <Button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="rounded-md w-8 h-8"
              variant="outline"
              size="icon"
            >
              <ChevronLeft
                className={cn(
                  'h-4 w-4 transition-transform ease-in-out duration-700',
                  isCollapsed ? 'rotate-180' : 'rotate-0'
                )}
              />
            </Button>
          </div>
        )}

        <div className="relative h-full flex flex-col px-3 py-4 overflow-y-auto">
          {/* Header */}
          <Button
            className={cn(
              'transition-transform ease-in-out duration-300 mb-1',
              isCollapsed ? 'translate-x-1' : 'translate-x-0'
            )}
            variant="link"
            asChild
          >
            <Link href="/learner" className="flex items-center gap-2">
              <GraduationCap className="w-8 h-8 mr-1 text-sidebar-primary" />
              <h1
                className={cn(
                  'font-semibold text-lg whitespace-nowrap transition-[transform,opacity,display] ease-in-out duration-300 text-sidebar-foreground',
                  isCollapsed && !isMobile
                    ? '-translate-x-96 opacity-0 hidden'
                    : 'translate-x-0 opacity-100'
                )}
              >
                MyJKKN
              </h1>
            </Link>
          </Button>

          {/* Mobile close button */}
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </Button>
          )}

          {/* Navigation */}
          <nav className="mt-8 h-full w-full">
            <ul className="flex flex-col min-h-[calc(100vh-48px-36px-16px-32px)] items-start space-y-1 px-2">
              <li className="w-full">
                <p className="text-sm font-medium text-muted-foreground px-4 pb-2 max-w-[248px] truncate">
                  {!isCollapsed || isMobile ? 'Student Portal' : ''}
                </p>
                {navItems.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = item.active;

                  return (
                    <div className="w-full" key={index}>
                      <TooltipProvider disableHoverableContent>
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <Button
                              variant={isActive ? 'secondary' : 'ghost'}
                              className="w-full justify-start h-10 mb-1 relative"
                              onClick={() => handleNavigation(item.href)}
                            >
                              <span
                                className={cn(
                                  isCollapsed && !isMobile ? '' : 'mr-4'
                                )}
                              >
                                <Icon className="h-[18px] w-[18px]" />
                              </span>
                              <p
                                className={cn(
                                  'max-w-[200px] truncate',
                                  isCollapsed && !isMobile
                                    ? '-translate-x-96 opacity-0'
                                    : 'translate-x-0 opacity-100'
                                )}
                              >
                                {item.label}
                              </p>
                              {item.badge && (
                                <div className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
                                  {item.badge}
                                </div>
                              )}
                            </Button>
                          </TooltipTrigger>
                          {isCollapsed && !isMobile && (
                            <TooltipContent side="right">
                              {item.label}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  );
                })}
              </li>
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
}