// __tests__/events/sponsor-form.test.ts — BUG-006143: sponsor notes + edit.
import { describe, it, expect } from 'vitest';
import {
  EMPTY_SPONSOR_FORM,
  sponsorFormToPayload,
  sponsorToForm,
} from '@/lib/utils/events/sponsor-form';
import type { MarathonSponsor } from '@/types/events-marathon';

describe('sponsorFormToPayload', () => {
  it('carries free-text notes, trimmed', () => {
    const p = sponsorFormToPayload(
      { ...EMPTY_SPONSOR_FORM, company_name: ' Acme ', notes: '  5 sponsors, Rs 50,000 total  ' },
      'add'
    );
    expect(p.company_name).toBe('Acme');
    expect(p.notes).toBe('5 sponsors, Rs 50,000 total');
  });

  it('stores blank optional fields as null, not empty strings', () => {
    const p = sponsorFormToPayload({ ...EMPTY_SPONSOR_FORM, company_name: 'Acme', notes: '   ' }, 'add');
    expect(p.notes).toBeNull();
    expect(p.contact_email).toBeNull();
  });

  it('only writes amount_received when editing', () => {
    const form = { ...EMPTY_SPONSOR_FORM, company_name: 'Acme', amount_received: '2500' };
    expect('amount_received' in sponsorFormToPayload(form, 'add')).toBe(false);
    expect(sponsorFormToPayload(form, 'edit')).toMatchObject({ amount_received: 2500 });
  });

  it('clamps bad amounts to 0', () => {
    const p = sponsorFormToPayload(
      { ...EMPTY_SPONSOR_FORM, company_name: 'Acme', amount_pledged: '-5', amount_received: 'abc' },
      'edit'
    );
    expect(p.amount_pledged).toBe(0);
    expect(p).toMatchObject({ amount_received: 0 });
  });
});

describe('sponsorToForm', () => {
  it('round-trips an existing sponsor including notes', () => {
    const s = {
      company_name: 'Acme',
      contact_person: null,
      contact_email: 'a@acme.com',
      contact_phone: null,
      website: null,
      tier: 'gold',
      pipeline_stage: 'committed',
      amount_pledged: 10000,
      amount_received: 4000,
      notes: 'Banner at gate',
    } as unknown as MarathonSponsor;
    const p = sponsorFormToPayload(sponsorToForm(s), 'edit');
    expect(p).toMatchObject({
      company_name: 'Acme',
      contact_email: 'a@acme.com',
      tier: 'gold',
      amount_pledged: 10000,
      amount_received: 4000,
      notes: 'Banner at gate',
    });
  });
});
