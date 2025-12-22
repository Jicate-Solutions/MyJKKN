// ============================================
// LEARNER DETAIL PAGE
// ============================================
// Created: 2025-01-19
// Purpose: Display comprehensive learner profile details
// ============================================

'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import { LearnerDetail } from '../_components/learner-detail';
import { LearnerDetailActions } from '../_components/learner-detail-actions';
import type { LearnerProfile } from '@/types/learner-profile';
import { usePermissions } from '@/hooks/use-permissions';

interface LearnerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function LearnerDetailPage({ params }: LearnerDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [learner, setLearner] = useState<LearnerProfile | null>(null);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading,
  } = usePermissions();

  // Check for permission to view learner details
  useEffect(() => {
    // Skip permission check while permissions are still loading
    if (permissionsLoading) {
      console.log('[learners/profiles/[id]] Permissions are still loading...');
      return;
    }

    const shouldRedirect = !isSuperAdmin && !canAccess('learners', 'view');

    if (shouldRedirect) {
      console.log('[learners/profiles/[id]] Access denied for learner details page');
      router.push('/unauthorized');
    }
  }, [isSuperAdmin, canAccess, router, permissionsLoading]);

  useEffect(() => {
    // UUID validation regex
    const isValidUUID = (str: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    async function fetchLearner() {
      // Check if ID is a valid UUID
      if (!isValidUUID(id)) {
        console.warn(`[learners/profiles/[id]] Invalid UUID format: "${id}"`);
        setLoading(false);
        setError(`Invalid learner ID format. The page "${id}" does not exist.`);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await LearnerProfileService.getLearnerProfile(id);
        setLearner(data);
      } catch (err) {
        console.error('[learners/profiles/[id]] Error fetching learner:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch learner details'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchLearner();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title="Learner Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Learner Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">
            {error.includes('Invalid learner ID format') ? 'Page Not Found' : 'Error Loading Learner'}
          </h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          {error.includes('bulk-edit') && (
            <p className="text-sm text-amber-600 mb-4">
              The Bulk Edit feature is coming soon. Please use individual edit for now.
            </p>
          )}
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
