'use client';

/**
 * /campus-living/gate-passes/scan — the screen a guard works a shift on.
 *
 * Scan the learner's MyJKKN QR. One line, one colour, and the movement is
 * ALREADY RECORDED by the time the screen paints:
 *
 *   GREEN  Marked OUT 8:04 PM
 *   AMBER  Marked IN 9:47 PM · 17 minutes late
 *   RED    GATE PASS NOT APPROVED — contact the warden. Do not allow.
 *
 * RED IS A HARD BLOCK. There is deliberately no override control anywhere on
 * this page, and no tap that could become one.
 *
 * AUTO-RECORD, NOT TAP-TO-CONFIRM. The previous build showed a verdict and
 * waited for a button. At a gate during a rush that button is the bottleneck,
 * so the write now happens in the same request as the decision. The guard's
 * protection against a double movement is not a confirmation tap, it is three
 * things that have to hold at once: a 2.5s decode debounce, a 10s per-card
 * cooldown, and a status-scoped UPDATE server-side that simply matches no rows
 * if another gate got there first.
 *
 * ONE REQUEST, SERVER-SIDE. /api/campus-living/gate-passes/scan resolves the
 * card, decides, writes the pass, writes hostel_access_log and notifies the
 * parent. The log half cannot be done from a browser at all — gate_security
 * holds no `.create` and role_has_block_access is false for them — so putting
 * the decision anywhere else would mean a gate whose audit trail is silently
 * always empty.
 *
 * Camera lifecycle is the canonical html5-qrcode pattern, plus the wake lock
 * and haptic from the bib scanner: this runs on a phone held one-handed at a
 * gate at night, where the screen must not sleep between learners and the
 * guard cannot always look down to read a toast.
 *
 * Gated on `campus_living.gate_passes.edit` — the WRITE key — because the only
 * purpose of the page is to write.
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
  PhoneOff,
  QrCode,
  Search,
  ShieldAlert,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

import { usePermissions } from '@/hooks/use-permissions';
import { useGateScan } from '@/hooks/campus-living/use-gate-passes';
import type { GateScanResponse } from '@/app/api/campus-living/gate-passes/scan/route';

export const navMeta = {
  invokedFrom: '/campus-living/gate-passes',
} as const;

const QR_ELEMENT_ID = 'gate-pass-qr-reader';

/**
 * How long one card is ignored after a movement is recorded on it.
 *
 * Without this, a card left in front of the lens re-decodes seconds after
 * being marked OUT and the next scan would mark it back IN. The 2.5s decode
 * debounce is not enough: it suppresses the repeat, not the reversal.
 */
const POST_ACTION_COOLDOWN_MS = 10_000;

