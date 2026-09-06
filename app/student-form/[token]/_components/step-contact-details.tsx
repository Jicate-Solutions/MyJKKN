'use client';

import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
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
import {
  indianStates,
  getDistrictsByState,
  getTaluksByDistrict,
  getLocationIdByName,
} from '@/lib/data/locations';
import {
  PostalCodeField,
  type PostalCodeFetchers,
} from '@/components/learners/postal-code-field';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  token: string;
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

// No authenticated session on the public form — postal lookups go through the
// token-validated course-options endpoint (service-role).
function buildPostalFetchers(token: string): PostalCodeFetchers {
  return {
    lookupPincode: async (pincode) => {
      const res = await fetch(
        `/api/student-form/${encodeURIComponent(token)}/course-options`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'postal_lookup', filters: { pincode } }),
        },
      );
      if (!res.ok) throw new Error(`postal_lookup ${res.status}`);
      const json = await res.json();
      return json.data ?? { offices: [], districts: [] };
    },
  };
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
  token,
  onContinue,
  onBack,
  submitting,
}: Props) {
  const postalFetchers = useMemo(() => buildPostalFetchers(token), [token]);
  // Stored permanent_address_* values may be display NAMES ('TAMIL NADU',
  // 'SALEM', 'METTUR') rather than the snake_case IDs the <Select>s use, so
  // resolve them to IDs up front — otherwise the dropdowns render blank on
  // edit even though the data exists (same root cause as the enquiry form).
  const [v, setV] = useState(() => {
    const stateId =
      getLocationIdByName(data.permanent_address_state, 'state') || 'tamil_nadu';
    return {
      student_mobile: data.student_mobile ?? '',
      student_email: data.student_email ?? '',
      permanent_address_street: data.permanent_address_street ?? '',
      permanent_address_state: stateId,
      permanent_address_district:
        getLocationIdByName(data.permanent_address_district, 'district') || '',
      permanent_address_taluk:
        getLocationIdByName(data.permanent_address_taluk, 'taluk', stateId) || '',
      permanent_address_pin_code: data.permanent_address_pin_code ?? '',
      post_office_id: data.post_office_id ?? null,
    };
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
        if (v.permanent_address_street && v.permanent_address_street.includes('@')) {
          toast.error('Please enter your street address, not an email address');
          return;
        }
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
          <PostalCodeField
            pincode={v.permanent_address_pin_code}
            postOfficeId={v.post_office_id}
            fetchers={postalFetchers}
            placeholder="6-digit pincode"
            onChange={({ pincode, postOfficeId, districtId }) =>
              setV((p) => ({
                ...p,
                permanent_address_pin_code: pincode,
                post_office_id: postOfficeId,
                ...(districtId
                  ? {
                      permanent_address_state: 'tamil_nadu',
                      permanent_address_district: districtId,
                      // Taluk belongs to the previous district — reset if changed
                      ...(p.permanent_address_district !== districtId
                        ? { permanent_address_taluk: '' }
                        : {}),
                    }
                  : {}),
              }))
            }
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
        <Button type="submit" className="flex-1 h-12 text-sm sm:text-base" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save & Continue / சேமித்துத் தொடரவும்
        </Button>
      </div>
    </form>
  );
}
