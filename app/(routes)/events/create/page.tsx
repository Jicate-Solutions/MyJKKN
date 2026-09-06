'use client';

// app/(routes)/events/create/page.tsx
// Events Platform Promotion PR9 — the unified "Create an Event" wizard.
//
// Decisions #9/#10 — FORMAT ≠ HOME. The wizard asks BOTH:
//   Step 1: FORMAT  — how the event runs (tournament / lecture-talk / race / cultural / convocation)
//   Step 2: HOME    — which module it lives under (Health & Wellness / CDC / Academic / …)
//   Step 3: PRESET  — optionally prefill tools/fees/divisions from an official or personal preset
//   Step 4: DETAILS — the full field set, on tabs.
//
// Filing under the correct home: a tournament routes to the dedicated tournament creator
// (so divisions/fixtures get seeded); other formats create a base `events` row with the
// resolved event_type and `config.home` set to the chosen module. A lecture is NEVER filed
// "under tournaments".
//
// STEP 4 IS TABBED because it now collects everything /events/tournament/new does.
// It used to collect nine fields against that form's seventeen — both writing the same
// `events` table — so a wizard-created lecture was stored with scope NULL, visibility
// NULL, allow_external_registration unset and is_public hardcoded false. The
// serialization rules live in _components/event-create-form.ts, where they are tested
// without a browser.

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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import { PresetManager } from '@/components/events/shared/preset-manager';
import { NaacCriteriaField } from '@/components/events/shared/naac-criteria-field';
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
import { BasicsTab } from './_components/basics-tab';
import { ScheduleTab } from './_components/schedule-tab';
import { VenueTab } from './_components/venue-tab';
import { PeopleTab } from './_components/people-tab';
import { RegistrationTab } from './_components/registration-tab';
import { CategoriesTab } from './_components/categories-tab';
import {
  applyPresetToForm,
  buildCategoryDtos,
  buildCreateEventDto,
  emptyEventCreateForm,
  validateEventForm,
} from './_components/event-create-form';
import type { EventCreateForm, FormTabKey } from './_components/event-create-form';

type Step = 'format' | 'home' | 'preset' | 'details';
const STEP_ORDER: Step[] = ['format', 'home', 'preset', 'details'];

const DETAIL_TABS: { key: FormTabKey; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'venue', label: 'Venue' },
  { key: 'people', label: 'People' },
  { key: 'registration', label: 'Registration' },
  { key: 'categories', label: 'Categories' },
  { key: 'evidence', label: 'Evidence' },
];

