// lib/utils/compress-image.ts
// Canvas-based client-side image compression for Family Moments uploads.
// Phone camera photos arrive at 3-5MB; the card only needs ~1200px JPEG.
// Keeps storage usage flat (~300KB/image) without any new dependency.

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('Image compression failed');
  return blob;
}
