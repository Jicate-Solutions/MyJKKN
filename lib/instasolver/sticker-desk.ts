// lib/instasolver/sticker-desk.ts
// ============================================================================
// The central sticker desk — pure helpers for /api/instasolver/qr-stickers.
//
// Director ruling (1 Oct 2026): InstaSolver stickers are printed and stuck by
// ONE central team, JKKN Main Office, for every college. So the sticker page
// lets that team pick ANY college, and it keeps a list of rooms and items that
// still have no printed sticker.
//
// "Printed" is recorded in the resource's existing custom_attributes JSONB
// under STICKER_PRINTED_KEY — no new table, no migration.
// ============================================================================

import { randomBytes } from 'node:crypto';

/** custom_attributes key holding the ISO time the InstaSolver sticker was printed. */
export const STICKER_PRINTED_KEY = 'instasolver_sticker_printed_at';

/** Most rows one request may prepare or mark. */
export const MAX_STICKER_BATCH = 1000;

/**
 * True when an institutions.name is JKKN Main Office. Normalised compare,
 * the same rule as findUmbrellaRow (accreditation/naac/committees/_lib):
 * a renamed row or a stray space must not lock the central team out.
 */
export function isMainOfficeName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().replace(/\s+/g, ' ').toLowerCase();
  return n === 'jkkn main office' || n.includes('main office');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The printed time, or null when no InstaSolver sticker has been printed. */
export function stickerPrintedAt(customAttributes: unknown): string | null {
  if (!isPlainObject(customAttributes)) return null;
  const v = customAttributes[STICKER_PRINTED_KEY];
  return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * custom_attributes with the printed time added, every other key kept.
 * Returns null when the stored value is not an object (an array, a string):
 * adding a key would change its shape, so that row is left untouched and
 * reported instead.
 */
export function withStickerPrinted(customAttributes: unknown, atIso: string): Record<string, unknown> | null {
  if (customAttributes === null || customAttributes === undefined) return { [STICKER_PRINTED_KEY]: atIso };
  if (!isPlainObject(customAttributes)) return null;
  return { ...customAttributes, [STICKER_PRINTED_KEY]: atIso };
}

/** A new sticker code in the same shape qrCodeService writes: res_ + 16 hex. */
export function newStickerToken(): string {
  return `res_${randomBytes(8).toString('hex')}`;
}
