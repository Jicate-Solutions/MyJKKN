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

import { useEffect, useMemo, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  MapPin,
  CalendarDays,
  Ticket,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import { PresetManager } from '@/components/events/shared/preset-manager';
import { VenueRoomPicker } from '@/components/events/venue/venue-room-picker';
import {
  holdEventVenue,
  findEventVenueClashes,
  buildDaySlots,
  countDays,
  MAX_EVENT_DAYS,
} from '@/lib/services/events/venue/event-venue';
import type { EventVenueClash } from '@/lib/services/events/venue/event-venue';
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

/**
 * datetime-local → ISO. `new Date('2026-01-05T09:00')` parses as LOCAL time —
 * what the organizer typed — and toISOString converts to UTC for storage.
 * Sending the raw string would hand Postgres a naive timestamp and shift it by
 * the timezone offset (a 5:30h drift in this deployment).
 */
function toIso(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

const timeRangeLabel = (startIso: string, endIso: string) => {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  return `${fmt(startIso)}–${fmt(endIso)}`;
};

export default function CreateEventPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  // HOST INSTITUTION — the college that owns this event. It is what `institution_id`
  // is set to, and what the booking spine compares the room's owner against to decide
  // whether the hold is same-college (auto) or cross-college (needs approval). It
  // defaults to the user's current institution context but stays explicitly
  // selectable: a coordinator with access to several colleges may run an event on
  // behalf of any of them, and the default is not always the one they mean.
  const [hostOverride, setHostOverride] = useState<string | null>(null);
  const ambientInstitutionId = selectedInstitutionId || profile?.institution_id || '';
  const institutionId = useMemo(() => {
    if (hostOverride) return hostOverride;
    // Before the accessible list resolves, keep the ambient value so nothing that
    // gates on institutionId flickers.
    if (!institutions.length) return ambientInstitutionId;
    // Only default to the ambient institution if the user can actually host under
    // it — otherwise the Select would sit on a value that isn't one of its options.
    return institutions.some((i) => i.id === ambientInstitutionId)
      ? ambientInstitutionId
      : institutions[0].id;
  }, [hostOverride, institutions, ambientInstitutionId]);

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
    // WHEN IT RUNS — the day(s) and hours the programme is actually conducted.
    // These are what the room is held for.
    event_date: '',
    last_day: '',
    start_time: '',
    end_time: '',
    // REGISTRATION — when people may sign up. Deliberately its own pair: these
    // used to have nowhere to go on this page, so organizers typed the
    // registration window into the room's start/end and held the room for weeks.
    registration_open: '',
    registration_close: '',
    venue: '',
  });
  const update = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Venue / booking-spine state. On-campus events MUST pick a real room (held via
  // the booking spine); off-campus events type a free-text place (no hold).
  const [offCampus, setOffCampus] = useState(false);
  const [venueResourceId, setVenueResourceId] = useState('');
  const [multiDay, setMultiDay] = useState(false);
  const [clashes, setClashes] = useState<EventVenueClash[]>([]);
  const [checking, setChecking] = useState(false);

  // The room is held at the Resource Management grain: the same hours on EACH day
  // of the event, never one continuous multi-day block.
  const lastDay = multiDay && form.last_day ? form.last_day : form.event_date;
  const daySlots = useMemo(
    () => buildDaySlots(form.event_date, lastDay, form.start_time, form.end_time),
    [form.event_date, lastDay, form.start_time, form.end_time],
  );
  const dayCount = countDays(form.event_date, lastDay);

  const badTimes =
    !!form.start_time && !!form.end_time && form.end_time <= form.start_time;
  const badDayRange = multiDay && !!form.last_day && !!form.event_date && form.last_day < form.event_date;
  const tooManyDays = dayCount > MAX_EVENT_DAYS;

  const regOpenIso = toIso(form.registration_open);
  const regCloseIso = toIso(form.registration_close);
  const badRegWindow =
    !!regOpenIso && !!regCloseIso && new Date(regCloseIso) < new Date(regOpenIso);

  // Live availability, per day, as soon as a room and a full schedule exist — so
  // the clash is visible BEFORE pressing Create, naming the day and the holder
  // instead of a blanket "already booked".
  useEffect(() => {
    if (offCampus || !venueResourceId || daySlots.length === 0) {
      setClashes([]);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      const found = await findEventVenueClashes(venueResourceId, daySlots);
      if (cancelled) return;
      setClashes(found);
      setChecking(false);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [offCampus, venueResourceId, daySlots]);

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

    // Schedule validation. The conduct date + hours drive BOTH what is stored and
    // what the room is held for, so they are checked before anything else.
    if (badDayRange) {
      toast.error('The last day must be on or after the first day.');
      return;
    }
    if (tooManyDays) {
      toast.error(
        `An event can span at most ${MAX_EVENT_DAYS} days — split a longer programme into separate events.`,
      );
      return;
    }
    if (badTimes) {
      toast.error('The end time must be after the start time.');
      return;
    }
    if (badRegWindow) {
      toast.error('Registration must close on or after it opens.');
      return;
    }

    // Venue validation (booking spine). On-campus events MUST pick a real room
    // AND give the hours it runs so the room can be held on each of its days;
    // off-campus events just type a place (no hold).
    if (!offCampus) {
      if (!venueResourceId) {
        toast.error('Pick a room for this on-campus event — or switch on "Off-campus".');
        return;
      }
      if (!form.event_date) {
        toast.error('Set the date this event is conducted on.');
        return;
      }
      if (!form.start_time || !form.end_time) {
        toast.error('Set the hours it runs so the room can be held.');
        return;
      }
      if (!daySlots.length) {
        toast.error('Could not work out the event hours — check the date and times.');
        return;
      }
    } else if (!form.venue.trim()) {
      toast.error('Type the venue for this off-campus event.');
      return;
    }

    // The stored run window is DERIVED from the conduct schedule — first day's
    // start to last day's end. It is never hand-typed, which is what let it drift
    // into being used as a registration window and hold the room for weeks.
    const startIso = daySlots.length ? daySlots[0].startIso : undefined;
    const endIso = daySlots.length ? daySlots[daySlots.length - 1].endIso : undefined;

    // Other formats create a base events row directly, filed under the chosen home.
    setCreating(true);
    try {
      // Hard-stop on a clash BEFORE creating the event, so a taken room never
      // leaves an orphan event row (the spine answers "is it free?", per day).
      if (!offCampus && venueResourceId) {
        const found = await findEventVenueClashes(venueResourceId, daySlots);
        if (found.length) {
          setClashes(found);
          toast.error(
            found.length === 1
              ? `That room is already taken on ${dayLabel(found[0].slot.startIso)}. Pick another room, day, or time.`
              : `That room is already taken on ${found.length} of your ${daySlots.length} days. Pick another room, days, or time.`,
          );
          return;
        }
      }

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
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        // Run window, derived from the schedule above (see startIso/endIso).
        start_date: startIso,
        end_date: endIso,
        // Registration window — a SEPARATE pair of columns that the edit dialog
        // has always used. Exposing them here is what stops the run window from
        // being filled in with registration dates.
        registration_open_date: regOpenIso,
        registration_close_date: regCloseIso,
        // On-campus: link the real room. Off-campus: free-text place.
        ...(offCampus
          ? { venue: form.venue.trim() || undefined }
          : { venue_resource_id: venueResourceId }),
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

      // Hold the room via the ONE booking spine (events policy decides approval:
      // same-college auto, cross-college pings the room's caretaker).
      if (!offCampus && venueResourceId) {
        const days = daySlots.length;
        const hold = await holdEventVenue({
          resourceId: venueResourceId,
          eventId: created.id,
          eventInstitutionId: institutionId,
          userId: profile?.id ?? '',
          purpose: `Event: ${created.name}`,
          slots: daySlots,
        });
        if (hold.held && hold.requiresApproval) {
          toast.success(
            days > 1
              ? `"${created.name}" created — the room is requested for all ${days} days; the owning college will approve it.`
              : `"${created.name}" created — room requested; the owning college will approve it.`,
          );
        } else if (hold.held) {
          toast.success(
            days > 1
              ? `"${created.name}" created and the room is held on all ${days} days.`
              : `"${created.name}" created and the room is held.`,
          );
        } else {
          // The event was created, but the room was NOT held. Do NOT leave
          // venue_resource_id pointing at a room there is no reservation for —
          // downstream that reads as "this room is booked" while the room stays
          // free for anyone else to take (this is how the existing multi-day
          // events ended up showing a venue they never held). Demote it to free
          // text instead. events_venue_at_least_one_check forbids clearing the
          // room without leaving venue/venue_text set, so both move together.
          const roomName = hold.roomName || 'Selected room';
          try {
            await EventBaseService.updateEvent(created.id, {
              venue_resource_id: null,
              venue_text: `${roomName} (not reserved)`,
            });
          } catch (demoteError) {
            // Non-fatal — the warning below is still accurate about the hold.
            console.error('[events/create] could not demote un-held room:', demoteError);
          }
          const why =
            hold.reason === 'taken'
              ? hold.failedOnIso
                ? `the room was just taken on ${dayLabel(hold.failedOnIso)}`
                : 'the room was just taken for that time'
              : hold.reason === 'no_approver'
                ? "that room's owning college has no approver set"
                : hold.reason === 'walk_in'
                  ? 'that room is walk-in only (not reservable)'
                  : hold.reason === 'not_reservable'
                    ? 'that room is not reservable'
                    : hold.reason === 'no_slots'
                      ? 'the event has no usable hours to hold'
                      : hold.message || 'the time may be outside the room’s bookable hours';
          toast(
            `"${created.name}" created, but the room was NOT held — ${why}. The venue is recorded as text only. Edit the event to pick another room or time, or book it in Resource Management.`,
            { icon: '⚠️', duration: 9000 },
          );
        }
      } else {
        toast.success(`"${created.name}" created`);
      }
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

      <div className="mx-auto mt-6 max-w-full space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex shrink-0 items-center gap-2">
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

        {!institutionId && !institutionsLoading && (
          <p className="text-sm text-destructive">
            You don&apos;t have access to any institution to host an event under.
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
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              {formatDef && home && (
                <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  <Badge variant="outline">{formatDef.label}</Badge>
                  <span>filed under</span>
                  <Badge variant="outline">
                    {EVENT_HOMES.find((h) => h.value === home)?.label}
                  </Badge>
                </div>
              )}
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
                  {/* Host institution — sits above Venue on purpose: it decides whether
                      picking a room is a same-college hold or a cross-college request. */}
                  <div className="space-y-2">
                    <Label htmlFor="host_institution">
                      Host Institution <span className="text-destructive">*</span>
                    </Label>
                    <Select value={institutionId} onValueChange={setHostOverride}>
                      <SelectTrigger id="host_institution">
                        <SelectValue
                          placeholder={
                            institutionsLoading
                              ? 'Loading institutions…'
                              : 'Select host institution'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The college this event is filed under. Booking a room owned by a
                      different college needs that college&apos;s approval.
                    </p>
                  </div>

                  {/* ── When it runs ──
                      These day(s) and hours ARE the room booking: the spine holds
                      this window on EACH day of the event. The registration window
                      is a separate block below — keeping the two apart is the
                      whole point (they used to be the same pair of inputs). */}
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4 opacity-60" /> When it runs
                      </Label>
                      <label
                        htmlFor="multi-day"
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        Runs over several days
                        <Switch
                          id="multi-day"
                          checked={multiDay}
                          onCheckedChange={(v) => {
                            setMultiDay(v);
                            if (!v) update('last_day', '');
                          }}
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="event_date" className="text-xs">
                          {multiDay ? 'First day' : 'Event date'}
                          {!offCampus && <span className="text-destructive"> *</span>}
                        </Label>
                        <Input
                          id="event_date"
                          type="date"
                          value={form.event_date}
                          onChange={(e) => update('event_date', e.target.value)}
                        />
                      </div>
                      {multiDay && (
                        <div className="space-y-1.5">
                          <Label htmlFor="last_day" className="text-xs">
                            Last day
                          </Label>
                          <Input
                            id="last_day"
                            type="date"
                            min={form.event_date || undefined}
                            value={form.last_day}
                            onChange={(e) => update('last_day', e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="start_time" className="text-xs">
                          Starts at
                          {!offCampus && <span className="text-destructive"> *</span>}
                        </Label>
                        <Input
                          id="start_time"
                          type="time"
                          value={form.start_time}
                          onChange={(e) => update('start_time', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="end_time" className="text-xs">
                          Ends at
                          {!offCampus && <span className="text-destructive"> *</span>}
                        </Label>
                        <Input
                          id="end_time"
                          type="time"
                          value={form.end_time}
                          onChange={(e) => update('end_time', e.target.value)}
                        />
                      </div>
                    </div>

                    {badDayRange && (
                      <p className="text-xs text-destructive">
                        The last day must be on or after the first day.
                      </p>
                    )}
                    {tooManyDays && (
                      <p className="text-xs text-destructive">
                        An event can span at most {MAX_EVENT_DAYS} days — split a longer
                        programme into separate events.
                      </p>
                    )}
                    {badTimes && (
                      <p className="text-xs text-destructive">
                        The end time must be after the start time.
                      </p>
                    )}
                    {!offCampus && daySlots.length > 0 && !badTimes && (
                      <p className="text-xs text-muted-foreground">
                        {daySlots.length > 1
                          ? `The room is held for these hours on each of the ${daySlots.length} days — it stays free outside them.`
                          : 'The room is held for exactly these hours — it stays free outside them.'}
                      </p>
                    )}
                  </div>

                  {/* Venue — booking spine. On-campus picks a real room from
                      Resource Management (held so it can't be double-booked);
                      off-campus types a free-text place (no hold). */}
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 opacity-60" /> Venue
                      </Label>
                      <label
                        htmlFor="off-campus"
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        Off-campus
                        <Switch
                          id="off-campus"
                          checked={offCampus}
                          onCheckedChange={setOffCampus}
                        />
                      </label>
                    </div>

                    {offCampus ? (
                      <Input
                        id="venue"
                        placeholder="e.g. City Convention Centre, or an online link"
                        value={form.venue}
                        onChange={(e) => update('venue', e.target.value)}
                      />
                    ) : (
                      <div className="space-y-3">
                        <VenueRoomPicker
                          value={venueResourceId}
                          onChange={setVenueResourceId}
                        />

                        {checking && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Checking this room for{' '}
                            {dayCount === 1 ? 'that day' : `all ${dayCount} days`}…
                          </p>
                        )}

                        {/* Name the day AND the holder. The spine already returns
                            both; the old flow threw them away for a blanket
                            "already booked", which is what made the clash look
                            arbitrary. */}
                        {!checking && clashes.length > 0 && (
                          <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
                            <p className="text-xs font-medium text-destructive">
                              Already booked on {clashes.length} of your {daySlots.length}{' '}
                              {daySlots.length === 1 ? 'day' : 'days'}:
                            </p>
                            <ul className="space-y-0.5 text-xs text-muted-foreground">
                              {clashes.map((c) => (
                                <li key={c.slot.startIso}>
                                  <span className="font-medium text-foreground">
                                    {dayLabel(c.slot.startIso)}
                                  </span>{' '}
                                  — {c.holderName || 'another user'}
                                  {c.holderDesignation ? ` (${c.holderDesignation})` : ''},{' '}
                                  {timeRangeLabel(c.holderStart, c.holderEnd)}
                                </li>
                              ))}
                            </ul>
                            <p className="text-xs text-muted-foreground">
                              Pick another room, or change the day/hours above.
                            </p>
                          </div>
                        )}

                        {!checking &&
                          !!venueResourceId &&
                          daySlots.length > 0 &&
                          clashes.length === 0 && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-500">
                              Free on {dayCount === 1 ? 'that day' : `all ${dayCount} days`} —
                              the room is held when you create the event.
                            </p>
                          )}

                        {!venueResourceId && (
                          <p className="text-xs text-muted-foreground">
                            Pick a campus room — it gets held so no one else can book it at
                            the same time.
                          </p>
                        )}
                        {!!venueResourceId && daySlots.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Set the date and hours above to check this room and hold it.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Registration ── Its own columns
                      (registration_open_date / registration_close_date), and
                      labelled to say plainly that it does NOT book the room.
                      With no field here, organizers put the registration window
                      into the run window, which held the venue for weeks. */}
                  <div className="space-y-3 rounded-lg border p-3">
                    <Label className="flex items-center gap-1.5">
                      <Ticket className="h-4 w-4 opacity-60" /> Registration
                      <span className="text-xs font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </Label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="reg_open" className="text-xs">
                          Opens
                        </Label>
                        <Input
                          id="reg_open"
                          type="datetime-local"
                          value={form.registration_open}
                          onChange={(e) => update('registration_open', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg_close" className="text-xs">
                          Closes
                        </Label>
                        <Input
                          id="reg_close"
                          type="datetime-local"
                          value={form.registration_close}
                          onChange={(e) => update('registration_close', e.target.value)}
                        />
                      </div>
                    </div>
                    {badRegWindow && (
                      <p className="text-xs text-destructive">
                        Registration must close on or after it opens.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      When people can sign up. This does{' '}
                      <span className="font-medium">not</span> book the venue — only the
                      hours under &ldquo;When it runs&rdquo; do.
                    </p>
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
                  disabled={
                    creating ||
                    !form.name.trim() ||
                    !institutionId ||
                    badTimes ||
                    badDayRange ||
                    tooManyDays ||
                    badRegWindow ||
                    // A clash the organizer can already see on screen — don't let
                    // them submit into a guaranteed "NOT held" outcome. (All of
                    // these are false on the dedicated-creator path, where none of
                    // the schedule/venue fields render.)
                    clashes.length > 0
                  }
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
