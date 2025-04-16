'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { FcGoogle } from 'react-icons/fc';
import { toast } from 'react-hot-toast';
import { BeatLoader } from 'react-spinners';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  // Check if user is already logged in
  useEffect(() => {
    console.log('Login page mounted/rendered');
    const redirectedFrom = new URLSearchParams(window.location.search).get(
      'redirectedFrom'
    );
    if (
      redirectedFrom &&
      redirectedFrom.includes('__nextjs_original-stack-frames')
    ) {
      console.log('Preventing redirect loop to:', redirectedFrom);
      return; // Don't proceed with automatic redirect
    }

    const checkUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        router.push('/');
      }
    };
    checkUser();
  }, [router, supabase.auth]);

  // Check for error params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      const errorMessages: Record<string, string> = {
        no_code: 'Authentication code missing',
        exchange: 'Error exchanging auth code',
        session: 'Error creating session',
        general: 'An unexpected error occurred',
        callback: 'Authentication callback failed'
      };
      toast.error(errorMessages[error] || `Login error: ${error}`);
    }
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);

      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : '/auth/callback';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) throw error;

      toast.success('Redirecting to Google...');
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-background p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader className='space-y-1'>
          <CardTitle className='text-2xl font-bold tracking-tight text-center'>
            Welcome to MyJKKN
          </CardTitle>
          <CardDescription className='text-center'>
            Sign in with your institutional Google account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant='outline'
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className='w-full flex items-center justify-center gap-2 h-12'
          >
            {isLoading ? (
              <BeatLoader size={8} color='#000000' />
            ) : (
              <>
                <FcGoogle className='h-5 w-5' />
                <span>Sign in with Google</span>
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
