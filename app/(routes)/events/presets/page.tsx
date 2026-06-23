'use client';

// app/(routes)/events/presets/page.tsx
// Events Platform Promotion PR9 — preset management hub (decisions #4/#5).
// Pick a format/type, then manage its official + personal presets. Admins (or
// events.presets.manage holders) can publish a new official preset from here.

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { PresetManager } from '@/components/events/shared/preset-manager';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useAuth } from '@/hooks/use-auth';
import { usePublishOfficialPreset } from '@/hooks/events/shared/use-event-presets';
import {
  EVENT_FORMATS,
  EVENT_TOOL_KEYS,
  EVENT_TOOL_LABELS,
  getFormatDef,
} from '@/types/events-presets';
import type { EventFormat, EventToolKey, PresetConfig } from '@/types/events-presets';

export default function EventPresetsPage() {
  const { can } = usePermissions();
  const canManageOfficial = can('events.presets.manage');
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const { profile } = useAuth();
  const institutionId = selectedInstitutionId || profile?.institution_id || null;

  const [format, setFormat] = useState<EventFormat>(EVENT_FORMATS[0].value);
  const formatDef = useMemo(() => getFormatDef(format), [format]);
  const eventType = formatDef?.eventType ?? '';

  const publishMutation = usePublishOfficialPreset(eventType);

  // New-official-preset form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [tools, setTools] = useState<EventToolKey[]>([]);
  const [fee, setFee] = useState('');
  const [divisions, setDivisions] = useState('');
  const [rules, setRules] = useState('');

  const toggleTool = (t: EventToolKey) =>
    setTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const resetForm = () => {
    setName('');
    setTools([]);
    setFee('');
    setDivisions('');
    setRules('');
    setShowForm(false);
  };

  const handlePublish = async () => {
    if (!name.trim()) return;
    const config: PresetConfig = {
      format,
      enabled_tools: tools,
      rules: rules.trim() || undefined,
      fee: fee.trim() ? Number(fee) : undefined,
      divisions: divisions.trim()
        ? divisions.split(',').map((d) => d.trim()).filter(Boolean)
        : undefined,
    };
    await publishMutation.mutateAsync({
      event_type: eventType,
      name: name.trim(),
      scope: 'official',
      config,
      institution_id: institutionId,
    });
    resetForm();
  };

  return (
    <ContentLayout title="Event Presets">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Presets' },
        ]}
      />

      <div className="mx-auto mt-6 max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Event Presets</CardTitle>
            <CardDescription>
              Reusable setups per event type. Coordinators copy an official preset and
              tweak it; admins publish the official ones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Event type</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as EventFormat)}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canManageOfficial && !showForm && (
              <Button variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                Publish official preset
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Publish-official form */}
        {canManageOfficial && showForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                New official preset · {formatDef?.label}
              </CardTitle>
              <CardDescription>
                Published presets are visible to every coordinator for this event type.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="preset-name">
                  Preset name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="preset-name"
                  placeholder="e.g. Volleyball — Inter-College"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Enabled tools</Label>
                <div className="grid grid-cols-2 gap-2">
                  {EVENT_TOOL_KEYS.map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <Checkbox
                        checked={tools.includes(t)}
                        onCheckedChange={() => toggleTool(t)}
                      />
                      {EVENT_TOOL_LABELS[t]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preset-fee">Default fee (₹, optional)</Label>
                  <Input
                    id="preset-fee"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preset-divisions">Divisions (comma-separated)</Label>
                  <Input
                    id="preset-divisions"
                    placeholder="e.g. Men, Women, U-19"
                    value={divisions}
                    onChange={(e) => setDivisions(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preset-rules">Rules / notes (optional)</Label>
                <Textarea
                  id="preset-rules"
                  rows={3}
                  placeholder="Default rules or notes for this preset…"
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={resetForm} disabled={publishMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={publishMutation.isPending || !name.trim()}
                  className="gap-1.5"
                >
                  {publishMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Publish
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {eventType && (
          <PresetManager eventType={eventType} eventTypeLabel={formatDef?.label} />
        )}
      </div>
    </ContentLayout>
  );
}
