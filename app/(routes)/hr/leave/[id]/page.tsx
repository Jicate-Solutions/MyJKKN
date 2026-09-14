'use client';

/**
 * One leave request, full page.
 *
 * Nothing links here any more — the requests list opens LeaveRequestDetailSheet
 * instead (2026-09-07). The route is kept so a bookmarked or shared request URL
 * still resolves, and it renders the SAME LeaveRequestDetail body the sheet
 * does rather than a second copy that would drift.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';

import { LeaveRequestDetail } from '../_components/leave-request-detail';

export default function ApplicationDetailPage() {
  const params = useParams();
  const id =
    typeof params.id === 'string'
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : '';

  return (
    <ContentLayout title="Leave Request">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr/leave/requests">Leave</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Request</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card className="mt-6 max-w-3xl">
        <CardContent className="p-6">
          <LeaveRequestDetail applicationId={id} />
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
