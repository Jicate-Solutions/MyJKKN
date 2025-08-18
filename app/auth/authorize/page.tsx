'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AuthorizePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Redirect to login page with all parameters
    const params = new URLSearchParams();
    
    // Copy all search parameters
    if (searchParams) {
      searchParams.forEach((value, key) => {
        params.append(key, value);
      });
    }
    
    // Redirect to login page
    router.replace(`/auth/login?${params.toString()}`);
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="flex flex-col items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
}