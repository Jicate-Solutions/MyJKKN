// lib/services/pde/strip-image-metadata.ts
// ============================================================================
// Browser-side metadata strip for clinical teaching images.
//
// Decoding to pixels and re-encoding through a canvas rebuilds the file from
// nothing but image data, so EXIF/GPS/IPTC/XMP cannot survive — the same
// property the PMS side gets from a sharp re-encode. It also normalises any
// format the browser can decode (PNG, WebP, HEIC on Safari) to JPEG, which is
// what the pde-clinical-images bucket accepts.
//
// This is a convenience, NOT the security boundary: /api/pde/cases/upload-image
// re-verifies the result server-side and fails closed.
// ============================================================================

const MAX_EDGE = 1920; // matches the PMS export's resize ceiling
const QUALITY = 0.85;

export interface StripResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Re-encode an image file to a metadata-free JPEG, capped at 1920px on its
 * longest edge. EXIF orientation is baked into the pixels (via
 * `imageOrientation: 'from-image'`) BEFORE the tag is dropped, so a
 * sideways-shot photo does not render rotated.
 *
 * Rejects with a human-readable Error the caller can surface directly.
 */
export async function stripImageMetadata(file: File): Promise<StripResult> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('That file could not be read as an image. Please choose a JPEG, PNG, or WebP.');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Your browser could not process this image. Try a different browser.');
  }
  // White backdrop: a transparent PNG would otherwise flatten to black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new Error('The image could not be converted. Please try a different file.');

  return { blob, width, height };
}
