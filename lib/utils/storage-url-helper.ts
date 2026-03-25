/**
 * Storage URL Helper
 *
 * Utilities for handling Supabase storage URLs,
 * especially for private buckets that require authentication.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Convert a public storage URL to an authenticated URL
 *
 * For private buckets, URLs need to use the authenticated endpoint
 * instead of the public endpoint.
 *
 * @param url - The storage URL (may contain /public/ or /authenticated/)
 * @returns URL with /authenticated/ path
 */
export function convertToAuthenticatedUrl(url: string): string {
  if (!url) return url;

  // Replace /public/ with /authenticated/
  return url.replace('/object/public/', '/object/authenticated/');
}

/**
 * Generate a signed URL for a private storage object
 *
 * Signed URLs are temporary URLs that work for a limited time (default: 1 hour)
 * and don't require the user to be logged in.
 *
 * @param bucketName - The storage bucket name
 * @param filePath - The path to the file within the bucket
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Promise with signed URL or null if error
 */
export async function generateSignedUrl(
  bucketName: string,
  filePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error('[storage-url-helper] Failed to generate signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('[storage-url-helper] Error generating signed URL:', error);
    return null;
  }
}

/**
 * Extract the file path from a Supabase storage URL
 *
 * Extracts the path after the bucket name from a full storage URL.
 *
 * Example:
 * Input: https://xxx.supabase.co/storage/v1/object/public/bucket-name/folder/file.jpg
 * Output: folder/file.jpg
 *
 * @param url - Full Supabase storage URL
 * @param bucketName - The bucket name to extract path from
 * @returns File path within the bucket
 */
export function extractFilePathFromUrl(url: string, bucketName: string): string {
  if (!url) return '';

  // Match pattern: /object/(public|authenticated)/bucket-name/[path]
  const pattern = new RegExp(`/object/(public|authenticated)/${bucketName}/(.+)$`);
  const match = url.match(pattern);

  if (match && match[2]) {
    return decodeURIComponent(match[2]);
  }

  return '';
}

/**
 * Get the public URL for a storage object
 *
 * For public buckets only! Use convertToAuthenticatedUrl or generateSignedUrl for private buckets.
 *
 * @param bucketName - The storage bucket name
 * @param filePath - The path to the file within the bucket
 * @returns Public URL
 */
export function getPublicUrl(bucketName: string, filePath: string): string {
  const supabase = createClientSupabaseClient();

  const { data } = supabase.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  return data.publicUrl;
}
