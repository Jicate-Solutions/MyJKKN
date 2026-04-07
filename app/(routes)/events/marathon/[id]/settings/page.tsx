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
} from 'lucide-react';
import type { EventCategory } from '@/types/events';

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

        <div className="space-y-2">
          <Label htmlFor="gen-hero">Hero Image URL</Label>
          <Input
            id="gen-hero"
            type="url"
            placeholder="https://..."
            value={form.hero_image_url}
            onChange={(e) =>
              setForm((f) => ({ ...f, hero_image_url: e.target.value }))
            }
          />
        </div>

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
// Route Tab (Placeholder for Phase 9)
// ============================================================================

function RouteTab({ event }: { event: any }) {
  const updateMutation = useUpdateRouteConfig();
  const [routeJson, setRouteJson] = useState('');

  useEffect(() => {
    if (event?.route_config) {
      setRouteJson(JSON.stringify(event.route_config, null, 2));
    }
  }, [event]);

  const handleSave = () => {
    try {
      const parsed = routeJson.trim() ? JSON.parse(routeJson) : {};
      updateMutation.mutate({ id: event.id, config: parsed });
    } catch {
      // toast handled by mutation
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Route Configuration</CardTitle>
        <CardDescription>
          Configure race route and checkpoints. Full checkpoint management will
          be available in a future update.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Route Config (JSON)</Label>
          <Textarea
            rows={10}
            className="font-mono text-sm"
            value={routeJson}
            onChange={(e) => setRouteJson(e.target.value)}
            placeholder='{"checkpoints": [], "map_center": {"lat": 0, "lng": 0}}'
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
          Save Route Config
        </Button>
      </CardContent>
    </Card>
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
  const id = params.id as string;
  const { data: event, isLoading, error } = useMarathonEvent(id);

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
