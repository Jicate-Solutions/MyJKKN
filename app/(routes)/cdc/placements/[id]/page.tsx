'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, ArrowLeft, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import {
  useCdcPlacement,
  useUpdateCdcPlacementStatus,
  canTransitionPlacement,
} from '@/hooks/cdc/use-cdc-placements';
import type { CdcPlacementStatus } from '@/types/cdc/placements';
import {
  CDC_PLACEMENT_STATUS_LABELS,
  CDC_PLACEMENT_STATUS_COLORS,
  isPlacementTerminal,
} from '@/types/cdc/placements';

export default function CdcPlacementDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.placements" action="view">
      <CdcPlacementDetailContent {...props} />
    </PermissionGuard>
  );
}

function CdcPlacementDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading, error } = useCdcPlacement(id);
  const updateStatus = useUpdateCdcPlacementStatus();
  const [declineReason, setDeclineReason] = useState('');
  const [rescindReason, setRescindReason] = useState('');
  const [pendingAction, setPendingAction] = useState<CdcPlacementStatus | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const placement = data?.placement;
  const otherOffers = data?.other_offers ?? [];

  async function handleTransition(to: CdcPlacementStatus) {
    if (!placement) return;
    setTransitionError(null);
    try {
      await updateStatus.mutateAsync({
        id: placement.id,
        update: {
          status: to,
          decline_reason: to === 'declined' ? declineReason || null : null,
          rescind_reason: to === 'rescinded' ? rescindReason || null : null,
        },
      });
      setPendingAction(null);
      setDeclineReason('');
      setRescindReason('');
      router.refresh();
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Failed to update status. Please try again.');
    }
  }

  if (isLoading) {
    return (
      <ContentLayout title="Placement Detail">
        <div className="text-sm text-muted-foreground py-16 text-center">Loading...</div>
      </ContentLayout>
    );
  }

  if (error || !placement) {
    return (
      <ContentLayout title="Placement Detail">
        <div className="py-16 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-muted-foreground">Placement not found or access denied.</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/cdc/placements"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const terminal = isPlacementTerminal(placement.status);

  return (
    <ContentLayout title="Placement Detail">
      <div className="space-y-6 max-w-3xl">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/cdc">CDC</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/cdc/placements">Placements</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Detail</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Status header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {placement.recruiter_name ?? 'Placement'}
            </h1>
            {placement.job_role && (
              <p className="text-muted-foreground">{placement.job_role}</p>
            )}
          </div>
          <span
            className={`px-3 py-1 rounded-full text-sm font-semibold ${CDC_PLACEMENT_STATUS_COLORS[placement.status]}`}
          >
            {CDC_PLACEMENT_STATUS_LABELS[placement.status]}
          </span>
        </div>

        {/* Multi-offer cascade warning */}
        {placement.status === 'offered' && otherOffers.length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex items-start gap-3 pt-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {otherOffers.length} other offer{otherOffers.length > 1 ? 's' : ''} pending
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Accepting this offer will automatically decline all other pending offers for this learner.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Placement details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Placement Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Company</p>
              <p className="font-medium">{placement.recruiter_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Offer Type</p>
              <p className="font-medium">{placement.offer_type_label ?? '—'}</p>
            </div>
            {placement.package_lpa && (
              <div>
                <p className="text-muted-foreground text-xs">Package (LPA)</p>
                <p className="font-medium">₹{placement.package_lpa} LPA</p>
              </div>
            )}
            {placement.job_location && (
              <div>
                <p className="text-muted-foreground text-xs">Location</p>
                <p className="font-medium">{placement.job_location}{placement.is_remote ? ' (Remote)' : ''}</p>
              </div>
            )}
            {placement.drive_title && (
              <div>
                <p className="text-muted-foreground text-xs">Drive</p>
                <p className="font-medium">
                  {placement.drive_id ? (
                    <Link href={`/cdc/drives/${placement.drive_id}`} className="hover:underline text-primary">
                      {placement.drive_title}
                    </Link>
                  ) : placement.drive_title}
                </p>
              </div>
            )}
            {placement.round_no && (
              <div>
                <p className="text-muted-foreground text-xs">Round</p>
                <p className="font-medium">Round {placement.round_no}, Batch {placement.batch_no}</p>
              </div>
            )}
            {placement.joining_date && (
              <div>
                <p className="text-muted-foreground text-xs">Joining Date</p>
                <p className="font-medium">{new Date(placement.joining_date).toLocaleDateString('en-IN')}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Offered At</p>
              <p className="font-medium">{new Date(placement.offered_at).toLocaleString('en-IN')}</p>
            </div>
            {placement.accepted_at && (
              <div>
                <p className="text-muted-foreground text-xs">Accepted At</p>
                <p className="font-medium">{new Date(placement.accepted_at).toLocaleString('en-IN')}</p>
              </div>
            )}
            {placement.declined_at && (
              <div>
                <p className="text-muted-foreground text-xs">Declined At</p>
                <p className="font-medium">{new Date(placement.declined_at).toLocaleString('en-IN')}</p>
              </div>
            )}
            {placement.decline_reason && !placement.decline_reason.startsWith('auto_declined') && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Decline Reason</p>
                <p className="font-medium">{placement.decline_reason}</p>
              </div>
            )}
            {placement.notes && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Notes</p>
                <p className="font-medium">{placement.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status actions */}
        {!terminal && (
          <PermissionGuard module="cdc.placements" action="edit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Update Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Transition error (server rejection: RLS denial, invalid transition, cascade conflict) */}
              {transitionError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{transitionError}</span>
                </div>
              )}

              {/* Accept */}
              {canTransitionPlacement(placement.status, 'accepted') && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => handleTransition('accepted')}
                    disabled={updateStatus.isPending}
                    className="gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Mark Accepted
                  </Button>
                  {otherOffers.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Will auto-decline {otherOffers.length} other offer{otherOffers.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}

              {/* Decline */}
              {canTransitionPlacement(placement.status, 'declined') && (
                <div className="space-y-2">
                  {pendingAction === 'declined' ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Reason for declining (optional)"
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleTransition('declined')}
                          disabled={updateStatus.isPending}
                        >
                          Confirm Decline
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPendingAction(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setPendingAction('declined')}
                      className="gap-2"
                    >
                      <XCircle className="h-4 w-4" />
                      Decline
                    </Button>
                  )}
                </div>
              )}

              {/* Rescind */}
              {canTransitionPlacement(placement.status, 'rescinded') && (
                <div className="space-y-2">
                  {pendingAction === 'rescinded' ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Reason for rescinding (required)"
                        value={rescindReason}
                        onChange={(e) => setRescindReason(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleTransition('rescinded')}
                          disabled={updateStatus.isPending || !rescindReason.trim()}
                        >
                          Confirm Rescind
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPendingAction(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setPendingAction('rescinded')}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <AlertCircle className="h-4 w-4" />
                      Rescind Offer
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          </PermissionGuard>
        )}

        {/* Back navigation */}
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/cdc/placements">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Placements
            </Link>
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
