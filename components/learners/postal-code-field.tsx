'use client';

// Pincode field with postal-master lookup.
//
// Typing a valid 6-digit pincode fetches the post offices for that pin:
// - exactly one district  -> auto-fills the address District (cascade id)
// - multiple districts    -> renders tap-to-pick district chips (142 border pins)
// - a compact optional Post Office dropdown links the learner to precise
//   lat/long (post_office_id) for map navigation.
//
// No-clobber guarantee: district auto-fill fires only on USER edits to the
// pincode (never on hydration), so opening a legacy record changes nothing.

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import type { PincodeLookupResult } from '@/types/postal-code';

export interface PostalCodeFetchers {
  lookupPincode: (pincode: string) => Promise<PincodeLookupResult>;
}

export interface PostalCodeChange {
  pincode: string;
  postOfficeId: string | null;
  /** Set only when the district should be auto-filled (unambiguous or user-picked). */
  districtId?: string;
}

interface PostalCodeFieldProps {
  pincode: string;
  postOfficeId?: string | null;
  onChange: (next: PostalCodeChange) => void;
  fetchers: PostalCodeFetchers;
  disabled?: boolean;
  placeholder?: string;
  /** Set when rendered inside a Radix Dialog (see SearchableSelect.modal). */
  modal?: boolean;
  className?: string;
}

const PIN_RE = /^[0-9]{6}$/;

export function PostalCodeField({
  pincode,
  postOfficeId = null,
  onChange,
  fetchers,
  disabled = false,
  placeholder = 'Enter 6-digit PIN code',
  modal = false,
  className,
}: PostalCodeFieldProps) {
  // District auto-fill only reacts to user edits, never to hydrated values.
  const userEditedRef = React.useRef(false);
  const pin = (pincode ?? '').trim();
  const validPin = PIN_RE.test(pin);

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.postalCodes.lookup(pin),
    queryFn: () => fetchers.lookupPincode(pin),
    enabled: validPin,
    staleTime: 30 * 60 * 1000,
  });
  const offices = data?.offices ?? [];
  const districts = data?.districts ?? [];

  // Fire the auto-fill when a user-typed pin resolves to exactly one district.
  const autoFilledForPinRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!userEditedRef.current || !validPin || !data) return;
    if (autoFilledForPinRef.current === pin) return;
    if (districts.length === 1) {
      autoFilledForPinRef.current = pin;
      onChange({ pincode: pin, postOfficeId, districtId: districts[0].district_id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pin, validPin]);

  const handlePinInput = (raw: string) => {
    userEditedRef.current = true;
    const next = raw.replace(/[^0-9]/g, '').slice(0, 6);
    // Any pin change invalidates a previously picked post office
    onChange({ pincode: next, postOfficeId: null });
  };

  const officeOptions = offices.map((o) => ({
    value: o.id,
    label: districts.length > 1 ? `${o.office_name} (${o.district})` : o.office_name,
  }));

  return (
    <div className={className ?? 'space-y-2'}>
      <Input
        value={pincode ?? ''}
        onChange={(e) => handlePinInput(e.target.value)}
        placeholder={placeholder}
        inputMode='numeric'
        maxLength={6}
        disabled={disabled}
      />

      {/* Border pincodes: several districts share this pin — let the user pick */}
      {userEditedRef.current && validPin && districts.length > 1 && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='text-xs text-muted-foreground'>District:</span>
          {districts.map((d) => (
            <Button
              key={d.district_id}
              type='button'
              variant='outline'
              size='sm'
              className='h-6 px-2 text-xs'
              disabled={disabled}
              onClick={() => onChange({ pincode: pin, postOfficeId, districtId: d.district_id })}
            >
              {d.district}
            </Button>
          ))}
        </div>
      )}

      {validPin && offices.length > 0 && (
        <SearchableSelect
          value={postOfficeId ?? ''}
          onValueChange={(id) => {
            const office = offices.find((o) => o.id === id);
            onChange({
              pincode: pin,
              postOfficeId: id || null,
              // Picking an office pins down the district too
              districtId: office?.district_id,
            });
          }}
          options={officeOptions}
          placeholder='Post office (optional)'
          searchPlaceholder='Search post office…'
          emptyMessage='No post office found.'
          disabled={disabled}
          loading={isFetching}
          className='w-full h-8 text-xs'
          modal={modal}
        />
      )}
    </div>
  );
}
