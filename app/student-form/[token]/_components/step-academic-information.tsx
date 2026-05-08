'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

const SCHOLARSHIP_OPTIONS = [
  { value: 'none', label: 'None / ஏதுமில்லை' },
  { value: 'first_graduate', label: 'First Graduate / முதல் பட்டதாரி' },
  { value: 'minority', label: 'Minority / சிறுபான்மையினர்' },
  { value: 'sc_st', label: 'SC/ST' },
  { value: 'other', label: 'Other / பிற' },
];

const ENTRY_TYPE_OPTIONS = [
  { value: 'FIRST YEAR',  label: 'First Year / முதலாமாண்டு' },
  { value: 'LATERAL',     label: 'Lateral / பக்கவழி' },
  { value: 'TRANSFER',    label: 'Transfer / பரிமாற்றம்' },
];

export function StepAcademicInformation({ data, onContinue, onBack, submitting }: Props) {
  const [v, setV] = useState({
    tenth_marks: data.tenth_marks ?? {},
    twelfth_marks: data.twelfth_marks ?? {},
    last_school: data.last_school ?? '',
    board_of_study: data.board_of_study ?? '',
    neet_roll_number: data.neet_roll_number ?? '',
    neet_score: data.neet_score ?? '',
    counseling_applied: data.counseling_applied ?? false,
    counseling_number: data.counseling_number ?? '',
    scholarship_type: data.scholarship_type ?? '',
    quota: data.quota ?? '',
    entry_type: data.entry_type ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) => setV((p) => ({ ...p, [k]: val }));

  // 10th/12th marks: max+obtained + group inside the JSONB column
  const set10 = (key: string, value: string) => set('tenth_marks', { ...v.tenth_marks, [key]: value });
  const set12 = (key: string, value: string) => set('twelfth_marks', { ...v.twelfth_marks, [key]: value });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onContinue(v); }} className="space-y-3">
      <h2 className="text-lg font-semibold">Academic Information / கல்வி விவரங்கள்</h2>

      <Label>10th Marks (Max / Obtained) / 10ஆம் வகுப்பு மதிப்பெண்</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Max" inputMode="numeric"
          value={v.tenth_marks.max ?? ''} onChange={(e) => set10('max', e.target.value)} className="h-12" />
        <Input placeholder="Obtained" inputMode="numeric"
          value={v.tenth_marks.obtained ?? ''} onChange={(e) => set10('obtained', e.target.value)} className="h-12" />
      </div>

      <Label>Last School / கடந்த பள்ளி</Label>
      <Input value={v.last_school} onChange={(e) => set('last_school', e.target.value)} className="h-12" />

      <Label>Board of Study / வாரியம்</Label>
      <Input value={v.board_of_study} onChange={(e) => set('board_of_study', e.target.value)} className="h-12" />

      <Label>12th Marks (Max / Obtained) / 12ஆம் வகுப்பு மதிப்பெண்</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Max" inputMode="numeric"
          value={v.twelfth_marks.max ?? ''} onChange={(e) => set12('max', e.target.value)} className="h-12" />
        <Input placeholder="Obtained" inputMode="numeric"
          value={v.twelfth_marks.obtained ?? ''} onChange={(e) => set12('obtained', e.target.value)} className="h-12" />
      </div>

      <Label>12th Group / 12ஆம் வகுப்பு பிரிவு</Label>
      <Input
        placeholder="e.g. Bio-Maths, Computer Science"
        value={v.twelfth_marks.group ?? ''}
        onChange={(e) => set12('group', e.target.value)}
        className="h-12"
      />

      <Label>NEET Roll Number / NEET எண்</Label>
      <Input value={v.neet_roll_number} onChange={(e) => set('neet_roll_number', e.target.value)} className="h-12" />

      <Label>NEET Score</Label>
      <Input value={v.neet_score} onChange={(e) => set('neet_score', e.target.value)} inputMode="numeric" className="h-12" />

      <Label>Scholarship Type / உதவித்தொகை வகை</Label>
      <Select value={v.scholarship_type} onValueChange={(s) => set('scholarship_type', s)}>
        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SCHOLARSHIP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Label>Quota / ஒதுக்கீடு</Label>
      <Input value={v.quota} onChange={(e) => set('quota', e.target.value)} className="h-12" />

      <Label>Entry Type / சேர்க்கை வகை</Label>
      <Select value={v.entry_type} onValueChange={(s) => set('entry_type', s)}>
        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ENTRY_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1 h-12" onClick={onBack}>Back / பின் செல்</Button>
        <Button type="submit" className="flex-1 h-12" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Continue / தொடரவும்
        </Button>
      </div>
    </form>
  );
}
