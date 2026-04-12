/**
 * Document Generation Engine — Brand Utilities
 * Shared color, image, QR code, and verification code helpers
 */

// JKKN Brand defaults (from existing certificate-pdf.ts lines 14-19)
export const DEFAULT_COLORS = {
  primary: { r: 11, g: 109, b: 65 },    // JKKN Green #0b6d41
  secondary: { r: 255, g: 222, b: 89 },  // JKKN Yellow #ffde59
  background: { r: 251, g: 251, b: 238 }, // JKKN Cream #fbfbee
  darkText: { r: 30, g: 30, b: 30 },
  mutedText: { r: 100, g: 100, b: 100 },
  white: { r: 255, g: 255, b: 255 },
} as const;

export type RGBColor = { r: number; g: number; b: number };

/**
 * Convert hex color string to RGB object
 * Handles both '#0b6d41' and '0b6d41' formats
 */
export function hexToRgb(hex: string): RGBColor {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

/**
 * Convert RGB to hex string
 */
export function rgbToHex(color: RGBColor): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/**
 * Fetch an image URL and return as base64 data URL
 * Returns empty string on any failure (CORS, 404, timeout)
 * This is critical — generators must never crash on missing images
 */
export async function fetchImageAsDataUrl(url: string): Promise<string> {
  if (!url) return '';
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    const blob = await response.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/**
 * Generate a QR code as data URL using the qrcode library
 * Uses JKKN brand colors by default (green on cream)
 * Matches pattern from certificate-pdf.ts lines 172-191
 */
export async function generateQRDataUrl(
  text: string,
  options?: { darkColor?: string; lightColor?: string; width?: number }
): Promise<string> {
  try {
    const QRCode = await import('qrcode');
    return await QRCode.toDataURL(text, {
      width: options?.width ?? 200,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: options?.darkColor ?? '#0b6d41',
        light: options?.lightColor ?? '#fbfbee',
      },
    });
  } catch {
    return '';
  }
}

/**
 * Generate an 8-character alphanumeric verification code
 * Uses crypto.getRandomValues for better randomness
 */
export function generateVerificationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed I/1/O/0 to avoid confusion
  const values = new Uint8Array(8);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

/**
 * Build the public verification URL for a document
 */
export function buildVerificationUrl(code: string): string {
  return `https://jkkn.ai/documents/verify/${code}`;
}

/**
 * Format a date string to Indian format: DD/MM/YYYY
 */
export function formatDateIndian(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

/**
 * Format a date string to long format: 12th April 2026
 */
export function formatDateLong(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

/**
 * Get full name from first and last name
 */
export function getFullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'N/A';
}
