'use client';

/**
 * Squad Tournament Requests — the Physical Director's filing desk.
 *
 * Route: /health/sports/squad-requests
 * Gate:  health.sports.file_request (MENU_PERMISSIONS + the INSERT/SELECT
 *        policies on health_tournament_permissions read the same key)
 *
 * The filing half of the Director-locked two-party path. One request covers the
 * whole squad (D2); the Principal decides it at /health/sports/approvals (D1).
 * The filer deliberately cannot approve — that is the whole point of two parties.
 *
 * Both failure modes are named on screen, never a silent redirect
 * (CLAUDE.md #27): a missing permission says which key is missing, and a squad
 * with no possible approver says so BEFORE anything is filed, so a request can
 * never sit pending forever with no visible reason.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FilePlus2, Users } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { HealthSportsService } from '@/lib/services/health/health-sports-service';
import type { TournamentPermissionRecord } from '@/lib/services/health/health-sports-service';
import {
  FailureNotice,
  NoAccessNotice,
  NoApproverNotice,
  RequestCard,
} from '../_components/tournament-permission-ui';
import { FileSquadDialog } from './_components/file-squad-dialog';

const FILE_KEY = 'health.sports.file_request';

export default function SquadRequestsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();

  const [rows, setRows] = useState<TournamentPermissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [approverExists, setApproverExists] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const gatesLoading = authLoading || permsLoading;
  const mayFile = isSuperAdmin || can(FILE_KEY);
  const profileId = profile?.id ?? null;

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await HealthSportsService.getPermissionsFiledBy(profileId);
      setRows(data);
    } catch (err) {
      setRows([]);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (gatesLoading || !mayFile) return;
    void load();
    // A missing approver is a real, checkable condition. On failure we say
    // nothing rather than raise a false alarm about the whole institution.
    HealthSportsService.anyRoleGrantsTournamentApproval()
      .then(setApproverExists)
      .catch(() => setApproverExists(null));
  }, [gatesLoading, mayFile, load]);

  return (
    <ContentLayout title="Squad Tournament Requests">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Sports', href: '/health/sports' },
          { label: 'Squad Requests' },
        ]}
      />

      <div className="mt-4 space-y-4">
        {gatesLoading ? (
          <>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </>
        ) : !mayFile ? (
          <NoAccessNotice
            permissionKey={FILE_KEY}
            purpose="Filing a tournament permission request for a squad"
          />
        ) : (
          <>
            {approverExists === false ? (
              <NoApproverNotice roleLabel="Principal" />
            ) : null}

            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-2.5">
                  <Users className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      One request per squad
                    </p>
                    <p className="text-xs text-slate-500">
                      Enter the tournament once and list every learner going. Each one
                      is recorded by name and roll number, so participation stays
                      traceable per learner afterwards.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setDialogOpen(true)}
                  disabled={!profileId}
                >
                  <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
                  File a request
                </Button>
              </CardContent>
            </Card>

            {loadError ? (
              <FailureNotice
                heading="Your filed requests could not be loaded"
                err={loadError}
                onRetry={() => void load()}
              />
            ) : loading ? (
              <>
                <Skeleton className="h-56 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
              </>
            ) : rows.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                  <FilePlus2 className="h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-500">You have not filed anything yet</p>
                  <p className="max-w-sm text-xs text-slate-400">
                    Filed requests appear here with the Principal&apos;s decision and
                    note once recorded. A learner can also request on their own from{' '}
                    <Link href="/health/sports" className="underline">
                      Sports Profile
                    </Link>
                    .
                  </p>
                </CardContent>
              </Card>
            ) : (
              rows.map((perm) => <RequestCard key={perm.id} perm={perm} />)
            )}
          </>
        )}
      </div>

      {profileId ? (
        <FileSquadDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          filedByProfileId={profileId}
          institutionId={profile?.institution_id ?? null}
          onFiled={(row) => setRows((prev) => [row, ...prev])}
        />
      ) : null}
    </ContentLayout>
  );
}
