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
  Settings
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
        icon: BookOpen,
        label: 'Courses',
        href: '/learner/courses',
        active: pathname.startsWith('/learner/courses')
      },
      {
        icon: FileText,
        label: 'Applications',
        href: '/learner/applications',
        active: pathname.startsWith('/learner/applications'),
        badge: 2
      },
      {
        icon: Calendar,
        label: 'Schedule',
        href: '/learner/schedule',
        active: pathname.startsWith('/learner/schedule')
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
          <div className='flex items-center justify-between px-2 py-1'>
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = item.active;

              return (
                <button
                  key={item.href}
                  onClick={() => handleNavigation(item.href, index)}
                  className={cn(
                    'relative flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all duration-300 ease-in-out group',
                    'min-w-0 flex-1 max-w-[80px] hover:scale-105 active:scale-95',
                    isActive
                      ? 'text-blue-600 transform -translate-y-1'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {/* Background for active state */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded-2xl transition-all duration-300',
                      isActive
                        ? 'bg-gradient-to-br from-blue-50 to-green-50 shadow-lg scale-105'
                        : 'bg-transparent group-hover:bg-gray-50 group-hover:scale-102'
                    )}
                  />

                  {/* Icon container with animation */}
                  <div className='relative z-10 mb-1'>
                    <div
                      className={cn(
                        'relative transition-all duration-300',
                        isActive ? 'animate-bounce' : 'group-hover:scale-110'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5 transition-all duration-300',
                          isActive
                            ? 'text-blue-600'
                            : 'text-gray-500 group-hover:text-gray-700'
                        )}
                      />

                      {/* Glow effect for active icon */}
                      {isActive && (
                        <div className='absolute inset-0 bg-blue-400 rounded-full blur-md opacity-20 animate-pulse' />
                      )}
                    </div>

                    {/* Badge */}
                    {item.badge && (
                      <div className='absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse'>
                        {item.badge}
                      </div>
                    )}
                  </div>

                  {/* Label with animation */}
                  <span
                    className={cn(
                      'text-xs font-medium transition-all duration-300 truncate px-1',
                      isActive
                        ? 'text-blue-600 font-semibold'
                        : 'text-gray-500 group-hover:text-gray-700'
                    )}
                  >
                    {item.label}
                  </span>

                  {/* Ripple effect */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded-2xl transition-all duration-500',
                      'opacity-0 group-active:opacity-100 bg-blue-200/30 scale-0 group-active:scale-100'
                    )}
                  />
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