/** Formats whose categories are competition classes (sport / level / bracket). */
const COMPETITION_FORMATS: EventFormat[] = ['tournament'];

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
  const [tab, setTab] = useState<FormTabKey>('basics');
  const [format, setFormat] = useState<EventFormat | null>(null);
  const [home, setHome] = useState<EventHome | null>(null);
  const [appliedPreset, setAppliedPreset] = useState<{
    config: PresetConfig;
    preset: EventPreset;
  } | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState<EventCreateForm>(emptyEventCreateForm());
  const set = <K extends keyof EventCreateForm>(field: K, value: EventCreateForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Venue / booking-spine state. On-campus events MUST pick a real room (held via
  // the booking spine); off-campus events type a free-text place (no hold).
  const [offCampus, setOffCampus] = useState(false);
  const [venueResourceId, setVenueResourceId] = useState('');
  const [multiDay, setMultiDay] = useState(false);
  const [clashes, setClashes] = useState<EventVenueClash[]>([]);
  const [checking, setChecking] = useState(false);
  const [inchargePickerOpen, setInchargePickerOpen] = useState(false);

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
  const badDayRange =
    multiDay && !!form.last_day && !!form.event_date && form.last_day < form.event_date;
  const tooManyDays = dayCount > MAX_EVENT_DAYS;

  // Field-level problems, keyed by the tab that owns them (pure — see
  // event-create-form.ts). Schedule/venue rules stay here because they depend on
  // the live booking-spine lookup rather than on the form alone.
  const fieldErrors = useMemo(() => validateEventForm(form), [form]);
  const errors: Partial<Record<FormTabKey, string>> = {
    ...fieldErrors,
    ...(badDayRange
      ? { schedule: 'The last day must be on or after the first day.' }
      : badTimes
        ? { schedule: 'The end time must be after the start time.' }
        : tooManyDays
          ? { schedule: `An event can span at most ${MAX_EVENT_DAYS} days.` }
          : {}),
    ...(clashes.length ? { venue: 'That room is already booked.' } : {}),
  };
  const badRegWindow = !!fieldErrors.registration;

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
  const showCompetitionFields = !!format && COMPETITION_FORMATS.includes(format);

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
    // Seed fee, tools and category drafts from the preset. Before this, a
    // preset's `divisions` were copied into events.config and never read, so
    // applying one produced no categories at all.
    setForm((prev) => applyPresetToForm(prev, config));
    toast.success(`Preset "${preset.name}" applied`);
    goNext();
  };

  const handleCreate = async () => {
    if (!format || !formatDef || !institutionId || !form.name.trim()) return;

    // A format with a dedicated rich creator (tournament, race, induction) routes
    // there so its divisions / registration window get seeded. We carry the chosen
    // home + applied preset through the URL so the dedicated flow can honor them.
    if (formatDef.dedicatedCreatePath) {
      const params = new URLSearchParams();
      if (home) params.set('home', home);
      if (appliedPreset) params.set('preset', appliedPreset.preset.id);
      if (form.name.trim()) params.set('name', form.name.trim());
      router.push(`${formatDef.dedicatedCreatePath}?${params.toString()}`);
      return;
    }

    // Field-level problems first — jump to the tab that owns the first one so the
    // organizer sees the offending input, not just a toast.
    const firstBad = DETAIL_TABS.find((t) => errors[t.key]);
    if (firstBad) {
      setTab(firstBad.key);
      toast.error(errors[firstBad.key] as string);
      return;
    }

    // Venue validation (booking spine). On-campus events MUST pick a real room
    // AND give the hours it runs so the room can be held on each of its days;
    // off-campus events just type a place (no hold).
    if (!offCampus) {
      if (!venueResourceId) {
        setTab('venue');
        toast.error('Pick a room for this on-campus event — or switch on "Off-campus".');
        return;
      }
      if (!form.event_date) {
        setTab('schedule');
        toast.error('Set the date this event is conducted on.');
        return;
      }
      if (!form.start_time || !form.end_time) {
        setTab('schedule');
        toast.error('Set the hours it runs so the room can be held.');
        return;
      }
      if (!daySlots.length) {
        setTab('schedule');
        toast.error('Could not work out the event hours — check the date and times.');
        return;
      }
    } else if (!form.venue.trim()) {
      setTab('venue');
      toast.error('Type the venue for this off-campus event.');
      return;
    }

    // The stored run window is DERIVED from the conduct schedule — first day's
    // start to last day's end. It is never hand-typed, which is what let it drift
    // into being used as a registration window and hold the room for weeks.
    const startIso = daySlots.length ? daySlots[0].startIso : undefined;
    const endIso = daySlots.length ? daySlots[daySlots.length - 1].endIso : undefined;

    setCreating(true);
    try {
      // Hard-stop on a clash BEFORE creating the event, so a taken room never
      // leaves an orphan event row (the spine answers "is it free?", per day).
      if (!offCampus && venueResourceId) {
        const found = await findEventVenueClashes(venueResourceId, daySlots);
        if (found.length) {
          setClashes(found);
          setTab('venue');
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
        new Date().getFullYear(),
      );
      const dto = buildCreateEventDto({
        form,
        institutionId,
        eventType,
        slug,
        year: new Date().getFullYear(),
        home,
        format,
        preset: appliedPreset
          ? { preset: appliedPreset.preset, config: appliedPreset.config }
          : null,
        startIso,
        endIso,
        offCampus,
        venueResourceId,
      });
      const created = await EventBaseService.createEvent(dto);

      // Seed categories. Best-effort, exactly like the tournament service seeds
      // divisions: a failed category must not roll back an event that already
      // exists. Unlike that service we COUNT the failures and say so — silently
      // swallowing them is what makes a half-created event look complete.
      const categoryDtos = buildCategoryDtos(form, created.id);
      let categoriesFailed = 0;
      for (const categoryDto of categoryDtos) {
        try {
          await EventBaseService.createCategory(categoryDto);
        } catch (categoryError) {
          categoriesFailed += 1;
          console.error('[events/create] could not create category:', categoryError);
        }
      }
      if (categoriesFailed > 0) {
        toast(
          `${categoriesFailed} of ${categoryDtos.length} categories could not be created — add them from the event console.`,
          { icon: '⚠️', duration: 8000 },
        );
      }

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
              {i < STEP_ORDER.length - 1 && <span className="text-muted-foreground">·</span>}
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
                    A <span className="font-medium">{formatDef.label.toLowerCase()}</span> can
                    be filed under any module. For example, a sports tournament lives under
                    Health &amp; Wellness; a career talk lives under CDC.
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
                Apply an official or personal preset to prefill tools, fees, and categories —
                or skip to set things up from scratch.
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
              {formatDef?.dedicatedCreatePath ? (
                // A dedicated creator owns the rest of the field set — asking for
                // it twice would let the two copies disagree. Only the name is
                // taken here, and it travels in the URL.
                <>
                  <BasicsTab
                    form={form}
                    set={set}
                    institutions={institutions}
                    institutionId={institutionId}
                    institutionsLoading={institutionsLoading}
                    onHostChange={setHostOverride}
                  />
                  <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                    {formatDef.label} has a dedicated setup with divisions and registration.
                    We&apos;ll take you there with your name and choices pre-filled.
                  </p>
                </>
              ) : (
                <Tabs value={tab} onValueChange={(v) => setTab(v as FormTabKey)}>
                  <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1">
                    {DETAIL_TABS.map((t) => (
                      <TabsTrigger key={t.key} value={t.key} className="gap-1.5 text-xs">
                        {t.label}
                        {errors[t.key] && (
                          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="basics" className="mt-0">
                    <BasicsTab
                      form={form}
                      set={set}
                      institutions={institutions}
                      institutionId={institutionId}
                      institutionsLoading={institutionsLoading}
                      onHostChange={setHostOverride}
                    />
                  </TabsContent>

                  <TabsContent value="schedule" className="mt-0">
                    <ScheduleTab
                      form={form}
                      set={set}
                      multiDay={multiDay}
                      onMultiDayChange={(v) => {
                        setMultiDay(v);
                        if (!v) set('last_day', '');
                      }}
                      offCampus={offCampus}
                      daySlotCount={daySlots.length}
                      badDayRange={badDayRange}
                      badTimes={badTimes}
                      tooManyDays={tooManyDays}
                      maxDays={MAX_EVENT_DAYS}
                    />
                  </TabsContent>

                  <TabsContent value="venue" className="mt-0">
                    <VenueTab
                      form={form}
                      set={set}
                      offCampus={offCampus}
                      onOffCampusChange={setOffCampus}
                      venueResourceId={venueResourceId}
                      onVenueResourceChange={setVenueResourceId}
                      checking={checking}
                      clashes={clashes}
                      daySlotCount={daySlots.length}
                      dayCount={dayCount}
                      dayLabel={dayLabel}
                      timeRangeLabel={timeRangeLabel}
                    />
                  </TabsContent>

                  <TabsContent value="people" className="mt-0">
                    <PeopleTab
                      form={form}
                      set={set}
                      pickerOpen={inchargePickerOpen}
                      onPickerOpenChange={setInchargePickerOpen}
                      error={fieldErrors.people}
                    />
                  </TabsContent>

                  <TabsContent value="registration" className="mt-0">
                    <RegistrationTab
                      form={form}
                      set={set}
                      badRegWindow={badRegWindow}
                      capacityError={fieldErrors.registration}
                    />
                  </TabsContent>

                  <TabsContent value="categories" className="mt-0">
                    <CategoriesTab
                      form={form}
                      set={set}
                      showCompetitionFields={showCompetitionFields}
                      error={fieldErrors.categories}
                    />
                  </TabsContent>

                  <TabsContent value="evidence" className="mt-0">
                    {/* NAAC evidence tags — writes events.naac_criteria; the
                        evidence emitter picks tagged events up once they complete. */}
                    <NaacCriteriaField
                      value={form.naac_criteria}
                      onChange={(next) => set('naac_criteria', next)}
                      disabled={creating}
                    />
                  </TabsContent>
                </Tabs>
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
                    // All of these are false on the dedicated-creator path, where
                    // none of the schedule/venue/registration fields render.
                    (!formatDef?.dedicatedCreatePath &&
                      (badTimes ||
                        badDayRange ||
                        tooManyDays ||
                        badRegWindow ||
                        // A clash the organizer can already see on screen — don't
                        // let them submit into a guaranteed "NOT held" outcome.
                        clashes.length > 0))
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
