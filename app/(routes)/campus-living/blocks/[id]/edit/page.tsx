'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useHostelBlock,
  useUpdateHostelBlock,
} from '@/hooks/campus-living/use-hostel-blocks';
import { useAmenitiesByScope } from '@/hooks/campus-living/use-amenities';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { BlockCollegesCard } from './_components/block-colleges-card';

/**
 * navMeta — invoked from the block detail page's Edit button and from the
 * blocks list page's quick-edit affordance. Closes BUG-003862 + BUG-003864
 * (no UI to edit hostel block details after creation).
 */
export const navMeta = {
  invokedFrom: '/campus-living/blocks/[id]',
} as const;

export default function EditBlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: blockData, isLoading } = useHostelBlock(id);
  const updateBlock = useUpdateHostelBlock();
  const block = blockData as any;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    hostel_type: 'boys',
    total_floors: '',
    address: '',
    contact_phone: '',
    curfew_time_weekday: '',
    curfew_time_weekend: '',
    visiting_hours_start: '',
    visiting_hours_end: '',
    status: 'active' as 'active' | 'under_maintenance' | 'closed',
  });

  const { amenities: blockAmenities, loading: amenitiesLoading } =
    useAmenitiesByScope('block');
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);

  // Pre-fill form once block data arrives
  useEffect(() => {
    if (!block) return;
    setFormData({
      name: block.name ?? '',
      code: block.code ?? '',
      hostel_type: block.hostel_type ?? 'boys',
      total_floors: block.total_floors != null ? String(block.total_floors) : '',
      address: block.address ?? '',
      contact_phone: block.contact_phone ?? '',
      curfew_time_weekday: block.curfew_time_weekday ?? '',
      curfew_time_weekend: block.curfew_time_weekend ?? '',
      visiting_hours_start: block.visiting_hours_start ?? '',
      visiting_hours_end: block.visiting_hours_end ?? '',
      status: block.status ?? 'active',
    });
    setSelectedAmenityIds(
      (block.amenity_tags ?? []).map((a: { id: string }) => a.id)
    );
  }, [block]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAmenity = (id: string) => {
    setSelectedAmenityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await updateBlock.mutateAsync({
        id,
        payload: {
          name: formData.name,
          code: formData.code,
          hostel_type: formData.hostel_type as 'boys' | 'girls' | 'mixed',
          total_floors: parseInt(formData.total_floors) || 0,
          address: formData.address || null,
          contact_phone: formData.contact_phone || null,
          curfew_time_weekday: formData.curfew_time_weekday || null,
          curfew_time_weekend: formData.curfew_time_weekend || null,
          visiting_hours_start: formData.visiting_hours_start || null,
          visiting_hours_end: formData.visiting_hours_end || null,
          status: formData.status,
        } as any,
        amenityTagIds: selectedAmenityIds,
      });

      router.push(`/campus-living/blocks/${id}`);
    } catch (error) {
      // Error toast surfaced by useUpdateHostelBlock onError
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !block) {
    return (
      <ContentLayout title="Edit Block">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit ${block.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks', href: '/campus-living/blocks' },
          { label: block.name, href: `/campus-living/blocks/${id}` },
          { label: 'Edit' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Edit Hostel Block</h1>
            <p className="text-sm text-muted-foreground">
              Update block details, contact info, timings, and amenities
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
              <CardDescription>Block name, code, and type</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Block Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Boys Hostel A"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Block Code *</Label>
                <Input
                  id="code"
                  placeholder="e.g., BHA"
                  value={formData.code}
                  onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                  required
                  maxLength={10}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hostel_type">Type *</Label>
                <select
                  id="hostel_type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={formData.hostel_type}
                  onChange={(e) => handleInputChange('hostel_type', e.target.value)}
                  required
                >
                  <option value="boys">Boys</option>
                  <option value="girls">Girls</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="total_floors">Number of Floors *</Label>
                <Input
                  id="total_floors"
                  type="number"
                  placeholder="e.g., 4"
                  min={1}
                  max={20}
                  value={formData.total_floors}
                  onChange={(e) => handleInputChange('total_floors', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="under_maintenance">Under Maintenance</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address / Location</Label>
                <Input
                  id="address"
                  placeholder="e.g., North Campus, near Main Gate"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_phone">Emergency Contact Phone</Label>
                <Input
                  id="contact_phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={formData.contact_phone}
                  onChange={(e) => handleInputChange('contact_phone', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Timings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timings</CardTitle>
              <CardDescription>Curfew and visiting hours</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="curfew_weekday">Curfew Time (Weekday)</Label>
                <Input
                  id="curfew_weekday"
                  type="time"
                  value={formData.curfew_time_weekday}
                  onChange={(e) => handleInputChange('curfew_time_weekday', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="curfew_weekend">Curfew Time (Weekend)</Label>
                <Input
                  id="curfew_weekend"
                  type="time"
                  value={formData.curfew_time_weekend}
                  onChange={(e) => handleInputChange('curfew_time_weekend', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="visiting_start">Visiting Hours Start</Label>
                <Input
                  id="visiting_start"
                  type="time"
                  value={formData.visiting_hours_start}
                  onChange={(e) => handleInputChange('visiting_hours_start', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="visiting_end">Visiting Hours End</Label>
                <Input
                  id="visiting_end"
                  type="time"
                  value={formData.visiting_hours_end}
                  onChange={(e) => handleInputChange('visiting_hours_end', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Amenities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Amenities</CardTitle>
              <CardDescription>Available facilities in this block</CardDescription>
            </CardHeader>
            <CardContent>
              {amenitiesLoading ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading amenities…
                </div>
              ) : blockAmenities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No block-scoped amenities defined yet. Add them under Settings →
                  Amenities (set Scope to Block or Both).
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {blockAmenities.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <Label htmlFor={`amenity-${a.id}`} className="cursor-pointer">
                        {a.name}
                      </Label>
                      <Switch
                        id={`amenity-${a.id}`}
                        checked={selectedAmenityIds.includes(a.id)}
                        onCheckedChange={() => toggleAmenity(a.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Colleges that use this block (hostel_block_institutions) — the
              single institution-access surface; managed independently of the
              form fields above via its own mutations. */}
          <BlockCollegesCard blockId={id} />

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
