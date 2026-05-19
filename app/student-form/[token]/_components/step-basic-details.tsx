'use client';

import { useState } from 'react';
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
import type { Language } from './language-toggle';
import {
  GENDER_OPTIONS,
  RELIGION_OPTIONS,
  COMMUNITY_OPTIONS,
} from '@/lib/constants/learner-dropdown-values';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onContinue: (fields: Record<string, any>) => void;
  onSaveDraft: (fields: Record<string, any>) => void;
  submitting: boolean;
}

const T = {
  title: { en: 'Basic Details', ta: 'அடிப்படை விவரங்கள்' },
  personal: { en: 'Personal Information', ta: 'தனிப்பட்ட விவரங்கள்' },
  parents: { en: "Parents' Information", ta: 'பெற்றோர் விவரங்கள்' },
  additional: { en: 'Additional', ta: 'கூடுதல்' },
  first_name: { en: 'First name', ta: 'முதல் பெயர்' },
  last_name: { en: 'Last name', ta: 'கடைசி பெயர்' },
  dob: { en: 'Date of birth', ta: 'பிறந்த தேதி' },
  gender: { en: 'Gender', ta: 'பாலினம்' },
  religion: { en: 'Religion', ta: 'மதம்' },
  community: { en: 'Community', ta: 'சமூகம்' },
  caste: { en: 'Caste', ta: 'ஜாதி' },
  father_name: { en: 'Father name', ta: 'தந்தை பெயர்' },
  father_occupation: { en: 'Father occupation', ta: 'தந்தை தொழில்' },
  father_phone: { en: 'Father phone', ta: 'தந்தை கைபேசி' },
  mother_name: { en: 'Mother name', ta: 'தாய் பெயர்' },
  mother_occupation: { en: 'Mother occupation', ta: 'தாய் தொழில்' },
  mother_phone: { en: 'Mother phone', ta: 'தாய் கைபேசி' },
  income: { en: 'Annual family income', ta: 'ஆண்டு வருமானம்' },
  cont: { en: 'Continue', ta: 'தொடரவும்' },
  select_gender: { en: 'Select gender', ta: 'பாலினம் தேர்வு செய்க' },
  select_religion: { en: 'Select religion', ta: 'மதம் தேர்வு செய்க' },
  select_community: { en: 'Select community', ta: 'சமூகம் தேர்வு செய்க' },
};
const lbl = (k: keyof typeof T) => `${T[k].en} / ${T[k].ta}`;
const ph = (k: keyof typeof T) => `${T[k].en} / ${T[k].ta}`;

// Required-field indicator
function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

// Section divider with bilingual header
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

// Labeled field wrapper for consistent spacing/alignment
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

export function StepBasicDetails({
  data,
  onContinue,
  onSaveDraft,
  submitting,
}: Props) {
  const [v, setV] = useState({
    first_name: data.first_name ?? '',
    last_name: data.last_name ?? '',
    date_of_birth: data.date_of_birth ?? '',
    // Normalize legacy lowercase values to canonical uppercase on first render
    // so the Select dropdown finds a matching option for old data.
    gender: (data.gender ?? '').toUpperCase(),
    religion: (data.religion ?? '').toUpperCase(),
    community: data.community ?? '',
    caste: data.caste ?? '',
    father_name: data.father_name ?? '',
    father_occupation: data.father_occupation ?? '',
    father_mobile: data.father_mobile ?? '',
    mother_name: data.mother_name ?? '',
    mother_occupation: data.mother_occupation ?? '',
    mother_mobile: data.mother_mobile ?? '',
    annual_income: data.annual_income ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) =>
    setV((p) => ({ ...p, [k]: val }));

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
          {T.title.en} <span className="text-muted-foreground font-normal">/ {T.title.ta}</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Fields marked <Req /> are required.
        </p>
      </header>

      {/* Personal Information */}
      <Section title={T.personal}>
        <Field label={lbl('first_name')} required>
          <Input
            value={v.first_name}
            onChange={(e) => set('first_name', e.target.value)}
            placeholder={ph('first_name')}
            className="h-12"
          />
        </Field>

        <Field label={lbl('last_name')}>
          <Input
            value={v.last_name}
            onChange={(e) => set('last_name', e.target.value)}
            placeholder={ph('last_name')}
            className="h-12"
          />
        </Field>

        <Field label={lbl('dob')}>
          <Input
            type="date"
            value={v.date_of_birth}
            onChange={(e) => set('date_of_birth', e.target.value)}
            className="h-12"
          />
        </Field>

        <Field label={lbl('gender')}>
          <Select value={v.gender} onValueChange={(s) => set('gender', s)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder={T.select_gender.en + ' / ' + T.select_gender.ta} />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={lbl('religion')}>
          <Select value={v.religion} onValueChange={(s) => set('religion', s)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder={T.select_religion.en + ' / ' + T.select_religion.ta} />
            </SelectTrigger>
            <SelectContent>
              {RELIGION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={lbl('community')}>
          <Select value={v.community} onValueChange={(s) => set('community', s)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder={T.select_community.en + ' / ' + T.select_community.ta} />
            </SelectTrigger>
            <SelectContent>
              {COMMUNITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={lbl('caste')}>
          <Input
            value={v.caste}
            onChange={(e) => set('caste', e.target.value)}
            placeholder={ph('caste')}
            className="h-12"
          />
        </Field>
      </Section>

      {/* Parents' Information */}
      <Section title={T.parents}>
        <Field label={lbl('father_name')}>
          <Input
            value={v.father_name}
            onChange={(e) => set('father_name', e.target.value)}
            placeholder={ph('father_name')}
            className="h-12"
          />
        </Field>

        <Field label={lbl('father_occupation')}>
          <Input
            value={v.father_occupation}
            onChange={(e) => set('father_occupation', e.target.value)}
            placeholder="e.g. Farmer, Teacher"
            className="h-12"
          />
        </Field>

        <Field label={lbl('father_phone')}>
          <Input
            value={v.father_mobile}
            onChange={(e) => set('father_mobile', e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
            className="h-12"
          />
        </Field>

        <Field label={lbl('mother_name')}>
          <Input
            value={v.mother_name}
            onChange={(e) => set('mother_name', e.target.value)}
            placeholder={ph('mother_name')}
            className="h-12"
          />
        </Field>

        <Field label={lbl('mother_occupation')}>
          <Input
            value={v.mother_occupation}
            onChange={(e) => set('mother_occupation', e.target.value)}
            placeholder="e.g. Homemaker, Nurse"
            className="h-12"
          />
        </Field>

        <Field label={lbl('mother_phone')}>
          <Input
            value={v.mother_mobile}
            onChange={(e) => set('mother_mobile', e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
            className="h-12"
          />
        </Field>
      </Section>

      {/* Additional */}
      <Section title={T.additional}>
        <Field label={lbl('income')}>
          <Input
            value={v.annual_income}
            onChange={(e) => set('annual_income', e.target.value)}
            placeholder="₹ per year"
            inputMode="numeric"
            className="h-12"
          />
        </Field>
      </Section>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 text-base"
          onClick={() => onSaveDraft(v)}
          disabled={submitting}
        >
          <Save className="h-4 w-4 mr-2" />
          Save Draft
        </Button>
        <Button type="submit" className="flex-1 h-12 text-base" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {T.cont.en} / {T.cont.ta}
        </Button>
      </div>
    </form>
  );
}
