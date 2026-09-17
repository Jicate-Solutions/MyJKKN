// File: lib/onemark/assets/constants.ts
//
// OneMark — the one place that says what a question picture may be.
//
// Wave 3 Lane D. The bucket and its storage policies belong to Lane S3 item 5
// (`onemark-question-assets`, private, 2 MB per object); this file is the
// application-side half of the same contract, so a route, a test and the PDF
// loader all read the same numbers.
//
// asset_type is CONSTRAINED BY THE DATABASE: migration 20260917111500 declares
//   CHECK (asset_type IN ('svg', 'png', 'katex_block'))
// so a JPEG has nowhere honest to be stored. It is refused with a message that
// names the constraint rather than being written as a mislabelled 'png'.

import type { OneMarkAssetType } from '@/types/onemark';

/** Lane S3 item 5. Private — a learner only ever receives a signed URL. */
export const ONEMARK_ASSET_BUCKET = 'onemark-question-assets';

/** Lane S3 item 5: max 2 MB per object. */
export const ONEMARK_ASSET_MAX_BYTES = 2 * 1024 * 1024;

/** How long a learner's read link lives (Lane D item 3). */
export const ONEMARK_ASSET_SIGNED_URL_TTL_SECONDS = 60;

/** Attaching, editing and removing a picture (ruling #4 — any author may
 *  attach, and the approver still ticks the item). */
export const ONEMARK_ASSET_WRITE_PERMISSION = 'foundation.items.manage';

/** Seeing a picture inside a sitting. */
export const ONEMARK_ASSET_READ_PERMISSION = 'foundation.practice.take';

/** The two image kinds the asset_type CHECK constraint can hold. */
export const ONEMARK_UPLOADABLE_ASSET_TYPES = ['png', 'svg'] as const;
export type OneMarkUploadableAssetType = (typeof ONEMARK_UPLOADABLE_ASSET_TYPES)[number];

export const ONEMARK_ASSET_MIME: Record<OneMarkUploadableAssetType, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
};

export const ONEMARK_ASSET_EXTENSION: Record<OneMarkUploadableAssetType, string> = {
  png: 'png',
  svg: 'svg',
};

/** Alt text is MANDATORY (ruling #4). One or two characters is not a
 *  description of a circuit; four is the shortest thing that could be. */
export const ONEMARK_ALT_TEXT_MIN_LENGTH = 4;
export const ONEMARK_ALT_TEXT_MAX_LENGTH = 500;

/** What each accepted content type maps to. Anything else — JPEG included —
 *  is refused by name. */
export function uploadableTypeForMime(mime: string): OneMarkUploadableAssetType | null {
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/svg+xml' || m === 'image/svg') return 'svg';
  return null;
}

/** The content type a stored object should be served with, from its path. */
export function mimeForStoragePath(path: string): string {
  return /\.svg$/i.test(path) ? ONEMARK_ASSET_MIME.svg : ONEMARK_ASSET_MIME.png;
}

export function isUploadableAssetType(t: OneMarkAssetType | string): t is OneMarkUploadableAssetType {
  return (ONEMARK_UPLOADABLE_ASSET_TYPES as readonly string[]).includes(t);
}
