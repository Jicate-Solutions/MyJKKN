/**
 * BoS letterhead assets — per-institution seal + principal signature.
 *
 * Backed by bos_letterhead_assets (20260729120000). Both images are stored as
 * base64 `data:` URIs so the Puppeteer call-letter render can paint them with
 * no network fetch (see the migration header for why storage URLs don't work
 * inside `page.setContent()`).
 *
 * Reads go through the SERVICE-ROLE client on purpose. The table's SELECT
 * policy requires `academic.bos-compositions.view` on the institution, but a
 * plain board member previewing their own call letter may not hold that key —
 * they'd silently get an unsigned PDF. The payload is pure branding (a seal and
 * a signature image already printed on every letter the member receives), so
 * bypassing RLS here leaks nothing; the surrounding routes still enforce their
 * own BoS authorization before rendering anything.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { InstitutionPdfHeader } from '@/lib/utils/internal-marks/institution-header';

export interface BosLetterheadAssets {
  seal_image: string | null;
  signature_image: string | null;
}

const EMPTY: BosLetterheadAssets = { seal_image: null, signature_image: null };

/** Fetch the active seal/signature row for an institution. Never throws. */
export async function fetchBosLetterheadAssets(
  institutionsId: string | null | undefined,
): Promise<BosLetterheadAssets> {
  if (!institutionsId) return EMPTY;
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('bos_letterhead_assets')
      .select('seal_image, signature_image')
      .eq('institutions_id', institutionsId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      // Missing table (migration not applied yet) or any transient failure must
      // degrade to an unsigned letter, never to a 500 on the PDF route.
      console.warn('[bos/letterhead-assets] lookup failed:', error.message);
      return EMPTY;
    }
    return {
      seal_image: (data as BosLetterheadAssets | null)?.seal_image ?? null,
      signature_image: (data as BosLetterheadAssets | null)?.signature_image ?? null,
    };
  } catch (e) {
    console.warn('[bos/letterhead-assets] lookup threw:', e);
    return EMPTY;
  }
}

/**
 * Overlay the DB-managed assets onto a static institution header config.
 * DB wins when present; otherwise the hardcoded /public path (if the
 * institution has one) is kept, so Arts & Science keeps working untouched.
 *
 * `urlToBase64` in the call-letter renderer passes `data:` URIs straight
 * through, so a stored data URI needs no further processing.
 */
export function withLetterheadAssets(
  header: InstitutionPdfHeader,
  assets: BosLetterheadAssets,
): InstitutionPdfHeader {
  return {
    ...header,
    sealImage: assets.seal_image ?? header.sealImage,
    signImage: assets.signature_image ?? header.signImage,
  };
}
