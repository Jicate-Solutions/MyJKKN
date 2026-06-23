'use client';

// app/(routes)/events/create/page.tsx
// Events Platform Promotion PR9 — the unified "Create an Event" wizard.
//
// Decisions #9/#10 — FORMAT ≠ HOME. The wizard asks BOTH:
//   Step 1: FORMAT  — how the event runs (tournament / lecture-talk / race / cultural / convocation)
//   Step 2: HOME    — which module it lives under (Health & Wellness / CDC / Academic / …)
//   Step 3: PRESET  — optionally prefill tools/fees/divisions from an official or personal preset
//   Step 4: DETAILS — name + dates, then create.
//
// Filing under the correct home: a tournament routes to the dedicated tournament creator
// (so divisions/fixtures get seeded); other formats create a base `events` row with the
// resolved event_type and `config.home` set to the chosen module. A lecture is NEVER filed
// "under tournaments".

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import { PresetManager } from '@/components/events/shared/preset-manager';
import {
  EVENT_FORMATS,
  EVENT_HOMES,
  DEFAULT_HOME_FOR_FORMAT,
  getFormatDef,
} from '@/types/events-presets';
import type {
  EventFormat,
  EventHome,
  PresetConfig,
  EventPreset,
} from '@/types/events-presets';
import type { CreateEventDto, EventType } from '@/types/events';

type Step = 'format' | 'home' | 'preset' | 'details';
const STEP_ORDER: Step[] = ['format', 'home', 'preset', 'details'];

