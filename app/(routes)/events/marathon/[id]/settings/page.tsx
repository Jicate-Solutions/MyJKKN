'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  useMarathonEvent,
  useUpdateMarathonEvent,
  useUpdateRegistrationConfig,
  useUpdateRouteConfig,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/hooks/events/marathon/use-marathon-events';
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  Pencil,
  X,
  Settings,
  ListChecks,
  MapPin,
  ClipboardList,
  ImagePlus,
  Upload,
} from 'lucide-react';
import Image from 'next/image';
import { StorageUtils } from '@/lib/supabase/storage-utils';
import toast from 'react-hot-toast';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import type { EventCategory } from '@/types/events';

// ============================================================================
// Hero Image Upload Component
// ============================================================================

function HeroImageUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    try {
      setIsUploading(true);
      const publicUrl = await StorageUtils.uploadFile(
        'event-images',
        file,
        'marathon/hero'
      );
      onChange(publicUrl);
      toast.success('Hero image uploaded');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload image. Make sure the "event-images" storage bucket exists in Supabase.');
    } finally {
      setIsUploading(false);
      // Reset the input so the same file can be re-selected
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label>Hero Image</Label>
      {value ? (
        <div className="relative w-full max-w-md">
          <div className="relative w-full h-48 rounded-lg overflow-hidden border">
            <Image
              src={value}
              alt="Hero image"
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="flex gap-2 mt-2">
            <label className="cursor-pointer">
              <Input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                disabled={isUploading}
                className="hidden"
              />
              <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
                <span>
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {isUploading ? 'Uploading...' : 'Change Image'}
                </span>
              </Button>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive gap-1.5"
              onClick={() => onChange('')}
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <label className="cursor-pointer">
          <Input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            disabled={isUploading}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center w-full max-w-md h-48 border-2 border-dashed rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-colors">
            {isUploading ? (
              <>
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                <span className="text-sm text-muted-foreground mt-2">Uploading...</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground mt-2">Click to upload hero image</span>
                <span className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</span>
              </>
            )}
          </div>
        </label>
      )}
    </div>
  );
}

// ============================================================================
// General Settings Tab
// ============================================================================

