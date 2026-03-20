'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  fallbackClassName?: string;
}

export function OptimizedImage({
  src,
  alt,
  width = 200,
  height = 200,
  className,
  objectFit = 'cover',
  fallbackClassName
}: OptimizedImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  // Reset the error state if src changes
  useEffect(() => {
    if (!src) {
      setError(true);
      setLoading(false);
      return;
    }

    console.log('OptimizedImage: Loading image from source:', src);
    setImgSrc(src);
    setError(false);
    setLoading(true);
  }, [src]);

  if (!imgSrc || error) {
    // Display fallback UI for empty src or error
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-muted',
          className,
          fallbackClassName
        )}
      >
        <User className='h-12 w-12 text-muted-foreground' />
        <span className='text-xs text-muted-foreground mt-2'>
          {error ? 'Failed to load' : 'No image'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        loading && 'animate-pulse bg-muted',
        className
      )}
    >
      <Image
        src={imgSrc}
        alt={alt}
        width={width}
        height={height}
        className={cn(
          'transition-opacity duration-300',
          loading ? 'opacity-0' : 'opacity-100',
          objectFit === 'contain' && 'object-contain',
          objectFit === 'cover' && 'object-cover',
          objectFit === 'fill' && 'object-fill'
        )}
        onLoadingComplete={() => {
          console.log('OptimizedImage: Image loaded successfully:', imgSrc);
          setLoading(false);
        }}
        onError={() => {
          console.error(`OptimizedImage: Failed to load image:`, imgSrc);
          setError(true);
          setLoading(false);
        }}
        unoptimized={true}
        referrerPolicy='no-referrer'
      />
    </div>
  );
}
