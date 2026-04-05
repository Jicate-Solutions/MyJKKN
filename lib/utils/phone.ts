// lib/utils/phone.ts
// Phone number normalization utility for MyJKKN.
// Standard: E.164 format (+919150621922)
//
// Usage:
//   import { normalizePhone, formatPhoneDisplay, phonesMatch } from '@/lib/utils/phone';
//   normalizePhone('09150621922')       → '+919150621922'
//   normalizePhone('+919150621922')     → '+919150621922'
//   normalizePhone('9150621922')        → '+919150621922'
//   normalizePhone('+14155551234')      → '+14155551234'  (international preserved)
//   formatPhoneDisplay('+919150621922') → '91506 21922'
//   phonesMatch('09150621922', '+919150621922') → true

/**
 * Normalize a phone number to E.164 format.
 * - Indian numbers (10 digits, starting with 6-9) → +91XXXXXXXXXX
 * - Already E.164 (+XX...) → preserved as-is
 * - Numbers with 91 prefix → +91XXXXXXXXXX
 * - Landlines with STD code (044...) → +9104XXXXXXXXX
 * - Returns original if can't normalize (better to store something than nothing)
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';

  // Strip spaces, dashes, dots, parentheses
  let cleaned = phone.replace(/[\s\-\.\(\)]/g, '');

  // Already E.164
  if (cleaned.startsWith('+') && cleaned.length >= 10) {
    return cleaned;
  }

  // Strip leading 00 (international dialing prefix)
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  // Indian mobile: starts with 6/7/8/9 and is 10 digits
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // Indian mobile with leading 0: 0XXXXXXXXXX (11 digits)
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned.slice(1)}`;
  }

  // Indian mobile with 91 prefix: 91XXXXXXXXXX (12 digits)
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Indian landline with STD code: 0XX-XXXXXXXX (starts with 0, 10-11 digits)
  if (/^0[1-5]\d{8,10}$/.test(cleaned)) {
    return `+91${cleaned.slice(1)}`;
  }

  // Looks like it has a country code already (starts with 1-9, length > 10)
  if (/^[1-9]\d{9,14}$/.test(cleaned) && cleaned.length > 10) {
    return `+${cleaned}`;
  }

  // Can't determine format — return with + prefix if long enough
  if (cleaned.length >= 10) {
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  // Too short or unrecognizable — return as-is
  return cleaned;
}

/**
 * Extract the last 10 digits from a phone number (for matching).
 * Useful for comparing phones stored in different formats.
 */
export function phoneLastDigits(phone: string | null | undefined, digits: number = 10): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.slice(-digits);
}

/**
 * Check if two phone numbers are the same person.
 * Compares by normalizing both to E.164, then falls back to last-10-digits match.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;

  // Try E.164 match first
  const normA = normalizePhone(a);
  const normB = normalizePhone(b);
  if (normA === normB) return true;

  // Fallback: last 10 digits
  const lastA = phoneLastDigits(a);
  const lastB = phoneLastDigits(b);
  return lastA.length >= 10 && lastA === lastB;
}

/**
 * Format a phone number for display (Indian format).
 * +919150621922 → 91506 21922
 * +14155551234  → +1 415 555 1234
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';

  const normalized = normalizePhone(phone);

  // Indian mobile: +91XXXXXXXXXX
  if (/^\+91[6-9]\d{9}$/.test(normalized)) {
    const num = normalized.slice(3); // Remove +91
    return `${num.slice(0, 5)} ${num.slice(5)}`;
  }

  // Indian landline: +91XXXXXXXXXXXX
  if (/^\+91[1-5]\d{8,10}$/.test(normalized)) {
    const num = normalized.slice(3);
    return `0${num}`; // Display with STD code
  }

  // International: show as +CC XXXX XXXX
  if (normalized.startsWith('+')) {
    return normalized;
  }

  return phone;
}

/**
 * Check if a phone number is Indian.
 */
export function isIndianPhone(phone: string | null | undefined): boolean {
  const normalized = normalizePhone(phone);
  return normalized.startsWith('+91');
}

/**
 * Check if a phone number is a mobile (not landline).
 */
export function isMobilePhone(phone: string | null | undefined): boolean {
  const normalized = normalizePhone(phone);
  // Indian mobile starts with +91[6-9]
  if (/^\+91[6-9]/.test(normalized)) return true;
  // International — assume mobile if we can't tell
  return normalized.startsWith('+') && !normalized.startsWith('+91');
}
