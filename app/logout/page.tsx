'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

function LogoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const handleLogout = async () => {
      const appId = searchParams?.get('app_id');
      const redirectUri = searchParams?.get('redirect_uri');
      const sessionId = searchParams?.get('session_id');
      
      try {
        // Sign out from Supabase
        const supabase = createClient();
        await supabase.auth.signOut();
        
        // If this is a child app logout
        if (appId) {
          try {
            // Log the logout event (don't await to avoid delays)
            fetch('/api/auth/child-app/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                app_id: appId,
                session_id: sessionId,
                redirect_uri: redirectUri
              })
            }).catch(console.error);
          } catch (error) {
            console.error('Failed to log logout event:', error);
          }
          
          // Validate and redirect to the child app if redirect URI is provided
          if (redirectUri) {
            // Basic validation to prevent open redirect vulnerabilities
            try {
              const url = new URL(redirectUri);
              // You could add more validation here like checking allowed domains
              window.location.href = redirectUri;
              return;
            } catch (error) {
              console.error('Invalid redirect URI:', redirectUri);
            }
          }
        }
        
        // Default redirect to login with a small delay to ensure logout completes
        setTimeout(() => {
          router.push('/auth/login');
        }, 500);
      } catch (error) {
        console.error('Logout error:', error);
        // Even if logout fails, redirect to login
        router.push('/auth/login');
      }
    };
    
    handleLogout();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Signing out...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LogoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <LogoutContent />
    </Suspense>
  );
}