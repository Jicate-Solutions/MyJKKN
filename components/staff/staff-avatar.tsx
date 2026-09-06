'use client';

/**
 * StaffAvatar — robust staff profile photo display.
 *
 * Problem (BUG-003950): profile_picture URLs stored via getPublicUrl() return
 * 403 when the staff-images bucket is private. Radix AvatarImage silently
 * falls back to AvatarFallback, so photos appear missing.
 *
 * Fix: try the stored URL first; on error, generate a signed URL via
 * Supabase Storage and retry. The signed URL is cached in component state
 * so subsequent renders don't re-fetch.
 */

import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface StaffAvatarProps {
  src: string | null | undefined;
  firstName: string;
  lastName: string;
  className?: string;
  fallbackClassName?: string;
}

const BUCKET = 'staff-images';

/**
 * Extract the file path from a Supabase Storage public URL.
 * Returns null if the URL isn't a staff-images public URL.
 */
function extractStoragePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Pattern: /storage/v1/object/public/staff-images/<path>
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

export function StaffAvatar({
  src,
  firstName,
  lastName,
  className,
  fallbackClassName,
}: StaffAvatarProps) {
  const initials = `${(firstName || '?').charAt(0)}${(lastName || '?').charAt(0)}`.toUpperCase();

  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(
    src || undefined
  );
  const [tried, setTried] = useState(false);

  // Reset when the source prop changes (e.g., navigating between staff)
  useEffect(() => {
    setResolvedSrc(src || undefined);
    setTried(false);
  }, [src]);

  const handleError = useCallback(async () => {
    // Only try the signed-URL fallback once
    if (tried || !src) return;
    setTried(true);

    const path = extractStoragePath(src);
    if (!path) return; // Not a Supabase storage URL — nothing we can do

    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600); // 1 hour

      if (!error && data?.signedUrl) {
        setResolvedSrc(data.signedUrl);
      }
    } catch {
      // Signed URL also failed — stay on fallback
    }
  }, [src, tried]);

  return (
    <Avatar className={className}>
      {resolvedSrc && (
        <AvatarImage
          src={resolvedSrc}
          alt={`${firstName} ${lastName}`}
          onLoadingStatusChange={(status) => {
            if (status === 'error') {
              handleError();
            }
          }}
        />
      )}
      <AvatarFallback className={cn('text-xs', fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
