'use client';

// Add-room form for a hostel block.
//
// Without this page, the "Add Room" link (/campus-living/blocks/[id]/rooms/new)
// fell through to the [roomId] detail route with roomId="new", which fetched a
// room by id="new" and threw 22P02 (invalid uuid). A static `new` segment
// takes routing precedence over the dynamic [roomId], so this page resolves
// /rooms/new cleanly AND provides the create flow.

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useHostelBlock } from '@/hooks/campus-living/use-hostel-blocks';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useCreateHostelRoom } from '@/hooks/campus-living/use-hostel-rooms';
import { useAmenitiesByScope } from '@/hooks/campus-living/use-amenities';
import type { RoomType, AcStatus } from '@/types/campus-living';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'triple', label: 'Triple' },
  { value: 'quad', label: 'Quad' },
  { value: 'dormitory', label: 'Dormitory' },
];

const AC_STATUSES: { value: AcStatus; label: string }[] = [
  { value: 'non_ac', label: 'Non-AC' },
  { value: 'ac', label: 'AC' },
  { value: 'cooler', label: 'Cooler' },
];

export default function NewRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: blockData } = useHostelBlock(id);
  const block = blockData as { name?: string; hostel_type?: string } | undefined;
  const createRoom = useCreateHostelRoom();
  const { hostelCategories: allCategories, loading: categoriesLoading } = useActiveHostelCategories();
  const { amenities: roomAmenities, loading: amenitiesLoading } =
    useAmenitiesByScope('room');
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);

  const toggleAmenity = (amenityId: string) =>
    setSelectedAmenityIds((prev) =>
      prev.includes(amenityId)
        ? prev.filter((x) => x !== amenityId)
        : [...prev, amenityId]
    );

  // Categories are gendered tiers; a block is a single gender, so only its
  // matching tiers apply. A 'mixed' block (rare) accepts every category.
  const blockType = block?.hostel_type;
  const categories =
    blockType && blockType !== 'mixed'
      ? allCategories.filter((c) => c.type === blockType)
      : allCategories;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    room_number: '',
    floor: '1',
    room_type: 'double' as RoomType,
    ac_status: 'non_ac' as AcStatus,
    category_id: '',
    capacity: '2',
    annual_fee: '',
    has_attached_bathroom: false,
    is_accessible: false,
  });

  const set = (field: string, value: string | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const canSave =
    formData.room_number.trim().length > 0 &&
    formData.category_id.trim().length > 0 &&
    Number.isFinite(Number(formData.floor)) &&
    Number(formData.capacity) > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createRoom.mutateAsync({
        block_id: id,
        room_number: formData.room_number.trim(),
        floor: parseInt(formData.floor, 10) || 0,
        room_type: formData.room_type,
        ac_status: formData.ac_status,
        category_id: formData.category_id,
        capacity: parseInt(formData.capacity, 10) || 1,
        annual_fee: formData.annual_fee === '' ? null : Number(formData.annual_fee),
        has_attached_bathroom: formData.has_attached_bathroom,
        is_accessible: formData.is_accessible,
        amenityTagIds: selectedAmenityIds,
      });
      router.push(`/campus-living/blocks/${id}/rooms`);
    } catch {
      // error toast surfaced by useCreateHostelRoom onError
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title="Add Room">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks', href: '/campus-living/blocks' },
          { label: block?.name ?? 'Block', href: `/campus-living/blocks/${id}` },
          { label: 'Rooms', href: `/campus-living/blocks/${id}/rooms` },
          { label: 'Add Room' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Add Room</h1>
            <p className="text-sm text-muted-foreground">
              Create a room in {block?.name ?? 'this block'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Room Details</CardTitle>
              <CardDescription>Number, floor, type, and capacity</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="room_number">Room Number *</Label>
                <Input
                  id="room_number"
                  placeholder="e.g., 101"
                  value={formData.room_number}
                  onChange={(e) => set('room_number', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="floor">Floor *</Label>
                <Input
                  id="floor"
                  type="number"
                  min={0}
                  max={50}
                  value={formData.floor}
                  onChange={(e) => set('floor', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="room_type">Room Type *</Label>
                <select
                  id="room_type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={formData.room_type}
                  onChange={(e) => set('room_type', e.target.value)}
                >
                  {ROOM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category_id">Room Category *</Label>
                <select
                  id="category_id"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={formData.category_id}
                  onChange={(e) => set('category_id', e.target.value)}
                  required
                  disabled={categoriesLoading}
                >
                  <option value="">Select Category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                {blockType && blockType !== 'mixed' && !categoriesLoading && categories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No {blockType} categories defined. Add one under Settings → Hostel Rooms Categories.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ac_status">AC Status *</Label>
                <select
                  id="ac_status"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={formData.ac_status}
                  onChange={(e) => set('ac_status', e.target.value)}
                >
                  {AC_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity (beds) *</Label>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  max={20}
                  value={formData.capacity}
                  onChange={(e) => set('capacity', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="annual_fee">Annual Fee (INR)</Label>
                <Input
                  id="annual_fee"
                  type="number"
                  min={0}
                  placeholder="optional"
                  value={formData.annual_fee}
                  onChange={(e) => set('annual_fee', e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="has_attached_bathroom" className="cursor-pointer">Attached Bathroom</Label>
                <Switch
                  id="has_attached_bathroom"
                  checked={formData.has_attached_bathroom}
                  onCheckedChange={(v) => set('has_attached_bathroom', v)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="is_accessible" className="cursor-pointer">Wheelchair Accessible</Label>
                <Switch
                  id="is_accessible"
                  checked={formData.is_accessible}
                  onCheckedChange={(v) => set('is_accessible', v)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Amenities</CardTitle>
              <CardDescription>Room-level facilities</CardDescription>
            </CardHeader>
            <CardContent>
              {amenitiesLoading ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading amenities…
                </div>
              ) : roomAmenities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No room-scoped amenities defined yet. Add them under Settings →
                  Amenities (set Scope to Room or Both).
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {roomAmenities.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <Label htmlFor={`room-amenity-${a.id}`} className="cursor-pointer">
                        {a.name}
                      </Label>
                      <Switch
                        id={`room-amenity-${a.id}`}
                        checked={selectedAmenityIds.includes(a.id)}
                        onCheckedChange={() => toggleAmenity(a.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Create Room
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
