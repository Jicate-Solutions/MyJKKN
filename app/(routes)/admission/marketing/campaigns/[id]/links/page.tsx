'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  useCampaign,
  useCampaignLinks,
  useDeactivateCampaignLink,
} from '@/hooks/admission/use-campaigns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CampaignLinksTable } from '@/components/admission/marketing/campaign-links-table';
import { CreateLinkDialog } from '@/components/admission/marketing/create-link-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function CampaignLinksPage() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign } = useCampaign(id);
  const { data: links, isLoading } = useCampaignLinks(id);
  const [pendingDeactivateLinkId, setPendingDeactivateLinkId] =
    useState<string>('');
  const deactivate = useDeactivateCampaignLink(
    id,
    pendingDeactivateLinkId,
  );

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <PermissionGuard module="admission.campaigns" action="view">
      <div className="space-y-4 p-6">
        <Link
          href={`/admission/marketing/campaigns/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {campaign.name}
        </Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Share links</CardTitle>
            <PermissionGuard
              module="admission.campaigns"
              action="create"
            >
              <CreateLinkDialog
                campaignId={id}
                campaignSource={campaign.source}
              />
            </PermissionGuard>
          </CardHeader>
          <CardContent>
            <CampaignLinksTable
              links={links}
              loading={isLoading}
              onDeactivate={(linkId) => {
                setPendingDeactivateLinkId(linkId);
                setTimeout(() => deactivate.mutate(), 0);
              }}
            />
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
