'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  KeyRound,
  Power,
  PowerOff,
  Send,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';
import {
  PosDeviceApiError,
  useDeleteImsPosDevice,
  useImsPosDevices,
  useSetImsPosDeviceActive,
  useTestImsPosDevice,
} from '@/hooks/ims/use-ims-pos-devices';
import type { ImsPosDeviceRow } from '@/types/ims/pos-devices';
import { PosDeviceFormDialog } from './_components/pos-device-form-dialog';
import { PosDeviceCredentialsDialog } from './_components/pos-device-credentials-dialog';
import { PosDeviceHelp } from './_components/pos-device-help';

type ConfirmAction = { kind: 'delete' | 'activate' | 'deactivate' | 'test-live'; device: ImsPosDeviceRow };

const KIND_LABEL: Record<ImsPosDeviceRow['kind'], string> = {
  razorpay_pos_soundbox: 'QR soundbox',
  ezetap_android: 'Android POS',
};

function ago(iso: string | null) {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : null;
}

export default function PosDevicesPage() {
  return (
    <ImsPageGuard module="ims.settings.pos_devices" action="manage">
      <PosDevicesPageInner />
    </ImsPageGuard>
  );
}

function PosDevicesPageInner() {
  const { data, isLoading, error } = useImsPosDevices();
  const devices = useMemo(() => data?.devices ?? [], [data]);
  const stores = useMemo(() => data?.stores ?? [], [data]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ImsPosDeviceRow | null>(null);
  const [credsFor, setCredsFor] = useState<ImsPosDeviceRow | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const setActive = useSetImsPosDeviceActive();
  const deleteDevice = useDeleteImsPosDevice();
  const testDevice = useTestImsPosDevice();

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (device: ImsPosDeviceRow) => {
    setEditing(device);
    setFormOpen(true);
  };

  const runTest = async (device: ImsPosDeviceRow, confirmLive = false) => {
    setTestingId(device.id);
    try {
      const result = await testDevice.mutateAsync({ id: device.id, confirmLive });
      if (!result.ok) toast.error(result.message);
      else if (result.cancelled) toast.success(result.message);
      else toast.warning(result.message);
    } catch (e) {
      if (e instanceof PosDeviceApiError && e.code === 'confirm_live') {
        setConfirm({ kind: 'test-live', device });
        return;
      }
      toast.error(e instanceof Error ? e.message : 'The test could not be sent');
    } finally {
      setTestingId(null);
    }
  };

  const handleTestClick = (device: ImsPosDeviceRow) => {
    if (device.environment === 'live') setConfirm({ kind: 'test-live', device });
    else void runTest(device);
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    const { kind, device } = confirm;
    setConfirm(null);
    if (kind === 'test-live') {
      await runTest(device, true);
      return;
    }
    try {
      if (kind === 'delete') {
        await deleteDevice.mutateAsync(device.id);
        toast.success(`${device.label} deleted`);
      } else {
        await setActive.mutateAsync({ id: device.id, active: kind === 'activate' });
        toast.success(`${device.label} ${kind === 'activate' ? 'activated' : 'deactivated'}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  return (
    <ContentLayout title="Payment Terminals">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payment Terminals</h1>
            <p className="text-muted-foreground mt-1">
              Razorpay POS QR soundboxes on IMS selling counters
            </p>
          </div>
          <Button onClick={openAdd} disabled={isLoading}>
            <Plus className="h-4 w-4 mr-2" />
            Add Terminal
          </Button>
        </div>

        {data && !data.vaultConfigured && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Terminal credentials are unavailable</AlertTitle>
            <AlertDescription>
              The server has no <code>RAZORPAY_CREDENTIALS_MASTER_SECRET</code>, so terminal credentials
              cannot be saved, tested or used at the counter. Ask the system administrator to set it in
              the deployment environment.
            </AlertDescription>
          </Alert>
        )}

        <PosDeviceHelp />

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : error ? (
              <div className="text-center py-12 text-destructive text-sm">
                {error instanceof Error ? error.message : 'Could not load payment terminals'}
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No payment terminals registered</p>
                <p className="text-sm mt-1">
                  {stores.length === 0
                    ? 'None of your stores has a selling counter yet — turn on POS for a store in Settings · Stores first.'
                    : 'Add the QR soundbox that sits on a selling counter to get started'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Terminal</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Environment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Credentials</TableHead>
                      <TableHead>Last push / error</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <p className="font-medium">{d.label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{d.serial}</p>
                          <p className="text-xs text-muted-foreground">{KIND_LABEL[d.kind]}</p>
                        </TableCell>
                        <TableCell>
                          <p>{d.storeName ?? '-'}</p>
                          <p className="text-xs text-muted-foreground">{d.institutionName ?? ''}</p>
                        </TableCell>
                        <TableCell>
                          {d.environment === 'live' ? (
                            <Badge variant="destructive">LIVE</Badge>
                          ) : (
                            <Badge variant="outline">DEMO</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.isActive ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.hasCredentials ? (
                            <span className="text-sm">
                              Saved
                              <span className="block text-xs text-muted-foreground">{d.username}</span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Not saved</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs max-w-[240px]">
                          {d.lastPushAt && <p>Pushed {ago(d.lastPushAt)}</p>}
                          {d.lastErrorAt && (
                            <p className="text-destructive truncate" title={d.lastErrorMessage ?? ''}>
                              {d.lastErrorCode ?? 'Error'} {ago(d.lastErrorAt)}: {d.lastErrorMessage}
                            </p>
                          )}
                          {!d.lastPushAt && !d.lastErrorAt && (
                            <span className="text-muted-foreground">Never used</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestClick(d)}
                              disabled={!d.hasCredentials || testingId !== null || !data?.vaultConfigured}
                              title={d.hasCredentials ? undefined : 'Save credentials first'}
                            >
                              {testingId === d.id ? (
                                <BeatLoader size={6} color="currentColor" />
                              ) : (
                                <>
                                  <Send className="h-3.5 w-3.5 mr-1.5" />
                                  Send ₹1 test
                                </>
                              )}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(d)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setCredsFor(d)}>
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  {d.hasCredentials ? 'Change credentials' : 'Set credentials'}
                                </DropdownMenuItem>
                                {d.isActive ? (
                                  <DropdownMenuItem onClick={() => setConfirm({ kind: 'deactivate', device: d })}>
                                    <PowerOff className="h-4 w-4 mr-2" />
                                    Deactivate
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    disabled={!d.hasCredentials}
                                    onClick={() => setConfirm({ kind: 'activate', device: d })}
                                  >
                                    <Power className="h-4 w-4 mr-2" />
                                    Activate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => setConfirm({ kind: 'delete', device: d })}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PosDeviceFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        device={editing}
        stores={stores}
      />

      <PosDeviceCredentialsDialog
        device={credsFor}
        onOpenChange={(open) => {
          if (!open) setCredsFor(null);
        }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'delete' && 'Delete terminal'}
              {confirm?.kind === 'activate' && 'Activate terminal'}
              {confirm?.kind === 'deactivate' && 'Deactivate terminal'}
              {confirm?.kind === 'test-live' && 'Send a LIVE ₹1 test?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'delete' &&
                `Delete "${confirm.device.label}"? This is refused once payments have been taken on it — deactivate it instead.`}
              {confirm?.kind === 'activate' &&
                (confirm.device.environment === 'demo'
                  ? `"${confirm.device.label}" is a DEMO terminal: payments are simulated. The counter will push bills to it, but in production the POS refuses demo terminals.`
                  : `"${confirm.device.label}" will receive real bills from the ${confirm.device.storeName ?? 'store'} counter.`)}
              {confirm?.kind === 'deactivate' &&
                `The ${confirm.device.storeName ?? 'store'} counter will stop pushing bills to "${confirm.device.label}". A payment already on the terminal can still be checked or cancelled.`}
              {confirm?.kind === 'test-live' &&
                `"${confirm.device.label}" is LIVE. The test shows a real ₹1.00 QR and withdraws it immediately — but if someone scans and pays before it is withdrawn, that rupee is real and is not booked as a sale.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={
                confirm?.kind === 'delete' || confirm?.kind === 'test-live'
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600'
                  : undefined
              }
            >
              {confirm?.kind === 'delete' && 'Delete'}
              {confirm?.kind === 'activate' && 'Activate'}
              {confirm?.kind === 'deactivate' && 'Deactivate'}
              {confirm?.kind === 'test-live' && 'Send live ₹1 test'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
