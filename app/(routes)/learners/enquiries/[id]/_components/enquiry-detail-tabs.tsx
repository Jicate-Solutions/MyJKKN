'use client';

// app/(routes)/learners/enquiries/[id]/_components/enquiry-detail-tabs.tsx
//
// Client wrapper that adds the Activities tab to the read-only enquiry
// detail page. Mirrors the edit page's tab structure so the navigation
// pattern is consistent — admission officers see Details + Activities;
// users without permission see Details only (no tab UI at all).
//
// The enquiry detail page is a server component (force-dynamic), but
// shadcn Tabs use Radix which is client-only. This thin wrapper bridges
// the boundary: parent server component fetches the enquiry data and
// passes it in; we render the Tabs client-side and route the Details
// content through the existing <EnquiryDetail/> renderer.

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Activity as ActivityIcon } from 'lucide-react';
import { EnquiryDetail } from '../../_components/enquiry-detail';
import { ActivitiesTab } from './activities-tab';
import { usePermissions } from '@/hooks/use-permissions';
import type { LearnerProfile } from '@/types/learner-profile';

interface EnquiryDetailTabsProps {
  enquiry: LearnerProfile;
}

export function EnquiryDetailTabs({ enquiry }: EnquiryDetailTabsProps) {
  // Same permission gate as the edit page — super_admin always sees;
  // admission + admission_staff get it via migration; counselor roles
  // and custom roles without the perm see only Details.
  const { canAccess, isSuperAdmin } = usePermissions();
  const canSeeActivities =
    isSuperAdmin || canAccess('admission.enquiries.activities', 'view');

  if (!canSeeActivities) {
    return (
      <div className="flex flex-col lg:flex-row gap-8">
        <EnquiryDetail enquiry={enquiry} />
      </div>
    );
  }

  return (
    <Tabs defaultValue="details" className="w-full">
      <TabsList>
        <TabsTrigger value="details" className="gap-2">
          <FileText className="h-4 w-4" />
          Details
        </TabsTrigger>
        <TabsTrigger value="activities" className="gap-2">
          <ActivityIcon className="h-4 w-4" />
          Activities
        </TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="mt-4">
        <div className="flex flex-col lg:flex-row gap-8">
          <EnquiryDetail enquiry={enquiry} />
        </div>
      </TabsContent>

      <TabsContent value="activities" className="mt-4">
        <ActivitiesTab
          learnerProfileId={enquiry.id}
          institutionId={enquiry.institution_id ?? ''}
        />
      </TabsContent>
    </Tabs>
  );
}
