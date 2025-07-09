'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  FileText,
  User,
  Bell,
  Calendar,
  BookOpen,
  Award,
  Settings,
  LayoutDashboard,
  Megaphone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';

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

  const navItems: NavItem[] = useMemo(
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
        icon: Megaphone,
        label: 'Notify',
        href: '/learner/notify',
        active: pathname.startsWith('/learner/notify')
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
    const currentIndex = navItems.findIndex((item) => item.active);
    if (currentIndex !== -1) {
      setActiveIndex(currentIndex);
    }
  }, [pathname, navItems]);

  const handleNavigation = (href: string, index: number) => {
    setActiveIndex(index);
    router.push(href);
  };

  return (
    <div className='relative w-full'>
      {/* Background with blur effect */}
      <div className='absolute inset-0 bg-white/95 backdrop-blur-lg border-t border-gray-200/50 shadow-2xl' />

      <div className='relative'>
        {/* Mobile Navigation */}
        {isMobile && (
          <div className='flex items-center justify-between px-4 py-3'>
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = item.active;

              return (
                <button
                  key={item.href}
                  onClick={() => handleNavigation(item.href, index)}
                  className={cn(
                    'relative flex flex-col items-center justify-center py-2 px-3 rounded-xl',
                    'min-w-0 flex-1 max-w-[80px]',
                    isActive ? 'text-blue-600 bg-blue-50' : 'text-gray-500'
                  )}
                >
                  {/* Icon container */}
                  <div className='relative mb-1'>
                    <Icon
                      className={cn(
                        'h-6 w-6',
                        isActive ? 'text-blue-600' : 'text-gray-500'
                      )}
                    />

                    {/* Badge */}
                    {item.badge && (
                      <div className='absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center'>
                        {item.badge}
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className={cn(
                      'text-xs font-medium truncate',
                      isActive ? 'text-blue-600 font-semibold' : 'text-gray-500'
                    )}
                  >
                    {item.label}
                  </span>

                  {/* Active indicator */}
                  {isActive && (
                    <div className='absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full' />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Desktop Navigation */}
        {!isMobile && (
          <div className='flex items-center justify-center px-4 py-2'>
            <div className='flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg border border-gray-200/50'>
              {navItems.map((item, index) => {
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
                        ? 'text-white bg-gradient-to-r from-blue-500 to-green-500 shadow-lg'
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
                        <div className='absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse'>
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

      {/* Bottom safe area for devices with home indicator */}
      <div className='h-safe-area-inset-bottom bg-white/95 backdrop-blur-lg' />
    </div>
  );
}
