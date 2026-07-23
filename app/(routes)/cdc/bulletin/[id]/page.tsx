'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useCdcOpportunity, useArchiveCdcOpportunity } from '@/hooks/cdc/use-cdc-bulletin';
import { useAuth } from '@/hooks/use-auth';
import { ArrowLeft, Calendar, ExternalLink, Archive, Megaphone } from 'lucide-react';
import type { BulletinStatus } from '@/types/cdc/bulletin';

const STATUS_COLORS: Record<BulletinStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-700',
};

// Title-case the raw status enum for display (e.g. "published" -> "Published").
// The STATUS_COLORS lookup above still uses the raw enum value.
function humanizeStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function BulletinOpportunityDetailPage(props: Props) {
  return (
    <PermissionGuard module="cdc.bulletin" action="view">
      <BulletinOpportunityDetailContent {...props} />
    </PermissionGuard>
  );
}

function BulletinOpportunityDetailContent({ params }: Props) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: opp, isLoading } = useCdcOpportunity(id);
  const archiveMutation = useArchiveCdcOpportunity();

  const canManage = profile?.is_super_admin ||
    profile?.role === 'admin' ||
    profile?.role === 'administrator' ||
    profile?.role === 'cdc_head' ||
    profile?.role === 'cdc_coordinator';

  if (isLoading) {
    return (
      <ContentLayout title="Opportunity">
        <div className="space-y-4 mt-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </ContentLayout>
    );
  }

  if (!opp) {
    return (
      <ContentLayout title="Not Found">
        <div className="mt-8 text-center">
          <p className="text-lg">Opportunity not found.</p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/cdc/bulletin"><ArrowLeft className="w-4 h-4 mr-2" />Back to bulletin</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={opp.title}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC' },
        { label: 'Opportunities Bulletin', href: '/cdc/bulletin' },
        { label: opp.title },
      ]} />

      <div className="space-y-6 mt-4 max-w-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cdc/bulletin"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{opp.title}</h1>
              <Badge className={STATUS_COLORS[opp.status ?? 'published']}>
                {humanizeStatus(opp.status ?? 'published')}
              </Badge>
            </div>
            {opp.source_organisation && (
              <p className="text-sm text-muted-foreground mt-0.5">{opp.source_organisation}</p>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4" /> Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {opp.description && (
              <p className="text-muted-foreground whitespace-pre-line">{opp.description}</p>
            )}
            {opp.category && (
              <div>
                <span className="font-medium">Category: </span>
                <span className="capitalize">{opp.category}</span>
              </div>
            )}
            {opp.deadline_date && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>Deadline: <strong>{opp.deadline_date}</strong></span>
              </div>
            )}
            {opp.stipend_text && (
              <div>
                <span className="font-medium">Benefit / Stipend: </span>
                <span>{opp.stipend_text}</span>
              </div>
            )}
            {opp.eligibility_text && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-1">Eligibility</p>
                  <p className="text-muted-foreground whitespace-pre-line">{opp.eligibility_text}</p>
                </div>
              </>
            )}

            {(opp.apply_url || opp.detail_url) && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-3">
                  {opp.apply_url && (
                    <Button asChild>
                      <a href={opp.apply_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Apply Now
                      </a>
                    </Button>
                  )}
                  {opp.detail_url && (
                    <Button asChild variant="outline">
                      <a href={opp.detail_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        More Info
                      </a>
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Posted by */}
        {opp.poster && (
          <p className="text-xs text-muted-foreground">
            Posted by {opp.poster.full_name} · {new Date(opp.posted_at).toLocaleDateString()}
          </p>
        )}

        {/* Admin actions */}
        {!opp.archived_at && (
          <PermissionGuard module="cdc.bulletin" action="delete">
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => archiveMutation.mutate(id)}
                disabled={archiveMutation.isPending}
              >
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </Button>
            </div>
          </PermissionGuard>
        )}
      </div>
    </ContentLayout>
  );
}
