'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
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

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    // Check for error params
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

      // Get the current URL for redirection
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : '/auth/callback';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo, // This ensures we redirect back to the same origin
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) throw error;
      toast.success('Signing in...');
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-background'>
      <Card className='w-[400px]'>
        <CardHeader className='space-y-1'>
          <CardTitle className='text-2xl text-center'>
            Welcome to MyJKKN
          </CardTitle>
          <CardDescription className='text-center'>
            Login with your institutional Google account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant='outline'
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className='w-full flex items-center justify-center gap-2'
          >
            {isLoading ? (
              <>
                <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-primary'></div>
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <FcGoogle className='w-5 h-5' />
                <span>Sign in with Google</span>
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
