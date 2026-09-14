'use client';

/**
 * /campus-living/gate-passes/new — a warden issues a pass at the desk.
 *
 * THIS IS THE STAFF LANE, and it is now gated as one. The learner's lane is
 * /campus-living/gate-passes/request.
 *
 * Why the gate changed: this page produces a pass that is ALREADY APPROVED,
 * with `approved_by` set to whoever submitted the form. It used to inherit
 * `campus_living.gate_passes.view` from the parent path and was explicitly
 * allow-listed for students in resident-route-guard.tsx, so a learner could
 * walk in here and approve themselves. It now requires
 * `campus_living.gate_passes.approve` — the same key the Approve button on a
 * request needs, because it is the same decision.
 *
 * It is kept, rather than deleted in favour of the request queue, for the
 * walk-in: a learner standing at the office with a parent on the phone and a
 * bus to catch should not have to file a request and wait for it to appear on
 * a queue the warden is already looking at them across.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, DoorOpen, Info, Loader2, ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useIssueGatePass } from '@/hooks/campus-living/use-gate-passes';
import { useLearnerHostelites } from '@/hooks/campus-living/use-learner-hostelites';
import { useActiveHostelLeaveTypes } from '@/hooks/campus-living/use-hostel-leave-types';

/**
 * navMeta — invoked from the parent listing page via the "Issue directly"
 * button. Required by scripts/assert-nav-coverage.mjs.
 */
export const navMeta = {
  invokedFrom: '/campus-living/gate-passes',
} as const;

export default function IssueGatePassPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canIssue = isSuperAdmin || canAccess('campus_living.gate_passes', 'approve');

  const issuePass = useIssueGatePass();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const institutionId = profile?.institution_id ?? '';
  const { data: hostelites, isLoading: hostelitesLoading } = useLearnerHostelites(institutionId);
  const { hostelLeaveTypes, loading: typesLoading } = useActiveHostelLeaveTypes(institutionId);

  const [learnerId, setLearnerId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [outAt, setOutAt] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [accompanyingPerson, setAccompanyingPerson] = useState('');

  const learners = useMemo(
    () =>
      ((hostelites as { data?: unknown[] } | undefined)?.data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        roll_number: string | null;
      }>,
    [hostelites],
  );

  const expectedReturnIso = useMemo(() => {
    if (!returnDate || !returnTime) return '';
    const d = new Date(`${returnDate}T${returnTime}`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }, [returnDate, returnTime]);

  const ready =
    Boolean(learnerId) &&
    Boolean(leaveTypeId) &&
    destination.trim() !== '' &&
    expectedReturnIso !== '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.institution_id || !profile?.id || !ready) return;

    setIsSubmitting(true);
    try {
      // `out_time` is deliberately NOT set here: it is the moment the learner
      // physically leaves, which the gate records when they scan. Issuing a
      // pass is not the same event as walking out.
      await issuePass.mutateAsync({
        institution_id: profile.institution_id,
        learner_id: learnerId,
        approved_by: profile.id,
        leave_type_id: leaveTypeId,
        destination,
        reason,
        planned_out_at: outAt ? new Date(outAt).toISOString() : null,
        expected_return: expectedReturnIso,
        transport_mode: transportMode,
        accompanying_person: accompanyingPerson,
      });
      router.push('/campus-living/gate-passes');
    } catch {
      // the mutation's onError toast reports it
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canIssue) {
    return (
      <ContentLayout title="Issue Gate Pass">
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">You cannot issue a gate pass directly</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Issuing a pass here approves it immediately, so it needs the &ldquo;Approve Gate
              Pass&rdquo; permission.
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/campus-living/gate-passes/request">Request a gate pass instead</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Issue Gate Pass">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Gate Passes', href: '/campus-living/gate-passes' },
          { label: 'Issue' },
        ]}
      />

      <div className="mt-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="py-1 text-2xl font-bold">Issue a Gate Pass</h1>
            <p className="text-sm text-muted-foreground">
              For a resident standing in front of you. The pass is approved the moment you
              submit it.
            </p>
          </div>
        </div>

        <div className="flex gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This bypasses the approval queue and records you as the approver. If the learner
            can file it themselves, send them to{' '}
            <Link href="/campus-living/gate-passes/request" className="underline">
              Request a Gate Pass
            </Link>{' '}
            instead.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resident and type</CardTitle>
              <CardDescription>Who this pass is for, and why they are going.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="learner">Resident *</Label>
                <Select value={learnerId} onValueChange={setLearnerId} disabled={hostelitesLoading}>
                  <SelectTrigger id="learner">
                    <SelectValue
                      placeholder={
                        hostelitesLoading
                          ? 'Loading residents…'
                          : learners.length === 0
                            ? 'No residents — allocate someone first'
                            : 'Select a resident'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {learners.map((l) => {
                      const name =
                        `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Unnamed';
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          {name}
                          {l.roll_number ? ` — ${l.roll_number}` : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="leave_type">Gate pass type *</Label>
                <Select value={leaveTypeId} onValueChange={setLeaveTypeId} disabled={typesLoading}>
                  <SelectTrigger id="leave_type">
                    <SelectValue
                      placeholder={typesLoading ? 'Loading types…' : 'Select a type'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {hostelLeaveTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.leave_type_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="destination">Destination *</Label>
                <Input
                  id="destination"
                  required
                  placeholder="e.g. Salem — parental home"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  rows={2}
                  placeholder="Why they are going. Shown on the pass."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Times and travel</CardTitle>
              <CardDescription>
                The gate records the real out and in times when the learner scans their
                MyJKKN QR.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="out_at">Planned out date &amp; time</Label>
                <Input
                  id="out_at"
                  type="datetime-local"
                  value={outAt}
                  onChange={(e) => setOutAt(e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="return_date">Date of return *</Label>
                <Input
                  id="return_date"
                  type="date"
                  required
                  min={outAt ? outAt.slice(0, 10) : undefined}
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="return_time">In time *</Label>
                <Input
                  id="return_time"
                  type="time"
                  required
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transport">Mode of transport</Label>
                <Input
                  id="transport"
                  placeholder="e.g. College bus"
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="accompanying">Person accompanying</Label>
                <Input
                  id="accompanying"
                  placeholder="Leave blank if travelling alone"
                  value={accompanyingPerson}
                  onChange={(e) => setAccompanyingPerson(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !ready}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Issuing…
                </>
              ) : (
                <>
                  <DoorOpen className="mr-2 h-4 w-4" />
                  Issue gate pass
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
