// __tests__/events/host-institution-resolution.test.ts
//
// KRISHNAVENI A could not create an event at all. Her home entity is JKKN Main
// Office, an 'admin_office' row, and the wizard's host list asked for
// entity_type 'institution' only — so her office was never in it and the
// wizard quietly defaulted the host to the first college in the list. The
// events INSERT policy then refused the write, after the entire wizard had
// been filled in.
//
// The rule pinned here is the one that made the failure invisible: a host that
// was not chosen must be NO host, never a guess.

import { describe, it, expect } from 'vitest';
import { resolveHostInstitutionId } from '@/app/(routes)/events/create/_components/event-create-form';

const MAIN_OFFICE = 'b962527f-97ce-4238-89ce-7b532d7c2bc6';
const PHARMACY = '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334';
const DENTAL = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5';

describe('resolveHostInstitutionId', () => {
  it('never invents a host the organizer did not choose', () => {
    const host = resolveHostInstitutionId({
      hostOverride: null,
      institutions: [{ id: PHARMACY }, { id: DENTAL }],
      ambientInstitutionId: MAIN_OFFICE,
    });

    expect(host).toBe('');
  });

  it('defaults to the ambient institution once it is actually offered', () => {
    const host = resolveHostInstitutionId({
      hostOverride: null,
      institutions: [{ id: MAIN_OFFICE }, { id: PHARMACY }],
      ambientInstitutionId: MAIN_OFFICE,
    });

    expect(host).toBe(MAIN_OFFICE);
  });

  it('keeps the ambient value while the accessible list is still loading', () => {
    const host = resolveHostInstitutionId({
      hostOverride: null,
      institutions: [],
      ambientInstitutionId: MAIN_OFFICE,
    });

    expect(host).toBe(MAIN_OFFICE);
  });

  it('an explicit choice wins over everything', () => {
    const host = resolveHostInstitutionId({
      hostOverride: DENTAL,
      institutions: [{ id: MAIN_OFFICE }, { id: PHARMACY }],
      ambientInstitutionId: MAIN_OFFICE,
    });

    expect(host).toBe(DENTAL);
  });

  it('reports no host when the user can host nowhere at all', () => {
    const host = resolveHostInstitutionId({
      hostOverride: null,
      institutions: [],
      ambientInstitutionId: '',
    });

    expect(host).toBe('');
  });
});
