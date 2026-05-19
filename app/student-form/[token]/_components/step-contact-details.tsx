'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { indianStates, getDistrictsByState, getTaluksByDistrict } from '@/lib/data/locations';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onContinue: (fields: Record<string, any>) => void;
  onSaveDraft: (fields: Record<string, any>) => void;
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
        {title.en} <span className="text-muted-foreground font-normal">/ {title.ta}</span>
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <Req />}
      </Label>
      {children}
    </div>
  );
}

export function StepContactDetails({
  data,
  onContinue,
  onSaveDraft,
  onBack,
  submitting,
}: Props) {
  const [v, setV] = useState({
    student_mobile: data.student_mobile ?? '',
    student_email: data.student_email ?? '',
    permanent_address_street: data.permanent_address_street ?? '',
    permanent_address_state: data.permanent_address_state ?? 'tamil_nadu',
    permanent_address_district: data.permanent_address_district ?? '',
    permanent_address_taluk: data.permanent_address_taluk ?? '',
    permanent_address_pin_code: data.permanent_address_pin_code ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const districts = useMemo(
    () => getDistrictsByState(v.permanent_address_state),
    [v.permanent_address_state],
  );

  const taluks = useMemo(
    () => getTaluksByDistrict(v.permanent_address_state, v.permanent_address_district),
    [v.permanent_address_state, v.permanent_address_district],
  );

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
          Contact Details <span className="text-muted-foreground font-normal">/ தொடர்பு விவரங்கள்</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Fields marked <Req /> are required.
        </p>
      </header>

      {/* Reach the Student */}
      <Section title={{ en: 'Reach the Student', ta: 'தொடர்பு' }}>
        <Field label="Student Mobile / கைபேசி எண்" required>
          <Input
            value={v.student_mobile}
            onChange={(e) => set('student_mobile', e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
            className="h-12"
          />
        </Field>

        <Field label="Email / மின்னஞ்சல்">
          <Input
            type="email"
            value={v.student_email}
            onChange={(e) => set('student_email', e.target.value)}
            placeholder="Optional"
            className="h-12"
          />
        </Field>
      </Section>

      {/* Permanent Address */}
      <Section title={{ en: 'Permanent Address', ta: 'நிரந்தர முகவரி' }}>
        <Field label="Address / முகவரி">
          <Input
            value={v.permanent_address_street}
            onChange={(e) => set('permanent_address_street', e.target.value)}
            placeholder="Street, area, landmark"
            className="h-12"
          />
        </Field>

        <Field label="State / மாநிலம்">
          <Select
            value={v.permanent_address_state}
            onValueChange={(s) => {
              set('permanent_address_state', s);
              set('permanent_address_district', '');
              set('permanent_address_taluk', '');
            }}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select state / மாநிலம் தேர்வு செய்க" />
            </SelectTrigger>
            <SelectContent>
              {indianStates.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="District / மாவட்டம்">
          <Select
            value={v.permanent_address_district}
            onValueChange={(s) => {
              set('permanent_address_district', s);
              set('permanent_address_taluk', '');
            }}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Pick state first / முதலில் மாநிலம் தேர்வு செய்க" />
            </SelectTrigger>
            <SelectContent>
              {districts.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Taluk / வட்டம்">
          <Select
            value={v.permanent_address_taluk}
            onValueChange={(s) => set('permanent_address_taluk', s)}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Pick district first / முதலில் மாவட்டம் தேர்வு செய்க" />
            </SelectTrigger>
            <SelectContent>
              {taluks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Pincode / அஞ்சல் குறியீடு">
          <Input
            value={v.permanent_address_pin_code}
            onChange={(e) => set('permanent_address_pin_code', e.target.value)}
            placeholder="6-digit pincode"
            inputMode="numeric"
            maxLength={6}
            className="h-12"
          />
        </Field>
      </Section>

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
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 text-sm sm:text-base"
          onClick={() => onSaveDraft(v)}
          disabled={submitting}
        >
          <Save className="h-4 w-4 mr-1.5" />
          Save Draft
        </Button>
        <Button type="submit" className="flex-1 h-12 text-sm sm:text-base" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Continue / தொடரவும்
        </Button>
      </div>
    </form>
  );
}
