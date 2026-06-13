'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Home, Bus } from 'lucide-react';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  token: string;
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

interface RouteOption { id: string; route_number: string; route_name: string }
interface StopOption { id: string; stop_name: string }

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

function Section({
  title,
  children,
}: {
  title: { en: string; ta: string };
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-5">
      <h3 className="text-base font-semibold text-foreground">
        {title.en}{' '}
        <span className="text-muted-foreground font-normal">/ {title.ta}</span>
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <Req />}
      </Label>
      {children}
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

export function StepAccommodation({
  data,
  token,
  onContinue,
  onBack,
  submitting,
}: Props) {
  // The convert route hardcodes 'DAY SCHOLAR' as the default accommodation_type
  // on new learners, so the field is virtually never empty on first render.
  // Falling back to '' covers the legacy-import edge case.
  // hostel_category_id / mess_category_id pickers removed (20260611190000):
  // room & mess categories are allocation-derived — set automatically when a
  // hostel room is allocated, never chosen on the admission form.
  const [v, setV] = useState({
    accommodation_type: data.accommodation_type ?? '',
    bus_required: (data.bus_required ?? null) as boolean | null,
    transport_route_id: data.transport_route_id ?? '',
    transport_stop_id: data.transport_stop_id ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // Day-Scholar bus transport. Routes/stops come from the token-gated
  // course-options API (service-role) because anon has no direct read on the
  // tms_route / tms_route_stop tables.
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [stops, setStops] = useState<StopOption[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);

  const fetchOptions = async (kind: string, filters?: Record<string, string>) => {
    const res = await fetch(
      `/api/student-form/${encodeURIComponent(token)}/course-options`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, filters }),
      },
    );
    if (!res.ok) throw new Error('options_failed');
    const json = await res.json();
    return (json.data ?? []) as any[];
  };

  const isDayScholar = v.accommodation_type === 'DAY SCHOLAR';

  // When the user flips Accommodation Type away from DAY SCHOLAR the bus
  // sub-fields go stale — reset so the saved data matches the choice.
  useEffect(() => {
    if (v.accommodation_type !== 'DAY SCHOLAR') {
      if (v.bus_required !== null || v.transport_route_id || v.transport_stop_id) {
        setV((p) => ({
          ...p,
          bus_required: null,
          transport_route_id: '',
          transport_stop_id: '',
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.accommodation_type]);

  // Load routes once the learner says a bus is needed.
  useEffect(() => {
    if (!isDayScholar || v.bus_required !== true) return;
    let cancelled = false;
    setLoadingRoutes(true);
    fetchOptions('routes')
      .then((rows) => { if (!cancelled) setRoutes(rows as RouteOption[]); })
      .catch(() => { if (!cancelled) setRoutes([]); })
      .finally(() => { if (!cancelled) setLoadingRoutes(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDayScholar, v.bus_required]);

  // Clear route + stop when no bus is needed.
  useEffect(() => {
    if (v.bus_required !== true && (v.transport_route_id || v.transport_stop_id)) {
      setV((p) => ({ ...p, transport_route_id: '', transport_stop_id: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.bus_required]);

  // Load stops for the chosen route; clear a stop no longer on the route.
  useEffect(() => {
    if (!v.transport_route_id) { setStops([]); return; }
    let cancelled = false;
    setLoadingStops(true);
    fetchOptions('route_stops', { route_id: v.transport_route_id })
      .then((rows) => {
        if (cancelled) return;
        const list = rows as StopOption[];
        setStops(list);
        if (v.transport_stop_id && !list.some((s) => s.id === v.transport_stop_id)) {
          setV((p) => ({ ...p, transport_stop_id: '' }));
        }
      })
      .catch(() => { if (!cancelled) setStops([]); })
      .finally(() => { if (!cancelled) setLoadingStops(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.transport_route_id]);

  const isHostel = v.accommodation_type === 'HOSTEL';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onContinue({
          ...v,
          // Normalize FK UUIDs: '' → null so the server never gets '' for a
          // uuid column (Postgres 22P02).
          bus_required: isDayScholar ? v.bus_required : null,
          transport_route_id: v.transport_route_id || null,
          transport_stop_id: v.transport_stop_id || null,
        });
      }}
      className="space-y-6"
    >
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Accommodation Preferences{' '}
          <span className="text-muted-foreground font-normal">
            / தங்குமிட விருப்பம்
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Fields marked <Req /> are required.
        </p>
      </header>

      <Section title={{ en: 'Where will you stay?', ta: 'எங்கு தங்குவீர்கள்?' }}>
        <Field label="Accommodation Type / தங்குமிட வகை" required>
          <RadioGroup
            value={v.accommodation_type}
            onValueChange={(s) => set('accommodation_type', s)}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {/* Tile-style radio for touch-friendly mobile interaction */}
            <label
              htmlFor="acc-hostel"
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                v.accommodation_type === 'HOSTEL'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:bg-muted/30'
              }`}
            >
              <RadioGroupItem value="HOSTEL" id="acc-hostel" className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <Home className="h-4 w-4" />
                  Hostel
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stay on-campus / விடுதி
                </p>
              </div>
            </label>

            <label
              htmlFor="acc-day"
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                v.accommodation_type === 'DAY SCHOLAR'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:bg-muted/30'
              }`}
            >
              <RadioGroupItem value="DAY SCHOLAR" id="acc-day" className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <Bus className="h-4 w-4" />
                  Day Scholar
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Commute from home / நாள்தோறும் வருபவர்
                </p>
              </div>
            </label>
          </RadioGroup>
        </Field>
      </Section>

      {isHostel && (
        <Section title={{ en: 'Hostel Details', ta: 'விடுதி விவரங்கள்' }}>
          <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 p-3">
            Your room and mess category will be assigned by the hostel office
            when a room is allocated to you.{' '}
            <span className="text-xs">
              / உங்களுக்கு அறை ஒதுக்கப்படும் போது அறை மற்றும் உணவக வகை
              நிர்ணயிக்கப்படும்.
            </span>
          </p>
        </Section>
      )}

      {isDayScholar && (
        <Section title={{ en: 'Transport', ta: 'போக்குவரத்து' }}>
          <Field label="Bus Required? / பேருந்து தேவையா?">
            <RadioGroup
              value={
                v.bus_required === true ? 'yes' : v.bus_required === false ? 'no' : ''
              }
              onValueChange={(s) => set('bus_required', s === 'yes')}
              className="grid grid-cols-2 gap-3"
            >
              <label
                htmlFor="bus-yes"
                className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                  v.bus_required === true
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                <RadioGroupItem value="yes" id="bus-yes" />
                <span className="font-medium">Yes / ஆம்</span>
              </label>
              <label
                htmlFor="bus-no"
                className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                  v.bus_required === false
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                <RadioGroupItem value="no" id="bus-no" />
                <span className="font-medium">No / இல்லை</span>
              </label>
            </RadioGroup>
          </Field>

          {v.bus_required === true && (
            <>
              <Field
                label="Route / வழித்தடம்"
                helper="Choose your bus route."
              >
                <Select
                  value={v.transport_route_id}
                  onValueChange={(s) => set('transport_route_id', s)}
                  disabled={loadingRoutes || routes.length === 0}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue
                      placeholder={
                        loadingRoutes
                          ? 'Loading...'
                          : routes.length === 0
                          ? 'No routes available'
                          : 'Select route / வழித்தடம் தேர்வு செய்க'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {routes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.route_number} - {r.route_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {v.transport_route_id && (
                <Field
                  label="Boarding Point / ஏறும் இடம்"
                  helper="Where you will board the bus."
                >
                  <Select
                    value={v.transport_stop_id}
                    onValueChange={(s) => set('transport_stop_id', s)}
                    disabled={loadingStops || stops.length === 0}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue
                        placeholder={
                          loadingStops
                            ? 'Loading...'
                            : stops.length === 0
                            ? 'No stops available'
                            : 'Select boarding point / ஏறும் இடம் தேர்வு செய்க'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {stops.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.stop_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </>
          )}
        </Section>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 text-sm sm:text-base"
          onClick={onBack}
          disabled={submitting}
        >
          Back / பின்
        </Button>
        <Button type="submit" className="flex-1 h-12 text-sm sm:text-base" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save & Continue / சேமித்துத் தொடரவும்
        </Button>
      </div>
    </form>
  );
}
