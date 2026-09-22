'use client';

/**
 * /gate-pass — "My Gate Pass", for everyone who is signed in.
 *
 *   Learner      → needs prior approval. This page sends them to the Gate
 *                  Pass service request (Service Requests → Gate Pass) and
 *                  lists their recent gate-pass requests.
 *   Team member  → no approval. Enter the reason, get a QR immediately
 *                  (gate_create_staff_pass). Security scans it for OUT / IN.
 *
 * Business rule (2026-09-16): a configured approval must never block a team
 * member. Staff passes are issued here directly; a staff member who instead
 * files the Gate Pass service request gets the pass at SUBMIT time.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, DoorOpen, LogIn, LogOut, QrCode, ShieldCheck } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useMyServiceRequests } from '@/hooks/service-requests/use-service-requests';
import { useCreateStaffPass, useMyStaffPasses } from '@/hooks/gate-security/use-gate-security';
import { STAFF_REASONS, type StaffPass } from '@/lib/services/gate-security/gate-security-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { statusMeta } from '@/components/service-requests/gate-pass-card';

const GATE_PASS_TYPE_SLUG = 'gate-pass';

function QrImage({ token, size = 224 }: { token: string; size?: number }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(token, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then(setUrl)
      .catch(() => setUrl(''));
  }, [token, size]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="Gate pass QR" className="rounded-lg border bg-white p-1" style={{ width: size, height: size }} />
  ) : (
    <Skeleton style={{ width: size, height: size }} className="rounded-lg" />
  );
}

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

/** Is the signed-in person a team member? (profile link, then email bridge) */
function useIsTeamMember() {
  const { profile } = useAuth();
  return useQuery<boolean>({
    queryKey: ['gate-pass', 'is-team-member', profile?.id],
    enabled: !!profile?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const byProfile = await supabase.from('staff').select('id').eq('profile_id', profile!.id).limit(1);
      if ((byProfile.data ?? []).length > 0) return true;
      const email = profile?.email?.trim();
      if (!email) return false;
      for (const column of ['institution_email', 'email'] as const) {
        const { data } = await supabase.from('staff').select('id').eq(column, email).limit(1);
        if ((data ?? []).length > 0) return true;
      }
      return false;
    },
  });
}

/**
 * Does the signed-in person hold an ACTIVE staff record? Only asked when the
 * profile also carries a learner link: a graduate who joined as staff keeps
 * their old learner_id, and must still get the team-member (instant QR) flow —
 * the same rule issue_gate_pass_for_service_request applies.
 */
function useHasActiveStaffRecord(enabled: boolean) {
  const { profile } = useAuth();
  return useQuery<boolean>({
    queryKey: ['gate-pass', 'has-active-staff', profile?.id],
    enabled: enabled && !!profile?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('staff')
        .select('id')
        .eq('profile_id', profile!.id)
        .eq('is_active', true)
        .limit(1);
      if (error) return false;
      return (data ?? []).length > 0;
    },
  });
}

