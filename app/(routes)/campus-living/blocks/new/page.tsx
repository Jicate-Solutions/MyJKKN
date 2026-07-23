'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCreateHostelBlock } from '@/hooks/campus-living/use-hostel-blocks';
import { useAmenitiesByScope } from '@/hooks/campus-living/use-amenities';
import {
  Building2,
  ArrowLeft,
  Save,
  Loader2,
  Star,
} from 'lucide-react';


/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/blocks',
} as const;

export default function NewBlockPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createBlock = useCreateHostelBlock();
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
  });

  const { amenities: blockAmenities, loading: amenitiesLoading } =
    useAmenitiesByScope('block');
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);

  // Colleges served by this block (hostel_block_institutions). The local
  // institutions catalog is RLS-scoped (super-admin sees all; scoped admins see
  // their accessible set). Same source as the edit page's Colleges card.
  const { data: institutions, isLoading: institutionsLoading } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: ['institutions', 'for-new-block-colleges'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Ordered selection — the FIRST entry is the primary college. Pre-select the
  // creator's own college once (profile loads after mount); the user can change it.
  const [selectedInstitutionIds, setSelectedInstitutionIds] = useState<string[]>([]);
  const didPreselect = useRef(false);
  useEffect(() => {
    if (!didPreselect.current && profile?.institution_id) {
      didPreselect.current = true;
      setSelectedInstitutionIds([profile.institution_id]);
    }
  }, [profile?.institution_id]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAmenity = (id: string) => {
    setSelectedAmenityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleInstitution = (id: string) => {
    setSelectedInstitutionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // hostel-rooms-v2 PR 2 (2026-05-26): hostel_blocks.institution_id dropped;
      // createBlock grants the selected colleges via the hostel_block_institutions
      // junction (first selected = primary). Empty = no college linked (block stays
      // RLS-invisible until granted later) — same as the old super-admin flow.
      const created = await createBlock.mutateAsync({
        institutionIds: selectedInstitutionIds,
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
        warden_id: null,
        deputy_warden_id: null,
        status: 'active' as const,
        metadata: null,
        amenityTagIds: selectedAmenityIds,
      });

      // BUG-003863: After block creation, route to the rooms management page
      // for the newly-created block so the user can immediately add rooms
      // (which is the prerequisite for adding beds and allocating residents).
      // Fallback to the blocks list if the created row didn't return an id
      // (defensive — should not happen with `.select().single()`).
      if (created?.id) {
        router.push(`/campus-living/blocks/${created.id}/rooms`);
      } else {
        router.push('/campus-living/blocks');
      }
    } catch (error) {
      // Error is handled by the mutation hook's onError
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
              Add a new hostel building or wing. After creating the block,
              you&apos;ll be taken to the rooms page to add rooms (rooms hold
              beds, which are then allocated to residents).
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

          {/* Colleges served */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Colleges served
              </CardTitle>
              <CardDescription>
                Students from any selected college can be allocated to this block. The first
                selected college is the <span className="font-medium">primary</span> (you can change
                it later on the block&apos;s Colleges card). Reserve specific rooms or floors for a
                cohort under Settings → Program Eligibility → Physical Rooms. Leave empty only if
                you&apos;ll assign colleges afterwards.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {institutionsLoading ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading colleges…
                </div>
              ) : (institutions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No colleges available to assign.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(institutions ?? []).map((inst) => {
                    const checked = selectedInstitutionIds.includes(inst.id);
                    const isPrimary = checked && selectedInstitutionIds[0] === inst.id;
                    return (
                      <div
                        key={inst.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`inst-${inst.id}`} className="cursor-pointer">
                            {inst.name}
                          </Label>
                          {isPrimary && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3 fill-current" /> Primary
                            </Badge>
                          )}
                        </div>
                        <Switch
                          id={`inst-${inst.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleInstitution(inst.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
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
                  Create Block &amp; Add Rooms
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
