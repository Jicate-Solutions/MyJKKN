'use client';

import { useEffect, useRef } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Smartphone,
  QrCode,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  usePersonalWhatsAppStatus,
  usePersonalWhatsAppMutations,
} from '@/hooks/admission/use-whatsapp-personal';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PersonalConnectProps {
  departmentId: string;
  onConnected?: (phoneNumber: string) => void;
  onDisconnected?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonalConnect({
  departmentId,
  onConnected,
  onDisconnected,
}: PersonalConnectProps) {
  const { data, isLoading, isError, error } = usePersonalWhatsAppStatus(
    departmentId,
    { pollWhileConnecting: true }
  );
  const mutations = usePersonalWhatsAppMutations(departmentId);

  const status: string = data?.status ?? 'disconnected';

  // ---- Callbacks on status transitions ----
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'ready' && prev !== null && prev !== 'ready') {
      onConnected?.(data?.phone_number ?? '');
    }
  }, [status, data?.phone_number, onConnected]);

  // Call onDisconnected when disconnect mutation succeeds
  useEffect(() => {
    if (mutations.disconnect.isSuccess) {
      onDisconnected?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutations.disconnect.isSuccess]);

  // ---- Loading state ----
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // ---- Render ----
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5" />
          Personal WhatsApp
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error alert */}
        {isError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              {(error as Error)?.message ?? 'Failed to fetch connection status.'}
            </AlertDescription>
          </Alert>
        )}

        {/* ---------- disconnected ---------- */}
        {status === 'disconnected' && (
          <div className="space-y-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <WifiOff className="h-10 w-10 text-muted-foreground" />
              <Badge variant="destructive">Not Connected</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Connect your personal WhatsApp to send messages directly from your
              phone number.
            </p>
            <Button
              className="bg-[#25D366] text-white hover:bg-[#1da851]"
              onClick={() => mutations.connect.mutate()}
              disabled={mutations.connect.isPending}
            >
              {mutations.connect.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Connect WhatsApp
            </Button>
          </div>
        )}

        {/* ---------- connecting ---------- */}
        {status === 'connecting' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
            <p className="text-sm text-muted-foreground">
              Initializing WhatsApp connection...
            </p>
          </div>
        )}

        {/* ---------- qr_ready ---------- */}
        {status === 'qr_ready' && (
          <div className="space-y-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <QrCode className="h-6 w-6 text-muted-foreground" />
              <Badge variant="outline">Scan QR Code</Badge>
            </div>

            {data?.qr_code && (
              <div className="flex justify-center">
                <img
                  src={data.qr_code}
                  alt="WhatsApp QR Code"
                  width={256}
                  height={256}
                  className="rounded-lg border"
                />
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm font-medium">
                Open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link
                a Device
              </p>
              <p className="text-xs text-muted-foreground">
                QR code refreshes automatically via polling.
              </p>
            </div>
          </div>
        )}

        {/* ---------- authenticated ---------- */}
        {status === 'authenticated' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-[#25D366]" />
              <CheckCircle2 className="h-6 w-6 text-[#25D366]" />
            </div>
            <p className="text-sm text-muted-foreground">
              Authenticated! Finalizing connection...
            </p>
          </div>
        )}

        {/* ---------- ready ---------- */}
        {status === 'ready' && (
          <div className="space-y-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-[#25D366]" />
              <Badge className="bg-[#25D366] text-white hover:bg-[#1da851]">
                Connected
              </Badge>
            </div>

            <div className="space-y-1">
              {data?.phone_number && (
                <p className="text-lg font-semibold">+{data.phone_number}</p>
              )}
              {data?.push_name && (
                <p className="text-sm text-muted-foreground">
                  {data.push_name}
                </p>
              )}
            </div>

            <Button
              variant="destructive"
              onClick={() => mutations.disconnect.mutate()}
              disabled={mutations.disconnect.isPending}
            >
              {mutations.disconnect.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Disconnect
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