function LearnerView() {
  const { data } = useMyServiceRequests({ page: 1, limit: 10 });
  const mine = (data?.data ?? []) as unknown as Array<{
    id: string;
    request_number: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
    service_type?: { slug?: string; issues_gate_pass?: boolean; name?: string };
  }>;
  const gatePassRequests = mine.filter((r) => r.service_type?.issues_gate_pass || r.service_type?.slug === GATE_PASS_TYPE_SLUG);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DoorOpen className="h-5 w-5" /> Request a gate pass
          </CardTitle>
          <CardDescription>
            Learners need prior approval. Fill in the date, expected exit and return time and the
            reason; once approved, your Gate Pass ID and QR appear on the request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-12 w-full text-base sm:w-auto">
            <Link href={`/service-requests/new?type=${GATE_PASS_TYPE_SLUG}`}>
              New Gate Pass request <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My gate-pass requests</CardTitle>
        </CardHeader>
        <CardContent>
          {gatePassRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gate-pass requests yet.</p>
          ) : (
            <ul className="divide-y">
              {gatePassRequests.map((r) => (
                <li key={r.id}>
                  <Link href={`/service-requests/${r.id}`} className="flex items-center gap-3 py-3">
                    <QrCode className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm">{r.request_number}</span>
                      <span className="block text-xs text-muted-foreground">{fmt(r.submitted_at ?? r.created_at)}</span>
                    </span>
                    <Badge variant="secondary">{r.status.replace('_', ' ')}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StaffView() {
  const passes = useMyStaffPasses();
  const create = useCreateStaffPass();
  const [reason, setReason] = useState<string>('');
  const [other, setOther] = useState('');

  const live: StaffPass | undefined = passes.data?.find((p) => p.status === 'open' || p.status === 'out');
  const finalReason = reason === 'Other' ? other.trim() : reason;

  return (
    <div className="space-y-4">
      {live && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" /> Your gate pass
            </CardTitle>
            <CardDescription>Show this QR to security. They record OUT when you leave and IN when you return.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {live.qr_code ? <QrImage token={live.qr_code} /> : <Skeleton className="h-56 w-56" />}
            <div className="w-full space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-bold">{live.pass_number}</span>
                <Badge className={statusMeta(live.status).className} variant="secondary">
                  {statusMeta(live.status).label}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{live.reason}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{fmt(live.created_at)}</dd>
                <dt className="text-muted-foreground">OUT</dt>
                <dd>{fmt(live.out_time)}</dd>
                <dt className="text-muted-foreground">Approval</dt>
                <dd>Not required</dd>
              </dl>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DoorOpen className="h-5 w-5" /> {live ? 'New gate pass' : 'Get a gate pass'}
          </CardTitle>
          <CardDescription>
            Enter the reason and your QR is ready at once. No prior approval is needed for team members.
            {live && live.status === 'open' && ' Creating a new one replaces the pass you have not used yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Reason for leaving</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent>
                {STAFF_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {reason === 'Other' && (
            <div className="space-y-1">
              <Label>Details</Label>
              <Textarea value={other} onChange={(e) => setOther(e.target.value)} placeholder="Say where / why" rows={2} />
            </div>
          )}
          <Button
            className="h-12 w-full text-base sm:w-auto"
            disabled={!finalReason || create.isPending}
            onClick={() => create.mutate(finalReason, { onSuccess: () => { setReason(''); setOther(''); } })}
          >
            <QrCode className="mr-2 h-5 w-5" /> Generate QR
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {passes.isLoading && <Skeleton className="h-16 w-full" />}
          {!passes.isLoading && !passes.data?.length && <p className="text-sm text-muted-foreground">No gate passes yet.</p>}
          <ul className="divide-y">
            {passes.data?.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-mono text-xs">{p.pass_number}</span>
                <span className="min-w-0 flex-1 truncate">{p.reason}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <LogOut className="h-3.5 w-3.5 text-green-600" /> {fmt(p.out_time)}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <LogIn className="h-3.5 w-3.5 text-amber-600" /> {fmt(p.in_time)}
                </span>
                <Badge variant="secondary" className={statusMeta(p.status).className}>{statusMeta(p.status).label}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyGatePassPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const hasLearnerLink = !!(profile as { learner_id?: string | null } | null)?.learner_id;
  const activeStaff = useHasActiveStaffRecord(hasLearnerLink);
  // Resolving until we know whether a learner link belongs to someone now on staff.
  const isLoading = authLoading || (hasLearnerLink && activeStaff.isLoading);
  const isLearner = hasLearnerLink && activeStaff.data !== true;
  const teamMember = useIsTeamMember();

  return (
    <ContentLayout title="My Gate Pass">
      <div className="mx-auto max-w-2xl space-y-4 pb-8">
        <div>
          <h1 className="text-xl font-bold">My Gate Pass</h1>
          <p className="text-sm text-muted-foreground">
            {isLearner ? 'Prior approval is required for learners.' : 'Team members get a QR immediately.'}
          </p>
        </div>
        {(isLoading || (!isLearner && teamMember.isLoading)) && <Skeleton className="h-40 w-full" />}
        {!isLoading && isLearner && <LearnerView />}
        {!isLoading && !isLearner && teamMember.data === true && <StaffView />}
        {!isLoading && !isLearner && teamMember.data === false && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No learner or team-member record is linked to this account, so a gate pass cannot be
              issued. Ask the office to link your profile.
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
