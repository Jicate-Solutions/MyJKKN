'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { indianStates, getDistrictsByState, getTaluksByDistrict } from '@/lib/data/locations';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

export function StepContactDetails({ data, onContinue, onBack, submitting }: Props) {
  const [v, setV] = useState({
    student_mobile: data.student_mobile ?? '',
    student_email: data.student_email ?? '',
    permanent_address_street: data.permanent_address_street ?? '',
    permanent_address_state: data.permanent_address_state ?? 'tamil_nadu',
    permanent_address_district: data.permanent_address_district ?? '',
    permanent_address_taluk: data.permanent_address_taluk ?? '',
    permanent_address_pin_code: data.permanent_address_pin_code ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) => setV((p) => ({ ...p, [k]: val }));

  const districts = useMemo(
    () => getDistrictsByState(v.permanent_address_state),
    [v.permanent_address_state],
  );

  const taluks = useMemo(
    () => getTaluksByDistrict(v.permanent_address_district),
    [v.permanent_address_district],
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); onContinue(v); }} className="space-y-3">
      <h2 className="text-lg font-semibold">Contact Details / தொடர்பு விவரங்கள்</h2>

      <div>
        <Label>Student Mobile / கைபேசி எண்</Label>
        <Input value={v.student_mobile} onChange={(e) => set('student_mobile', e.target.value)}
               inputMode="numeric" required className="h-12" />
      </div>

      <div>
        <Label>Email (optional) / மின்னஞ்சல்</Label>
        <Input type="email" value={v.student_email} onChange={(e) => set('student_email', e.target.value)} className="h-12" />
      </div>

      <div>
        <Label>Address / முகவரி</Label>
        <Input value={v.permanent_address_street} onChange={(e) => set('permanent_address_street', e.target.value)} className="h-12" />
      </div>

      <div>
        <Label>State / மாநிலம்</Label>
        <Select value={v.permanent_address_state} onValueChange={(s) => {
          set('permanent_address_state', s);
          set('permanent_address_district', '');
          set('permanent_address_taluk', '');
        }}>
          <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {indianStates.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>District / மாவட்டம்</Label>
        <Select value={v.permanent_address_district} onValueChange={(s) => {
          set('permanent_address_district', s);
          set('permanent_address_taluk', '');
        }}>
          <SelectTrigger className="h-12"><SelectValue placeholder="Pick state first" /></SelectTrigger>
          <SelectContent>
            {districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Taluk / வட்டம்</Label>
        <Select value={v.permanent_address_taluk} onValueChange={(s) => set('permanent_address_taluk', s)}>
          <SelectTrigger className="h-12"><SelectValue placeholder="Pick district first" /></SelectTrigger>
          <SelectContent>
            {taluks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Pincode / அஞ்சல் குறியீடு</Label>
        <Input value={v.permanent_address_pin_code} onChange={(e) => set('permanent_address_pin_code', e.target.value)}
               inputMode="numeric" className="h-12" />
      </div>

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
