'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';

export default function GuestPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4'>
      <Card className='w-full max-w-md mx-auto shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm'>
        <CardContent className='p-8 text-center space-y-6'>
          {/* Icon */}
          <div className='mx-auto w-20 h-20 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg'>
            <AlertTriangle className='w-10 h-10 text-white' />
          </div>

          {/* Title */}
          <div className='space-y-2'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
              Guest Access
            </h1>
            <p className='text-gray-600 dark:text-gray-300 text-sm'>
              Limited access mode
            </p>
          </div>

          {/* Message */}
          <div className='bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800'>
            <p className='text-gray-700 dark:text-gray-300 text-sm leading-relaxed'>
              Contact your administrator to assign you the appropriate role and
              gain full access to the application.
            </p>
          </div>

          {/* Email */}
          <div className='text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg p-3'>
            <span className='font-medium'>Your email:</span>
            <br />
            {user?.email}
          </div>

          {/* Actions */}
          <div className='flex gap-3 pt-2'>
            <Button
              onClick={handleSignOut}
              variant='outline'
              size='sm'
              className='flex-1 h-10'
            >
              <LogOut className='w-4 h-4 mr-2' />
              Sign Out
            </Button>
            <Button
              onClick={() => window.location.reload()}
              size='sm'
              className='flex-1 h-10 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600'
            >
              <RefreshCw className='w-4 h-4 mr-2' />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
