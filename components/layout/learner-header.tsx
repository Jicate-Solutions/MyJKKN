'use client';

import { useState, useEffect } from 'react';
import {
  Bell,
  Search,
  User,
  Settings,
  Moon,
  Sun,
  Menu,
  GraduationCap
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface LearnerHeaderProps {
  isMobile?: boolean;
  onMenuClick?: () => void;
}

export function LearnerHeader({
  isMobile = false,
  onMenuClick
}: LearnerHeaderProps): JSX.Element {
  const [isClient, setIsClient] = useState(false);
  const [studentPhotoUrl, setStudentPhotoUrl] = useState<string | null>(null);
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();

  // Fetch student photo from students table
  useEffect(() => {
    const fetchStudentPhoto = async () => {
      if (!profile?.email) return;

      try {
        const supabase = createClientSupabaseClient();

        // Find the student record using email matching
        const { data: studentRecord, error: studentRecordError } = await supabase
          .from('students')
          .select('student_photo_url')
          .or(`student_email.eq.${profile.email},college_email.eq.${profile.email}`)
          .eq('status', 'active')
          .single();

        if (studentRecordError || !studentRecord) {
          console.log('Header - No student record found:', studentRecordError);
          return;
        }

        console.log('Header - Student photo URL:', studentRecord.student_photo_url);
        setStudentPhotoUrl(studentRecord.student_photo_url);
      } catch (error) {
        console.error('Header - Error fetching student photo:', error);
      }
    };

    fetchStudentPhoto();
  }, [profile?.email]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Use the passed isMobile prop to avoid hydration mismatch
  const currentIsMobile = isMobile;

  const getStudentAvatarUrl = () => {
    if (!studentPhotoUrl) return '';

    // If it's already a full URL, return it
    if (studentPhotoUrl.startsWith('http')) {
      return studentPhotoUrl;
    }

    // If it's a Supabase storage path, construct the full URL using student-photos bucket
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const fullUrl = `${supabaseUrl}/storage/v1/object/public/student-photos/${studentPhotoUrl}`;

    console.log('Header - Constructed student photo URL:', fullUrl);
    return fullUrl;
  };

  // Prevent hydration mismatch for theme-dependent elements
  if (!isClient) {
    return (
      <header
        className={cn(
          'sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-gray-200/50 shadow-sm',
          'transition-colors duration-200',
          currentIsMobile ? 'px-4 py-3' : 'px-6 py-4',
          'flex items-center justify-between'
        )}
      >
        <div className='flex items-center space-x-4'>
          {currentIsMobile ? (
            <div className='flex items-center space-x-3'>
              <Button
                variant='ghost'
                size='sm'
                className='hover:bg-gray-100 p-2'
              >
                <Menu className='h-5 w-5' />
              </Button>
              <div className='flex items-center space-x-2'>
                <GraduationCap className='w-6 h-6 text-green-600' />
                <h1 className='font-semibold text-lg text-gray-900'>MyJKKN</h1>
              </div>
            </div>
          ) : (
            <div className='relative hidden md:block'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
              <Input
                placeholder='Search...'
                className='pl-10 w-80 bg-gray-50/50 border-gray-200 focus:bg-white'
              />
            </div>
          )}
        </div>
        <div className='flex items-center space-x-2'>
          <div className='w-20 h-8'></div> {/* Placeholder for buttons */}
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-gray-200/50 shadow-sm',
        'dark:bg-gray-900/95 dark:border-gray-700/50',
        'transition-colors duration-200',
        currentIsMobile ? 'px-4 py-3' : 'px-6 py-4',
        'flex items-center justify-between'
      )}
    >
      {/* Left section */}
      <div className='flex items-center space-x-4'>
        {/* Mobile Menu Button & Logo */}
        {currentIsMobile ? (
          <div className='flex items-center space-x-3'>
            <Button
              variant='ghost'
              size='sm'
              onClick={onMenuClick}
              className='hover:bg-gray-100 dark:hover:bg-gray-800 p-2'
            >
              <Menu className='h-5 w-5' />
            </Button>
            <div className='flex items-center space-x-2'>
              <GraduationCap className='w-6 h-6 text-green-600' />
              <h1 className='font-semibold text-lg text-gray-900 dark:text-white'>
                MyJKKN
              </h1>
            </div>
          </div>
        ) : (
          /* Desktop Search */
          <div className='relative hidden md:block'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
            <Input
              placeholder='Search...'
              className='pl-10 w-80 bg-gray-50/50 border-gray-200 focus:bg-white dark:bg-gray-800/50 dark:border-gray-700 dark:focus:bg-gray-800'
            />
          </div>
        )}
      </div>

      {/* Right section */}
      <div className='flex items-center space-x-2'>
        {/* Mobile compact actions */}
        {currentIsMobile ? (
          <div className='flex items-center space-x-1'>
            {/* Notifications */}
            <Button
              variant='ghost'
              size='sm'
              className='relative hover:bg-gray-100 dark:hover:bg-gray-800 p-2'
            >
              <Bell className='h-4 w-4' />
              <div className='absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full h-3 w-3 flex items-center justify-center'>
                3
              </div>
            </Button>

            {/* User avatar only */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='p-1'>
                  <Avatar className='h-7 w-7'>
                    <AvatarImage src={getStudentAvatarUrl()} />
                    <AvatarFallback className='bg-gradient-to-br from-green-500 to-blue-600 text-white text-xs'>
                      {profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                <DropdownMenuItem>
                  <User className='mr-2 h-4 w-4' />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className='mr-2 h-4 w-4' />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          /* Desktop full actions */
          <div className='flex items-center space-x-4'>
            {/* Dark mode toggle */}
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className='hover:bg-gray-100 dark:hover:bg-gray-800'
            >
              <Sun className='h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0' />
              <Moon className='absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100' />
            </Button>

            {/* Notifications */}
            <Button
              variant='ghost'
              size='sm'
              className='relative hover:bg-gray-100 dark:hover:bg-gray-800'
            >
              <Bell className='h-5 w-5' />
              <div className='absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center'>
                3
              </div>
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  className='flex items-center space-x-2 hover:bg-transparent'
                >
                  <Avatar className='h-8 w-8'>
                    <AvatarImage src={getStudentAvatarUrl()} />
                    <AvatarFallback className='bg-gradient-to-br from-green-500 to-blue-600 text-white'>
                      {profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className='hidden md:block text-left'>
                    <p className='text-sm font-medium'>
                      {profile?.full_name || 'User'}
                    </p>
                    <p className='text-xs text-gray-600'>Student</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                <DropdownMenuItem>
                  <User className='mr-2 h-4 w-4' />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className='mr-2 h-4 w-4' />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
}
