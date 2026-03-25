// ============================================
// LEARNER PROMOTION PAGE
// ============================================
// Created: 2025-01-20
// Purpose: Promote learners (semester/section + status changes)
// Features: Bulk operations with progress tracking
// ============================================

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// Promotion components
import { SemesterPromotionForm } from '../_components/semester-promotion-form';
import { StatusPromotionForm } from '../_components/status-promotion-form';

/**
 * LearnerPromotionPage Component
 *
 * Handles two types of promotions:
 * 1. Semester/Section Promotion - Move learners to new semester/section
 * 2. Status Promotion - Change lifecycle status (active/inactive/exited/graduated)
 *
 * Features:
 * - Bulk operations with progress tracking
 * - Real-time success/failure reporting
 * - Account disabling for 'exited' status
 * - Cache invalidation after promotion
 */
export default function LearnerPromotionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];

  const [activeTab, setActiveTab] = useState('semester');

  const handleDeselectLearner = (learnerId: string) => {
    const updatedIds = selectedIds.filter(id => id !== learnerId);

    if (updatedIds.length === 0) {
      // If no learners left, redirect back to profiles page
      router.push('/learners/profiles');
    } else {
      // Update URL with remaining IDs
      router.push(`/learners/profiles/promotion?ids=${updatedIds.join(',')}`);
    }
  };

  return (
    <ContentLayout title="Promote Learners">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners', href: '/learners' },
          { label: 'Profiles', href: '/learners/profiles' },
          { label: 'Promotion' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Promote Learners</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {selectedIds.length > 0
                ? `${selectedIds.length} learner(s) selected for promotion`
                : 'Select learners from the profiles page to promote'}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/learners/profiles">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Profiles
            </Link>
          </Button>
        </div>

        {/* Promotion Forms */}
        <Card className="p-6">
          {selectedIds.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No learners selected. Please select learners from the profiles page to proceed with promotion.
              </p>
              <Button asChild>
                <Link href="/learners/profiles">Go to Profiles Page</Link>
              </Button>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="semester">Semester/Section Promotion</TabsTrigger>
                <TabsTrigger value="status">Status Promotion</TabsTrigger>
              </TabsList>

              <TabsContent value="semester" className="space-y-4 mt-6">
                <SemesterPromotionForm
                  selectedLearnerIds={selectedIds}
                  onSuccess={() => router.push('/learners/profiles')}
                  onDeselectLearner={handleDeselectLearner}
                />
              </TabsContent>

              <TabsContent value="status" className="space-y-4 mt-6">
                <StatusPromotionForm
                  selectedLearnerIds={selectedIds}
                  onSuccess={() => router.push('/learners/profiles')}
                  onDeselectLearner={handleDeselectLearner}
                />
              </TabsContent>
            </Tabs>
          )}
        </Card>
      </div>
    </ContentLayout>
  );
}
