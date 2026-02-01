'use client';

// ============================================================================
// Create Elective OKR Page - DEPRECATED
//
// DEPRECATION NOTICE (2026-02-01):
// Learner-specific elective OKRs have been replaced by the Competency module.
// This page now redirects users to the main objectives creation page.
// ============================================================================

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Target } from 'lucide-react';

// UI Components
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';

export default function CreateElectiveOKRPage() {
  const router = useRouter();

  // Auto-redirect after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/okr/objectives/create');
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <ContentLayout title="Create OKR">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <CardTitle>Personal OKRs Deprecated</CardTitle>
                <CardDescription>
                  Individual/elective OKRs have been replaced
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="default" className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Feature Changed</AlertTitle>
              <AlertDescription className="text-amber-700">
                As of February 2026, personal/individual OKRs have been replaced by the new
                <strong> Competency Module</strong>. To track personal skills and growth,
                use the Competency system instead.
              </AlertDescription>
            </Alert>

            <div className="p-4 bg-muted/50 rounded-lg">
              <h3 className="font-medium mb-2">What you can do instead:</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <Target className="h-4 w-4 mt-0.5 text-primary" />
                  <span>
                    <strong>Create Department/Institution OKRs:</strong> Use the full OKR
                    creation form for organizational objectives
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Target className="h-4 w-4 mt-0.5 text-primary" />
                  <span>
                    <strong>Track Personal Growth via Competencies:</strong> Use the new
                    Competency module to track skills and learning outcomes
                  </span>
                </li>
              </ul>
            </div>

            <p className="text-sm text-muted-foreground">
              Redirecting to OKR creation page in 5 seconds...
            </p>

            <div className="flex gap-3">
              <Button asChild>
                <Link href="/okr/objectives/create">
                  Create Organization OKR
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/competency-catalog">
                  View Competencies
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
