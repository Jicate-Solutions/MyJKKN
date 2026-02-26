'use client';

// app/(public)/cookie-cleanup/page.tsx
// Emergency cookie cleanup page for fixing HTTP 431 errors

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { clearAuthCookies, debugCookies, getCookiesSize } from '@/lib/utils/clear-auth-cookies';
import { AlertCircle, CheckCircle2, Trash2, Info } from 'lucide-react';

export default function CookieCleanupPage() {
  const [cookieStats, setCookieStats] = useState<{
    totalSize: number;
    cookies: Array<{ name: string; size: number }>;
    exceededLimit: boolean;
  } | null>(null);
  const [cleaned, setCleaned] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    analyzeCookies();
  }, []);

  const analyzeCookies = () => {
    const stats = getCookiesSize();
    setCookieStats(stats);
  };

  const handleCleanup = async () => {
    setLoading(true);

    try {
      // Client-side cleanup
      clearAuthCookies();

      // Server-side cleanup
      await fetch('/api/auth/cleanup-cookies', {
        method: 'POST'
      });

      setCleaned(true);

      // Re-analyze after cleanup
      setTimeout(() => {
        analyzeCookies();
      }, 500);
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDebug = () => {
    debugCookies();
  };

  return (
    <div className="container max-w-2xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-6 w-6" />
            Cookie Cleanup Tool
          </CardTitle>
          <CardDescription>
            Fix HTTP 431 errors by clearing authentication cookies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cleaned && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Success!</AlertTitle>
              <AlertDescription className="text-green-700">
                Authentication cookies have been cleared. You can now try logging in again.
              </AlertDescription>
            </Alert>
          )}

          {cookieStats && cookieStats.exceededLimit && !cleaned && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Warning: Large Cookies Detected</AlertTitle>
              <AlertDescription>
                Your cookies exceed browser limits. This may cause HTTP 431 errors.
                Click the cleanup button below to fix this issue.
              </AlertDescription>
            </Alert>
          )}

          {cookieStats && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <h3 className="font-semibold text-sm">Cookie Statistics</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-600">Total Cookies</div>
                  <div className="font-mono font-bold">{cookieStats.cookies.length}</div>
                </div>
                <div>
                  <div className="text-slate-600">Total Size</div>
                  <div className="font-mono font-bold">
                    {(cookieStats.totalSize / 1024).toFixed(2)} KB
                  </div>
                </div>
              </div>

              {cookieStats.cookies.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-slate-600 mb-2">Largest Cookies:</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {cookieStats.cookies.slice(0, 5).map((cookie, index) => (
                      <div key={index} className="text-xs font-mono bg-white p-2 rounded border">
                        <div className="flex justify-between items-center">
                          <span className="truncate flex-1">{cookie.name}</span>
                          <span className={cookie.size > 4000 ? 'text-red-600 font-bold' : 'text-slate-600'}>
                            {(cookie.size / 1024).toFixed(2)} KB
                            {cookie.size > 4000 && ' ⚠️'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleCleanup}
              disabled={loading}
              className="flex-1"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {loading ? 'Cleaning...' : 'Clear Auth Cookies'}
            </Button>

            <Button
              onClick={handleDebug}
              variant="outline"
            >
              <Info className="h-4 w-4 mr-2" />
              Debug Console
            </Button>
          </div>

          {cleaned && (
            <Button
              onClick={() => window.location.href = '/auth/login'}
              className="w-full"
              variant="default"
            >
              Go to Login Page
            </Button>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>What causes HTTP 431 errors?</AlertTitle>
            <AlertDescription className="text-sm mt-2 space-y-2">
              <p>
                <strong>HTTP 431</strong> occurs when request headers exceed server limits.
                Common causes:
              </p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Large OAuth tokens from Google authentication</li>
                <li>Accumulated cookies from multiple login attempts</li>
                <li>Supabase session data exceeding 4KB cookie limit</li>
              </ul>
              <p className="mt-2">
                This tool removes all authentication cookies to resolve the issue.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
