'use client';

// app/(routes)/internships/_components/no-access-alert.tsx
// Shared fallback rendered by PermissionGuard when an internship page is
// gated out for the current user. Standardized so every internship page
// produces an identical "no access" UX instead of bouncing/redirecting
// silently (see CLAUDE.md rule #27 — permission failures must be explicit).

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function NoAccessAlert() {
  return (
    <ContentLayout title="Access denied">
      <Card className="mx-auto mt-10 max-w-xl">
        <CardContent className="py-8">
          <Alert variant="destructive" className="border-0 p-0">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>You don&apos;t have permission to view this page</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p className="text-sm">
                Your current role does not include access to this internship page.
                If you believe this is wrong, contact your administrator.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
