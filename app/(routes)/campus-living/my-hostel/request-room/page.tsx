'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, BedDouble } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useMyManualCategories,
  useMyRoomOptions,
  useSelfAllocationActions,
} from '@/hooks/campus-living/use-self-allocation';

export const navMeta = { invokedFrom: '/campus-living/my-hostel' } as const;

export default function RequestRoomPage() {
  const router = useRouter();
  const { categories, loading: catLoading } = useMyManualCategories();
  const [categoryId, setCategoryId] = useState('');
  const { rooms, loading: roomsLoading } = useMyRoomOptions(categoryId || null);
  const [bedId, setBedId] = useState('');
  const { requestRoom } = useSelfAllocationActions();
  const [submitting, setSubmitting] = useState(false);

  const selected = rooms.find((r) => r.bed_id === bedId) ?? null;

  // Group beds by block, then room.
  const grouped = rooms.reduce<Record<string, typeof rooms>>((acc, r) => {
    const key = `${r.block_name} · ${r.floor === 0 ? 'Ground floor' : `Floor ${r.floor}`}`;
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  const submit = async () => {
    if (!categoryId || !selected) return;
    setSubmitting(true);
    try {
      await requestRoom(categoryId, selected.room_id, selected.bed_id);
      toast.success('Request submitted — awaiting warden approval');
      router.push('/campus-living/my-hostel');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentLayout title="Request Room">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Request Room' },
        ]}
      />
      <div className="space-y-6 mt-4 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold py-1">Request a Room / Upgrade</h1>
          <p className="text-sm text-muted-foreground">
            Pick a category and an available room you&apos;re eligible for. Your
            request is reviewed by the warden before it&apos;s confirmed.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category</CardTitle>
            <CardDescription>Self-selectable room categories for you</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setBedId(''); }} disabled={catLoading}>
                <SelectTrigger><SelectValue placeholder={catLoading ? 'Loading…' : 'Select category'} /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {categoryId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Choose a bed</CardTitle>
              <CardDescription>Only rooms you&apos;re eligible for are shown</CardDescription>
            </CardHeader>
            <CardContent>
              {roomsLoading ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading rooms…
                </div>
              ) : rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No available rooms you&apos;re eligible for in this category right now.
                </p>
              ) : (
                <div className="space-y-4 max-h-[360px] overflow-y-auto">
                  {Object.entries(grouped).map(([group, beds]) => (
                    <div key={group} className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{group}</p>
                      <div className="flex flex-wrap gap-2">
                        {beds.map((b) => (
                          <button
                            key={b.bed_id}
                            type="button"
                            onClick={() => setBedId(b.bed_id)}
                            className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${bedId === b.bed_id ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                          >
                            <BedDouble className="h-4 w-4 text-muted-foreground" />
                            {b.room_number} · Bed {b.bed_number}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!selected || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit request
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
