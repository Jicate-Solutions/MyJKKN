'use client';

import { Wifi, RefreshCw, Home, Signal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <div className="relative">
              <Wifi className="h-10 w-10 text-gray-400" />
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-red-500">
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-xs text-white">×</span>
                </div>
              </div>
            </div>
          </div>
          <CardTitle className="text-xl">You&apos;re Offline</CardTitle>
          <CardDescription className="text-base">
            It looks like you&apos;ve lost your internet connection. Please check your network and try again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <h4 className="font-medium mb-2">What you can do:</h4>
            <ul className="space-y-1 text-left">
              <li className="flex items-center gap-2">
                <Signal className="h-4 w-4" />
                Check your WiFi or mobile data connection
              </li>
              <li className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Try refreshing the page
              </li>
              <li className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Go back to the homepage when online
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <Button
              onClick={() => window.location.reload()}
              className="w-full"
              variant="default"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>

            <Button
              onClick={() => window.history.back()}
              variant="outline"
              className="w-full"
            >
              Go Back
            </Button>

            <Link href="/" className="block">
              <Button variant="ghost" className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Homepage
              </Button>
            </Link>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              MyJKKN works best with an internet connection, but some features may be available offline.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}