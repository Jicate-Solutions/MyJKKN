'use client';

/**
 * /campus-living/gate-passes/request — where a hostel resident asks to leave.
 *
 * This is the LEARNER lane. The sibling page at /gate-passes/new is the staff
 * one: a warden issuing a pass directly at the desk, which produces an
 * already-approved pass and is gated on `campus_living.gate_passes.approve`.
 * Before the rebuild there was only that page, and it was reachable by
 * students — a learner could issue themselves an approved pass with
 * `approved_by` set to their own profile. This page exists so the resident has
 * somewhere honest to go, and so that door can be closed.
 *
 * THE TYPE DRIVES THE FORM. Types come from `hostel_leave_types`, the same
 * per-institution list /campus-living/settings/policies-workflows configures.
 * Three of its flags are enforced live as the learner fills the form:
 *
 *   advance_notice_hours       → the earliest time they may leave
 *   default_max_duration_days  → the latest date they may return
 *   requires_attachment        → a supporting document becomes mandatory
 *
 * All three are re-checked in `requestGatePass` before the insert. What
 * happens here is a courtesy — the boundary is the service.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarClock,
  FileUp,
  Info,
  Loader2,
  Paperclip,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useActiveHostelLeaveTypes } from '@/hooks/campus-living/use-hostel-leave-types';
import { useRequestGatePass } from '@/hooks/campus-living/use-gate-passes';
import { describeRequestViolation } from '@/lib/services/campus-living/gate-pass-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type { HostelLeaveType } from '@/types/hostel-leave-types';

/**
 * navMeta — reached from the My Hostel hub's Requests tab. Required by
 * scripts/assert-nav-coverage.mjs, which also verifies the parent links here.
 */
export const navMeta = {
  invokedFrom: '/campus-living/my-hostel',
} as const;

const ATTACHMENT_BUCKET = 'hostel-gate-pass-documents';
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Free text, with the options people actually pick offered as a datalist. */
const TRANSPORT_SUGGESTIONS = [
  'College bus',
  'Public bus',
  'Train',
  'Own two-wheeler',
  'Car — family',
  'Auto / taxi',
  'Walking',
];

