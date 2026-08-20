'use client';

/**
 * /campus-living/gate-passes/scan — the screen a guard works a shift on.
 *
 * The gate-pass subsystem already existed and nobody used it, because using
 * it meant finding a learner in a list, opening the record, and working out
 * which of two buttons applied. This page removes all of that: scan the card,
 * read one line and one colour, tap once.
 *
 *   GREEN  APPROVED         → one tap records the exit
 *   RED    NO APPROVED PASS → nothing to tap; the learner is stopped
 *   AMBER  RETURNING        → one tap records the return
 *
 * RED IS A HARD BLOCK. There is deliberately no override control anywhere on
 * this page — the Director chose a hard block over a recorded override.
 *
 * Camera lifecycle is the canonical html5-qrcode pattern from
 * app/(routes)/resource-management/scan/page.tsx, plus the wake-lock and
 * haptic from components/marathon/bib-scanner.tsx: this runs on a phone held
 * one-handed at a gate at night, where the screen must not sleep between
 * learners and the guard cannot always look down to read a toast.
 *
 * Gated on `campus_living.gate_passes.edit` — the WRITE key — because the
 * only purpose of the page is to write. A read-only holder has no use for it.
 *
 * navMeta declares the button entry point on the gate-pass list; required by
 * scripts/assert-nav-coverage.mjs (which also verifies the parent really
 * links here).
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Keyboard,
  Loader2,
  LogIn,
  LogOut,
  QrCode,
  Search,
  ShieldAlert,
  Clock,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useRecordExit, useReturnGatePass } from '@/hooks/campus-living/use-gate-passes';

import { GatePassService } from '@/lib/services/campus-living/gate-pass-service';
import {
  approverName,
  resolveScannedLearner,
  type ScannedLearner,
} from '@/lib/services/campus-living/gate-scan-service';
import {
  decideScan,
  type GateDecision,
} from '@/lib/services/campus-living/gate-scan-resolve';

export const navMeta = {
  invokedFrom: '/campus-living/gate-passes',
} as const;

const QR_ELEMENT_ID = 'gate-pass-qr-reader';

/** Everything the verdict panel renders for one scan. */
interface ScanResult {
  /** The code that produced this result, so a completed movement can put
   *  that one card on cooldown. */
  code: string;
  learner: ScannedLearner;
  decision: GateDecision;
  approvedBy: string | null;
}

/**
 * How long one card is ignored after a movement is recorded on it.
 *
 * Without this, a card left in front of the lens re-decodes seconds after
 * "Let out" and comes back as RETURNING — and one stray tap on a button
 * sized for a gloved thumb would walk the learner straight back in. The
 * 2.5s decode debounce is not enough: it only suppresses the repeat, not
 * the reversal.
 */
const POST_ACTION_COOLDOWN_MS = 10_000;

/** One completed action, so the guard can glance back at the last few. */
interface ShiftEntry {
  name: string;
  direction: 'out' | 'in';
  at: string;
  late: boolean;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function GatePassScanPage() {
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canScan = isSuperAdmin || canAccess('campus_living.gate_passes', 'edit');

  const [scanMode, setScanMode] = useState<'qr' | 'manual'>('qr');
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [unrecognised, setUnrecognised] = useState<string | null>(null);
  const [shiftLog, setShiftLog] = useState<ShiftEntry[]>([]);

  const recordExit = useRecordExit();
  const recordReturn = useReturnGatePass();

  const scannerRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);
  const lastScanTokenRef = useRef<string>('');
  const lastScanAtRef = useRef<number>(0);
  const cooldownRef = useRef<{ code: string; at: number } | null>(null);