function GeneralTab({ event }: { event: any }) {
  const updateMutation = useUpdateMarathonEvent();
  const [form, setForm] = useState({
    name: '',
    theme: '',
    tagline: '',
    event_date: '',
    start_time: '',
    venue: '',
    venue_address: '',
    hero_image_url: '',
    description: '',
  });

  useEffect(() => {
    if (event) {
      setForm({
        name: event.name ?? '',
        theme: event.theme ?? '',
        tagline: event.tagline ?? '',
        event_date: event.event_date ?? '',
        start_time: event.start_time ?? '',
        venue: event.venue ?? '',
        venue_address: event.venue_address ?? '',
        hero_image_url: event.hero_image_url ?? '',
        description: event.description ?? '',
      });
    }
  }, [event]);

  const handleSave = () => {
    updateMutation.mutate({
      id: event.id,
      dto: {
        name: form.name || undefined,
        theme: form.theme || undefined,
        tagline: form.tagline || undefined,
        event_date: form.event_date || undefined,
        start_time: form.start_time || undefined,
        venue: form.venue || undefined,
        venue_address: form.venue_address || undefined,
        hero_image_url: form.hero_image_url || undefined,
        description: form.description || undefined,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">General Settings</CardTitle>
        <CardDescription>
          Update the core details of your marathon event.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gen-name">Event Name</Label>
          <Input
            id="gen-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gen-theme">Theme</Label>
            <Input
              id="gen-theme"
              value={form.theme}
              onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gen-tagline">Tagline</Label>
            <Input
              id="gen-tagline"
              value={form.tagline}
              onChange={(e) =>
                setForm((f) => ({ ...f, tagline: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gen-date">Event Date</Label>
            <Input
              id="gen-date"
              type="date"
              value={form.event_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, event_date: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gen-time">Start Time</Label>
            <Input
              id="gen-time"
              type="time"
              value={form.start_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, start_time: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gen-venue">Venue</Label>
          <Input
            id="gen-venue"
            value={form.venue}
            onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gen-address">Venue Address</Label>
          <Textarea
            id="gen-address"
            rows={2}
            value={form.venue_address}
            onChange={(e) =>
              setForm((f) => ({ ...f, venue_address: e.target.value }))
            }
          />
        </div>

        <HeroImageUpload
          value={form.hero_image_url}
          onChange={(url) => setForm((f) => ({ ...f, hero_image_url: url }))}
        />

        <div className="space-y-2">
          <Label htmlFor="gen-desc">Description</Label>
          <Textarea
            id="gen-desc"
            rows={3}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="gap-2"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Categories Tab
// ============================================================================

function CategoriesTab({
  eventId,
  categories,
}: {
  eventId: string;
  categories: EventCategory[];
}) {
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const emptyForm = {
    name: '',
    code: '',
    distance_km: '',
    fee_amount: '',
    early_bird_fee: '',
    max_participants: '',
    min_age: '',
    max_age: '',
  };
  const [form, setForm] = useState(emptyForm);

  const startEdit = (cat: EventCategory) => {
    setEditingId(cat.id);
    setShowAdd(false);
    setForm({
      name: cat.name,
      code: cat.code ?? '',
      distance_km: cat.distance_km?.toString() ?? '',
      fee_amount: cat.fee_amount?.toString() ?? '',
      early_bird_fee: cat.early_bird_fee?.toString() ?? '',
      max_participants: cat.max_participants?.toString() ?? '',
      min_age: cat.min_age?.toString() ?? '',
      max_age: cat.max_age?.toString() ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowAdd(false);
    setForm(emptyForm);
  };

  const handleSave = () => {
    const dto: Partial<EventCategory> = {
      name: form.name,
      code: form.code || null,
      distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
      fee_amount: form.fee_amount ? parseFloat(form.fee_amount) : 0,
      early_bird_fee: form.early_bird_fee
        ? parseFloat(form.early_bird_fee)
        : null,
      max_participants: form.max_participants
        ? parseInt(form.max_participants, 10)
        : null,
      min_age: form.min_age ? parseInt(form.min_age, 10) : null,
      max_age: form.max_age ? parseInt(form.max_age, 10) : null,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, eventId, dto },
        { onSuccess: () => cancelEdit() }
      );
    } else {
      createMutation.mutate(
        { ...dto, event_id: eventId, sort_order: categories.length + 1 },
        { onSuccess: () => cancelEdit() }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this category? This cannot be undone.')) return;
    deleteMutation.mutate({ id, eventId });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Categories</CardTitle>
            <CardDescription>
              Manage race categories (e.g. 10K, 5K, 3K Fun Run).
            </CardDescription>
          </div>
          {!showAdd && !editingId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAdd(true);
                setForm(emptyForm);
              }}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category list */}
        {categories.map((cat) =>
          editingId === cat.id ? (
            <CategoryForm
              key={cat.id}
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onCancel={cancelEdit}
              isSaving={isSaving}
              isEdit
            />
          ) : (
            <div
              key={cat.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{cat.name}</span>
                  {cat.code && (
                    <Badge variant="outline" className="text-xs">
                      {cat.code}
                    </Badge>
                  )}
                  {cat.distance_km && (
                    <Badge variant="secondary" className="text-xs">
                      {cat.distance_km} km
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                  <span>Fee: {cat.fee_amount ?? 0}</span>
                  {cat.early_bird_fee != null && (
                    <span>Early Bird: {cat.early_bird_fee}</span>
                  )}
                  {cat.max_participants && (
                    <span>Max: {cat.max_participants}</span>
                  )}
                  {(cat.min_age != null || cat.max_age != null) && (
                    <span>
                      Age: {cat.min_age ?? '0'}-{cat.max_age ?? '99+'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit(cat)}
                  className="h-8 w-8"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(cat.id)}
                  disabled={deleteMutation.isPending}
                  className="h-8 w-8 text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        )}

        {categories.length === 0 && !showAdd && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No categories yet. Click &quot;Add&quot; to create one.
          </p>
        )}

        {/* Add form */}
        {showAdd && (
          <CategoryForm
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={cancelEdit}
            isSaving={isSaving}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CategoryForm({
  form,
  setForm,
  onSave,
  onCancel,
  isSaving,
  isEdit = false,
}: {
  form: any;
  setForm: (fn: any) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isEdit?: boolean;
}) {
  return (
    <div className="p-4 rounded-lg border border-primary/30 bg-muted/30 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Name *</Label>
          <Input
            value={form.name}
            onChange={(e) =>
              setForm((f: any) => ({ ...f, name: e.target.value }))
            }
            placeholder="e.g. 10 KM Run"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Code</Label>
          <Input
            value={form.code}
            onChange={(e) =>
              setForm((f: any) => ({ ...f, code: e.target.value }))
            }
            placeholder="e.g. 10K"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Distance (km)</Label>
          <Input
            type="number"
            step="0.1"
            value={form.distance_km}
            onChange={(e) =>
              setForm((f: any) => ({ ...f, distance_km: e.target.value }))
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Fee</Label>
          <Input
            type="number"
            value={form.fee_amount}
            onChange={(e) =>
              setForm((f: any) => ({ ...f, fee_amount: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Early Bird Fee</Label>
          <Input
            type="number"
            value={form.early_bird_fee}
            onChange={(e) =>
              setForm((f: any) => ({ ...f, early_bird_fee: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max Participants</Label>
          <Input
            type="number"
            value={form.max_participants}
            onChange={(e) =>
              setForm((f: any) => ({
                ...f,
                max_participants: e.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Age Range</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              placeholder="Min"
              value={form.min_age}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, min_age: e.target.value }))
              }
              className="w-full"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="number"
              placeholder="Max"
              value={form.max_age}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, max_age: e.target.value }))
              }
              className="w-full"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={onSave}
          disabled={isSaving || !form.name.trim()}
        >
          {isSaving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {isEdit ? 'Update' : 'Add Category'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="mr-1 h-3.5 w-3.5" /> Cancel
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Route Tab — Route details + Checkpoint management
// ============================================================================

interface RouteCheckpoint {
  name: string;
  type: 'start' | 'finish' | 'water' | 'medical' | 'waypoint' | 'km_marker';
  distance_km: string;
  lat: string;
  lng: string;
}

const CHECKPOINT_TYPES = [
  { value: 'start', label: 'Start Line' },
  { value: 'finish', label: 'Finish Line' },
  { value: 'water', label: 'Water Station' },
  { value: 'medical', label: 'Medical Post' },
  { value: 'waypoint', label: 'Waypoint' },
  { value: 'km_marker', label: 'KM Marker' },
] as const;

const CHECKPOINT_TYPE_LABELS: Record<string, string> = {
  start: 'Start',
  finish: 'Finish',
  water: 'Water',
  medical: 'Medical',
  waypoint: 'Waypoint',
  km_marker: 'KM',
};

function RouteTab({ event }: { event: any }) {
  const updateMutation = useUpdateRouteConfig();

  // Route details
  const [routeForm, setRouteForm] = useState({
    total_distance_km: '',
    start_location: '',
    finish_location: '',
    map_center_lat: '',
    map_center_lng: '',
    elevation_gain_m: '',
    route_description: '',
  });

  // Checkpoints list
  const [checkpoints, setCheckpoints] = useState<RouteCheckpoint[]>([]);
  const [showAddCheckpoint, setShowAddCheckpoint] = useState(false);
  const [newCheckpoint, setNewCheckpoint] = useState<RouteCheckpoint>({
    name: '',
    type: 'water',
    distance_km: '',
    lat: '',
    lng: '',
  });

  // Load existing config
  useEffect(() => {
    if (event?.route_config) {
      const rc = event.route_config;
      setRouteForm({
        total_distance_km: rc.total_distance_km?.toString() ?? '',
        start_location: rc.start_location ?? '',
        finish_location: rc.finish_location ?? '',
        map_center_lat: rc.map_center?.lat?.toString() ?? '',
        map_center_lng: rc.map_center?.lng?.toString() ?? '',
        elevation_gain_m: rc.elevation_gain_m?.toString() ?? '',
        route_description: rc.route_description ?? '',
      });
      if (Array.isArray(rc.checkpoints)) {
        setCheckpoints(
          rc.checkpoints.map((cp: any) => ({
            name: cp.name ?? '',
            type: cp.type ?? 'waypoint',
            distance_km: cp.distance_km?.toString() ?? '',
            lat: cp.lat?.toString() ?? '',
            lng: cp.lng?.toString() ?? '',
          }))
        );
      }
    }
  }, [event]);

  const handleSave = () => {
    const config: Record<string, unknown> = {
      total_distance_km: routeForm.total_distance_km ? parseFloat(routeForm.total_distance_km) : undefined,
      start_location: routeForm.start_location || undefined,
      finish_location: routeForm.finish_location || undefined,
      elevation_gain_m: routeForm.elevation_gain_m ? parseFloat(routeForm.elevation_gain_m) : undefined,
      route_description: routeForm.route_description || undefined,
      map_center:
        routeForm.map_center_lat && routeForm.map_center_lng
          ? { lat: parseFloat(routeForm.map_center_lat), lng: parseFloat(routeForm.map_center_lng) }
          : undefined,
      checkpoints: checkpoints.map((cp, i) => ({
        name: cp.name,
        type: cp.type,
        distance_km: cp.distance_km ? parseFloat(cp.distance_km) : 0,
        lat: cp.lat ? parseFloat(cp.lat) : undefined,
        lng: cp.lng ? parseFloat(cp.lng) : undefined,
        sort_order: i + 1,
      })),
    };
    updateMutation.mutate({ id: event.id, config });
  };

  const addCheckpoint = () => {
    if (!newCheckpoint.name.trim()) {
      toast.error('Checkpoint name is required');
      return;
    }
    setCheckpoints((prev) =>
      [...prev, { ...newCheckpoint }].sort(
        (a, b) => (parseFloat(a.distance_km) || 0) - (parseFloat(b.distance_km) || 0)
      )
    );
    setNewCheckpoint({ name: '', type: 'water', distance_km: '', lat: '', lng: '' });
    setShowAddCheckpoint(false);
  };

  const removeCheckpoint = (index: number) => {
    setCheckpoints((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Route Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Route Details</CardTitle>
          <CardDescription>
            Configure the race route — distance, start/finish locations, and map center coordinates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Total Distance (km)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="e.g. 10"
                value={routeForm.total_distance_km}
                onChange={(e) => setRouteForm((f) => ({ ...f, total_distance_km: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Elevation Gain (m)</Label>
              <Input
                type="number"
                placeholder="e.g. 120"
                value={routeForm.elevation_gain_m}
                onChange={(e) => setRouteForm((f) => ({ ...f, elevation_gain_m: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Location</Label>
              <Input
                placeholder="e.g. JKKN College Main Gate"
                value={routeForm.start_location}
                onChange={(e) => setRouteForm((f) => ({ ...f, start_location: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Finish Location</Label>
              <Input
                placeholder="e.g. JKKN College Ground"
                value={routeForm.finish_location}
                onChange={(e) => setRouteForm((f) => ({ ...f, finish_location: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Map Center — Latitude</Label>
              <Input
                type="number"
                step="0.0000001"
                placeholder="e.g. 11.4520"
                value={routeForm.map_center_lat}
                onChange={(e) => setRouteForm((f) => ({ ...f, map_center_lat: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Map Center — Longitude</Label>
              <Input
                type="number"
                step="0.0000001"
                placeholder="e.g. 77.5830"
                value={routeForm.map_center_lng}
                onChange={(e) => setRouteForm((f) => ({ ...f, map_center_lng: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Route Description</Label>
            <Textarea
              rows={3}
              placeholder="Brief description of the route — terrain, key turns, landmarks..."
              value={routeForm.route_description}
              onChange={(e) => setRouteForm((f) => ({ ...f, route_description: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Checkpoints */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Checkpoints</CardTitle>
              <CardDescription>
                Add water stations, medical posts, and km markers along the route.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowAddCheckpoint(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Checkpoint
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Add Checkpoint Form */}
          {showAddCheckpoint && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    placeholder="e.g. Water Station 1"
                    value={newCheckpoint.name}
                    onChange={(e) => setNewCheckpoint((c) => ({ ...c, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={newCheckpoint.type}
                    onChange={(e) => setNewCheckpoint((c) => ({ ...c, type: e.target.value as RouteCheckpoint['type'] }))}
                  >
                    {CHECKPOINT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Distance from Start (km)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 2.5"
                    value={newCheckpoint.distance_km}
                    onChange={(e) => setNewCheckpoint((c) => ({ ...c, distance_km: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Latitude (optional)</Label>
                  <Input
                    type="number"
                    step="0.0000001"
                    placeholder="e.g. 11.4523"
                    value={newCheckpoint.lat}
                    onChange={(e) => setNewCheckpoint((c) => ({ ...c, lat: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Longitude (optional)</Label>
                  <Input
                    type="number"
                    step="0.0000001"
                    placeholder="e.g. 77.5834"
                    value={newCheckpoint.lng}
                    onChange={(e) => setNewCheckpoint((c) => ({ ...c, lng: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addCheckpoint} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddCheckpoint(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Checkpoint List */}
          {checkpoints.length === 0 && !showAddCheckpoint ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No checkpoints added yet. Click &quot;Add Checkpoint&quot; to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {checkpoints.map((cp, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs min-w-[50px] justify-center">
                      {CHECKPOINT_TYPE_LABELS[cp.type] ?? cp.type}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{cp.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {cp.distance_km ? `${cp.distance_km} km` : 'No distance set'}
                        {cp.lat && cp.lng ? ` · ${cp.lat}, ${cp.lng}` : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeCheckpoint(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="gap-2"
      >
        {updateMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save Route Configuration
      </Button>
    </div>
  );
}

// ============================================================================
// Registration Tab
// ============================================================================

// Convert ISO timestamp to datetime-local format (YYYY-MM-DDTHH:mm)
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    // Format as local time for the input
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

// Convert datetime-local value to ISO string for Supabase
function toISOString(datetimeLocal: string): string | undefined {
  if (!datetimeLocal) return undefined;
  try {
    const d = new Date(datetimeLocal);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString();
  } catch {
    return undefined;
  }
}

function RegistrationTab({ event }: { event: any }) {
  const updateMutation = useUpdateRegistrationConfig();
  const [form, setForm] = useState({
    registration_open_date: '',
    registration_close_date: '',
    allow_external_registration: false,
  });

  useEffect(() => {
    if (event) {
      setForm({
        registration_open_date: toDatetimeLocal(event.registration_open_date),
        registration_close_date: toDatetimeLocal(event.registration_close_date),
        allow_external_registration:
          event.allow_external_registration ?? false,
      });
    }
  }, [event]);

  const handleSave = () => {
    updateMutation.mutate({
      id: event.id,
      config: {
        registration_open_date: toISOString(form.registration_open_date),
        registration_close_date: toISOString(form.registration_close_date),
        allow_external_registration: form.allow_external_registration,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Registration Settings</CardTitle>
        <CardDescription>
          Control when and how participants can register.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="reg-open">Registration Opens</Label>
            <Input
              id="reg-open"
              type="datetime-local"
              value={form.registration_open_date}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  registration_open_date: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-close">Registration Closes</Label>
            <Input
              id="reg-close"
              type="datetime-local"
              value={form.registration_close_date}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  registration_close_date: e.target.value,
                }))
              }
            />
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Allow External Registration</Label>
            <p className="text-xs text-muted-foreground">
              Let participants outside the institution register for this event.
            </p>
          </div>
          <Switch
            checked={form.allow_external_registration}
            onCheckedChange={(checked) =>
              setForm((f) => ({
                ...f,
                allow_external_registration: checked,
              }))
            }
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="gap-2"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Registration Settings
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Settings Page
// ============================================================================

export default function MarathonSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: event, isLoading, error } = useMarathonEvent(id);
  const access = useMarathonAccess();

  // Block non-admin users
  if (!access.isLoading && !access.canManage) {
    return (
      <ContentLayout title="Access Denied">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to access event settings.
          </p>
          <Button variant="outline" onClick={() => router.push('/events/marathon')}>
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title="Event Settings">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !event) {
    return (
      <ContentLayout title="Event Settings">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Events', href: '/events' },
            { label: 'Marathon', href: '/events/marathon' },
            { label: 'Settings' },
          ]}
        />
        <div className="text-center py-12 text-destructive">
          {error ? 'Failed to load event.' : 'Event not found.'}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event.name} - Settings`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event.name, href: `/events/marathon/${id}/settings` },
          { label: 'Settings' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">{event.name}</h1>
            <p className="text-sm text-muted-foreground">
              Configure your marathon event settings.
            </p>
          </div>
          <Badge variant="secondary" className="uppercase">
            {event.status}
          </Badge>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="gap-1.5">
              <Settings className="h-3.5 w-3.5 hidden sm:inline-block" />
              General
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5 hidden sm:inline-block" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="route" className="gap-1.5">
              <MapPin className="h-3.5 w-3.5 hidden sm:inline-block" />
              Route
            </TabsTrigger>
            <TabsTrigger value="registration" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 hidden sm:inline-block" />
              Registration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <GeneralTab event={event} />
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            <CategoriesTab
              eventId={event.id}
              categories={event.categories ?? []}
            />
          </TabsContent>

          <TabsContent value="route" className="mt-4">
            <RouteTab event={event} />
          </TabsContent>

          <TabsContent value="registration" className="mt-4">
            <RegistrationTab event={event} />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
