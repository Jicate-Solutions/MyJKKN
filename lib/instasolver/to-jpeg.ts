// lib/instasolver/to-jpeg.ts
//
// Turns whatever photo someone picked — a gallery PNG, a screenshot, an iPhone
// HEIC the browser decodes, a 12 MB camera shot — into a JPEG the InstaSolver
// upload routes accept. The re-encode itself is the existing canvas helper
// (longest edge 1920px, quality 0.85, orientation baked in); this wrapper only
// names the file and replaces every failure with one plain sentence.

import { stripImageMetadata } from '@/lib/services/pde/strip-image-metadata';

export const PHOTO_UNREADABLE = "This photo couldn't be read — try another one.";

export async function toJpeg(file: File): Promise<File> {
  try {
    const { blob } = await stripImageMetadata(file);
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } catch {
    throw new Error(PHOTO_UNREADABLE);
  }
}
