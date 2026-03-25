'use client';

import { cn } from '@/lib/utils';
import { LucideIcon, User } from 'lucide-react';
import Image from 'next/image';

// Fields that contain image URLs
const IMAGE_FIELDS = ['student_photo_url', 'profile_image', 'photo_url', 'image_url'];

// Fields that contain marks data
const MARKS_FIELDS = ['tenth_marks', 'twelfth_marks', '10th_marks', '12th_marks'];

interface InfoFieldProps {
  label: string;
  value: any;
  className?: string;
  isChanged?: boolean;
  icon?: LucideIcon;
  fieldName?: string;
}

export function InfoField({ label, value, className, isChanged, icon: Icon, fieldName }: InfoFieldProps) {
  // Check if this is an image field
  const isImageField = fieldName
    ? (IMAGE_FIELDS.includes(fieldName) || fieldName.toLowerCase().includes('photo') || fieldName.toLowerCase().includes('image'))
    : false;

  // Check if this is a marks field
  const isMarksField = fieldName
    ? (MARKS_FIELDS.includes(fieldName) || fieldName.toLowerCase().includes('marks'))
    : false;

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return 'Not provided';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') {
      try {
        if (val instanceof Date) return val.toLocaleDateString();
        return JSON.stringify(val, null, 2);
      } catch (e) {
        return String(val);
      }
    }
    return String(val);
  };

  const displayValue = formatValue(value);
  const isProvided = value !== null && value !== undefined && value !== '';

  // Render image for image fields
  const renderImageValue = () => {
    if (!isProvided) {
      return (
        <div className="flex items-center gap-2 py-2">
          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center border">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground italic">No image</span>
        </div>
      );
    }

    return (
      <div className="py-2">
        <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-background shadow-sm">
          <Image
            src={value}
            alt={label}
            fill
            className="object-cover"
            sizes="80px"
          />
        </div>
      </div>
    );
  };

  // Render marks in a better format
  const renderMarksValue = () => {
    if (!isProvided || typeof value !== 'object') {
      return (
        <span className="text-sm text-muted-foreground italic">Not provided</span>
      );
    }

    const { max_marks, obtained_marks, percentage, group, subjects } = value;

    // Get subjects with actual values (non-empty)
    const subjectEntries = subjects
      ? Object.entries(subjects).filter(([_, val]) => val && val !== '')
      : [];

    // Format subject name for display
    const formatSubjectName = (name: string) => {
      return name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    return (
      <div className="space-y-2 text-sm">
        {/* Summary row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {group && (
            <span className={cn(isChanged && 'text-green-600 dark:text-green-400 font-semibold')}>
              <span className="text-muted-foreground">Group:</span>{' '}
              <span className="font-medium">{group.toUpperCase()}</span>
            </span>
          )}
          {obtained_marks && max_marks && (
            <span className={cn(isChanged && 'text-green-600 dark:text-green-400 font-semibold')}>
              <span className="text-muted-foreground">Marks:</span>{' '}
              <span className="font-medium">{obtained_marks}/{max_marks}</span>
            </span>
          )}
          {percentage && (
            <span className={cn(isChanged && 'text-green-600 dark:text-green-400 font-semibold')}>
              <span className="text-muted-foreground">Percentage:</span>{' '}
              <span className="font-medium">{percentage}%</span>
            </span>
          )}
        </div>

        {/* Subjects grid (for 12th marks) */}
        {subjectEntries.length > 0 && (
          <div className="pt-1">
            <p className="text-xs text-muted-foreground mb-1">Subjects:</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {subjectEntries.map(([subject, marks]) => (
                <div key={subject} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{formatSubjectName(subject)}:</span>
                  <span className={cn('font-medium', isChanged && 'text-green-600 dark:text-green-400')}>
                    {String(marks)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-2">
        {Icon && (
          <div className="flex-shrink-0">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <label className="text-sm font-medium text-muted-foreground">{label}</label>
      </div>
      {isImageField ? (
        renderImageValue()
      ) : isMarksField ? (
        renderMarksValue()
      ) : (
        <p
          className={cn(
            'text-sm font-medium break-words',
            isProvided ? 'text-foreground' : 'text-muted-foreground italic',
            isChanged && 'text-green-600 dark:text-green-400 font-semibold',
            Icon && 'ml-6'
          )}
        >
          {displayValue}
        </p>
      )}
    </div>
  );
}
