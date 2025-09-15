'use client';

import { useState } from 'react';
import { Target, User } from 'lucide-react';
import Image from 'next/image';

interface StudentAvatarProps {
  photoUrl?: string;
  studentName: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StudentAvatar({
  photoUrl,
  studentName,
  size = 'md',
  className = ''
}: StudentAvatarProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);


  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-16 h-16',
    lg: 'w-24 h-24'
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  // Get initials from student name for fallback
  const getInitials = (name: string) => {
    const names = name.trim().split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return names[0]?.[0]?.toUpperCase() || 'S';
  };

  const shouldShowImage = photoUrl && !imageError;

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {shouldShowImage ? (
        <>
          <Image
            src={photoUrl}
            alt={`${studentName} profile picture`}
            className={`
              ${sizeClasses[size]}
              object-cover rounded-full border-2 border-blue-200
              ${imageLoaded ? 'opacity-100' : 'opacity-0'}
              transition-opacity duration-300
            `}
            onLoad={handleImageLoad}
            onError={handleImageError}
            loading='lazy'
            fill
          />
          {!imageLoaded && (
            <div
              className={`
              ${sizeClasses[size]}
              bg-gray-200 rounded-full flex items-center justify-center absolute inset-0
              animate-pulse
            `}
            >
              <div className='text-gray-400 text-xs'>Loading...</div>
            </div>
          )}
        </>
      ) : (
        <div
          className={`
          ${sizeClasses[size]}
          bg-gradient-to-br from-blue-100 to-blue-200
          rounded-full flex items-center justify-center
          border-2 border-blue-300
        `}
        >
          {studentName ? (
            <span
              className={`
              font-semibold text-blue-700
              ${
                size === 'sm'
                  ? 'text-xs'
                  : size === 'md'
                  ? 'text-sm'
                  : 'text-lg'
              }
            `}
            >
              {getInitials(studentName)}
            </span>
          ) : (
            <User className={`text-blue-600 ${iconSizes[size]}`} />
          )}
        </div>
      )}

      {/* Status indicator - can be used for online/offline status */}
      {/* <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></div> */}
    </div>
  );
}
