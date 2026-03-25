'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import {
  ShieldAlert,
  UserX,
  AlertTriangle,
  Mail,
  ArrowLeft
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');

  const getContent = () => {
    switch (reason) {
      case 'inactive':
        return {
          icon: <UserX className='h-8 w-8 text-red-500' />,
          title: 'Account Deactivated',
          subtitle: 'Your access has been temporarily suspended',
          message:
            'Your account has been deactivated by an administrator. To regain access to the application, please contact your system administrator.',
          buttonText: 'Back to Login',
          buttonHref: '/auth/login',
          statusBadge: {
            text: 'Account Status: Inactive',
            variant: 'destructive' as const
          }
        };
      default:
        return {
          icon: <ShieldAlert className='h-16 w-16 text-amber-500' />,
          title: 'Access Denied',
          subtitle: 'Insufficient permissions',
          message:
            "You don't have the necessary permissions to access this page. Please contact your administrator if you believe this is an error.",
          buttonText: 'Return to Dashboard',
          buttonHref: '/',
          statusBadge: null
        };
    }
  };

  const content = getContent();

  return (
    <div className='min-h-screen flex items-center justify-center p-4 relative overflow-hidden'>
      {/* Static Gradient Background */}
      <div className='absolute inset-0'></div>

      {/* Floating gradient orbs around the card */}
      <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'>
        <div className='absolute -top-32 -left-32 w-64 h-64 bg-gradient-to-r from-green-300 to-emerald-400 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-blob'></div>
        <div className='absolute -top-20 -right-40 w-72 h-72 bg-gradient-to-r from-lime-300 to-green-400 rounded-full mix-blend-multiply filter blur-xl opacity-35 animate-blob animation-delay-2000'></div>
        <div className='absolute -bottom-28 -left-40 w-80 h-80 bg-gradient-to-r from-emerald-300 to-teal-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000'></div>
        <div className='absolute -bottom-32 -right-32 w-60 h-60 bg-gradient-to-r from-green-200 to-emerald-300 rounded-full mix-blend-multiply filter blur-xl opacity-45 animate-blob animation-delay-6000'></div>
      </div>
      <Card className='w-full max-w-lg relative z-10 shadow-2xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm'>
        <CardHeader className='text-center pb-6 pt-8 px-8'>
          {/* Icon with animated background */}
          <div className='flex justify-center mb-6'>
            <div className='relative'>
              <div className='absolute inset-0 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-full blur-xl animate-pulse'></div>
              <div className='relative bg-white dark:bg-slate-800 p-4 rounded-full shadow-lg border border-slate-200 dark:border-slate-700'>
                {content.icon}
              </div>
            </div>
          </div>

          <CardTitle className='text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent mb-2'>
            {content.title}
          </CardTitle>

          <p className='text-sm text-muted-foreground font-medium'>
            {content.subtitle}
          </p>
        </CardHeader>

        <CardContent className='px-8 pb-8 space-y-6'>
          {/* Main message */}
          <div className='text-center'>
            <p className='text-slate-600 dark:text-slate-300 leading-relaxed text-base'>
              {content.message}
            </p>
          </div>

          {/* Status badge for inactive accounts */}
          {content.statusBadge && (
            <div className='bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50 border border-red-200 dark:border-red-800 p-4 rounded-xl'>
              <div className='flex items-center justify-center gap-3 text-red-700 dark:text-red-300'>
                <div className='p-1 bg-red-100 dark:bg-red-900/50 rounded-full'>
                  <AlertTriangle className='h-4 w-4' />
                </div>
                <span className='font-semibold text-sm'>
                  {content.statusBadge.text}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className='space-y-3 pt-2'>
            <Link href={content.buttonHref} className='block'>
              <Button
                className='w-full h-12 text-base font-medium bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5'
                size='lg'
              >
                {reason === 'inactive' ? (
                  <>
                    <ArrowLeft className='mr-2 h-5 w-5' />
                    {content.buttonText}
                  </>
                ) : (
                  content.buttonText
                )}
              </Button>
            </Link>

            {/* Secondary action for inactive accounts */}
            {reason === 'inactive' && (
              <Button
                variant='outline'
                className='w-full h-10 text-sm border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                asChild
              >
                <Link href='mailto:admin@jkkn.ac.in'>
                  <Mail className='mr-2 h-4 w-4' />
                  Contact Administrator
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen flex items-center justify-center p-4 relative overflow-hidden'>
          {/* Static Gradient Background */}
          <div className='absolute inset-0'></div>

          {/* Floating gradient orbs around the card */}
          <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'>
            <div className='absolute -top-32 -left-32 w-64 h-64 bg-gradient-to-r from-green-300 to-emerald-400 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-blob'></div>
            <div className='absolute -top-20 -right-40 w-72 h-72 bg-gradient-to-r from-lime-300 to-green-400 rounded-full mix-blend-multiply filter blur-xl opacity-35 animate-blob animation-delay-2000'></div>
            <div className='absolute -bottom-28 -left-40 w-80 h-80 bg-gradient-to-r from-emerald-300 to-teal-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000'></div>
            <div className='absolute -bottom-32 -right-32 w-60 h-60 bg-gradient-to-r from-green-200 to-emerald-300 rounded-full mix-blend-multiply filter blur-xl opacity-45 animate-blob animation-delay-6000'></div>
          </div>
          <Card className='w-full max-w-lg relative z-10 shadow-2xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm'>
            <CardHeader className='text-center pb-6 pt-8 px-8'>
              <div className='flex justify-center mb-6'>
                <div className='relative'>
                  <div className='absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse'></div>
                  <div className='relative bg-white dark:bg-slate-800 p-4 rounded-full shadow-lg border border-slate-200 dark:border-slate-700'>
                    <ShieldAlert className='h-16 w-16 text-blue-500 animate-pulse' />
                  </div>
                </div>
              </div>
              <CardTitle className='text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent mb-2'>
                Loading...
              </CardTitle>
              <p className='text-sm text-muted-foreground font-medium'>
                Please wait while we verify your access
              </p>
            </CardHeader>
            <CardContent className='px-8 pb-8'>
              <div className='flex justify-center'>
                <div className='w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin'></div>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <UnauthorizedContent />
    </Suspense>
  );
}
