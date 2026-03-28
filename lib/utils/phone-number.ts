/**
 * Indian phone number normalization utilities for Exotel telephony integration.
 * Handles all common Indian phone number formats and converts between them.
 */

/**
 * Normalizes any Indian phone number format to E.164 format (+91XXXXXXXXXX).
 *
 * Handles the following input formats:
 * - 10-digit:          9876543210
 * - 0-prefixed:        09876543210
 * - 91-prefixed:       919876543210
 * - 0091-prefixed:     00919876543210
 * - +91-prefixed:      +919876543210
 * - Spaces/dashes:     +91 98765 43210, 98765-43210
 *
 * Returns the input as-is if it cannot be recognized as an Indian number
 * (e.g. international numbers from other countries).
 */
export function normalizeIndianPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return phone;
  }

  // Strip all non-digit characters except a leading +
  const hasLeadingPlus = phone.trimStart().startsWith('+');
  const digitsOnly = phone.replace(/\D/g, '');

  // +91XXXXXXXXXX → already E.164 digits = 12 digits starting with 91
  if (hasLeadingPlus && digitsOnly.startsWith('91') && digitsOnly.length === 12) {
    return `+${digitsOnly}`;
  }

  // 0091XXXXXXXXXX → 14 digits starting with 0091
  if (digitsOnly.startsWith('0091') && digitsOnly.length === 14) {
    return `+${digitsOnly.slice(2)}`; // strip leading 00
  }

  // 91XXXXXXXXXX → 12 digits starting with 91
  if (digitsOnly.startsWith('91') && digitsOnly.length === 12) {
    return `+${digitsOnly}`;
  }

  // 0XXXXXXXXXX → 11 digits starting with 0
  if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
    return `+91${digitsOnly.slice(1)}`;
  }

  // XXXXXXXXXX → bare 10-digit number
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  // Cannot recognize — return original value unchanged
  return phone;
}

/**
 * Converts any Indian phone number format to Exotel's expected format: 0XXXXXXXXXX.
 *
 * Exotel requires an 11-digit number with a leading zero (STD trunk prefix).
 * Normalizes to E.164 first, then strips the +91 prefix and prepends 0.
 */
export function toExotelFormat(phone: string): string {
  const normalized = normalizeIndianPhone(phone);

  // Only convert if we have a valid E.164 Indian number
  if (normalized.startsWith('+91') && normalized.length === 13) {
    return `0${normalized.slice(3)}`;
  }

  // Return as-is if not recognizable as Indian E.164
  return normalized;
}

/**
 * Masks a phone number for safe logging, showing only the country prefix
 * and last 4 digits.
 *
 * Examples:
 * - +919876543210 → +91****3210
 * - 09876543210   → +91****3210 (normalizes first)
 * - 9876543210    → +91****3210 (normalizes first)
 * - short/invalid → ****
 */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return '****';
  }

  const normalized = normalizeIndianPhone(phone);

  // If normalization produced a valid E.164 Indian number
  if (normalized.startsWith('+91') && normalized.length === 13) {
    const last4 = normalized.slice(-4);
    return `+91****${last4}`;
  }

  // Generic masking for other formats: show last 4 only
  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly.length < 4) {
    return '****';
  }

  return `****${digitsOnly.slice(-4)}`;
}

/**
 * Validates whether a string is a valid Indian mobile number.
 *
 * Rules:
 * - Normalizes the input to E.164 first (+91XXXXXXXXXX)
 * - Must be exactly 13 characters in E.164 form
 * - The 10-digit subscriber number must start with 6, 7, 8, or 9
 *   (TRAI-assigned mobile number series)
 */
export function isValidIndianMobile(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  const normalized = normalizeIndianPhone(phone);

  // Must match +91 followed by exactly 10 digits starting with 6-9
  return /^\+91[6-9]\d{9}$/.test(normalized);
}
