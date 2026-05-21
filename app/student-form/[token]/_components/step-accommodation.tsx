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
import {
  HOSTEL_TYPE_OPTIONS,
  FOOD_TYPE_OPTIONS,
} from '@/lib/constants/learner-dropdown-values';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

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
  onContinue,
  onBack,
  submitting,
}: Props) {
  // The convert route hardcodes 'DAY SCHOLAR' as the default accommodation_type
  // on new learners, so the field is virtually never empty on first render.
  // Falling back to '' covers the legacy-import edge case.
  const [v, setV] = useState({
    accommodation_type: data.accommodation_type ?? '',
    hostel_type: data.hostel_type ?? '',
    food_type: data.food_type ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // When the user flips Accommodation Type, the hostel sub-fields become
  // either required (HOSTEL) or stale (DAY SCHOLAR). Reset them when
  // switching to DAY SCHOLAR so the saved data matches the choice.
  useEffect(() => {
    if (v.accommodation_type !== 'HOSTEL') {
      if (v.hostel_type || v.food_type) {
        setV((p) => ({ ...p, hostel_type: '', food_type: '' }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.accommodation_type]);

  const isHostel = v.accommodation_type === 'HOSTEL';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onContinue(v);
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
          <Field
            label="Hostel Type / விடுதி வகை"
            helper="Choose your preferred hostel category. Final allocation depends on availability."
          >
            <Select
              value={v.hostel_type}
              onValueChange={(s) => set('hostel_type', s)}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select hostel type / விடுதி வகை தேர்வு செய்க" />
              </SelectTrigger>
              <SelectContent>
                {HOSTEL_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Food Type / உணவு வகை"
            helper="Dietary preference for hostel meals."
          >
            <Select
              value={v.food_type}
              onValueChange={(s) => set('food_type', s)}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select food type / உணவு வகை தேர்வு செய்க" />
              </SelectTrigger>
              <SelectContent>
                {FOOD_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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
