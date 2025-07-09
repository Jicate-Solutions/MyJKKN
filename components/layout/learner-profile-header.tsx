'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Profile } from '@/types/auth';
import { format } from 'date-fns';
import { Bell, Settings, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LearnerProfileHeaderProps {
  user: Profile | null;
  currentTime: Date;
}

export function LearnerProfileHeader({
  user,
  currentTime
}: LearnerProfileHeaderProps) {
  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (date: Date) => {
    return format(date, 'HH:mm');
  };

  const formatDate = (date: Date) => {
    return format(date, 'EEEE, MMMM d');
  };

  return (
    <div className='bg-transparent'>
      <div className='px-4 py-4'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center space-x-2'>
            <div className='bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-2 shadow-lg'>
              <GraduationCap className='h-6 w-6 text-white' />
            </div>
            <div className='flex flex-col'>
              <div className='flex items-baseline space-x-1'>
                <span className='text-2xl font-bold bg-gradient-to-r from-green-600 to-green-700 bg-clip-text text-transparent'>
                  My
                </span>
                <span className='text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-600 to-rose-700'>
                  JKKN
                </span>
              </div>
              <span className='text-xs font-medium text-gray-500 tracking-wide'>
                Learning Hub
              </span>
            </div>
          </div>

          <div className='relative'>
            <div className='absolute inset-0 rounded-full bg-green-400 spiral-pulse-1'></div>
            <div className='absolute inset-0 rounded-full bg-green-300 spiral-pulse-2'></div>
            <div className='absolute inset-0 rounded-full bg-green-200 smooth-ripple'></div>
            <Avatar className='relative h-10 w-10 border-2 border-white shadow-lg z-10'>
              <AvatarImage
                src={user?.avatar_url || ''}
                alt={user?.full_name || 'User'}
              />
              <AvatarFallback className='bg-gray-100 text-gray-700 font-semibold text-sm'>
                {getInitials(user?.full_name)}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div className='mt-4'>
          <h2 className='text-lg font-semibold text-gray-900 mb-1'>
            {getGreeting()}, {user?.full_name?.split(' ')[0] || 'Student'}!
          </h2>
          <p className='text-gray-600 text-sm'>
            Welcome back to your learning journey
          </p>
        </div>
      </div>
    </div>
  );
}
