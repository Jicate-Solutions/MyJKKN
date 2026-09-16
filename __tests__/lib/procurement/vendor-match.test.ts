import { describe, it, expect } from 'vitest';
import { matchVendor, normalizeGstin, normalizeVendorName } from '@/lib/procurement/vendor-match';

const vendors = [
  { id: 'a', name: 'Jothi Computers Pvt. Ltd.', gstin: '33ABCDE1234F1Z5', phone: '+91 98765 43210' },
  { id: 'b', name: 'Sri Murugan Traders', gstin: null, phone: '0424-2261234' },
  { id: 'c', name: 'Global Chemicals', gstin: null, phone: null },
];

describe('matchVendor', () => {
  it('matches on GSTIN regardless of spacing and case', () => {
    expect(matchVendor({ name: 'Anything', gstin: '33abcde 1234 f1z5' }, vendors)).toEqual({
      vendor: vendors[0],
      by: 'gstin',
    });
  });

  it('treats an unknown GSTIN as a new vendor even when the name looks familiar', () => {
    expect(matchVendor({ name: 'Jothi Computers', gstin: '33ZZZZZ9999Z1Z9' }, vendors)).toBeNull();
  });

  it('falls back to the last 10 phone digits', () => {
    expect(matchVendor({ name: 'SMT', phone: '9876543210' }, vendors)?.vendor.id).toBe('a');
  });

  it('matches names ignoring legal suffixes and punctuation', () => {
    expect(matchVendor({ name: 'M/s. JOTHI COMPUTERS PRIVATE LIMITED' }, vendors)).toEqual({
      vendor: vendors[0],
      by: 'name',
    });
  });

  it('does not guess when two suppliers share a normalised name', () => {
    const dupes = [...vendors, { id: 'd', name: 'Global Chemicals Ltd', gstin: null, phone: null }];
    expect(matchVendor({ name: 'Global Chemicals' }, dupes)).toBeNull();
  });

  it('returns null with nothing to go on', () => {
    expect(matchVendor(null, vendors)).toBeNull();
    expect(matchVendor({ name: 'ab' }, vendors)).toBeNull();
  });
});

describe('normalizers', () => {
  it('rejects malformed GSTINs', () => {
    expect(normalizeGstin('12345')).toBeNull();
  });
  it('keeps meaningful words in names', () => {
    expect(normalizeVendorName('Sri Murugan & Co.')).toBe('srimurugan');
  });
});
