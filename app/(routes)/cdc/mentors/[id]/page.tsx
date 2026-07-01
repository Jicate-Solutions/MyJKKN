'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMentorPairingById, useUpdateMentorPairing } from '@/hooks/cdc/use-cdc-mentors';
import { useAuth } from '@/hooks/use-auth';
import { canEditMentorPairing } from '@/lib/services/cdc/mentor-access';
import { MentorSessionsCard } from '@/components/cdc/mentor-sessions-card';
import { BeatLoader } from 'react-spinners';
import type { MentoringStatus } from '@/types/cdc/mentors';
import { ArrowLeft, User, Building2, Eye } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_COLORS: Record<MentoringStatus, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  paused: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  concluded: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function MentorPairingDetailPage(props: PageProps) {
  return (
    <PermissionGuard module="cdc.mentors" action="view">
      <MentorPairingDetailContent {...props} />
    </PermissionGuard>
  );
}

function MentorPairingDetailContent({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();

  const { data: pairing, isLoading, error } = useMentorPairingById(id);
  const updatePairing = useUpdateMentorPairing(id);

  const handleStatusChange = async (newStatus: MentoringStatus) => {
    await updatePairing.mutateAsync({
      status: newStatus,
      concluded_at: newStatus === 'concluded' ? new Date().toISOString() : undefined,
    });
  };

  if (isLoading) {
    return (
      <ContentLayout title="Mentor Pairing">
        <div className="flex justify-center py-20"><BeatLoader color="#3b82f6" /></div>
      </ContentLayout>
    );
  }

  if (error || !pairing) {
    return (
      <ContentLayout title="Mentor Pairing">
        <p className="text-red-600 mt-6">{error?.message ?? 'Pairing not found'}</p>
      </ContentLayout>
    );
  }

  const mentor = pairing.mentor;
  const mentee = pairing.mentee;
  const status = pairing.status as MentoringStatus;

  // Owning college = mentee's institution (mentor's as fallback). Editing is
  // restricted to that college's CDC staff; RLS enforces it, this only gates the
  // action buttons so a cross-college viewer isn't shown controls that would fail.
  const college = mentee?.institution?.name ?? mentor?.institution?.name ?? null;
  const ownerInstitutionId = mentee?.institution_id ?? mentor?.institution_id ?? null;
  const canEdit = canEditMentorPairing(profile, ownerInstitutionId);

  return (
    <ContentLayout title="Mentor Pairing">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc/mentors">Mentor Pairings</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Pairing Detail</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-lg space-y-6">
        <div>
          <button
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
            onClick={() => router.push('/cdc/mentors')}
          >
            <ArrowLeft className="w-3 h-3" /> Back to pairings
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Mentor Pairing</h1>
            <Badge className={`text-xs border ${STATUS_COLORS[status]}`} variant="outline">
              {status}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Paired on {new Date(pairing.paired_at).toLocaleDateString()}
          </p>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-gray-400" />
            {college ?? 'College not set'}
            {!canEdit && (
              <Badge variant="outline" className="ml-1 text-xs border-gray-200 text-gray-500 gap-1">
                <Eye className="w-3 h-3" /> View only
              </Badge>
            )}
          </p>
        </div>

        {/* Mentor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" /> Peer Mentor
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{mentor?.name ?? 'Unknown learner'}</p>
            {mentor?.roll_number && <p className="text-gray-500">Roll: {mentor.roll_number}</p>}
          </CardContent>
        </Card>

        {/* Mentee */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-green-500" /> Mentee (Fresher Learner)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{mentee?.name ?? 'Unknown learner'}</p>
            {mentee?.roll_number && <p className="text-gray-500">Roll: {mentee.roll_number}</p>}
          </CardContent>
        </Card>

        {/* Notes */}
        {pairing.notes && (
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent className="text-sm text-gray-600">{pairing.notes}</CardContent>
          </Card>
        )}

        {/* Sessions (BUG-004198) — log + rollup for this peer pairing */}
        <MentorSessionsCard kind="peer" pairingId={id} canLog={status !== 'concluded'} />

        {pairing.concluded_at && (
          <p className="text-sm text-gray-500">
            Concluded: {new Date(pairing.concluded_at).toLocaleDateString()}
          </p>
        )}

        {/* Status actions — only for the pairing's own college (RLS-enforced). */}
        {canEdit && status !== 'concluded' && (
          <div className="flex gap-3 flex-wrap">
            {status === 'active' && (
              <Button
                variant="outline"
                onClick={() => handleStatusChange('paused')}
                disabled={updatePairing.isPending}
              >
                Pause
              </Button>
            )}
            {status === 'paused' && (
              <Button
                variant="outline"
                onClick={() => handleStatusChange('active')}
                disabled={updatePairing.isPending}
              >
                Resume
              </Button>
            )}
            <Button
              variant="outline"
              className="text-gray-600 border-gray-300"
              onClick={() => handleStatusChange('concluded')}
              disabled={updatePairing.isPending}
            >
              Mark as Concluded
            </Button>
          </div>
        )}
        {!canEdit && (
          <p className="text-sm text-gray-500 border border-gray-200 rounded-md bg-gray-50 px-3 py-2">
            This pairing belongs to {college ?? 'another college'}. You can view it, but
            only that college&apos;s CDC staff can change its status.
          </p>
        )}
      </div>
    </ContentLayout>
  );
}
