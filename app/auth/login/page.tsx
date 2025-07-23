'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { FcGoogle } from 'react-icons/fc';
import { toast } from 'react-hot-toast';
import { BeatLoader } from 'react-spinners';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { GraduationCap, BookOpen, School } from 'lucide-react';
import { GoogleOneTap } from '@/components/auth/google-one-tap';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const router = useRouter();

  // Prevent recreation of client on each render
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  // Check if user is already logged in - only once
  useEffect(() => {
    let isMounted = true;

    // Don't redirect if coming from error page
    const redirectedFrom = new URLSearchParams(window.location.search).get(
      'redirectedFrom'
    );
    if (
      redirectedFrom &&
      (redirectedFrom.includes('__nextjs_original-stack-frames') ||
        redirectedFrom.includes('/error'))
    ) {
      console.log('Preventing redirect from error page:', redirectedFrom);
      setIsCheckingAuth(false);
      return;
    }

    const checkUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (!error && data.user) {
          // User is authenticated, check their role
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();

          // Determine destination based on role
          let destination = '/';
          if (profile?.role === 'guest') {
            destination = '/guest';
          } else if (profile?.role === 'student') {
            destination = '/learner';
          }

          // Override with redirectedFrom if provided (except for guest users)
          if (redirectedFrom && profile?.role !== 'guest') {
            destination = redirectedFrom;
          }

          router.push(destination);
        } else {
          // User is not authenticated, just update state
          setIsCheckingAuth(false);
        }
      } catch (err) {
        console.error('Auth check error:', err);
        if (isMounted) setIsCheckingAuth(false);
      }
    };

    checkUser();

    return () => {
      isMounted = false;
    };
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
      setIsLoading(false);
    }
    // We don't set isLoading to false on success because we're redirecting to Google
  };

  // Show loading indicator while checking auth
  if (isCheckingAuth) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <BeatLoader size={10} color='#000000' />
      </div>
    );
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-yellow-50 p-4 relative overflow-hidden'>
      {!isCheckingAuth && <GoogleOneTap />}
      {/* Animated background elements */}
      <div className='absolute inset-0 pointer-events-none'>
        <div className='absolute h-40 w-40 bg-green-200 rounded-full -top-10 -left-10 opacity-20 animate-blob'></div>
        <div className='absolute h-40 w-40 bg-blue-200 rounded-full top-1/3 -right-10 opacity-20 animate-blob animation-delay-2000'></div>
        <div className='absolute h-40 w-40 bg-yellow-200 rounded-full bottom-1/4 left-1/4 opacity-20 animate-blob animation-delay-4000'></div>
        <div className='absolute h-40 w-40 bg-lime-200 rounded-full -bottom-10 right-1/3 opacity-20 animate-blob animation-delay-3000'></div>
      </div>

      <div className='w-full max-w-5xl flex flex-col md:flex-row overflow-hidden rounded-xl shadow-xl relative z-10'>
        {/* Left Panel - Image and Info */}
        <div className='w-full md:w-1/2 bg-gradient-to-br from-green-600 to-lime-800 text-white p-8 flex flex-col justify-between relative'>
          <div className='absolute inset-0 opacity-10'>
            <div className='absolute top-20 left-10 transform rotate-12 animate-float'>
              <GraduationCap size={120} />
            </div>
            <div className='absolute bottom-20 right-10 transform -rotate-12 animate-float animation-delay-2000'>
              <BookOpen size={100} />
            </div>
            <div className='absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse animation-delay-1000'>
              <School size={180} />
            </div>
          </div>

          <div className='relative z-10'>
            <h1 className='text-3xl font-bold mb-2'>JKKN Learning Portal</h1>
            <p className='text-blue-100 mb-6'>
              Empowering education through innovation
            </p>

            <div className='space-y-4 mt-8'>
              <div className='flex items-start space-x-3'>
                <div className='bg-white/20 p-2 rounded-full'>
                  <GraduationCap className='h-5 w-5 text-white' />
                </div>
                <div>
                  <h3 className='font-semibold'>Academic Excellence</h3>
                  <p className='text-sm text-blue-100'>
                    Access to world-class educational resources
                  </p>
                </div>
              </div>

              <div className='flex items-start space-x-3'>
                <div className='bg-white/20 p-2 rounded-full'>
                  <BookOpen className='h-5 w-5 text-white' />
                </div>
                <div>
                  <h3 className='font-semibold'>Collaborative Learning</h3>
                  <p className='text-sm text-blue-100'>
                    Connect with faculty and peers seamlessly
                  </p>
                </div>
              </div>

              <div className='flex items-start space-x-3'>
                <div className='bg-white/20 p-2 rounded-full'>
                  <School className='h-5 w-5 text-white' />
                </div>
                <div>
                  <h3 className='font-semibold'>Institutional Support</h3>
                  <p className='text-sm text-blue-100'>
                    Administrative tools for academic success
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className='mt-auto relative z-10 text-sm'>
            <p>
              &copy; {new Date().getFullYear()} JKKN Educational Institution
            </p>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className='w-full md:w-1/2 bg-white p-8 flex items-center justify-center'>
          <Card className='w-full max-w-md border-none shadow-none'>
            <CardHeader className='space-y-3'>
              <div className='mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center'>
                <School className='h-8 w-8 text-primary' />
              </div>
              <CardTitle className='text-2xl font-bold tracking-tight text-center text-gray-800'>
                Welcome Back
              </CardTitle>
              <CardDescription className='text-center text-gray-600'>
                Sign in with your institutional account to access the MyJKKN
                portal
              </CardDescription>
            </CardHeader>

            <CardContent className='pt-6'>
              <Button
                variant='outline'
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className='w-full flex items-center justify-center gap-3 h-12 text-gray-700 border-gray-300 hover:bg-yellow-50 hover:border-yellow-400 transition-all'
              >
                {isLoading ? (
                  <BeatLoader size={8} color='#4F46E5' />
                ) : (
                  <>
                    <FcGoogle className='h-5 w-5' />
                    <span>Sign in with Google</span>
                  </>
                )}
              </Button>
            </CardContent>

            <CardFooter className='w-full flex items-center justify-center text-center text-sm text-gray-500 pt-2'>
              <p>Protected by industry-standard security protocols</p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