/** `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in LOCAL time. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDateValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function RequestGatePassPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canRequest = isSuperAdmin || canAccess('campus_living.gate_passes', 'create');

  const institutionId = profile?.institution_id ?? '';
  const { hostelLeaveTypes, loading: typesLoading } = useActiveHostelLeaveTypes(institutionId);
  const requestPass = useRequestGatePass();

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('');
  const [outAt, setOutAt] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [accompanyingPerson, setAccompanyingPerson] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedType: HostelLeaveType | undefined = useMemo(
    () => hostelLeaveTypes.find((t) => t.id === leaveTypeId),
    [hostelLeaveTypes, leaveTypeId],
  );

  // The two bounds the chosen type imposes, recomputed whenever it changes.
  // A null flag means NO limit — treating it as zero would silently forbid
  // every request under a type that was deliberately configured without a cap.
  const earliestOut = useMemo(() => {
    const hours = selectedType?.advance_notice_hours ?? 0;
    return toLocalInputValue(new Date(Date.now() + (hours > 0 ? hours : 0) * 3_600_000));
  }, [selectedType]);

  const latestReturnDate = useMemo(() => {
    const days = selectedType?.default_max_duration_days;
    if (!days || days <= 0 || !outAt) return undefined;
    const from = new Date(outAt);
    if (Number.isNaN(from.getTime())) return undefined;
    return toLocalDateValue(new Date(from.getTime() + days * 86_400_000));
  }, [selectedType, outAt]);

  // Switching to a type that does not want a document must not leave a stale
  // one attached to the request.
  useEffect(() => {
    if (selectedType && !selectedType.requires_attachment && attachmentUrl) {
      setAttachmentUrl(null);
      setAttachmentName(null);
    }
  }, [selectedType, attachmentUrl]);

  const expectedReturnIso = useMemo(() => {
    if (!returnDate || !returnTime) return '';
    const composed = new Date(`${returnDate}T${returnTime}`);
    return Number.isNaN(composed.getTime()) ? '' : composed.toISOString();
  }, [returnDate, returnTime]);

  const plannedOutIso = useMemo(() => {
    if (!outAt) return '';
    const d = new Date(outAt);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }, [outAt]);

  /**
   * The same sentence the service would refuse with, shown before they submit.
   * One rule, one wording, two moments — never a client message that disagrees
   * with the server's.
   */
  const violation = useMemo(() => {
    if (!selectedType || !plannedOutIso || !expectedReturnIso) return null;
    return describeRequestViolation(
      {
        advance_notice_hours: selectedType.advance_notice_hours,
        default_max_duration_days: selectedType.default_max_duration_days,
        requires_attachment: selectedType.requires_attachment,
      },
      { plannedOutAt: plannedOutIso, expectedReturn: expectedReturnIso, attachmentUrl },
    );
  }, [selectedType, plannedOutIso, expectedReturnIso, attachmentUrl]);

  const requiredFilled =
    Boolean(leaveTypeId) &&
    reason.trim() !== '' &&
    destination.trim() !== '' &&
    plannedOutIso !== '' &&
    expectedReturnIso !== '';

  async function handleAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
      toast.error('Only PDF, JPG or PNG files are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('File exceeds the 5 MB limit.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const supabase = createClientSupabaseClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${profile.id}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });
      // Storage errors come back in `error`, not as a throw — an unchecked
      // upload looks identical to a successful one.
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      setAttachmentUrl(signed?.signedUrl ?? path);
      setAttachmentName(safeName);
      toast.success('Document attached');
    } catch (err) {
      toast.error(`Upload failed: ${getErrorMessage(err)}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.id || !institutionId || !selectedType) return;
    if (violation) {
      toast.error(violation);
      return;
    }

    setSubmitting(true);
    try {
      await requestPass.mutateAsync({
        payload: {
          institution_id: institutionId,
          // profile.id IS a profiles.id, which is what the RLS insert lane
          // compares against auth.uid(). The service accepts either id space.
          learner_id: profile.id,
          leave_type_id: selectedType.id,
          reason,
          destination,
          planned_out_at: plannedOutIso,
          expected_return: expectedReturnIso,
          transport_mode: transportMode,
          accompanying_person: accompanyingPerson,
          attachment_url: attachmentUrl,
        },
        rules: {
          advance_notice_hours: selectedType.advance_notice_hours,
          default_max_duration_days: selectedType.default_max_duration_days,
          requires_attachment: selectedType.requires_attachment,
        },
      });
      router.push('/campus-living/my-hostel?tab=requests');
    } catch {
      // the mutation's onError toast is the learner-facing report
    } finally {
      setSubmitting(false);
    }
  }

  if (!canRequest) {
    return (
      <ContentLayout title="Request a Gate Pass">
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">You cannot request a gate pass</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This needs the &ldquo;Request Gate Pass&rdquo; permission. Ask the hostel office
              to grant it to your role.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Request a Gate Pass">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Request Gate Pass' },
        ]}
      />

      <div className="mt-4 space-y-6">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/campus-living/my-hostel">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Request a Gate Pass</h1>
            <p className="text-sm text-muted-foreground">
              Your warden reviews this and may call your parent before deciding. You will see
              the decision in My Hostel.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Type ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Why are you leaving?</CardTitle>
              <CardDescription>
                Pick the type that matches. Some types need more notice or a supporting
                document.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="leave_type">Gate pass type *</Label>
                <Select value={leaveTypeId} onValueChange={setLeaveTypeId} disabled={typesLoading}>
                  <SelectTrigger id="leave_type">
                    <SelectValue
                      placeholder={
                        typesLoading
                          ? 'Loading types…'
                          : hostelLeaveTypes.length === 0
                            ? 'No types configured — contact the hostel office'
                            : 'Select a type'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {hostelLeaveTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: t.color_code }}
                            aria-hidden
                          />
                          {t.leave_type_name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* What this type demands, said before they hit it rather than
                  as a validation error afterwards. */}
              {selectedType && (
                <div className="flex gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <ul className="space-y-0.5 text-muted-foreground">
                    {selectedType.advance_notice_hours ? (
                      <li>
                        Needs <strong>{selectedType.advance_notice_hours} hours</strong> notice.
                      </li>
                    ) : (
                      <li>No advance notice required.</li>
                    )}
                    {selectedType.default_max_duration_days ? (
                      <li>
                        Up to <strong>{selectedType.default_max_duration_days} days</strong>.
                      </li>
                    ) : (
                      <li>No maximum duration.</li>
                    )}
                    {selectedType.requires_attachment && (
                      <li className="text-amber-700 dark:text-amber-400">
                        A supporting document is <strong>required</strong>.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">Reason *</Label>
                <Textarea
                  id="reason"
                  required
                  rows={3}
                  placeholder="Tell your warden why you need to go."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Destination *</Label>
                <Input
                  id="destination"
                  required
                  placeholder="e.g. Salem — parental home"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── When ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                When are you going and coming back?
              </CardTitle>
              <CardDescription>
                The gate records the real times when you scan your MyJKKN QR. These are the
                times you are asking for.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="out_at">Out date &amp; time *</Label>
                <Input
                  id="out_at"
                  type="datetime-local"
                  required
                  min={earliestOut}
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
                  max={latestReturnDate}
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
            </CardContent>
          </Card>

          {/* ── How ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Travel</CardTitle>
              <CardDescription>
                How you are travelling, and who is going with you.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transport">Mode of transport</Label>
                <Input
                  id="transport"
                  list="transport-suggestions"
                  placeholder="e.g. College bus"
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value)}
                />
                <datalist id="transport-suggestions">
                  {TRANSPORT_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="accompanying">Person accompanying</Label>
                <Input
                  id="accompanying"
                  placeholder="e.g. Father — R. Kumar"
                  value={accompanyingPerson}
                  onChange={(e) => setAccompanyingPerson(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank if you are travelling alone.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── Attachment, only when the type demands one ───────── */}
          {selectedType?.requires_attachment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Paperclip className="h-4 w-4" />
                  Supporting document *
                </CardTitle>
                <CardDescription>
                  {selectedType.leave_type_name} requires proof. PDF, JPG or PNG, up to 5 MB.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {attachmentUrl ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{attachmentName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAttachmentUrl(null);
                        setAttachmentName(null);
                      }}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/40">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileUp className="h-4 w-4" />
                    )}
                    {uploading ? 'Uploading…' : 'Choose a file'}
                    <input
                      type="file"
                      className="hidden"
                      accept={ALLOWED_MIME.join(',')}
                      disabled={uploading}
                      onChange={handleAttachment}
                    />
                  </label>
                )}
              </CardContent>
            </Card>
          )}

          {/* The service would refuse with this exact sentence. Say it here. */}
          {violation && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{violation}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" asChild disabled={submitting}>
              <Link href="/campus-living/my-hostel">Cancel</Link>
            </Button>
            <Button type="submit" disabled={submitting || !requiredFilled || Boolean(violation)}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit for warden approval
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
