'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  User,
  Calendar,
  LayoutDashboard,
  Megaphone,
  CreditCard,
  Clock,
  Grid3X3,
  Plus,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
}

export function LearnerBottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const mainNavItems: NavItem[] = useMemo(
    () => [
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
        icon: LayoutDashboard,
        label: 'Apps',
        href: '/learner/apps',
        active: pathname.startsWith('/learner/apps'),
        badge: 2
      },
      {
        icon: User,
        label: 'Profile',
        href: '/learner/profile',
        active: pathname.startsWith('/learner/profile')
      }
    ],
    [pathname]
  );

  const moreNavItems: NavItem[] = useMemo(
    () => [
      {
        icon: CreditCard,
        label: 'Billing',
        href: '/learner/billing',
        active: pathname.startsWith('/learner/billing')
      },
      {
        icon: Clock,
        label: 'Time Table',
        href: '/learner/time-table',
        active: pathname.startsWith('/learner/time-table')
      },
      {
        icon: Megaphone,
        label: 'Notifications',
        href: '/learner/notify',
        active: pathname.startsWith('/learner/notify')
      }
    ],
    [pathname]
  );

  // Check device type and update on resize
  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  // Update active index when pathname changes
  useEffect(() => {
    const currentIndex = mainNavItems.findIndex((item) => item.active);
    if (currentIndex !== -1) {
      setActiveIndex(currentIndex);
    }
  }, [pathname, mainNavItems]);

  const handleNavigation = (href: string, index?: number) => {
    if (index !== undefined) {
      setActiveIndex(index);
    }
    router.push(href);
    setIsMoreOpen(false);
  };

  return (
    <div className='relative w-full'>
      {/* Enhanced background with gradient */}
      <div className='absolute inset-0 bg-gradient-to-t from-white via-white/98 to-white/95 backdrop-blur-xl border-t border-gray-200/60 shadow-2xl' />

      {/* Subtle inner glow */}
      <div className='absolute inset-0 bg-gradient-to-t from-transparent via-blue-50/20 to-transparent' />

      <div className='relative'>
        {/* Mobile Navigation */}
        {isMobile && (
          <div className='flex items-center justify-between px-3 py-3'>
            {/* Main navigation items */}
            {mainNavItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = item.active;

              return (
                <button
                  key={item.href}
                  onClick={() => handleNavigation(item.href, index)}
                  className={cn(
                    'relative flex flex-col items-center justify-center py-2.5 px-3 rounded-2xl',
                    'min-w-0 flex-1 max-w-[85px] transition-all duration-300 ease-out',
                    'hover:scale-105 active:scale-95',
                    isActive
                      ? 'text-white bg-gradient-to-br from-green-500 to-blue-600 shadow-lg shadow-blue-500/30'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100/60'
                  )}
                >
                  {/* Icon container with enhanced effects */}
                  <div className='relative mb-1.5'>
                    <div className={cn(
                      'relative transition-all duration-300',
                      isActive ? 'animate-pulse' : 'group-hover:scale-110'
                    )}>
                      <Icon
                        className={cn(
                          'h-6 w-6 transition-all duration-300',
                          isActive ? 'text-white drop-shadow-lg' : 'text-gray-600'
                        )}
                      />

                      {/* Glow effect for active icon */}
                      {isActive && (
                        <div className='absolute inset-0 bg-white/30 rounded-full blur-sm opacity-60 animate-pulse' />
                      )}
                    </div>

                    {/* Enhanced badge */}
                    {item.badge && (
                      <div className='absolute -top-1.5 -right-1.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center shadow-lg animate-bounce'>
                        {item.badge}
                      </div>
                    )}
                  </div>

                  {/* Enhanced label */}
                  <span
                    className={cn(
                      'text-xs font-medium truncate transition-all duration-300',
                      isActive ? 'text-white font-semibold drop-shadow-sm' : 'text-gray-600'
                    )}
                  >
                    {item.label}
                  </span>

                  {/* Enhanced active indicator */}
                  {isActive && (
                    <div className='absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-lg' />
                  )}
                </button>
              );
            })}

            {/* More menu button with Sheet */}
            <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    'relative flex flex-col items-center justify-center py-2.5 px-3 rounded-2xl',
                    'min-w-0 flex-1 max-w-[85px] transition-all duration-300 ease-out',
                    'hover:scale-105 active:scale-95',
                    'text-gray-600 hover:text-gray-800 hover:bg-gray-100/60'
                  )}
                >
                  <div className='relative mb-1.5'>
                    <Grid3X3 className='h-6 w-6 transition-all duration-300' />
                  </div>
                  <span className='text-xs font-medium truncate'>More</span>
                </button>
              </SheetTrigger>

              <SheetContent side="bottom" className="h-auto max-h-[70vh]">
                <SheetHeader>
                  <SheetTitle>Quick Access</SheetTitle>
                  <SheetDescription>
                    Access additional features and navigation options
                  </SheetDescription>
                </SheetHeader>
                <div className="py-4">

                  <div className="grid grid-cols-3 gap-4">
                    {moreNavItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.active;

                      return (
                        <button
                          key={item.href}
                          onClick={() => handleNavigation(item.href)}
                          className={cn(
                            'flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300',
                            'hover:scale-105 active:scale-95',
                            isActive
                              ? 'bg-gradient-to-br from-green-500 to-blue-600 text-white border-transparent shadow-lg'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          )}
                        >
                          <Icon className={cn(
                            'h-8 w-8 mb-2',
                            isActive ? 'text-white' : 'text-gray-600'
                          )} />
                          <span className={cn(
                            'text-sm font-medium text-center',
                            isActive ? 'text-white' : 'text-gray-700'
                          )}>
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}

        {/* Enhanced Desktop Navigation */}
        {!isMobile && (
          <div className='flex items-center justify-center px-4 py-2'>
            <div className='flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg border border-gray-200/50'>
              {[...mainNavItems, ...moreNavItems].map((item, index) => {
                const Icon = item.icon;
                const isActive = item.active;

                return (
                  <button
                    key={item.href}
                    onClick={() => handleNavigation(item.href, index)}
                    className={cn(
                      'relative flex items-center space-x-2 px-4 py-2 rounded-full transition-all duration-300 ease-in-out group',
                      'hover:scale-105 active:scale-95 min-w-[120px] justify-center',
                      isActive
                        ? 'text-white bg-gradient-to-r from-green-500 to-blue-600 shadow-lg'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    )}
                  >
                    {/* Icon container */}
                    <div className='relative'>
                      <div
                        className={cn(
                          'relative transition-all duration-300',
                          isActive ? 'animate-pulse' : 'group-hover:scale-110'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5 transition-all duration-300',
                            isActive
                              ? 'text-white'
                              : 'text-gray-600 group-hover:text-gray-800'
                          )}
                        />

                        {/* Glow effect for active icon */}
                        {isActive && (
                          <div className='absolute inset-0 bg-white/30 rounded-full blur-sm opacity-50 animate-pulse' />
                        )}
                      </div>

                      {/* Badge */}
                      {item.badge && (
                        <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse shadow-lg'>
                          {item.badge}
                        </div>
                      )}
                    </div>

                    {/* Label */}
                    <span
                      className={cn(
                        'text-sm font-medium transition-all duration-300',
                        isActive
                          ? 'text-white font-semibold'
                          : 'text-gray-600 group-hover:text-gray-800'
                      )}
                    >
                      {item.label}
                    </span>

                    {/* Ripple effect */}
                    <div
                      className={cn(
                        'absolute inset-0 rounded-full transition-all duration-500',
                        'opacity-0 group-active:opacity-100 bg-blue-200/30 scale-0 group-active:scale-100'
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Enhanced bottom safe area with gradient */}
      <div className='h-safe-area-inset-bottom bg-gradient-to-t from-white via-white/98 to-transparent backdrop-blur-lg' />
    </div>
  );
}
