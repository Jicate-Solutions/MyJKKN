'use client';

// Thin client wrapper — /events/propose/[id]/status
// Per Director spec (chat-bypass-workflow-gravity §5):
//   "Keep [id]/status as separate route, but next/dynamic-load"
//
// In Next.js 16 App Router, `next/dynamic({ ssr: false })` must live in a
// Client Component ('use client'). We use `useParams()` to get the id so
// the Server Component wrapper is not needed.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamic import with ssr: false — timeline fetches via Supabase browser client.
// Valid here because this is a Client Component.
const ProposalTimeline = dynamic(
  () => import('./_components/timeline'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 p-1" aria-label="Loading proposal timeline">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    ),
  }
);

export default function ProposalStatusPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  return (
    <ContentLayout title="Proposal Status">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/events">Events</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/events/propose">Propose</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Status</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="max-w-xl">
        <Link
          href="/events/propose"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          aria-label="Back to propose form"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Propose
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Proposal Status</CardTitle>
            <p className="text-sm text-muted-foreground">
              Track where your event proposal is in the approval workflow.
            </p>
          </CardHeader>
          <CardContent>
            {/* Timeline loads client-side via next/dynamic({ ssr: false }) */}
            {id ? (
              <ProposalTimeline proposalId={id} />
            ) : (
              <p className="text-sm text-muted-foreground">Proposal ID not found in URL.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
