'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Plus, QrCode } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import {
  useParentGatePasses,
  useParentLeaves,
  useParentPickupMembers,
} from '@/hooks/parent/use-parent-features';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';
import type { GatePassType, LeaveType } from '@/types/parent-portal';
import { useEffect } from 'react';

const PASS_TYPES: { v: GatePassType; l: string }[] = [
  { v: 'early_leave', l: 'Early leave' },
  { v: 'late_arrival', l: 'Late arrival' },
  { v: 'outpass', l: 'Outpass' },
  { v: 'medical', l: 'Medical' },
];
const LEAVE_TYPES: { v: LeaveType; l: string }[] = [
  { v: 'sick', l: 'Sick' },
  { v: 'casual', l: 'Casual' },
  { v: 'emergency', l: 'Emergency' },
  { v: 'on_duty', l: 'On duty' },
  { v: 'planned_family', l: 'Planned / family' },
];
const statusPill = (s: string) =>
  cn(
    'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
    s === 'approved' ? 'bg-green-100 text-green-700' : s === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
  );

function QrBadge({ token }: { token: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(token, { width: 160, margin: 1 }).then(setUrl).catch(() => {});
  }, [token]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="Gate pass QR" className="mt-2 h-32 w-32" />
  ) : (
    <QrCode className="mt-2 h-10 w-10 text-[#0b6d41]" />
  );
}

export default function GatePassPage() {
  const { activeLearnerId } = useParentSession();
  const queryClient = useQueryClient();
  const passes = useParentGatePasses();
  const leaves = useParentLeaves();
  const pickups = useParentPickupMembers();

  const [sheet, setSheet] = useState<null | 'pass' | 'leave' | 'pickup'>(null);
  const [saving, setSaving] = useState(false);
  // shared form state
  const [passType, setPassType] = useState<GatePassType>('early_leave');
  const [leaveType, setLeaveType] = useState<LeaveType>('sick');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [contact, setContact] = useState('');

  const close = () => {
    setSheet(null);
    setReason('');
    setDate('');
    setToDate('');
    setName('');
    setRelationship('');
    setContact('');
  };

  const submitPass = async () => {
    if (!activeLearnerId || !reason || !date) return toast.error('Reason and date are required.');
    setSaving(true);
    try {
      await ParentFeatures.createGatePass({ learnerId: activeLearnerId, passType, reason, requestedDate: date });
      toast.success('Gate pass requested.');
      close();
      queryClient.invalidateQueries({ queryKey: ['parent-gatepass'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };
  const submitLeave = async () => {
    if (!activeLearnerId || !reason || !date || !toDate) return toast.error('All fields are required.');
    setSaving(true);
    try {
      await ParentFeatures.createLeave({ learnerId: activeLearnerId, leaveType, fromDate: date, toDate, reason });
      toast.success('Leave requested.');
      close();
      queryClient.invalidateQueries({ queryKey: ['parent-leaves'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };
  const submitPickup = async () => {
    if (!name.trim()) return toast.error('Name is required.');
    setSaving(true);
    try {
      await ParentFeatures.addPickupMember({ name, relationship, contactNo: contact, learnerId: activeLearnerId ?? undefined });
      toast.success('Member added.');
      close();
      queryClient.invalidateQueries({ queryKey: ['parent-pickup'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Gate Pass &amp; Leaves</h1>
      <Tabs defaultValue="passes">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="passes">Passes</TabsTrigger>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
          <TabsTrigger value="pickup">Pickup</TabsTrigger>
        </TabsList>

        <TabsContent value="passes" className="space-y-3 pt-3">
          <Button onClick={() => setSheet('pass')} className="w-full bg-[#0b6d41] hover:bg-[#0a5733]">
            <Plus className="mr-1 h-4 w-4" /> Request Gate Pass
          </Button>
          {passes.isLoading ? (
            <Skeleton className="h-24 w-full rounded-2xl" />
          ) : (passes.data?.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No gate passes yet.</p>
          ) : (
            passes.data!.data.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{p.passType?.replace('_', ' ')}</span>
                  <span className={statusPill(p.status)}>{p.status}</span>
                </div>
                <p className="text-sm text-muted-foreground">{p.reason}</p>
                <p className="text-xs text-muted-foreground">{formatDate(p.requestedDate)}</p>
                {p.qrToken && (
                  <div className="flex flex-col items-center border-t pt-2">
                    <span className="text-xs font-medium text-[#0b6d41]">Show this at the gate</span>
                    <QrBadge token={p.qrToken} />
                  </div>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="leaves" className="space-y-3 pt-3">
          <Button onClick={() => setSheet('leave')} className="w-full bg-[#0b6d41] hover:bg-[#0a5733]">
            <Plus className="mr-1 h-4 w-4" /> Request Leave
          </Button>
          {leaves.isLoading ? (
            <Skeleton className="h-24 w-full rounded-2xl" />
          ) : (leaves.data?.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No leave requests yet.</p>
          ) : (
            leaves.data!.data.map((l) => (
              <Card key={l.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{l.leaveType.replace('_', ' ')}</span>
                  <span className={statusPill(l.status)}>{l.status}</span>
                </div>
                <p className="text-sm text-muted-foreground">{l.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(l.fromDate)} – {formatDate(l.toDate)}
                </p>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="pickup" className="space-y-3 pt-3">
          <Button onClick={() => setSheet('pickup')} className="w-full bg-[#0b6d41] hover:bg-[#0a5733]">
            <Plus className="mr-1 h-4 w-4" /> Add Pickup Member
          </Button>
          {pickups.isLoading ? (
            <Skeleton className="h-24 w-full rounded-2xl" />
          ) : (pickups.data?.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No authorised members yet.</p>
          ) : (
            pickups.data!.data.map((m) => (
              <Card key={m.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[m.relationship, m.contactNo].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Drawer open={sheet !== null} onOpenChange={(o) => !o && close()}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader className="text-left">
            <DrawerTitle>
              {sheet === 'pass' ? 'Request Gate Pass' : sheet === 'leave' ? 'Request Leave' : 'Add Pickup Member'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {sheet === 'pass' && (
              <>
                <Label>Type</Label>
                <select value={passType} onChange={(e) => setPassType(e.target.value as GatePassType)} className="w-full rounded-xl border p-2.5 text-sm">
                  {PASS_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
                <Label htmlFor="d">Date</Label>
                <Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <Label htmlFor="r">Reason</Label>
                <Input id="r" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button onClick={submitPass} disabled={saving} className="w-full bg-[#0b6d41]">Submit</Button>
              </>
            )}
            {sheet === 'leave' && (
              <>
                <Label>Leave type</Label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)} className="w-full rounded-xl border p-2.5 text-sm">
                  {LEAVE_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label htmlFor="f">From</Label><Input id="f" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                  <div><Label htmlFor="t">To</Label><Input id="t" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
                </div>
                <Label htmlFor="lr">Reason</Label>
                <Input id="lr" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button onClick={submitLeave} disabled={saving} className="w-full bg-[#0b6d41]">Submit</Button>
              </>
            )}
            {sheet === 'pickup' && (
              <>
                <Label htmlFor="n">Name</Label>
                <Input id="n" value={name} onChange={(e) => setName(e.target.value)} />
                <Label htmlFor="rel">Relationship</Label>
                <Input id="rel" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
                <Label htmlFor="c">Contact</Label>
                <Input id="c" value={contact} onChange={(e) => setContact(e.target.value)} inputMode="numeric" />
                <Button onClick={submitPickup} disabled={saving} className="w-full bg-[#0b6d41]">Add</Button>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
