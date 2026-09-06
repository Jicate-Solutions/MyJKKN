'use client';

/**
 * /resource-management/scan — Resource QR scan + assign/return console.
 *
 * Wave 1.5 PR-2 (HR adapter): consumes the qr_code_token column added by
 * PR-1 substrate migration. Two scan modes:
 *   1. 'qr'     — camera scan via html5-qrcode (canonical pattern from
 *                 components/marathon/bib-scanner.tsx)
 *   2. 'manual' — paste token text (e.g. `res_a1b2c3d4e5f60718`)
 *
 * Permission: any user with resources.resources.view (mirrors the resource
 * list page); the assign/return mutations are still gated server-side by
 * RLS on the resources table.
 *
 * navMeta declares this page is invoked from the resources list; required
 * by scripts/assert-nav-coverage.mjs.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  ScanLine,
  QrCode,
  Keyboard,
  CheckCircle2,
  XCircle,
  PackageCheck,
  PackageOpen,
  Search,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import Loading from '@/components/Loading/Loading';

import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useStaff } from '@/hooks/staff/use-staff';

import { qrCodeService } from '@/lib/services/resource-management/qr-code-service';
import { ResourceService } from '@/lib/services/resource-management/resource-service';
import type { Resource } from '@/types/resource-management';

export const navMeta = {
  invokedFrom: '/resource-management/resources',
} as const;

interface LastScan {
  status: 'success' | 'error';
  message: string;
  resourceName?: string;
  token?: string;
}

export default function ResourceScanPage() {
  const { canAccess, isSuperAdmin } = usePermissions();
  const { profile } = useAuth();

  const canView = isSuperAdmin || canAccess('resources.resources', 'view');
  const canEdit = isSuperAdmin || canAccess('resources.resources', 'edit');

  const [scanMode, setScanMode] = useState<'qr' | 'manual'>('manual');
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [currentResource, setCurrentResource] = useState<Resource | null>(null);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [returnBusy, setReturnBusy] = useState(false);

  // Staff list (scoped to current user's institution by default)
  const institutionId = profile?.institution_id || undefined;
  const { data: staffData } = useStaff({ institution_id: institutionId });
  const staffList: any[] = (staffData as any)?.data ?? [];

  const scannerRef = useRef<any>(null);
  const lastScanTokenRef = useRef<string>('');
  const lastScanAtRef = useRef<number>(0);

  // -------- QR-mode camera lifecycle ------------------------------------
  useEffect(() => {
    if (scanMode !== 'qr' || !cameraActive) return;

    let scanner: any = null;
    let cancelled = false;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode('resource-qr-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            const now = Date.now();
            // Debounce same-token rescans within 2.5s
            if (
              decodedText === lastScanTokenRef.current &&
              now - lastScanAtRef.current < 2500
            ) {
              return;
            }
            lastScanTokenRef.current = decodedText;
            lastScanAtRef.current = now;
            void handleToken(decodedText);
          },
          () => {
            // expected per-frame no-match noise
          }
        );
      } catch (err) {
        console.error('Scanner start failed', err);
        if (!cancelled) setCameraActive(false);
        toast.error('Camera permission denied or unavailable');
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

  // -------- Lookup ------------------------------------------------------
  const handleToken = async (rawToken: string) => {
    const token = rawToken.trim();
    if (!token) return;
    setLookupBusy(true);
    try {
      const resource = await qrCodeService.lookupResourceByQrToken(token);
      if (!resource) {
        setCurrentResource(null);
        setLastScan({
          status: 'error',
          message: `No resource found for token "${token.slice(0, 24)}${token.length > 24 ? '…' : ''}"`,
          token,
        });
        return;
      }
      setCurrentResource(resource);
      setLastScan({
        status: 'success',
        message: 'Resource located',
        resourceName: resource.name,
        token,
      });
    } catch (err: any) {
      setCurrentResource(null);
      setLastScan({
        status: 'error',
        message: err?.message || 'Lookup failed',
        token,
      });
    } finally {
      setLookupBusy(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) return;
    await handleToken(manualInput);
    setManualInput('');
  };

  // -------- Assign / Return mutations -----------------------------------
  const handleAssign = async () => {
    if (!currentResource || !selectedStaffId) return;
    setAssignBusy(true);
    try {
      const updated = await ResourceService.assignToStaff(
        currentResource.id,
        selectedStaffId
      );
      setCurrentResource({ ...currentResource, ...updated });
      toast.success(`Assigned ${currentResource.name} to staff`);
      setAssignOpen(false);
      setSelectedStaffId('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign resource');
    } finally {
      setAssignBusy(false);
    }
  };

  const handleReturn = async () => {
    if (!currentResource) return;
    setReturnBusy(true);
    try {
      const updated = await ResourceService.markReturned(currentResource.id);
      setCurrentResource({ ...currentResource, ...updated });
      toast.success(`Marked ${currentResource.name} as returned`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark returned');
    } finally {
      setReturnBusy(false);
    }
  };

  // -------- Permission gate ---------------------------------------------
  if (!canView) {
    return (
      <ContentLayout title="Resource Scan">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              You do not have permission to scan resources.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const assigneeBadge = (() => {
    const t = currentResource?.assignee_type;
    if (!t || t === 'none') {
      return <Badge variant="outline">In pool</Badge>;
    }
    return (
      <Badge variant="default" className="capitalize">
        Held by {t}
      </Badge>
    );
  })();

  return (
    <ContentLayout title="Resource Scan">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/resource-management/resources">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Resource Scan</h1>
            <p className="text-muted-foreground">
              Scan a resource QR sticker or paste a token to assign or return it.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Scan card */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Scan Entry</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={scanMode === 'qr' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScanMode('qr')}
                  >
                    <QrCode className="mr-2 h-4 w-4" /> QR Code
                  </Button>
                  <Button
                    variant={scanMode === 'manual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setScanMode('manual');
                      setCameraActive(false);
                    }}
                  >
                    <Keyboard className="mr-2 h-4 w-4" /> Manual
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {scanMode === 'qr' ? (
                <div className="space-y-4">
                  <div
                    id="resource-qr-reader"
                    className={
                      'aspect-square w-full overflow-hidden rounded-lg bg-black ' +
                      (!cameraActive ? 'flex items-center justify-center' : '')
                    }
                  >
                    {!cameraActive && (
                      <div className="text-center">
                        <QrCode className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Camera is off
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => setCameraActive((v) => !v)}
                    variant={cameraActive ? 'destructive' : 'default'}
                    className="w-full"
                  >
                    {cameraActive ? (
                      <>
                        <CameraOff className="mr-2 h-4 w-4" /> Stop Camera
                      </>
                    ) : (
                      <>
                        <Camera className="mr-2 h-4 w-4" /> Start Camera
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Point the camera at a resource QR sticker. Scans
                    auto-trigger lookup.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor="qr-token">QR token</Label>
                  <div className="flex gap-2">
                    <Input
                      id="qr-token"
                      placeholder="res_abc123…"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && void handleManualSubmit()
                      }
                      autoFocus
                      disabled={lookupBusy}
                    />
                    <Button
                      onClick={() => void handleManualSubmit()}
                      disabled={lookupBusy || !manualInput.trim()}
                    >
                      {lookupBusy ? (
                        <>
                          <Loading />
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" /> Lookup
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tokens look like <code>res_a1b2c3d4e5f60718</code> — copy
                    from the printed label or the resource detail page.
                  </p>
                </div>
              )}

              {lastScan && (
                <div
                  className={
                    'mt-4 flex items-start gap-3 rounded-lg border p-3 ' +
                    (lastScan.status === 'success'
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50')
                  }
                >
                  {lastScan.status === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  )}
                  <div className="text-sm">
                    <p className="font-medium">
                      {lastScan.resourceName || lastScan.message}
                    </p>
                    {lastScan.resourceName && (
                      <p className="text-xs text-muted-foreground">
                        {lastScan.message}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resource card */}
          <Card>
            <CardHeader>
              <CardTitle>Resource</CardTitle>
            </CardHeader>
            <CardContent>
              {lookupBusy ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ) : !currentResource ? (
                <p className="text-sm text-muted-foreground">
                  Scan a QR or paste a token to load a resource here.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold">
                          {currentResource.name}
                        </p>
                        {currentResource.resource_code && (
                          <p className="text-xs text-muted-foreground">
                            {currentResource.resource_code}
                          </p>
                        )}
                      </div>
                      {assigneeBadge}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {(currentResource as any).parent_category?.name && (
                      <>
                        <dt className="text-muted-foreground">Category</dt>
                        <dd>{(currentResource as any).parent_category.name}</dd>
                      </>
                    )}
                    {(currentResource as any).institution?.name && (
                      <>
                        <dt className="text-muted-foreground">Institution</dt>
                        <dd>{(currentResource as any).institution.name}</dd>
                      </>
                    )}
                    {currentResource.assigned_at && (
                      <>
                        <dt className="text-muted-foreground">Assigned</dt>
                        <dd>
                          {new Date(currentResource.assigned_at).toLocaleString()}
                        </dd>
                      </>
                    )}
                    {currentResource.returned_at && (
                      <>
                        <dt className="text-muted-foreground">Returned</dt>
                        <dd>
                          {new Date(currentResource.returned_at).toLocaleString()}
                        </dd>
                      </>
                    )}
                    {currentResource.qr_code_token && (
                      <>
                        <dt className="text-muted-foreground">Token</dt>
                        <dd className="font-mono text-xs">
                          {currentResource.qr_code_token}
                        </dd>
                      </>
                    )}
                  </dl>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {currentResource.assignee_type !== 'staff' ? (
                      <Button
                        onClick={() => setAssignOpen(true)}
                        disabled={!canEdit || assignBusy}
                      >
                        <PackageCheck className="mr-2 h-4 w-4" />
                        Assign to staff
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => void handleReturn()}
                        disabled={!canEdit || returnBusy}
                      >
                        <PackageOpen className="mr-2 h-4 w-4" />
                        {returnBusy ? 'Marking…' : 'Mark Returned'}
                      </Button>
                    )}
                    <Button variant="outline" asChild>
                      <Link
                        href={`/resource-management/resources/${currentResource.id}`}
                      >
                        Open full record
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to staff</DialogTitle>
            <DialogDescription>
              {currentResource ? `${currentResource.name}` : 'Resource'} will be
              marked as held by the selected staff member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="staff-pick">Staff member</Label>
            <Select
              value={selectedStaffId}
              onValueChange={setSelectedStaffId}
            >
              <SelectTrigger id="staff-pick">
                <SelectValue placeholder="Select staff…" />
              </SelectTrigger>
              <SelectContent>
                {staffList.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No staff loaded
                  </SelectItem>
                ) : (
                  staffList.slice(0, 50).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                      {s.staff_id ? ` (${s.staff_id})` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignOpen(false)}
              disabled={assignBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleAssign()}
              disabled={!selectedStaffId || assignBusy}
            >
              {assignBusy ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