export default function CreateEventPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId || profile?.institution_id || '';

  const [step, setStep] = useState<Step>('format');
  const [format, setFormat] = useState<EventFormat | null>(null);
  const [home, setHome] = useState<EventHome | null>(null);
  const [appliedPreset, setAppliedPreset] = useState<{
    config: PresetConfig;
    preset: EventPreset;
  } | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    event_date: '',
    venue: '',
  });
  const update = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const formatDef = useMemo(() => (format ? getFormatDef(format) : undefined), [format]);
  const eventType = formatDef?.eventType ?? '';

  const stepIndex = STEP_ORDER.indexOf(step);
  const goNext = () => setStep(STEP_ORDER[Math.min(stepIndex + 1, STEP_ORDER.length - 1)]);
  const goBack = () => setStep(STEP_ORDER[Math.max(stepIndex - 1, 0)]);

  // Picking a format seeds a sensible default home (still overridable in step 2).
  const pickFormat = (f: EventFormat) => {
    setFormat(f);
    setHome((prev) => prev ?? DEFAULT_HOME_FOR_FORMAT[f]);
    setAppliedPreset(null); // presets are per-type; reset when the type changes
    goNext();
  };

  const applyPreset = (config: PresetConfig, preset: EventPreset) => {
    setAppliedPreset({ config, preset });
    if (config.home) setHome(config.home);
    toast.success(`Preset "${preset.name}" applied`);
    goNext();
  };

  const handleCreate = async () => {
    if (!format || !formatDef || !institutionId || !form.name.trim()) return;

    // A format with a dedicated rich creator (tournament, race) routes there so its
    // divisions / registration window get seeded. We carry the chosen home + applied
    // preset through the URL so the dedicated flow can honor them.
    if (formatDef.dedicatedCreatePath) {
      const params = new URLSearchParams();
      if (home) params.set('home', home);
      if (appliedPreset) params.set('preset', appliedPreset.preset.id);
      if (form.name.trim()) params.set('name', form.name.trim());
      router.push(`${formatDef.dedicatedCreatePath}?${params.toString()}`);
      return;
    }

    // Other formats create a base events row directly, filed under the chosen home.
    setCreating(true);
    try {
      const slug = await EventBaseService.generateUniqueSlug(
        form.name,
        new Date().getFullYear()
      );
      const dto: CreateEventDto = {
        institution_id: institutionId,
        // DB column is plain text; cast covers formats the shared union doesn't model.
        event_type: eventType as EventType,
        name: form.name.trim(),
        slug,
        description: form.description.trim() || undefined,
        event_date: form.event_date || undefined,
        venue: form.venue.trim() || undefined,
        year: new Date().getFullYear(),
        is_public: false,
        config: {
          // FORMAT ≠ HOME: the module home is recorded here so the owning module
          // can surface this event. No schema change — `events.config` already exists.
          home,
          format,
          ...(appliedPreset
            ? {
                preset_id: appliedPreset.preset.id,
                enabled_tools: appliedPreset.config.enabled_tools,
                rules: appliedPreset.config.rules,
                fee: appliedPreset.config.fee,
                divisions: appliedPreset.config.divisions,
              }
            : {}),
        },
      };
      const created = await EventBaseService.createEvent(dto);
      toast.success(`"${created.name}" created`);
      router.push('/events');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create event');
    } finally {
      setCreating(false);
    }
  };

  const stepLabels: Record<Step, string> = {
    format: 'Format',
    home: 'Home',
    preset: 'Preset',
    details: 'Details',
  };

  return (
    <ContentLayout title="Create an Event">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Create' },
        ]}
      />

      <div className="mx-auto mt-6 max-w-2xl space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  i < stepIndex
                    ? 'bg-primary text-primary-foreground'
                    : i === stepIndex
                      ? 'border-2 border-primary text-primary'
                      : 'border text-muted-foreground'
                }`}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={`text-xs ${i === stepIndex ? 'font-medium' : 'text-muted-foreground'}`}
              >
                {stepLabels[s]}
              </span>
              {i < STEP_ORDER.length - 1 && (
                <span className="text-muted-foreground">·</span>
              )}
            </div>
          ))}
        </div>

        {!institutionId && (
          <p className="text-sm text-destructive">
            No institution selected — pick an institution before creating an event.
          </p>
        )}

        {/* Step 1 — FORMAT */}
        {step === 'format' && (
          <Card>
            <CardHeader>
              <CardTitle>How will this event run?</CardTitle>
              <CardDescription>
                Pick the format. This decides the tools and flow — not which module it
                lives under (you choose that next).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {EVENT_FORMATS.map((f) => {
                const Icon = f.icon;
                const selected = format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => pickFormat(f.value)}
                    className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:border-primary/50 ${
                      selected ? 'border-primary ring-1 ring-primary' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="font-medium">{f.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{f.description}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Step 2 — HOME */}
        {step === 'home' && (
          <Card>
            <CardHeader>
              <CardTitle>Which module does it belong to?</CardTitle>
              <CardDescription>
                {formatDef && (
                  <>
                    A <span className="font-medium">{formatDef.label.toLowerCase()}</span>{' '}
                    can be filed under any module. For example, a sports tournament lives
                    under Health &amp; Wellness; a career talk lives under CDC.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {EVENT_HOMES.map((h) => {
                  const selected = home === h.value;
                  return (
                    <button
                      key={h.value}
                      type="button"
                      onClick={() => setHome(h.value)}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors hover:border-primary/50 ${
                        selected ? 'border-primary ring-1 ring-primary' : ''
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-medium">{h.label}</span>
                        {home === h.value &&
                          formatDef &&
                          DEFAULT_HOME_FOR_FORMAT[formatDef.value] === h.value && (
                            <Badge variant="secondary" className="text-[10px]">
                              Suggested
                            </Badge>
                          )}
                      </div>
                      <span className="text-xs text-muted-foreground">{h.description}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={goBack} className="gap-1">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={goNext} disabled={!home} className="gap-1">
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — PRESET (optional) */}
        {step === 'preset' && (
          <Card>
            <CardHeader>
              <CardTitle>Start from a preset?</CardTitle>
              <CardDescription>
                Apply an official or personal preset to prefill tools, fees, and divisions
                — or skip to set things up from scratch.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {eventType && (
                <PresetManager
                  eventType={eventType}
                  eventTypeLabel={formatDef?.label}
                  onApply={applyPreset}
                  compact
                />
              )}
              {appliedPreset && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                  Applied preset:{' '}
                  <span className="font-medium">{appliedPreset.preset.name}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={goBack} className="gap-1">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={goNext} variant={appliedPreset ? 'default' : 'secondary'}>
                  {appliedPreset ? 'Continue' : 'Skip presets'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4 — DETAILS */}
        {step === 'details' && (
          <Card>
            <CardHeader>
              <CardTitle>Event details</CardTitle>
              <CardDescription>
                {formatDef && home && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{formatDef.label}</Badge>
                    <span className="text-muted-foreground">filed under</span>
                    <Badge variant="outline">
                      {EVENT_HOMES.find((h) => h.value === home)?.label}
                    </Badge>
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Event Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g. Industry Connect — Resume Workshop"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  required
                />
              </div>

              {formatDef?.dedicatedCreatePath ? (
                <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {formatDef.label} has a dedicated setup with divisions and registration.
                  We&apos;ll take you there with your choices pre-filled.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="event_date">Date</Label>
                      <Input
                        id="event_date"
                        type="date"
                        value={form.event_date}
                        onChange={(e) => update('event_date', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="venue">Venue (optional)</Label>
                      <Input
                        id="venue"
                        placeholder="e.g. Main Auditorium"
                        value={form.venue}
                        onChange={(e) => update('venue', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Brief description of the event…"
                      value={form.description}
                      onChange={(e) => update('description', e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={goBack} className="gap-1">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !form.name.trim() || !institutionId}
                  className="gap-1"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {formatDef?.dedicatedCreatePath ? 'Continue setup' : 'Create event'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