/** One completed movement, so the guard can glance back at the last few. */
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
  const { canAccess, isSuperAdmin } = usePermissions();
  const canScan = isSuperAdmin || canAccess('campus_living.gate_passes', 'edit');

  const [scanMode, setScanMode] = useState<'qr' | 'manual'>('qr');
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [result, setResult] = useState<GateScanResponse | null>(null);
  const [shiftLog, setShiftLog] = useState<ShiftEntry[]>([]);

  const gateScan = useGateScan();

  const scannerRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);
  const lastScanTokenRef = useRef<string>('');
  const lastScanAtRef = useRef<number>(0);
  const cooldownRef = useRef<{ code: string; at: number } | null>(null);

  // -------- One scan --------------------------------------------------
  const handleCode = useCallback(
    async (rawCode: string) => {
      const code = (rawCode ?? '').trim();
      if (!code) return;

      // A card that was just acted on is ignored for a beat, so the movement
      // cannot be reversed by the same card sitting in front of the lens.
      const cooling = cooldownRef.current;
      if (cooling && cooling.code === code && Date.now() - cooling.at < POST_ACTION_COOLDOWN_MS) {
        toast('Already recorded — move to the next learner');
        return;
      }

      setResult(null);
      try {
        const res = await gateScan.mutateAsync({ code });
        setResult(res);

        // Haptic confirmation — the guard does not have to watch the screen to
        // know the scan registered, and a refusal buzzes differently.
        try {
          navigator.vibrate?.(
            res.verdict === 'blocked' || res.verdict === 'unrecognised' ? [80, 60, 80] : 100,
          );
        } catch {
          // vibration unsupported — the colour band is still correct
        }

        if (res.recorded) {
          // This card goes on cooldown only once something was actually
          // written. A refused scan must stay re-scannable — the guard may be
          // trying again after the learner fetched their pass.
          cooldownRef.current = { code, at: Date.now() };
          setShiftLog((log) =>
            [
              {
                name: res.learner?.name ?? 'Unknown',
                direction: res.recorded!.direction,
                at: new Date(res.recorded!.at).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                }),
                late: res.recorded!.isLate,
              },
              ...log,
            ].slice(0, 8),
          );
        }
      } catch {
        // the mutation's onError toast is the guard-facing report
      }
    },
    [gateScan],
  );

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
          },
        );
      } catch (err) {
        console.error('Gate scanner start failed', err);
        if (!cancelled) {
          setCameraActive(false);
          // A denied camera must not end the shift — drop straight into the
          // typed-code path rather than leaving a dead screen.
          setScanMode('manual');
        }
        toast.error('Camera unavailable — type the ID instead');
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

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) return;
    await handleCode(manualInput);
    setManualInput('');
  };

  const clearScan = () => {
    setResult(null);
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
  const verdict = result?.verdict ?? null;
  const panelClass =
    verdict === 'approved'
      ? 'bg-green-600 text-white'
      : verdict === 'returning'
        ? 'bg-amber-400 text-black'
        : verdict === 'blocked'
          ? 'bg-red-700 text-white'
          : verdict === 'unrecognised'
            ? 'bg-slate-600 text-white'
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
              Scan the learner&apos;s MyJKKN QR. The time records itself.
            </p>
          </div>
        </div>

        {/* ── The answer ──────────────────────────────────────────── */}
        {gateScan.isPending && (
          <Card>
            <CardContent className="flex min-h-36 items-center justify-center gap-3 p-6">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-lg">Reading card…</span>
            </CardContent>
          </Card>
        )}

        {!gateScan.isPending && result && (
          <div className="overflow-hidden rounded-xl border-2 shadow-sm">
            {/* Colour band + the one line */}
            <div className={`px-4 py-5 ${panelClass}`}>
              <p className="text-3xl font-black leading-none tracking-tight sm:text-4xl">
                {result.headline}
              </p>
              <p className="mt-2 text-base font-medium leading-snug sm:text-lg">
                {result.detail}
              </p>
            </div>

            {/* Face + name — the guard checks this against the person */}
            {result.learner && (
              <div className="flex items-center gap-4 bg-background px-4 py-4">
                {result.learner.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.learner.photoUrl}
                    alt={result.learner.name}
                    className="h-20 w-20 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border bg-muted text-2xl font-bold text-muted-foreground">
                    {initials(result.learner.name)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold leading-tight">
                    {result.learner.name}
                  </p>
                  {result.learner.passNumber && (
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {result.learner.passNumber}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2 bg-background px-4 pb-4">
              {/* RED has no control at all. That is the decision, not an omission. */}
              {result.verdict === 'blocked' && (
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-center dark:border-red-800 dark:bg-red-950/40">
                  <p className="flex items-center justify-center gap-2 text-base font-semibold text-red-800 dark:text-red-200">
                    <ShieldAlert className="h-5 w-5 shrink-0" />
                    Do not allow.
                  </p>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    {result.blockedReason === 'has_left'
                      ? 'This person has left. Send them to the office — a new pass must not be issued.'
                      : result.blockedReason === 'not_a_learner'
                        ? 'This card is not a hostel resident’s. Direct them to the main campus entrance.'
                        : 'Send them to the warden. No override exists on this screen.'}
                  </p>
                </div>
              )}

              {/* The movement is already written. Say what could not be done
                  alongside it rather than letting silence imply it all worked. */}
              {result.recorded && (
                <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    {result.recorded.direction === 'out' ? (
                      <LogOut className="h-4 w-4 text-green-600" />
                    ) : (
                      <LogIn className="h-4 w-4 text-amber-600" />
                    )}
                    Movement recorded.
                  </p>
                  {result.parentNotified === false && (
                    <p className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <PhoneOff className="h-3.5 w-3.5 shrink-0" />
                      No parent could be notified for this learner.
                    </p>
                  )}
                  {!result.logged && (
                    <p className="text-muted-foreground">
                      The movement was saved, but it could not be written to the access log.
                    </p>
                  )}
                </div>
              )}

              <Button variant="outline" className="h-14 w-full text-lg" onClick={clearScan}>
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
                    placeholder="JKKN ID, e.g. 348295-7"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleManualSubmit()}
                    disabled={gateScan.isPending}
                  />
                  <Button
                    className="h-14 px-5"
                    onClick={() => void handleManualSubmit()}
                    disabled={gateScan.isPending || !manualInput.trim()}
                  >
                    <Search className="h-5 w-5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Accepts the JKKN ID printed on the card, or an older card&apos;s ID.
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
                    {e.late && <span className="shrink-0 text-xs text-red-600">late</span>}
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
