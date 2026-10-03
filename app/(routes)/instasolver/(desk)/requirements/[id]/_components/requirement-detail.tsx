'use client';

import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { ActivityTimeline } from '@/components/instasolver/activity-timeline';
import { RequirementStatusBadge } from '@/components/instasolver/badges';
import { NotesPanel } from '@/components/instasolver/notes-panel';
import { PhotoStrip } from '@/components/instasolver/photo-strip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstaSolverAccess, useRequirement } from '@/hooks/instasolver/use-instasolver';
import type { Requirement } from '@/types/instasolver';
import { formatDate, formatDateTime, formatINR } from '../../_components/format';
import { RequirementActions } from './requirement-actions';

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  const empty = children === null || children === undefined || children === '' || children === '—';
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{empty ? '—' : children}</dd>
    </div>
  );
}

function ReviewCard({ r }: { r: Requirement }) {
  if (r.status === 'pending' || r.status === 'withdrawn') return null;
  const noteLabel = r.status === 'rejected' ? 'Reason for rejection' : 'Note from the CAO';
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Review</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item label="Reviewed by">{r.reviewer?.full_name}</Item>
          <Item label="Reviewed on">{formatDateTime(r.reviewed_at)}</Item>
          <Item label={noteLabel} wide>
            {r.review_notes}
          </Item>
          {r.status === 'fulfilled' && <Item label="Fulfilled on">{formatDateTime(r.fulfilled_at)}</Item>}
        </dl>
      </CardContent>
    </Card>
  );
}

export function RequirementDetail({ id }: { id: number }) {
  const { data: access, isLoading: accessLoading } = useInstaSolverAccess();
  const { data: r, isLoading, error } = useRequirement(id);

  const back = (
    <Button asChild variant="outline">
      <Link href="/instasolver/requirements">
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to requirements
      </Link>
    </Button>
  );

  if (isLoading || accessLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !r) {
    return (
      <Card className="mx-auto mt-8 max-w-md">
        <CardContent className="space-y-3 pt-6 text-center">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="font-medium">{error ? 'This requirement could not be loaded' : 'Requirement not found'}</p>
          <p className="text-sm text-muted-foreground">
            {error
              ? 'Refresh the page to try again.'
              : 'It may not exist, or it belongs to someone else. You can see your own requirements, and the CAO and Principals see theirs.'}
          </p>
          {back}
        </CardContent>
      </Card>
    );
  }

  const isManager = !!access?.is_manager;
  const isRequester = !!access?.user_id && access.user_id === r.requested_by;

  return (
    <div className="space-y-4">
      <PageBreadcrumb
        items={[
          { label: 'InstaSolver', href: '/instasolver/dashboard' },
          { label: 'Requirements', href: '/instasolver/requirements' },
          { label: r.reference_no, isCurrent: true }
        ]}
      />
      <PageHeader
        title={r.item_requested}
        description={`${r.reference_no} · requested by ${r.requester?.full_name ?? 'someone'} on ${formatDate(r.created_at)}`}
        actions={back}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RequirementStatusBadge status={r.status} className="px-3 py-1 text-sm" />
        <RequirementActions requirement={r} isManager={isManager} isRequester={isRequester} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label="Institution">{r.institution?.name}</Item>
                <Item label="Category">{r.category?.name}</Item>
                <Item label="Specifications" wide>
                  {r.specifications}
                </Item>
                <Item label="Quantity needed">{r.quantity_needed}</Item>
                <Item label="Cost estimate">{formatINR(r.cost_estimate)}</Item>
                <Item label="Needed by">{formatDate(r.needed_by)}</Item>
                <Item label="Last ordered">{formatDate(r.last_ordered)}</Item>
                <Item label="Usage location">{r.usage_location}</Item>
                <Item label="Delivery location">{r.delivery_location}</Item>
                <Item label="Usage details" wide>
                  {r.usage_details}
                </Item>
                <Item label="Why it is needed" wide>
                  {r.reason_needed}
                </Item>
                <Item label="Preferred vendor" wide>
                  {r.preferred_vendor}
                </Item>
                <Item label="Contact person">{r.contact_person}</Item>
                <Item label="Contact phone">{r.contact_phone}</Item>
                <Item label="Alternate phone">{r.alternate_phone}</Item>
              </dl>
            </CardContent>
          </Card>

          {r.image_urls?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Photographs</CardTitle>
              </CardHeader>
              <CardContent>
                <PhotoStrip urls={r.image_urls} label="Requirement photograph" />
              </CardContent>
            </Card>
          )}

          <ReviewCard r={r} />
        </div>

        <div className="space-y-4">
          <NotesPanel entity="requirement" id={r.id} canWrite={isManager || isRequester} canWriteInternal={isManager} />
          <ActivityTimeline entity="requirement" id={r.id} />
        </div>
      </div>
    </div>
  );
}
