'use client';

// app/(routes)/learners/enquiries/[id]/_components/enquiry-detail-tabs.tsx
//
// Client wrapper that adds tabs to the read-only enquiry detail page.
// Tabs: Details (always), Activities (permission), Checklist (permission),
// Billing (permission + status gate: account/reserved/admitted only).

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Activity as ActivityIcon, ClipboardCheck, IndianRupee } from 'lucide-react';
import { EnquiryDetail } from '../../_components/enquiry-detail';
import { ActivitiesTab } from './activities-tab';
import { ChecklistTab } from './checklist-tab';
import { BillingTab } from './billing-tab';
import { usePermissions } from '@/hooks/use-permissions';
import { useTabParam } from '@/hooks/use-tab-param';
import type { LearnerProfile } from '@/types/learner-profile';

const BILLING_VISIBLE_STATUSES = new Set(['account', 'reserved', 'admitted']);

const ENQUIRY_DETAIL_TABS = ['details', 'activities', 'checklist', 'billing'] as const;

interface EnquiryDetailTabsProps {
  enquiry: LearnerProfile;
}

export function EnquiryDetailTabs({ enquiry }: EnquiryDetailTabsProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useTabParam('details', ENQUIRY_DETAIL_TABS);
  const canSeeActivities =
    isSuperAdmin || canAccess('admission.enquiries.activities', 'view');
  const canSeeChecklist =
    isSuperAdmin || canAccess('admission.enquiries.checklist', 'view');
  const canSeeBilling =
    BILLING_VISIBLE_STATUSES.has(enquiry.lifecycle_status) &&
    (isSuperAdmin || canAccess('learners', 'finance.view'));

  const hasTabs = canSeeActivities || canSeeChecklist || canSeeBilling;

  if (!hasTabs) {
    return (
      <div className="flex flex-col lg:flex-row gap-8">
        <EnquiryDetail enquiry={enquiry} />
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
        <TabsTrigger value="details" className="gap-2">
          <FileText className="h-4 w-4" />
          Details
        </TabsTrigger>
        {canSeeActivities && (
          <TabsTrigger value="activities" className="gap-2">
            <ActivityIcon className="h-4 w-4" />
            Activities
          </TabsTrigger>
        )}
        {canSeeChecklist && (
          <TabsTrigger value="checklist" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Checklist
          </TabsTrigger>
        )}
        {canSeeBilling && (
          <TabsTrigger value="billing" className="gap-2">
            <IndianRupee className="h-4 w-4" />
            Billing
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="details" className="mt-4">
        <div className="flex flex-col lg:flex-row gap-8">
          <EnquiryDetail enquiry={enquiry} />
        </div>
      </TabsContent>

      {canSeeActivities && (
        <TabsContent value="activities" className="mt-4">
          <ActivitiesTab
            learnerProfileId={enquiry.id}
            institutionId={enquiry.institution_id ?? ''}
          />
        </TabsContent>
      )}

      {canSeeChecklist && (
        <TabsContent value="checklist" className="mt-4">
          <ChecklistTab learnerProfileId={enquiry.id} />
        </TabsContent>
      )}

      {canSeeBilling && (
        <TabsContent value="billing" className="mt-4">
          <BillingTab learnerId={enquiry.id} />
        </TabsContent>
      )}
    </Tabs>
  );
}
