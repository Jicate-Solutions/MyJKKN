'use client';

/**
 * A team member's personal gate QR, shown on /profile.
 *
 * The QR carries ONLY 'GS:<staff.id>' — an opaque UUID reference the gate
 * screen resolves server-side (gate_resolve_token). No name, number or email
 * is encoded. Below it: today's movements with an editable reason
 * (gate_update_movement_reason keeps the original in gate_audit_events).
 *
 * Renders nothing for accounts with no staff row (learners, service accounts).
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { LogIn, LogOut, QrCode, Pencil } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useMyGateMovements, useUpdateGateReason } from '@/hooks/gate-security/use-gate-security';
import { STAFF_REASONS } from '@/lib/services/gate-security/gate-security-service';

interface StaffRow {
  id: string;
  staff_id: string | null;
}

function useMyStaffRow() {
  const { profile } = useAuth();
  return useQuery<StaffRow | null>({
    queryKey: ['gate-security', 'my-staff-row', profile?.id],
    enabled: !!profile?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const byProfile = await supabase.from('staff').select('id, staff_id').eq('profile_id', profile!.id).limit(1);
      const first = (byProfile.data as StaffRow[] | null)?.[0];
      if (first) return first;
      const email = profile?.email?.trim();
      if (!email) return null;
      for (const column of ['institution_email', 'email'] as const) {
        const { data } = await supabase.from('staff').select('id, staff_id').eq(column, email).limit(1);
        const row = (data as StaffRow[] | null)?.[0];
        if (row) return row;
      }
      return null;
    },
  });
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export function StaffGateQr() {
  const { data: staff, isLoading } = useMyStaffRow();
  const movements = useMyGateMovements(!!staff);
  const updateReason = useUpdateGateReason();
  const [qrUrl, setQrUrl] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const token = staff ? `GS:${staff.id}` : '';
  useEffect(() => {
    if (!token) return;
    QRCode.toDataURL(token, { width: 200, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [token]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!staff) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-5 w-5" /> My Gate QR
        </CardTitle>
        <CardDescription>
          Show this at the campus gate. Security scans it and records your IN / OUT.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="My gate QR" className="h-48 w-48 rounded-lg border bg-white p-1" />
          ) : (
            <Skeleton className="h-48 w-48 rounded-lg" />
          )}
          {staff.staff_id && <p className="font-mono text-xs text-muted-foreground">{staff.staff_id}</p>}
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-2 text-sm font-semibold">Recent gate movements</p>
          {movements.isLoading && <Skeleton className="h-16 w-full" />}
          {!movements.isLoading && !movements.data?.length && (
            <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
          )}
          <ul className="divide-y">
            {movements.data?.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                {m.direction === 'out' ? (
                  <LogOut className="h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <LogIn className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                <span className="font-medium">{m.direction.toUpperCase()}</span>
                <span className="text-muted-foreground">
                  {new Date(m.recorded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · {fmtTime(m.recorded_at)}
                </span>
                {editing === m.id ? (
                  <span className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Reason" /></SelectTrigger>
                      <SelectContent>
                        {STAFF_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!reason || updateReason.isPending}
                      onClick={() =>
                        updateReason.mutate(
                          { movementId: m.id, reason },
                          { onSuccess: () => setEditing(null) }
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </span>
                ) : (
                  <span className="ml-auto flex items-center gap-2">
                    <span className={m.reason ? '' : 'text-muted-foreground'}>{m.reason ?? 'No reason'}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Edit reason"
                      onClick={() => {
                        setEditing(m.id);
                        setReason(m.reason ?? '');
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
