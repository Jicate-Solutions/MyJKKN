'use client';

// ============================================================================
// Elective OKR Edit Page - DEPRECATED
//
// DEPRECATION NOTICE (2026-02-01):
// Learner-specific elective OKRs have been replaced by the Competency module.
// Editing is disabled for all users - data is preserved for historical reference.
// This page redirects to the view page (which shows historical data for admins).
// ============================================================================

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight } from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';

export default function EditElectiveOKRPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // Auto-redirect to view page after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push(`/okr/elective/${id}`);
    }, 3000);
    return () => clearTimeout(timer);
  }, [router, id]);

  return (
    <div className="container mx-auto py-6 max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <CardTitle>Editing Disabled</CardTitle>
              <CardDescription>
                Elective OKR editing is no longer available
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Feature Deprecated</AlertTitle>
            <AlertDescription className="text-amber-700">
              As of February 2026, individual/learner OKRs have been replaced by the new
              <strong> Competency Module</strong>. Editing of historical elective OKRs is
              disabled to preserve data integrity.
            </AlertDescription>
          </Alert>

          <div className="p-4 bg-muted/50 rounded-lg">
            <h3 className="font-medium mb-2">What you can do:</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>View historical elective OKR data (if you have access)</li>
              <li>Track new personal goals via the Competency module</li>
              <li>Create organization/department objectives in the main OKR system</li>
            </ul>
          </div>

          <p className="text-sm text-muted-foreground">
            Redirecting to view page in 3 seconds...
          </p>

          <div className="flex gap-3">
            <Button asChild>
              <Link href={`/okr/elective/${id}`}>
                View Historical Data
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/competency-catalog">
                Go to Competencies
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
