'use client';

/**
 * /campus-living/mess/meals/scan — the mess-door console.
 *
 * WHAT CHANGED AND WHY
 * The QR mode used to be a picture of a scanner: a static icon over the words
 * "QR Scanner Active", with no camera, no decoder and no call to the scan
 * mutation. Selecting it made the page incapable of recording anything. The
 * camera below is the canonical html5-qrcode lifecycle ported from
 * app/(routes)/resource-management/scan/page.tsx, including its 2.5s
 * same-token debounce — without that, a card held in frame at fps 10 writes
 * dozens of rows a second straight into the mess headcount.
 *
 * The manual box was broken too, in its own way: its label says "Roll Number"
 * but the value went through untouched as `learner_id`, a uuid column. Both
 * paths now go through MessMealService.recordMealByScannedCode, which resolves
 * the code first (see mess-scan-resolver for the shapes it accepts).
 *
 * The old `} catch {` had no binding, so the underlying foreign-key and RLS
 * refusals never reached the guard, the console or the logs — which is how a
 * scanner that had never written a row went months looking plausible.
 */

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ScanLine,
  QrCode,
  Keyboard,
  Camera,
  CameraOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMessMeals, messMealKeys } from '@/hooks/campus-living/use-mess-meals';
import {
  MessMealService,
  type MessScanOutcome,
} from '@/lib/services/campus-living/mess-meal-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { useQueryClient } from '@tanstack/react-query';
import type { MealType } from '@/types/campus-living';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/mess/meals',
} as const;

/**
 * 'blocked' is a refusal about the PERSON, not about the scan — a card that
 * read perfectly and belongs to someone who has left. It gets a solid red
 * band rather than the ordinary pale error box, because the one thing the
 * server behind the counter must not do is mistake it for a reader fault and
 * wave the queue through.
 */
type ScanTone = 'success' | 'warning' | 'error' | 'blocked';

interface LastScan {
  tone: ScanTone;
  title: string;
  detail: string;
}

/** One place that decides what the guard reads for each outcome. */
function describeOutcome(outcome: MessScanOutcome): LastScan {
  switch (outcome.status) {
    case 'recorded':
      return {
        tone: 'success',
        title: outcome.displayName,
        detail: `${outcome.rollNumber ?? 'Meal recorded'} — meal recorded`,
      };
    case 'already_scanned':
      return {
        tone: 'warning',
        title: outcome.displayName,
        detail: `${outcome.rollNumber ?? 'Already scanned'} — already scanned for this meal today`,
      };
    case 'not_recognised':
      return {
        tone: 'error',
        title: 'Card not recognised',
        detail: `"${outcome.code.slice(0, 32)}${outcome.code.length > 32 ? '…' : ''}" does not match any current card. It may be an old or retired card.`,
      };
    case 'no_login_profile':
      return {
        tone: 'error',
        title: 'Card not recognised',
        detail: `${outcome.displayName} is on record but has no login account yet, so a meal cannot be filed against them. Send them to the office.`,
      };
    case 'has_left':
      return {
        tone: 'blocked',
        title: `${outcome.displayName} — card no longer valid`,
        detail: `${outcome.reason} No meal was recorded. Do not serve on this card; send them to the office.`,
      };
    case 'failed':
    default:
      return {
        tone: 'error',
        title: 'Could not record that meal',
        detail: outcome.message,
      };
  }
}

