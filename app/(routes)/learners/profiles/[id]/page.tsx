// ============================================
// LEARNER DETAIL PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-19
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Purpose: Display comprehensive learner profile details
// ============================================

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { getLearnerProfile } from '../_data/get-learner-profile';
import { getLearnerBilling } from '../_data/get-learner-billing';
import { LearnerDetail } from '../_components/learner-detail';
import { LearnerDetailActions } from '../_components/learner-detail-actions';

interface LearnerDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Learner Detail Page - Server Component
 *
 * Performance improvements:
 * - Data fetched on server (faster TTI)
 * - Cached with 5 minute TTL (warm cache for student data)
 * - No client-side loading states
 * - Automatic revalidation on data changes
 */
export default async function LearnerDetailPage({ params }: LearnerDetailPageProps) {
  // Await params as per Next.js 16 async API
  const { id } = await params;

  // UUID validation regex
  const isValidUUID = (str: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  // Check if ID is a valid UUID
  if (!isValidUUID(id)) {
    return (
      <ContentLayout title="Learner Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Page Not Found</h2>
          <p className="text-muted-foreground mb-4">
            Invalid learner ID format. The page "{id}" does not exist.
          </p>
          <Button asChild>
            <Link href="/learners/profiles">Back to Learners</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Fetch data on server with caching (billing in parallel, non-blocking)
  let learner;
  let billing = null;
  try {
    const [learnerResult, billingResult] = await Promise.all([
      getLearnerProfile(id),
      getLearnerBilling(id),
    ]);
    learner = learnerResult;
    billing = billingResult;
  } catch (error) {
    console.error('[learners/profiles/[id]] Error fetching learner:', error);
    return (
      <ContentLayout title="Learner Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Error Loading Learner</h2>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'Failed to fetch learner details'}
          </p>
          <Button asChild>
            <Link href="/learners/profiles">Back to Learners</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!learner) {
    return (
      <ContentLayout title="Learner Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Learner Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The requested learner could not be found.
          </p>
          <Button asChild>
            <Link href="/learners/profiles">Back to Learners</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      title={`Learner: ${learner.first_name} ${learner.last_name || ''}`.trim()}
    >
      <div className="space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners', href: '/learners/profiles' },
            {
              label: `${learner.first_name} ${learner.last_name || ''}`.trim(),
            },
          ]}
        />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {`${learner.first_name} ${learner.last_name || ''}`.trim()}
            </h1>
            <p className="text-muted-foreground">
              {learner.roll_number
                ? `Roll No: ${learner.roll_number}`
                : 'No Roll Number Assigned'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/learners/profiles">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <LearnerDetailActions learner={learner} />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <LearnerDetail learner={learner} />
        </div>
      </div>
    </ContentLayout>
  );
}
