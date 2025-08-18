'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck, AlertCircle, CheckCircle } from 'lucide-react';

function ChildAppLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [childApp, setChildApp] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [authorizing, setAuthorizing] = useState(false);

  const appId = searchParams?.get('app_id') || null;
  const redirectUri = searchParams?.get('redirect_uri') || null;
  const scope = searchParams?.get('scope')?.split(',') || ['read'];

  useEffect(() => {
    const validateAndLoadApp = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!appId) {
          setError('Missing application ID');
          setLoading(false);
          return;
        }

        if (!redirectUri) {
          setError('Missing redirect URI');
          setLoading(false);
          return;
        }

        // Check if user is authenticated
        const supabase = createClient();
        const {
          data: { user: currentUser },
          error: userError
        } = await supabase.auth.getUser();

        if (userError || !currentUser) {
          // Redirect to login with return URL
          const returnUrl = encodeURIComponent(window.location.href);
          router.push(`/auth/login?redirect=${returnUrl}`);
          return;
        }

        setUser(currentUser);

        // Get child app details
        const { data: app, error: appError } = await supabase
          .from('applications')
          .select('*')
          .eq('app_id', appId)
          .eq('uses_parent_auth', true)
          .eq('is_active', true)
          .single();

        if (appError || !app) {
          setError('Invalid or inactive application');
          setLoading(false);
          return;
        }

        // Validate redirect URI
        const allowedUris = app.allowed_redirect_uris || [];
        if (!allowedUris.includes(redirectUri)) {
          setError('Invalid redirect URI for this application');
          setLoading(false);
          return;
        }

        setChildApp(app);
        setLoading(false);
      } catch (err) {
        console.error('Error loading app:', err);
        setError('Failed to load application details');
        setLoading(false);
      }
    };

    validateAndLoadApp();
  }, [appId, redirectUri, router]);


  const handleAuthorize = async () => {
    try {
      setAuthorizing(true);
      setError(null);

      const supabase = createClient();
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setError('Session expired. Please login again.');
        router.push(
          `/auth/login?redirect=${encodeURIComponent(window.location.href)}`
        );
        return;
      }

      // First, generate an authorization code
      const authCodeResponse = await fetch('/api/auth/child-app/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          app_id: appId,
          scope: scope.join(','),
          redirect_uri: redirectUri
        })
      });

      const authCodeData = await authCodeResponse.json();

      if (!authCodeResponse.ok) {
        setError(authCodeData.message || 'Failed to authorize application');
        setAuthorizing(false);
        return;
      }

      // Redirect back to child app with authorization code
      const redirectUrl = new URL(redirectUri!);
      redirectUrl.searchParams.append('code', authCodeData.code);
      redirectUrl.searchParams.append('state', authCodeData.state || '');

      window.location.href = redirectUrl.toString();
    } catch (err) {
      console.error('Authorization error:', err);
      setError('Failed to authorize application');
      setAuthorizing(false);
    }
  };

  const handleCancel = () => {
    // Redirect back to child app with error
    if (redirectUri) {
      try {
        const redirectUrl = new URL(redirectUri);
        redirectUrl.searchParams.append('error', 'access_denied');
        redirectUrl.searchParams.append(
          'error_description',
          'User cancelled authorization'
        );
        window.location.href = redirectUrl.toString();
      } catch (err) {
        // If redirect URI is invalid, go back to previous page
        window.history.back();
      }
    } else {
      window.history.back();
    }
  };

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100'>
        <Card className='w-full max-w-md'>
          <CardContent className='flex flex-col items-center justify-center py-12'>
            <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
            <p className='text-muted-foreground'>
              Loading application details...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100'>
        <Card className='w-full max-w-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-red-600'>
              <AlertCircle className='h-5 w-5' />
              Authorization Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button
              onClick={() => window.history.back()}
              className='w-full mt-4'
              variant='outline'
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100'>
      <Card className='w-full max-w-lg'>
        <CardHeader className='text-center'>
          <div className='flex justify-center mb-4'>
            <ShieldCheck className='h-12 w-12 text-primary' />
          </div>
          <CardTitle className='text-2xl'>Authorize Application</CardTitle>
          <CardDescription>
            {childApp?.name} is requesting access to your MyJKKN account
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* App Info */}
          <div className='bg-muted p-4 rounded-lg'>
            <h3 className='font-semibold mb-2'>{childApp?.name}</h3>
            {childApp?.description && (
              <p className='text-sm text-muted-foreground'>
                {childApp.description}
              </p>
            )}
            <p className='text-xs text-muted-foreground mt-2'>
              {childApp?.url}
            </p>
          </div>

          {/* Permissions */}
          <div>
            <h4 className='font-medium mb-3'>
              This application will be able to:
            </h4>
            <ul className='space-y-2'>
              {scope.includes('read') && (
                <li className='flex items-start gap-2'>
                  <CheckCircle className='h-4 w-4 text-green-600 mt-0.5' />
                  <span className='text-sm'>View your profile information</span>
                </li>
              )}
              {scope.includes('write') && (
                <li className='flex items-start gap-2'>
                  <CheckCircle className='h-4 w-4 text-green-600 mt-0.5' />
                  <span className='text-sm'>
                    Update your profile information
                  </span>
                </li>
              )}
              {scope.includes('profile') && (
                <li className='flex items-start gap-2'>
                  <CheckCircle className='h-4 w-4 text-green-600 mt-0.5' />
                  <span className='text-sm'>
                    Access your basic profile data
                  </span>
                </li>
              )}
              <li className='flex items-start gap-2'>
                <CheckCircle className='h-4 w-4 text-green-600 mt-0.5' />
                <span className='text-sm'>
                  Access your institution information
                </span>
              </li>
            </ul>
          </div>

          {/* User Info */}
          <div className='bg-blue-50 p-3 rounded-lg'>
            <p className='text-sm'>
              Authorizing as: <strong>{user?.email}</strong>
            </p>
          </div>

          {/* Actions */}
          <div className='flex gap-3'>
            <Button
              onClick={handleCancel}
              variant='outline'
              className='flex-1'
              disabled={authorizing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAuthorize}
              className='flex-1'
              disabled={authorizing}
            >
              {authorizing ? (
                <>
                  <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                  Authorizing...
                </>
              ) : (
                'Authorize'
              )}
            </Button>
          </div>

          {/* Privacy Notice */}
          <p className='text-xs text-center text-muted-foreground'>
            By authorizing, you agree to share your information with this
            application. You can revoke access at any time from your account
            settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ChildAppLoginPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100'>
          <Card className='w-full max-w-md'>
            <CardContent className='flex flex-col items-center justify-center py-12'>
              <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
              <p className='text-muted-foreground'>Loading...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <ChildAppLoginContent />
    </Suspense>
  );
}
