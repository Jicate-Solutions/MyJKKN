'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, Mail, ArrowLeft } from 'lucide-react';

const REASON_MESSAGES: Record<string, { title: string; description: string }> = {
  not_registered: {
    title: 'Account Not Registered',
    description:
      'Your email is not registered in MyJKKN. This application is restricted to pre-registered JKKN staff, faculty, and enrolled students.'
  },
  no_profile: {
    title: 'Profile Not Found',
    description:
      'We could not find a profile for your account. Please contact your administrator to have your access restored.'
  },
  profile_creation_failed: {
    title: 'Onboarding Error',
    description:
      'We encountered an error while setting up your account. Please try signing in again, or contact support if the problem persists.'
  },
  default: {
    title: 'Access Denied',
    description:
      'You do not have permission to access MyJKKN. This application is for pre-registered users only.'
  }
};

// Inner component that uses `useSearchParams()` — MUST be wrapped in
// <Suspense> per Next.js 16 prerender requirements. Without the wrapper,
// `next build` fails with "useSearchParams() should be wrapped in a
// suspense boundary at page /auth/access-denied" and ALL production deploys
// get blocked.
function AccessDeniedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sessionCleared, setSessionCleared] = useState(false);

  const email = searchParams?.get('email') ?? '';
  const reason = searchParams?.get('reason') ?? 'default';
  const messageConfig = REASON_MESSAGES[reason] ?? REASON_MESSAGES.default;

  useEffect(() => {
    const cleanup = async () => {
      try {
        const supabase = createClientSupabaseClient();
        await supabase.auth.signOut();
      } catch {
        // ignore — best-effort cleanup
      } finally {
        setSessionCleared(true);
      }
    };
    cleanup();
  }, []);

  return (
    <Card className='max-w-lg w-full shadow-xl'>
      <CardHeader className='text-center'>
        <div className='mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4'>
          <ShieldAlert className='w-8 h-8 text-red-600 dark:text-red-400' />
        </div>
        <CardTitle className='text-2xl'>{messageConfig.title}</CardTitle>
        <CardDescription className='text-base mt-2'>
          {messageConfig.description}
        </CardDescription>
      </CardHeader>

      <CardContent className='space-y-5'>
        {email && (
          <Alert>
            <Mail className='w-4 h-4' />
            <AlertTitle>Attempted Sign-in</AlertTitle>
            <AlertDescription>
              <code className='text-sm font-mono bg-muted px-2 py-0.5 rounded'>
                {email}
              </code>
            </AlertDescription>
          </Alert>
        )}

        <div className='rounded-lg border bg-muted/30 p-4 text-sm space-y-2'>
          <p className='font-medium'>Think this is a mistake?</p>
          <ul className='list-disc list-inside space-y-1 text-muted-foreground'>
            <li>
              <strong>Students:</strong> Your admission must be approved before you can log in.
            </li>
            <li>
              <strong>Staff &amp; Faculty:</strong> An administrator must add you to the system before first login.
            </li>
            <li>
              Contact your department administrator or email{' '}
              <a
                href='mailto:support@jkkn.ac.in'
                className='text-primary underline'
              >
                support@jkkn.ac.in
              </a>{' '}
              with your email address and role for assistance.
            </li>
          </ul>
        </div>

        <div className='flex gap-3'>
          <Button
            variant='outline'
            className='flex-1'
            onClick={() => router.push('/auth/login')}
            disabled={!sessionCleared}
          >
            <ArrowLeft className='w-4 h-4 mr-2' />
            Back to Sign In
          </Button>
          <Button asChild className='flex-1'>
            <Link href='mailto:support@jkkn.ac.in'>
              <Mail className='w-4 h-4 mr-2' />
              Contact Support
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Lightweight fallback shown while the inner component hydrates. Kept simple
// so it renders during SSG without needing searchParams.
function AccessDeniedFallback() {
  return (
    <Card className='max-w-lg w-full shadow-xl'>
      <CardHeader className='text-center'>
        <div className='mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4'>
          <ShieldAlert className='w-8 h-8 text-red-600 dark:text-red-400' />
        </div>
        <CardTitle className='text-2xl'>Access Denied</CardTitle>
        <CardDescription className='text-base mt-2'>Loading…</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function AccessDeniedPage() {
  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4'>
      <Suspense fallback={<AccessDeniedFallback />}>
        <AccessDeniedContent />
      </Suspense>
    </div>
  );
}
