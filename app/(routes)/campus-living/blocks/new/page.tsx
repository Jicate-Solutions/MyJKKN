'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import {
  Building2,
  ArrowLeft,
  Save,
  Loader2
} from 'lucide-react';

export default function NewBlockPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    hostel_type: 'boys',
    total_floors: '',
    address: '',
    contact_phone: '',
    curfew_time_weekday: '21:30',
    curfew_time_weekend: '22:00',
    visiting_hours_start: '16:00',
    visiting_hours_end: '19:00',
    amenities: {
      wifi: false,
      laundry: false,
      gym: false,
      study_room: false,
      tv_room: false,
      parking: false,
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAmenityToggle = (amenity: string) => {
    setFormData((prev) => ({
      ...prev,
      amenities: {
        ...prev.amenities,
        [amenity]: !prev.amenities[amenity as keyof typeof prev.amenities],
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // TODO: Replace with actual API call via React Query mutation
      // await createHostelBlock({ ...formData, institution_id: profile?.institution_id });
      console.log('Creating block:', formData);

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      router.push('/campus-living/blocks');
    } catch (error) {
      console.error('Failed to create block:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title="New Hostel Block">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks', href: '/campus-living/blocks' },
          { label: 'New Block' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Create New Hostel Block</h1>
            <p className="text-sm text-muted-foreground">
              Add a new hostel building or wing
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
                <Label htmlFor="hostel_type">Hostel Type *</Label>
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(formData.amenities).map(([amenity, enabled]) => (
                  <div key={amenity} className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor={`amenity-${amenity}`} className="capitalize cursor-pointer">
                      {amenity.replace('_', ' ')}
                    </Label>
                    <Switch
                      id={`amenity-${amenity}`}
                      checked={enabled}
                      onCheckedChange={() => handleAmenityToggle(amenity)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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
                  Creating...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Create Block
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