  // -------- Lookup ------------------------------------------------------
  const handleCode = useCallback(async (rawCode: string) => {
    const code = (rawCode ?? '').trim();
    if (!code) return;

    // A card that was just acted on is ignored for a beat, so the movement
    // cannot be reversed by the same card sitting in front of the lens.
    const cooling = cooldownRef.current;
    if (cooling && cooling.code === code && Date.now() - cooling.at < POST_ACTION_COOLDOWN_MS) {
      toast('Already recorded — move to the next learner');
      return;
    }

    setLookupBusy(true);
    setUnrecognised(null);
    setResult(null);
    try {
      const learner = await resolveScannedLearner(code);
      if (!learner) {
        setUnrecognised(code);
        return;
      }

      const passes = await GatePassService.getScannablePassesForLearner(learner.profileId);
      // The subject is judged before the passes: a learner who has left can
      // still be holding a valid-looking card, and often an open pass too.
      const decision = decideScan(learner.subject, passes, new Date());

      // Only GREEN shows an approver — on AMBER the guard needs the clock,
      // not the paperwork.
      const decidedId = decision.pass?.id;
      const approvedByName =
        decidedId && decision.verdict === 'approved'
          ? await approverName(passes.find((p) => p.id === decidedId)?.approved_by ?? null)
          : null;

      setResult({ code, learner, decision, approvedBy: approvedByName });
      // Haptic confirmation — the guard does not have to watch the screen to
      // know the scan registered.
      try {
        navigator.vibrate?.(decision.verdict === 'blocked' ? [80, 60, 80] : 100);
      } catch {
        // vibration unsupported — visual state is still correct
      }
    } catch (err: any) {
      setUnrecognised(code);
      toast.error(err?.message || 'Could not read that card');
    } finally {
      setLookupBusy(false);
    }
  }, []);