export default function MealScanPage() {
  const [scanMode, setScanMode] = useState<'qr' | 'manual'>('qr');
  const [cameraActive, setCameraActive] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>('lunch');
  const [manualInput, setManualInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);

  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const institutionId = profile?.institution_id || '';
  const today = new Date().toISOString().split('T')[0];
  const { data: mealsData } = useMessMeals(institutionId, { date: today, meal_type: selectedMeal });

  const mealRecords: any[] = (mealsData as any)?.data || mealsData || [];

  const scannerRef = useRef<any>(null);
  const lastScanTokenRef = useRef<string>('');
  const lastScanAtRef = useRef<number>(0);

  // Kept in a ref so the camera's decode callback — registered once when the
  // camera starts — always files against the meal currently selected.
  const selectedMealRef = useRef<MealType>(selectedMeal);
  useEffect(() => {
    selectedMealRef.current = selectedMeal;
  }, [selectedMeal]);

  const submitCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      setBusy(true);
      try {
        const outcome = await MessMealService.recordMealByScannedCode({
          code,
          date: today,
          mealType: selectedMealRef.current,
          scanMethod: scanMode === 'qr' ? 'qr_code' : 'manual',
          fallbackInstitutionId: institutionId || null,
        });
        setLastScan(describeOutcome(outcome));
        if (outcome.status === 'recorded') {
          queryClient.invalidateQueries({ queryKey: messMealKeys.all });
        }
      } catch (error) {
        // Bound, logged and surfaced. The predecessor swallowed this entirely.
        logger.error('campus-living/meals', 'Meal scan failed', error);
        setLastScan({
          tone: 'error',
          title: 'Could not record that meal',
          detail: error instanceof Error ? error.message : 'Unexpected error',
        });
      } finally {
        setBusy(false);
      }
    },
    [today, scanMode, institutionId, queryClient]
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
        scanner = new Html5Qrcode('mess-qr-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            const now = Date.now();
            // Debounce same-card rescans within 2.5s. A card sitting in frame
            // decodes ten times a second; without this the duplicate guard
            // would be doing all the work.
            if (
              decodedText === lastScanTokenRef.current &&
              now - lastScanAtRef.current < 2500
            ) {
              return;
            }
            lastScanTokenRef.current = decodedText;
            lastScanAtRef.current = now;
            void submitCode(decodedText);
          },
          () => {
            // expected per-frame no-match noise
          }
        );
      } catch (err) {
        logger.error('campus-living/meals', 'Scanner start failed', err);
        if (!cancelled) {
          setCameraActive(false);
          setLastScan({
            tone: 'error',
            title: 'Camera unavailable',
            detail:
              'Camera permission was denied or no camera was found. Use Manual entry instead.',
          });
        }
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

  const handleManualEntry = async () => {
    if (!manualInput.trim()) return;
    await submitCode(manualInput);
    setManualInput('');
  };

  const todayStats = {
    total_scanned: mealRecords.length,
    current_meal: selectedMeal.charAt(0).toUpperCase() + selectedMeal.slice(1),
    serving_time:
      selectedMeal === 'breakfast'
        ? '7:00 - 9:00 AM'
        : selectedMeal === 'lunch'
          ? '12:00 - 2:00 PM'
          : selectedMeal === 'snacks'
            ? '4:00 - 5:00 PM'
            : '7:00 - 9:00 PM',
  };

  const recentScans = mealRecords.slice(0, 5).map((r: any) => ({
    roll: r.learner_id || '-',
    time: r.scan_time
      ? new Date(r.scan_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '-',
    status: r.consumed ? 'success' : 'error',
  }));

  return (
    <ContentLayout title="Meal Scan">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/mess/meals">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Meal Scan</h1>
            <p className="text-muted-foreground">
              Scan a printed ID card, or type a roll number, to record a meal
            </p>
          </div>
        </div>

        {/* Current Meal Info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Current Meal</p>
                  <p className="text-lg font-semibold">{todayStats.current_meal}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Serving Time</p>
                  <p className="text-lg font-semibold">{todayStats.serving_time}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Select
                  value={selectedMeal}
                  onValueChange={(v) => setSelectedMeal(v as MealType)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">Breakfast</SelectItem>
                    <SelectItem value="lunch">Lunch</SelectItem>
                    <SelectItem value="snacks">Snacks</SelectItem>
                    <SelectItem value="dinner">Dinner</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-primary">
                    {todayStats.total_scanned} scanned
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Scan Area */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Scan Entry</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={scanMode === 'qr' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScanMode('qr')}
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    QR Code
                  </Button>
                  <Button
                    variant={scanMode === 'manual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setCameraActive(false);
                      setScanMode('manual');
                    }}
                  >
                    <Keyboard className="mr-2 h-4 w-4" />
                    Manual
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {scanMode === 'qr' ? (
                <div className="space-y-4">
                  <div
                    id="mess-qr-reader"
                    className={
                      cameraActive
                        ? 'rounded-lg overflow-hidden max-w-sm mx-auto'
                        : 'hidden'
                    }
                  />
                  {!cameraActive && (
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg aspect-square max-w-sm mx-auto flex items-center justify-center bg-muted/50">
                      <div className="text-center px-6">
                        <QrCode className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground font-medium">Camera is off</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Start the camera, then hold the printed card in front of it
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-center">
                    <Button
                      variant={cameraActive ? 'outline' : 'default'}
                      onClick={() => setCameraActive((v) => !v)}
                    >
                      {cameraActive ? (
                        <>
                          <CameraOff className="mr-2 h-4 w-4" />
                          Stop camera
                        </>
                      ) : (
                        <>
                          <Camera className="mr-2 h-4 w-4" />
                          Start camera
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="roll">Roll number, register number or card code</Label>
                    <div className="flex gap-2">
                      <Input
                        id="roll"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="Enter roll number..."
                        onKeyDown={(e) => e.key === 'Enter' && handleManualEntry()}
                        autoFocus
                      />
                      <Button onClick={handleManualEntry} disabled={busy}>
                        <ScanLine className="mr-2 h-4 w-4" />
                        Record
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Last Scan Result */}
              {lastScan && (
                <div
                  className={`mt-4 p-4 rounded-lg border ${
                    lastScan.tone === 'success'
                      ? 'bg-green-50 border-green-200'
                      : lastScan.tone === 'warning'
                        ? 'bg-amber-50 border-amber-200'
                        : lastScan.tone === 'blocked'
                          ? 'bg-red-600 border-red-800 text-white'
                          : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {lastScan.tone === 'success' ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                    ) : lastScan.tone === 'warning' ? (
                      <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                    ) : lastScan.tone === 'blocked' ? (
                      <ShieldAlert className="h-7 w-7 shrink-0 text-white" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600 shrink-0" />
                    )}
                    <div>
                      <p
                        className={
                          lastScan.tone === 'blocked' ? 'text-lg font-bold' : 'font-medium'
                        }
                      >
                        {lastScan.title}
                      </p>
                      <p
                        className={`text-sm ${
                          lastScan.tone === 'blocked' ? 'text-white/90' : 'text-muted-foreground'
                        }`}
                      >
                        {lastScan.detail}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Scans */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Scans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentScans.map((scan, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      {scan.status === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">{scan.roll}</p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">{scan.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
