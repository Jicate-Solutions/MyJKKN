'use client';

// ============================================
// ALUMNI EDIT PAGE
// ============================================
// Created: 2026-03-22
// Purpose: Edit alumni profile with comprehensive form
// ============================================


import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useLearnerProfile, useUpdateLearnerProfile } from '@/hooks/use-learner-profiles';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EnquiryForm } from '../../../enquiries/_components/enquiry-form';
import { Loader2, GraduationCap } from 'lucide-react';
import type { LearnerProfile } from '@/types/learner-profile';

interface AlumniEditPageProps {
  params: Promise<{ id: string }>;
}

/**
 * AlumniEditPage Component
 *
 * Page for editing existing alumni profiles.
 * Uses the same comprehensive EnquiryForm as the profiles edit page.
 *
 * Features:
 * - Loads existing alumni data
 * - Pre-populates form with current values
 * - Redirects to alumni detail page on success
 */
const ALUMNI_STATUSES: { value: LearnerProfile['lifecycle_status']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'exited', label: 'Exited' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'alumni', label: 'Alumni' },
];

export default function AlumniEditPage({ params }: AlumniEditPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: learner, isLoading, error } = useLearnerProfile(id);
  const updateMutation = useUpdateLearnerProfile();
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  if (isLoading) {
    return (
      <ContentLayout title="Edit Alumni Profile">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading alumni profile...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (error || !learner) {
    return (
      <ContentLayout title="Edit Alumni Profile">
        <div className="text-center py-8">
          <p className="text-destructive">Failed to load alumni profile</p>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/learners/alumni">Back to Alumni</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const fullName = `${learner.first_name} ${learner.last_name || ''}`.trim();
  const currentStatus = selectedStatus || learner.lifecycle_status;

  const handleStatusSave = async () => {
    if (!selectedStatus || selectedStatus === learner.lifecycle_status) return;
    try {
      await updateMutation.mutateAsync({
        id: learner.id,
        dto: { lifecycle_status: selectedStatus as LearnerProfile['lifecycle_status'] },
      });
      toast.success(`Status updated to ${selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)}`);
      router.refresh();
    } catch (error) {
      console.error('[alumni/edit] Error updating status:', error);
      toast.error('Failed to update status. Please try again.');
    }
  };

  return (
    <ContentLayout title={`Edit: ${fullName}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners', href: '/learners' },
          { label: 'Alumni', href: '/learners/alumni' },
          { label: fullName, href: `/learners/alumni/${id}` },
          { label: 'Edit' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Edit Alumni Profile</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Update profile details for {fullName}
          </p>
        </div>

        {/* Status Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" />
              Profile Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Select value={currentStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {ALUMNI_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleStatusSave}
                disabled={
                  !selectedStatus ||
                  selectedStatus === learner.lifecycle_status ||
                  updateMutation.isPending
                }
                variant="outline"
                size="sm"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save Status
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Profile Details Form */}
        <Card className="p-6">
          <EnquiryForm
            learner={learner}
            onSuccess={(updatedLearner) => {
              router.push(`/learners/alumni/${updatedLearner.id}`);
            }}
          />
        </Card>
      </div>
    </ContentLayout>
  );
}
