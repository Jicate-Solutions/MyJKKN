'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, CheckCircle, AlertCircle, User, Mail, Building } from 'lucide-react';
import Image from 'next/image';

function ConsentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [appDetails, setAppDetails] = useState<any>(null);
  const [authorizing, setAuthorizing] = useState(false);

  // Get OAuth parameters from URL
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
      console.log('[Consent Page] Starting auth check with params:', {
        appId,
        redirectUri,
        state,
        scope,
        currentURL: window.location.href
      });
      
      const supabase = createClientSupabaseClient();
      
      // Check if user is authenticated
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !currentUser) {
        // Redirect to login preserving all params
        const loginUrl = new URL('/auth/login', window.location.origin);
        const currentUrl = new URL(window.location.href);
        
        // Add child app auth flag
        loginUrl.searchParams.set('child_app_auth', 'true');
        
        // Copy all current params to login URL
        currentUrl.searchParams.forEach((value, key) => {
          loginUrl.searchParams.set(key, value);
        });
        
        // Set return URL
        loginUrl.searchParams.set('return_to', window.location.href);
        
        console.log('[Consent Page] Redirecting to login:', loginUrl.toString());
        console.log('[Consent Page] Current URL:', window.location.href);
        
        // Use window.location.href instead of router.push to ensure params are preserved
        window.location.href = loginUrl.toString();
        return;
      }

      setUser(currentUser);

      // Load user profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
      
      if (userProfile) {
        setProfile(userProfile);
      }

      // Load app details
      if (appId) {
        const { data: app, error: appError } = await supabase
          .from('applications')
          .select('*')
          .eq('app_id', appId)
          .single();

        if (appError || !app) {
          setError('Invalid application. Please contact the application owner.');
          setLoading(false);
          return;
        }

        setAppDetails(app);
        
        // Check if user has already authorized this app recently
        // Look for any session in the last 30 days to determine if re-consent is needed
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: recentSessions } = await supabase
          .from('child_app_user_sessions')
          .select('id, last_activity_at')
          .eq('user_id', currentUser.id)
          .eq('app_id', appId)
          .gte('last_activity_at', thirtyDaysAgo.toISOString())
          .order('last_activity_at', { ascending: false })
          .limit(1);
        
        // If user has authorized recently, skip consent and authorize directly
        // This provides seamless re-authentication after logout
        if (recentSessions && recentSessions.length > 0) {
          console.log('[Consent Page] User previously authorized, auto-approving');
          handleAuthorize(true);
        }
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

  const handleAuthorize = async (skipConsent = false) => {
    if (!appId || !redirectUri || !state) {
      setError('Missing required parameters');
      return;
    }

    setAuthorizing(true);
    setError(null);

    // Build authorization URL with all params
    const authUrl = new URL('/api/auth/child-app/authorize', window.location.origin);
    authUrl.searchParams.set('app_id', appId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', responseType);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);
    
    if (skipConsent) {
      authUrl.searchParams.set('skip_consent', 'true');
    }

    // Directly navigate to the authorize endpoint
    // This will handle the redirect properly without CORS issues
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
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
            <div className="flex gap-3 mt-4">
              <Button 
                onClick={() => router.push('/')} 
                variant="outline"
                className="flex-1"
              >
                Return to Home
              </Button>
              {redirectUri && (
                <Button 
                  onClick={handleDeny}
                  variant="outline"
                  className="flex-1"
                >
                  Return to App
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center space-y-4">
          {/* App Logo */}
          <div className="mx-auto">
            {appDetails?.logo_url ? (
              <Image 
                src={appDetails.logo_url} 
                alt={appDetails.name}
                width={72}
                height={72}
                className="rounded-xl shadow-lg"
              />
            ) : (
              <div className="w-18 h-18 bg-primary/10 rounded-xl flex items-center justify-center">
                <Shield className="h-10 w-10 text-primary" />
              </div>
            )}
          </div>
          
          <div>
            <CardTitle className="text-2xl">
              {appDetails?.name || 'Application'} wants to access your account
            </CardTitle>
            <CardDescription className="mt-2">
              Review the permissions this application is requesting
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* User Info Card */}
          <div className="bg-muted rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">{profile?.full_name || user?.email}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            {profile?.role && (
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">{profile.role}</span>
              </div>
            )}
          </div>

          {/* Permissions List */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm">This application will be able to:</h3>
            <div className="space-y-2">
              {scope.split(' ').map((permission) => (
                <div key={permission} className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {permission === 'read' && 'Read your profile information'}
                      {permission === 'write' && 'Make changes on your behalf'}
                      {permission === 'profile' && 'Access your complete profile'}
                      {permission === 'admin' && 'Perform administrative actions'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {permission === 'read' && 'View your name, email, role, and institution'}
                      {permission === 'write' && 'Update records and perform actions as you'}
                      {permission === 'profile' && 'Access all your profile details and preferences'}
                      {permission === 'admin' && 'Access admin features if you have permissions'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* App Description */}
          {appDetails?.description && (
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription>
                <strong>About this app:</strong> {appDetails.description}
              </AlertDescription>
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
              Cancel
            </Button>
            <Button
              onClick={() => handleAuthorize(false)}
              className="flex-1"
              disabled={authorizing}
            >
              {authorizing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Authorizing...
                </>
              ) : (
                'Authorize Access'
              )}
            </Button>
          </div>

          {/* Privacy Note */}
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              By clicking Authorize, you allow {appDetails?.name || 'this application'} to use your information in accordance with their terms of service and privacy policy.
            </p>
            <p className="text-xs text-muted-foreground">
              You can revoke access at any time from your account settings.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <ConsentContent />
    </Suspense>
  );
}