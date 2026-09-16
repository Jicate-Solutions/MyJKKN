// lib/procurement/vendor-match.ts
//
// Match the vendor printed on a quotation PDF to a registered supplier, so the
// quotation page can select it instead of making someone create a duplicate.
//
// Order of trust: GSTIN (unique per business registration) > phone (last 10
// digits) > name (normalised). A weaker key only decides when a stronger one is
// absent from the PDF — a GSTIN on the PDF that matches nobody means a NEW
// vendor, even if some registered name looks similar.

export interface VendorCandidate {
  id: string;
  name: string;
  gstin?: string | null;
  phone?: string | null;
}

export interface ReadVendor {
  name?: string | null;
  gstin?: string | null;
  phone?: string | null;
}

export type VendorMatchKey = 'gstin' | 'phone' | 'name';

const GSTIN_RE = /^[0-9A-Z]{15}$/;

export function normalizeGstin(v: string | null | undefined): string | null {
  const s = (v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return GSTIN_RE.test(s) ? s : null;
}

export function normalizePhone(v: string | null | undefined): string | null {
  const digits = (v ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// Legal-form and filler words that vary between how a vendor writes its name
// and how someone typed it into the supplier master.
const NAME_NOISE = /\b(m\/s|messrs|pvt|private|ltd|limited|llp|co|company|the|and)\b/g;

export function normalizeVendorName(v: string | null | undefined): string | null {
  const s = (v ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,()]/g, ' ')
    .replace(NAME_NOISE, ' ')
    .replace(/[^a-z0-9]/g, '');
  return s.length >= 3 ? s : null;
}

export function matchVendor<T extends VendorCandidate>(
  read: ReadVendor | null | undefined,
  candidates: T[],
): { vendor: T; by: VendorMatchKey } | null {
  if (!read) return null;

  const gstin = normalizeGstin(read.gstin);
  if (gstin) {
    const hit = candidates.find((c) => normalizeGstin(c.gstin) === gstin);
    return hit ? { vendor: hit, by: 'gstin' } : null;
  }

  const phone = normalizePhone(read.phone);
  if (phone) {
    const hit = candidates.find((c) => normalizePhone(c.phone) === phone);
    if (hit) return { vendor: hit, by: 'phone' };
  }

  const name = normalizeVendorName(read.name);
  if (name) {
    const hits = candidates.filter((c) => normalizeVendorName(c.name) === name);
    // Two registered suppliers normalising to the same name: don't guess.
    if (hits.length === 1) return { vendor: hits[0], by: 'name' };
  }
  return null;
}
