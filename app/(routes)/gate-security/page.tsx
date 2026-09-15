'use client';

/**
 * /gate-security — the campus gate, on a phone.
 *
 *   SCAN (pass QR · staff QR · ID card)  or  SEARCH (roll / name / email / id / pass)
 *      → VERIFY (photo, identity, pass, approver)
 *      → ONE TAP: OUT or IN
 *      → RECORDED (server timestamp, audited)
 *
 * Learner passes come from the Service Requests module (a service type with
 * "Gate Pass" ticked) and from Campus Living wardens; both land in
 * hostel_gate_passes, so one screen serves both. The verdict logic is the
 * hostel scanner's `decideScan` (GREEN / AMBER / RED, hard block on RED) plus
 * the calendar-day rule: a pass is valid on its `valid_date` only.
 *
 * Staff present their personal QR ('GS:<staff.id>', see /profile). The screen
 * shows who they are and their last movement today, and records IN or OUT
 * with an optional reason. The server refuses IN→IN and OUT→OUT.
 *
 * Camera lifecycle is the canonical html5-qrcode pattern from
 * app/(routes)/campus-living/gate-passes/scan/page.tsx (wake-lock, haptic,
 * debounce, post-action cooldown).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Keyboard,
  Loader2,
  LogIn,
  LogOut,
  QrCode,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useGateSearch,
  useGateTodayActivity,
  useRecordGateMovement,
} from '@/hooks/gate-security/use-gate-security';
import {
  GateSecurityService,
  STAFF_REASONS,
  type GateSubject,
  type SearchHit,
} from '@/lib/services/gate-security/gate-security-service';
import { formatClock } from '@/lib/services/campus-living/gate-scan-resolve';
import { todayIsoIndia } from '@/lib/gate-security/gate-pass-form-fields';

const QR_ELEMENT_ID = 'gate-security-qr-reader';
const POST_ACTION_COOLDOWN_MS = 10_000;

interface ShiftEntry {
  name: string;
  kind: 'learner' | 'staff';
  direction: 'out' | 'in';
  at: string;
}

function initials(name: string | null | undefined): string {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function Face({ url, name, size = 'h-20 w-20' }: { url: string | null | undefined; name: string | null | undefined; size?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name ?? ''} className={`${size} shrink-0 rounded-lg border object-cover`} />
  ) : (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-lg border bg-muted text-2xl font-bold text-muted-foreground`}>
      {initials(name)}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

export default function GateSecurityPage() {
  const { canAccess, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canScan =
    isSuperAdmin || canAccess('gate_security.scan', 'view') || canAccess('campus_living.gate_passes', 'edit');
  const canRecord =
    isSuperAdmin || canAccess('gate_security.movements', 'record') || canAccess('campus_living.gate_passes', 'edit');

  const [scanMode, setScanMode] = useState<'qr' | 'manual'>('qr');
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [query, setQuery] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [subject, setSubject] = useState<GateSubject | null>(null);
  const [subjectCode, setSubjectCode] = useState<string>('');
  const [unrecognised, setUnrecognised] = useState<string | null>(null);
  const [staffReason, setStaffReason] = useState<string>('');
  const [shiftLog, setShiftLog] = useState<ShiftEntry[]>([]);

  const today = useGateTodayActivity(canScan);
  const search = useGateSearch(query, canScan);
  const record = useRecordGateMovement();

  const scannerRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);
  const lastScanTokenRef = useRef('');
  const lastScanAtRef = useRef(0);
  const cooldownRef = useRef<{ code: string; at: number } | null>(null);

  // ── Lookup ───────────────────────────────────────────────────────────
  const present = useCallback(async (code: string, resolver: () => Promise<GateSubject | null>) => {
    const cooling = cooldownRef.current;
    if (cooling && cooling.code === code && Date.now() - cooling.at < POST_ACTION_COOLDOWN_MS) {
      toast('Already recorded — next person');
      return;
    }
    setLookupBusy(true);
    setUnrecognised(null);
    setSubject(null);
    setStaffReason('');
    try {
      const s = await resolver();
      if (!s) {
        setUnrecognised(code);
        return;
      }
      setSubject(s);
      setSubjectCode(code);
      try {
        const blocked = s.kind === 'learner' && s.decision.verdict === 'blocked';
        navigator.vibrate?.(blocked ? [80, 60, 80] : 100);
      } catch {
        /* unsupported */
      }
    } catch (err: any) {
      setUnrecognised(code);
      toast.error(err?.message || 'Could not read that code');
    } finally {
      setLookupBusy(false);
    }
  }, []);

  const handleCode = useCallback(
    (raw: string) => {
      const code = (raw ?? '').trim();
      if (!code) return;
      void present(code, () => GateSecurityService.resolveCode(code));
    },
    [present]
  );

  const pickHit = (hit: SearchHit) => {
    setQuery('');
    if (hit.person_type === 'staff' && hit.staff_id) {
      void present(`GS:${hit.staff_id}`, () => GateSecurityService.resolveStaff(hit.staff_id!));
    } else if (hit.profile_id) {
      void present(hit.profile_id, () => GateSecurityService.resolveLearner(hit.profile_id!));
    }
  };

  // ── Camera ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scanMode !== 'qr' || !cameraActive) return;
    let scanner: any = null;
    let cancelled = false;
    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode(QR_ELEMENT_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            const now = Date.now();
            if (decodedText === lastScanTokenRef.current && now - lastScanAtRef.current < 2500) return;
            lastScanTokenRef.current = decodedText;
            lastScanAtRef.current = now;
            handleCode(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error('Gate scanner start failed', err);
        if (!cancelled) {
          setCameraActive(false);
          setScanMode('manual');
        }
        toast.error('Camera unavailable — type the code or search instead');
      }
    };
    void start();
    return () => {
      cancelled = true;
      const s = scanner || scannerRef.current;
      if (s) {
        try {
          if (s.isScanning) s.stop().catch(() => {});
        } catch {
          /* already stopped */
        }
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, cameraActive]);

  useEffect(() => {
    if (!cameraActive) return;
    const acquire = async () => {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock?.request('screen');
      } catch {
        /* unsupported */
      }
    };
    void acquire();
    return () => {
      try {
        wakeLockRef.current?.release?.();
      } catch {
        /* released */
      }
      wakeLockRef.current = null;
    };
  }, [cameraActive]);

  // ── The tap ──────────────────────────────────────────────────────────
  const clear = () => {
    setSubject(null);
    setUnrecognised(null);
    setStaffReason('');
    lastScanTokenRef.current = '';
  };

  const finish = (name: string, kind: 'learner' | 'staff', direction: 'out' | 'in') => {
    setShiftLog((log) =>
      [
        {
          name,
          kind,
          direction,
          at: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
        },
        ...log,
      ].slice(0, 10)
    );
    cooldownRef.current = { code: subjectCode, at: Date.now() };
    toast.success(`${direction === 'out' ? 'OUT' : 'IN'} recorded — ${name}`);
    clear();
  };

  const actLearner = async () => {
    if (subject?.kind !== 'learner' || !subject.decision.pass || !subject.decision.action) return;
    const { pass, action } = subject.decision;
    await record.mutateAsync({ kind: 'learner', passId: pass.id, direction: action });
    if (action === 'out' || subject.decision.isLate) {
      void fetch('/api/campus-living/gate-passes/notify-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passId: pass.id, event: action === 'out' ? 'out' : 'late_return' }),
      }).catch(() => {});
    }
    finish(subject.snapshot?.full_name || subject.learner.fullName, 'learner', action);
  };

  const actStaff = async (direction: 'in' | 'out') => {
    if (subject?.kind !== 'staff') return;
    await record.mutateAsync({
      kind: 'staff',
      staffId: subject.snapshot.staff_id,
      direction,
      reason: staffReason || null,
    });
    finish(subject.snapshot.full_name || 'Team member', 'staff', direction);
  };

  // ── Learner verdict incl. the calendar-day rule ──────────────────────
  const learnerView = useMemo(() => {
    if (subject?.kind !== 'learner') return null;
    const d = subject.decision;
    const pass = d.pass as (typeof d.pass & { valid_date?: string | null; expected_exit?: string | null }) | null;
    const validDate = pass?.valid_date ?? null;
    const notToday = d.verdict === 'approved' && !!validDate && validDate !== todayIsoIndia();
    if (notToday) {
      return {
        verdict: 'blocked' as const,
        headline: 'NOT VALID TODAY',
        detail: `This pass is valid on ${fmtDate(validDate)}. Do not let the learner out today.`,
        action: null as null | 'in' | 'out',
        pass,
      };
    }
    return { verdict: d.verdict, headline: d.headline, detail: d.detail, action: d.action, pass };
  }, [subject]);

  // ── Gate ─────────────────────────────────────────────────────────────
  if (!permsLoading && !canScan) {
    return (
      <ContentLayout title="Gate Security">
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">You cannot use the gate screen</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This screen needs the “Gate Security screen” permission. Ask an administrator to
              grant it to your role.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const panelClass =
    learnerView?.verdict === 'approved'
      ? 'bg-green-600 text-white'
      : learnerView?.verdict === 'returning'
        ? 'bg-amber-400 text-black'
        : learnerView?.verdict === 'blocked'
          ? 'bg-red-700 text-white'
          : 'bg-slate-800 text-white';

  return (
    <ContentLayout title="Gate Security">
      <div className="mx-auto max-w-2xl space-y-4 pb-24">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">Gate Security</h1>
            <p className="truncate text-xs text-muted-foreground">Scan or search · verify · one tap OUT / IN</p>
          </div>
        </div>

        {/* ── Verdict ─────────────────────────────────────────────── */}
        {lookupBusy && (
          <Card>
            <CardContent className="flex min-h-32 items-center justify-center gap-3 p-6">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-lg">Checking…</span>
            </CardContent>
          </Card>
        )}

        {!lookupBusy && unrecognised && (
          <Card className="border-2 border-slate-400">
            <CardContent className="space-y-3 p-6 text-center">
              <QrCode className="mx-auto h-10 w-10 text-slate-500" />
              <p className="text-2xl font-bold">Not recognised</p>
              <p className="break-all text-sm text-muted-foreground">
                Nothing on file for <span className="font-mono">{unrecognised.slice(0, 40)}</span>
              </p>
              <Button variant="outline" className="h-12 w-full text-base" onClick={clear}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {!lookupBusy && subject?.kind === 'learner' && learnerView && (
          <div className="overflow-hidden rounded-xl border-2 shadow-sm">
            <div className={`px-4 py-5 ${panelClass}`}>
              <p className="text-3xl font-black leading-none tracking-tight sm:text-4xl">{learnerView.headline}</p>
              <p className="mt-2 text-base font-medium leading-snug">{learnerView.detail}</p>
            </div>

            <div className="flex items-start gap-4 bg-background px-4 pt-4">
              <Face url={subject.snapshot?.photo_url ?? subject.learner.photoUrl} name={subject.snapshot?.full_name ?? subject.learner.fullName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold leading-tight">
                  {subject.snapshot?.full_name || subject.learner.fullName}
                </p>
                <Row label="Roll" value={subject.snapshot?.roll_number} />
                <Row label="Register" value={subject.snapshot?.register_number} />
                <Row label="MyJKKN ID" value={subject.snapshot?.jkkn_id} />
                <Row label="Email" value={subject.snapshot?.email} />
                <Row label="Mobile" value={subject.snapshot?.mobile} />
              </div>
            </div>

            {learnerView.pass && (
              <div className="mx-4 mt-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{learnerView.pass.pass_number}</span>
                  <Badge variant="secondary">{learnerView.pass.status}</Badge>
                </div>
                <Row label="Reason" value={learnerView.pass.destination} />
                <Row label="Valid on" value={fmtDate(learnerView.pass.valid_date)} />
                <Row label="Exit" value={learnerView.pass.expected_exit ? formatClock(learnerView.pass.expected_exit) : null} />
                <Row label="Return by" value={formatClock(learnerView.pass.expected_return)} />
                <Row label="Out at" value={learnerView.pass.out_time ? formatClock(learnerView.pass.out_time) : null} />
                <Row label="Approved by" value={subject.approvedBy} />
              </div>
            )}

            <div className="space-y-2 bg-background px-4 py-4">
              {learnerView.action === 'out' && canRecord && (
                <Button
                  className="h-20 w-full bg-green-600 text-2xl font-bold hover:bg-green-700"
                  onClick={() => void actLearner()}
                  disabled={record.isPending}
                >
                  {record.isPending ? <Loader2 className="h-7 w-7 animate-spin" /> : (<><LogOut className="mr-3 h-7 w-7" /> OUT</>)}
                </Button>
              )}
              {learnerView.action === 'in' && canRecord && (
                <Button
                  className="h-20 w-full bg-amber-500 text-2xl font-bold text-black hover:bg-amber-600"
                  onClick={() => void actLearner()}
                  disabled={record.isPending}
                >
                  {record.isPending ? <Loader2 className="h-7 w-7 animate-spin" /> : (<><LogIn className="mr-3 h-7 w-7" /> IN</>)}
                </Button>
              )}
              {learnerView.action && !canRecord && (
                <p className="text-center text-sm text-muted-foreground">You can verify but not record. Ask for the “Record OUT / IN” permission.</p>
              )}
              {learnerView.verdict === 'blocked' && (
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-center text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                  <ShieldAlert className="mx-auto mb-1 h-5 w-5" />
                  Do not let this learner out. An approved gate pass for today is required.
                </div>
              )}
              <Button variant="outline" className="h-12 w-full text-base" onClick={clear} disabled={record.isPending}>
                Next person
              </Button>
            </div>
          </div>
        )}

        {!lookupBusy && subject?.kind === 'staff' && (
          <div className="overflow-hidden rounded-xl border-2 shadow-sm">
            <div className={`px-4 py-5 ${subject.snapshot.is_active === false ? 'bg-red-700 text-white' : 'bg-slate-800 text-white'}`}>
              <p className="text-3xl font-black leading-none tracking-tight">
                {subject.snapshot.is_active === false ? 'NOT ACTIVE' : 'TEAM MEMBER'}
              </p>
              <p className="mt-2 text-base font-medium">
                {subject.snapshot.last_direction
                  ? `Last today: ${subject.snapshot.last_direction.toUpperCase()} at ${formatClock(subject.snapshot.last_movement_at ?? '')}`
                  : 'No movement recorded today'}
              </p>
            </div>
            <div className="flex items-start gap-4 bg-background px-4 pt-4">
              <Face url={subject.snapshot.photo_url} name={subject.snapshot.full_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold leading-tight">{subject.snapshot.full_name}</p>
                <Row label="Staff ID" value={subject.snapshot.staff_code} />
                <Row label="Department" value={subject.snapshot.department} />
                <Row label="Designation" value={subject.snapshot.designation} />
                <Row label="Status" value={subject.snapshot.last_direction === 'out' ? 'Currently OUT' : subject.snapshot.last_direction === 'in' ? 'Currently IN' : null} />
              </div>
            </div>
            <div className="space-y-3 bg-background px-4 py-4">
              {subject.snapshot.is_active !== false && canRecord && (
                <>
                  <Select value={staffReason} onValueChange={setStaffReason}>
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Reason (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      className="h-20 bg-green-600 text-2xl font-bold hover:bg-green-700"
                      onClick={() => void actStaff('out')}
                      disabled={record.isPending || subject.snapshot.last_direction === 'out'}
                    >
                      <LogOut className="mr-2 h-7 w-7" /> OUT
                    </Button>
                    <Button
                      className="h-20 bg-amber-500 text-2xl font-bold text-black hover:bg-amber-600"
                      onClick={() => void actStaff('in')}
                      disabled={record.isPending || subject.snapshot.last_direction === 'in'}
                    >
                      <LogIn className="mr-2 h-7 w-7" /> IN
                    </Button>
                  </div>
                </>
              )}
              {subject.snapshot.is_active === false && (
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-center text-sm text-red-800">
                  This team member is no longer active. Do not accept this QR.
                </div>
              )}
              <Button variant="outline" className="h-12 w-full text-base" onClick={clear} disabled={record.isPending}>
                Next person
              </Button>
            </div>
          </div>
        )}

        {/* ── Scan ────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Button variant={scanMode === 'qr' ? 'default' : 'outline'} className="h-12 text-base" onClick={() => setScanMode('qr')}>
                <QrCode className="mr-2 h-5 w-5" /> Scan QR
              </Button>
              <Button
                variant={scanMode === 'manual' ? 'default' : 'outline'}
                className="h-12 text-base"
                onClick={() => {
                  setScanMode('manual');
                  setCameraActive(false);
                }}
              >
                <Keyboard className="mr-2 h-5 w-5" /> Type code
              </Button>
            </div>
            {scanMode === 'qr' ? (
              <div className="space-y-3">
                <div id={QR_ELEMENT_ID} className={`aspect-square w-full overflow-hidden rounded-lg bg-black ${!cameraActive ? 'flex items-center justify-center' : ''}`}>
                  {!cameraActive && (
                    <div className="text-center">
                      <Camera className="mx-auto mb-2 h-10 w-10 text-slate-400" />
                      <p className="text-sm text-slate-400">Camera is off</p>
                    </div>
                  )}
                </div>
                <Button onClick={() => setCameraActive((v) => !v)} variant={cameraActive ? 'destructive' : 'default'} className="h-14 w-full text-lg">
                  {cameraActive ? (<><CameraOff className="mr-2 h-5 w-5" /> Stop camera</>) : (<><Camera className="mr-2 h-5 w-5" /> SCAN QR / BARCODE</>)}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  autoComplete="off"
                  className="h-14 text-base"
                  placeholder="Pass ID, card code or GS: token"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCode(manualInput);
                      setManualInput('');
                    }
                  }}
                  disabled={lookupBusy}
                />
                <Button className="h-14 px-5" onClick={() => { handleCode(manualInput); setManualInput(''); }} disabled={lookupBusy || !manualInput.trim()}>
                  <Search className="h-5 w-5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Search ──────────────────────────────────────────────── */}
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                inputMode="search"
                autoComplete="off"
                className="h-14 pl-10 pr-10 text-base"
                placeholder="Search roll / name / email / ID / pass"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQuery('')} aria-label="Clear search">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            {query.trim().length >= 2 && (
              <ul className="divide-y rounded-lg border">
                {search.isFetching && !search.data?.length && (
                  <li className="p-3 text-sm text-muted-foreground">Searching…</li>
                )}
                {search.data?.map((hit) => (
                  <li key={`${hit.person_type}-${hit.staff_id ?? hit.profile_id}-${hit.subtitle}`}>
                    <button type="button" className="flex w-full items-center gap-3 p-3 text-left active:bg-muted" onClick={() => pickHit(hit)}>
                      <Face url={hit.photo_url} name={hit.full_name} size="h-12 w-12" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{hit.full_name || 'Unnamed'}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {hit.person_type === 'staff' ? 'Team · ' : 'Learner · '}
                          {hit.code || hit.email || ''}{hit.subtitle && hit.subtitle !== hit.code ? ` · ${hit.subtitle}` : ''}
                        </span>
                      </span>
                      <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
                {!search.isFetching && search.data?.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">No match.</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Today ───────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-semibold text-muted-foreground">Today&apos;s activity</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/30">
                <p className="text-2xl font-black text-green-700 dark:text-green-300">{today.data?.out ?? '–'}</p>
                <p className="text-xs">OUT</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
                <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{today.data?.in ?? '–'}</p>
                <p className="text-xs">IN</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
                <p className="text-2xl font-black">{today.data?.outside ?? '–'}</p>
                <p className="text-xs">Outside</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {shiftLog.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">This shift</p>
              <ul className="divide-y">
                {shiftLog.map((e, i) => (
                  <li key={`${e.name}-${e.at}-${i}`} className="flex items-center gap-3 py-2">
                    {e.direction === 'out' ? <LogOut className="h-4 w-4 shrink-0 text-green-600" /> : <LogIn className="h-4 w-4 shrink-0 text-amber-600" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                    <Badge variant="outline" className="text-[10px]">{e.kind === 'staff' ? 'Team' : 'Learner'}</Badge>
                    <span className="shrink-0 text-xs text-muted-foreground">{e.at}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> {shiftLog.length} recorded on this device
                <Clock className="ml-auto h-3.5 w-3.5" /> server time
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
