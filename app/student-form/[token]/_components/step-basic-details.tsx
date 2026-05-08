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
import { Loader2 } from 'lucide-react';
import { SelfieCapture } from './selfie-capture';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  token: string;
  onContinue: (fields: Record<string, any>) => void;
  submitting: boolean;
}

const T = {
  title: { en: 'Basic Details', ta: 'அடிப்படை விவரங்கள்' },
  first_name: { en: 'First name', ta: 'முதல் பெயர்' },
  last_name: { en: 'Last name', ta: 'கடைசி பெயர்' },
  dob: { en: 'Date of birth', ta: 'பிறந்த தேதி' },
  gender: { en: 'Gender', ta: 'பாலினம்' },
  religion: { en: 'Religion', ta: 'மதம்' },
  community: { en: 'Community', ta: 'சமூகம்' },
  caste: { en: 'Caste', ta: 'ஜாதி' },
  father_name: { en: 'Father name', ta: 'தந்தை பெயர்' },
  father_phone: { en: 'Father phone', ta: 'தந்தை கைபேசி' },
  mother_name: { en: 'Mother name', ta: 'தாய் பெயர்' },
  mother_phone: { en: 'Mother phone', ta: 'தாய் கைபேசி' },
  income: { en: 'Annual income', ta: 'ஆண்டு வருமானம்' },
  cont: { en: 'Continue', ta: 'தொடரவும்' },
};
const lbl = (k: keyof typeof T) => `${T[k].en} / ${T[k].ta}`;

export function StepBasicDetails({
  data,
  token,
  onContinue,
  submitting,
}: Props) {
  const [v, setV] = useState({
    first_name: data.first_name ?? '',
    last_name: data.last_name ?? '',
    date_of_birth: data.date_of_birth ?? '',
    gender: data.gender ?? '',
    religion: data.religion ?? '',
    community: data.community ?? '',
    caste: data.caste ?? '',
    student_photo_url: data.student_photo_url ?? '',
    father_name: data.father_name ?? '',
    father_mobile: data.father_mobile ?? '',
    mother_name: data.mother_name ?? '',
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
      className="space-y-3"
    >
      <h2 className="text-lg font-semibold">
        {T.title.en} / {T.title.ta}
      </h2>

      <SelfieCapture
        token={token}
        initialUrl={v.student_photo_url}
        onUploaded={(url) => set('student_photo_url', url)}
      />

      <Label>{lbl('first_name')}</Label>
      <Input
        value={v.first_name}
        onChange={(e) => set('first_name', e.target.value)}
        required
        className="h-12"
      />
      <Label>{lbl('last_name')}</Label>
      <Input
        value={v.last_name}
        onChange={(e) => set('last_name', e.target.value)}
        className="h-12"
      />
      <Label>{lbl('dob')}</Label>
      <Input
        type="date"
        value={v.date_of_birth}
        onChange={(e) => set('date_of_birth', e.target.value)}
        className="h-12"
      />
      <Label>{lbl('gender')}</Label>
      <Select value={v.gender} onValueChange={(s) => set('gender', s)}>
        <SelectTrigger className="h-12">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="male">Male / ஆண்</SelectItem>
          <SelectItem value="female">Female / பெண்</SelectItem>
          <SelectItem value="other">Other / பிற</SelectItem>
        </SelectContent>
      </Select>
      <Label>{lbl('religion')}</Label>
      <Input
        value={v.religion}
        onChange={(e) => set('religion', e.target.value)}
        className="h-12"
      />
      <Label>{lbl('community')}</Label>
      <Input
        value={v.community}
        onChange={(e) => set('community', e.target.value)}
        className="h-12"
      />
      <Label>{lbl('caste')}</Label>
      <Input
        value={v.caste}
        onChange={(e) => set('caste', e.target.value)}
        className="h-12"
      />

      <div className="border-t my-2 pt-2">
        <h3 className="text-sm font-medium">Parents / பெற்றோர்</h3>
      </div>
      <Label>{lbl('father_name')}</Label>
      <Input
        value={v.father_name}
        onChange={(e) => set('father_name', e.target.value)}
        className="h-12"
      />
      <Label>{lbl('father_phone')}</Label>
      <Input
        value={v.father_mobile}
        onChange={(e) => set('father_mobile', e.target.value)}
        inputMode="numeric"
        className="h-12"
      />
      <Label>{lbl('mother_name')}</Label>
      <Input
        value={v.mother_name}
        onChange={(e) => set('mother_name', e.target.value)}
        className="h-12"
      />
      <Label>{lbl('mother_phone')}</Label>
      <Input
        value={v.mother_mobile}
        onChange={(e) => set('mother_mobile', e.target.value)}
        inputMode="numeric"
        className="h-12"
      />
      <Label>{lbl('income')}</Label>
      <Input
        value={v.annual_income}
        onChange={(e) => set('annual_income', e.target.value)}
        inputMode="numeric"
        className="h-12"
      />

      <Button type="submit" className="w-full h-12" disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {T.cont.en} / {T.cont.ta}
      </Button>
    </form>
  );
}
