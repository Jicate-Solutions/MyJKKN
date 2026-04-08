

// ============================================
// ALUMNI DETAIL PAGE (SERVER COMPONENT)
// ============================================
// Created: 2026-03-22
// Purpose: Display comprehensive alumni profile details
// ============================================

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { getLearnerProfile } from '../../profiles/_data/get-learner-profile';
import { LearnerDetail } from '../../profiles/_components/learner-detail';
import { AlumniDetailActions } from '../_components/alumni-detail-actions';

interface AlumniDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AlumniDetailPage({ params }: AlumniDetailPageProps) {
  const { id } = await params;

  const isValidUUID = (str: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  if (!isValidUUID(id)) {
    return (
      <ContentLayout title="Alumni Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Page Not Found</h2>
          <p className="text-muted-foreground mb-4">
            Invalid alumni ID format. The page &quot;{id}&quot; does not exist.
          </p>
          <Button asChild>
            <Link href="/learners/alumni">Back to Alumni</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  let learner;
  try {
    learner = await getLearnerProfile(id);
  } catch (error) {
    console.error('[learners/alumni/[id]] Error fetching alumni:', error);
    return (
      <ContentLayout title="Alumni Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Error Loading Alumni</h2>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'Failed to fetch alumni details'}
          </p>
          <Button asChild>
            <Link href="/learners/alumni">Back to Alumni</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!learner) {
    return (
      <ContentLayout title="Alumni Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Alumni Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The requested alumni could not be found.
          </p>
          <Button asChild>
            <Link href="/learners/alumni">Back to Alumni</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const fullName = `${learner.first_name} ${learner.last_name || ''}`.trim();

  return (
    <ContentLayout title={`Alumni: ${fullName}`}>
      <div className="space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners', href: '/learners/alumni' },
            { label: 'Alumni', href: '/learners/alumni' },
            { label: fullName },
          ]}
        />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
            <p className="text-muted-foreground">
              {learner.roll_number
                ? `Roll No: ${learner.roll_number}`
                : 'No Roll Number Assigned'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/learners/alumni">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <AlumniDetailActions learner={learner} />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <LearnerDetail learner={learner} />
        </div>
      </div>
    </ContentLayout>
  );
}