  // -------- QR-mode camera lifecycle ------------------------------------
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
            // Debounce same-token rescans within 2.5s — a card sitting in
            // front of the lens decodes many times a second.
            if (decodedText === lastScanTokenRef.current && now - lastScanAtRef.current < 2500) {
              return;
            }
            lastScanTokenRef.current = decodedText;
            lastScanAtRef.current = now;
            void handleCode(decodedText);
          },
          () => {
            // expected per-frame no-match noise
          }
        );
      } catch (err) {
        console.error('Gate scanner start failed', err);
        if (!cancelled) {
          setCameraActive(false);
          // A denied camera must not end the shift — drop straight into the
          // typed-code path rather than leaving a dead screen.
          setScanMode('manual');
        }
        toast.error('Camera unavailable — type the card number instead');
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
          // already stopped
        }
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, cameraActive]);

  // -------- Keep the screen awake while scanning ------------------------
  useEffect(() => {
    if (!cameraActive) return;

    const acquire = async () => {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock?.request('screen');
      } catch {
        // wake lock unsupported or refused — harmless, the screen may dim
      }
    };
    void acquire();

    return () => {
      try {
        wakeLockRef.current?.release?.();
      } catch {
        // already released
      }
      wakeLockRef.current = null;
    };
  }, [cameraActive]);

  // -------- The one tap -------------------------------------------------
  const handleAction = async () => {
    if (!result?.decision.pass || !result.decision.action) return;
    if (!profile?.id) {
      toast.error('Your account is still loading — try again in a moment');
      return;
    }

    const { pass, action, isLate } = result.decision;
    const learnerName = result.learner.fullName;

    setWriteBusy(true);
    try {
      if (action === 'out') {
        await recordExit.mutateAsync({ id: pass.id, securityId: profile.id });
      } else {
        await recordReturn.mutateAsync({ id: pass.id, securityId: profile.id });
      }

      // Marking OUT notifies the parent; a late return notifies them too.
      // Fire-and-forget: a parent with no linked account must never block a
      // gate that has already opened.
      if (action === 'out' || isLate) {
        void fetch('/api/campus-living/gate-passes/notify-parent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passId: pass.id,
            event: action === 'out' ? 'out' : 'late_return',
          }),
        }).catch(() => {
          /* notification failure is logged server-side */
        });
      }

      setShiftLog((log) =>
        [
          {
            name: learnerName,
            direction: action,
            at: new Date().toLocaleTimeString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }),
            late: isLate,
          },
          ...log,
        ].slice(0, 8)
      );
      // Put THIS card on cooldown before clearing the panel, so a card still
      // in frame cannot immediately re-resolve and offer the opposite action.
      cooldownRef.current = { code: result.code, at: Date.now() };
      setResult(null);
    } catch {
      // the mutation hooks already toast the failure
    } finally {
      setWriteBusy(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) return;
    await handleCode(manualInput);
    setManualInput('');
  };

  const clearScan = () => {
    setResult(null);
    setUnrecognised(null);
    lastScanTokenRef.current = '';
  };

  // -------- Permission gate ---------------------------------------------
  if (!canScan) {
    return (
      <ContentLayout title="Gate Scan">
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">You cannot record gate movements</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This screen needs the &ldquo;Edit Gate Passes&rdquo; permission. Ask an
              administrator to grant it to your role in Role Management.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // -------- Verdict panel styling ---------------------------------------
  const verdict = result?.decision.verdict ?? null;
  const panelClass =
    verdict === 'approved'
      ? 'bg-green-600 text-white'
      : verdict === 'returning'
        ? 'bg-amber-400 text-black'
        : verdict === 'blocked'
          ? 'bg-red-700 text-white'
          : '';

  return (
    <ContentLayout title="Gate Scan">
      <div className="space-y-4 pb-8">
        {/* Header — deliberately compact; the verdict owns the screen */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link href="/campus-living/gate-passes">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">Gate Scan</h1>
            <p className="truncate text-xs text-muted-foreground">
              Scan a learner&apos;s ID card. One tap records the movement.
            </p>
          </div>
        </div>

        {/* ── The answer ──────────────────────────────────────────── */}
        {lookupBusy && (
          <Card>
            <CardContent className="flex min-h-36 items-center justify-center gap-3 p-6">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-lg">Reading card…</span>
            </CardContent>
          </Card>
        )}

        {!lookupBusy && unrecognised && (
          <Card className="border-2 border-slate-400">
            <CardContent className="space-y-3 p-6 text-center">
              <QrCode className="mx-auto h-10 w-10 text-slate-500" />
              <p className="text-2xl font-bold">Card not recognised</p>
              <p className="break-all text-sm text-muted-foreground">
                Nothing on file for{' '}
                <span className="font-mono">
                  {unrecognised.slice(0, 40)}
                  {unrecognised.length > 40 ? '…' : ''}
                </span>
              </p>
              <Button variant="outline" className="h-12 w-full text-base" onClick={clearScan}>
                Scan again
              </Button>
            </CardContent>
          </Card>
        )}

        {!lookupBusy && result && (
          <div className="overflow-hidden rounded-xl border-2 shadow-sm">
            {/* Colour band + the one line */}
            <div className={`px-4 py-5 ${panelClass}`}>
              <p className="text-3xl font-black leading-none tracking-tight sm:text-4xl">
                {result.decision.headline}
              </p>
              <p className="mt-2 text-base font-medium leading-snug sm:text-lg">
                {result.decision.detail}
              </p>
              {result.decision.verdict === 'approved' && result.approvedBy && (
                <p className="mt-1 text-sm opacity-90">approved by {result.approvedBy}</p>
              )}
            </div>

            {/* Face + name — the guard checks this against the person */}
            <div className="flex items-center gap-4 bg-background px-4 py-4">
              {result.learner.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.learner.photoUrl}
                  alt={result.learner.fullName}
                  className="h-20 w-20 shrink-0 rounded-lg border object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border bg-muted text-2xl font-bold text-muted-foreground">
                  {initials(result.learner.fullName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-xl font-bold leading-tight">
                  {result.learner.fullName}
                </p>
                {result.decision.pass && (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {result.decision.pass.pass_number}
                  </p>
                )}
              </div>
            </div>

            {/* The one tap. RED has none — that is the decision, not an omission. */}
            <div className="space-y-2 bg-background px-4 pb-4">
              {result.decision.action === 'out' && (
                <Button
                  className="h-20 w-full bg-green-600 text-2xl font-bold hover:bg-green-700"
                  onClick={() => void handleAction()}
                  disabled={writeBusy}
                >
                  {writeBusy ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <>
                      <LogOut className="mr-3 h-7 w-7" />
                      Let out
                    </>
                  )}
                </Button>
              )}

              {result.decision.action === 'in' && (
                <Button
                  className="h-20 w-full bg-amber-500 text-2xl font-bold text-black hover:bg-amber-600"
                  onClick={() => void handleAction()}
                  disabled={writeBusy}
                >
                  {writeBusy ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="mr-3 h-7 w-7" />
                      Let in
                    </>
                  )}
                </Button>
              )}

              {result.decision.verdict === 'blocked' && (
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-center dark:border-red-800 dark:bg-red-950/40">
                  {result.decision.blockedReason === 'has_left' ? (
                    <>
                      <p className="flex items-center justify-center gap-2 text-base font-semibold text-red-800 dark:text-red-200">
                        <ShieldAlert className="h-5 w-5 shrink-0" />
                        Do not accept this card.
                      </p>
                      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                        This person has left. A new pass must not be issued —
                        send them to the office.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-red-800 dark:text-red-200">
                        Do not let this learner out.
                      </p>
                      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                        A warden must issue a pass first.
                      </p>
                    </>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                className="h-12 w-full text-base"
                onClick={clearScan}
                disabled={writeBusy}
              >
                Next learner
              </Button>
            </div>
          </div>
        )}

        {/* ── Scan entry ──────────────────────────────────────────── */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={scanMode === 'qr' ? 'default' : 'outline'}
                className="h-12 text-base"
                onClick={() => setScanMode('qr')}
              >
                <QrCode className="mr-2 h-5 w-5" /> Camera
              </Button>
              <Button
                variant={scanMode === 'manual' ? 'default' : 'outline'}
                className="h-12 text-base"
                onClick={() => {
                  setScanMode('manual');
                  setCameraActive(false);
                }}
              >
                <Keyboard className="mr-2 h-5 w-5" /> Type it
              </Button>
            </div>

            {scanMode === 'qr' ? (
              <div className="space-y-3">
                {/* The container must exist before Html5Qrcode.start() runs */}
                <div
                  id={QR_ELEMENT_ID}
                  className={`aspect-square w-full overflow-hidden rounded-lg bg-black ${
                    !cameraActive ? 'flex items-center justify-center' : ''
                  }`}
                >
                  {!cameraActive && (
                    <div className="text-center">
                      <Camera className="mx-auto mb-2 h-10 w-10 text-slate-400" />
                      <p className="text-sm text-slate-400">Camera is off</p>
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => setCameraActive((v) => !v)}
                  variant={cameraActive ? 'destructive' : 'default'}
                  className="h-14 w-full text-lg"
                >
                  {cameraActive ? (
                    <>
                      <CameraOff className="mr-2 h-5 w-5" /> Stop camera
                    </>
                  ) : (
                    <>
                      <Camera className="mr-2 h-5 w-5" /> Start camera
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    inputMode="text"
                    autoComplete="off"
                    className="h-14 text-base"
                    placeholder="Card number or ID"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleManualSubmit()}
                    disabled={lookupBusy}
                  />
                  <Button
                    className="h-14 px-5"
                    onClick={() => void handleManualSubmit()}
                    disabled={lookupBusy || !manualInput.trim()}
                  >
                    <Search className="h-5 w-5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Accepts the ID printed on the card, either shape.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── This shift ──────────────────────────────────────────── */}
        {shiftLog.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">This shift</p>
              <ul className="divide-y">
                {shiftLog.map((e, i) => (
                  <li key={`${e.name}-${e.at}-${i}`} className="flex items-center gap-3 py-2">
                    {e.direction === 'out' ? (
                      <LogOut className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <LogIn className="h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                    {e.late && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-red-600">
                        <Clock className="h-3 w-3" /> late
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">{e.at}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {shiftLog.length} recorded on this device
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
