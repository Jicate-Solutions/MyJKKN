'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, LogIn, CheckCircle, AlertCircle } from 'lucide-react';
import Image from 'next/image';

function AuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [appDetails, setAppDetails] = useState<any>(null);
  const [authorizing, setAuthorizing] = useState(false);

  // Get OAuth parameters
  const appId = searchParams.get('app_id') || searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const scope = searchParams.get('scope') || 'read';
  const responseType = searchParams.get('response_type') || 'code';

  useEffect(() => {
    checkAuthAndLoadApp();
  }, [appId]);

  const checkAuthAndLoadApp = async () => {
    try {
      const supabase = createClientSupabaseClient();
      
      // Check if user is authenticated
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !currentUser) {
        // User not logged in, redirect to login with child app params preserved
        const loginUrl = new URL('/auth/login', window.location.origin);
        
        // Preserve all child app parameters
        loginUrl.searchParams.set('child_app_auth', 'true');
        loginUrl.searchParams.set('app_id', appId || '');
        loginUrl.searchParams.set('redirect_uri', redirectUri || '');
        loginUrl.searchParams.set('state', state || '');
        loginUrl.searchParams.set('scope', scope);
        loginUrl.searchParams.set('response_type', responseType);
        
        // Set return URL to come back here after login
        const returnUrl = new URL('/auth/child-app/authorize', window.location.origin);
        returnUrl.search = window.location.search; // Preserve all params
        loginUrl.searchParams.set('return_to', returnUrl.toString());
        
        router.push(loginUrl.toString());
        return;
      }

      setUser(currentUser);

      // Load app details
      if (appId) {
        const { data: app, error: appError } = await supabase
          .from('applications')
          .select('*')
          .eq('app_id', appId)
          .single();

        if (appError || !app) {
          setError('Invalid application');
          setLoading(false);
          return;
        }

        setAppDetails(app);
      } else {
        setError('Missing application ID');
      }
    } catch (err) {
      console.error('Error checking auth:', err);
      setError('Authentication check failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = () => {
    if (!appId || !redirectUri || !state) {
      setError('Missing required parameters');
      return;
    }

    setAuthorizing(true);
    setError(null);

    // Directly navigate to the authorize endpoint
    // The endpoint will handle the redirect to the child app
    const authUrl = new URL('/api/auth/child-app/authorize', window.location.origin);
    authUrl.search = searchParams.toString();
    
    window.location.href = authUrl.toString();
  };

  const handleDeny = () => {
    // Redirect back to child app with error
    if (redirectUri && state) {
      const errorUrl = new URL(redirectUri);
      errorUrl.searchParams.set('error', 'access_denied');
      errorUrl.searchParams.set('error_description', 'User denied authorization');
      errorUrl.searchParams.set('state', state);
      window.location.href = errorUrl.toString();
    } else {
      router.push('/');
    }
  };

  const handleLogin = () => {
    // Redirect to login with all params preserved
    const loginUrl = new URL('/auth/login', window.location.origin);
    
    // Preserve all child app parameters
    loginUrl.searchParams.set('child_app_auth', 'true');
    loginUrl.searchParams.set('app_id', appId || '');
    loginUrl.searchParams.set('redirect_uri', redirectUri || '');
    loginUrl.searchParams.set('state', state || '');
    loginUrl.searchParams.set('scope', scope);
    loginUrl.searchParams.set('response_type', responseType);
    
    // Set return URL to come back here after login
    const returnUrl = new URL('/auth/child-app/authorize', window.location.origin);
    returnUrl.search = window.location.search;
    loginUrl.searchParams.set('return_to', returnUrl.toString());
    
    router.push(loginUrl.toString());
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Authorization Error</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button 
              onClick={() => router.push('/')} 
              className="w-full mt-4"
              variant="outline"
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <Shield className="h-12 w-12 text-primary" />
            </div>
            <CardTitle>Sign in Required</CardTitle>
            <CardDescription>
              Please sign in to continue to {appDetails?.name || 'the application'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleLogin}
              className="w-full"
              size="lg"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign in with MyJKKN
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {appDetails?.logo_url ? (
              <Image 
                src={appDetails.logo_url} 
                alt={appDetails.name}
                width={64}
                height={64}
                className="rounded-lg"
              />
            ) : (
              <Shield className="h-16 w-16 text-primary" />
            )}
          </div>
          <CardTitle>Authorize {appDetails?.name || 'Application'}</CardTitle>
          <CardDescription>
            This application is requesting access to your MyJKKN account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User Info */}
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">Signed in as</p>
            <p className="font-medium">{user.email}</p>
          </div>

          {/* Permissions */}
          <div className="space-y-3">
            <p className="text-sm font-medium">This application will be able to:</p>
            <div className="space-y-2">
              {scope.split(' ').map((permission) => (
                <div key={permission} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">
                    {permission === 'read' && 'View your profile information'}
                    {permission === 'write' && 'Make changes on your behalf'}
                    {permission === 'profile' && 'Access your full profile'}
                    {permission === 'admin' && 'Perform administrative actions'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* App Info */}
          {appDetails?.description && (
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
              <p className="text-sm">{appDetails.description}</p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleDeny}
              variant="outline"
              className="flex-1"
              disabled={authorizing}
            >
              Deny
            </Button>
            <Button
              onClick={handleAuthorize}
              className="flex-1"
              disabled={authorizing}
            >
              {authorizing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Authorizing...
                </>
              ) : (
                'Authorize'
              )}
            </Button>
          </div>

          {/* Security Note */}
          <p className="text-xs text-muted-foreground text-center">
            By authorizing, you allow this app to access your information according to its terms of service and privacy policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <AuthorizeContent />
    </Suspense>
  );
}