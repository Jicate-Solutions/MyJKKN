'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Profile } from '@/types/auth';
import { format } from 'date-fns';
import { GraduationCap } from 'lucide-react';
import GradientText from '@/components/ui/gradient-text';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { TrophyIcon, ClipboardListIcon } from '@/components/icons';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='relative h-10 w-10 rounded-full p-0'
              >
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
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className='w-56' align='end' forceMount>
              <DropdownMenuLabel className='font-normal'>
                <div className='flex flex-col space-y-1'>
                  <p className='text-sm font-medium leading-none'>
                    {user?.full_name || 'Student'}
                  </p>
                  <p className='text-xs leading-none text-muted-foreground'>
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link
                    href='/learner/bug-reports'
                    className='flex items-center cursor-pointer'
                  >
                    <ClipboardListIcon className='mr-2 h-4 w-4' />
                    My Bug Reports
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href='/learner/bug-leaderboard'
                    className='flex items-center cursor-pointer'
                  >
                    <TrophyIcon className='mr-2 h-4 w-4' />
                    Bug Leaderboard
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className='mt-8 flex flex-col items-start gap-2'>
          <GradientText
            colors={['#16a34a', '#e11d48', '#16a34a']}
            animationSpeed={5}
            className='text-3xl'
          >
            {getGreeting()}, {user?.full_name?.split(' ')[0] || 'Student'}!
          </GradientText>

          <p className='text-gray-600 text-sm'>
            Welcome back to your learning journey
          </p>
        </div>
      </div>
    </div>
  );
}
