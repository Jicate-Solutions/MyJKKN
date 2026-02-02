'use client';

/**
 * Satisfaction Rating Component
 * F004: Grievance Ticketing System
 *
 * 1-5 star rating input with optional feedback textarea
 */

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';

interface SatisfactionRatingProps {
  value?: number;
  feedback?: string;
  onChange?: (rating: number, feedback?: string) => void;
  disabled?: boolean;
  showFeedback?: boolean;
  required?: boolean;
}

export function SatisfactionRating({
  value = 0,
  feedback = '',
  onChange,
  disabled = false,
  showFeedback = true,
  required = false
}: SatisfactionRatingProps) {
  const [rating, setRating] = useState(value);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState(feedback);

  const handleRatingChange = (newRating: number) => {
    if (disabled) return;
    setRating(newRating);
    onChange?.(newRating, feedbackText);
  };

  const handleFeedbackChange = (text: string) => {
    setFeedbackText(text);
    onChange?.(rating, text);
  };

  const getRatingLabel = (rating: number) => {
    switch (rating) {
      case 1:
        return 'Very Dissatisfied';
      case 2:
        return 'Dissatisfied';
      case 3:
        return 'Neutral';
      case 4:
        return 'Satisfied';
      case 5:
        return 'Very Satisfied';
      default:
        return 'Rate your experience';
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rating">
          Satisfaction Rating {required && <span className="text-red-500">*</span>}
        </Label>

        {/* Star Rating */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => handleRatingChange(star)}
                onMouseEnter={() => !disabled && setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                disabled={disabled}
                className={`transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-110'}`}
              >
                <Star
                  className={`h-8 w-8 ${
                    (hoverRating || rating) >= star
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'fill-gray-200 text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Rating Label */}
          <span className="text-sm text-muted-foreground ml-2">
            {getRatingLabel(hoverRating || rating)}
          </span>
        </div>

        {/* Rating Description */}
        <p className="text-xs text-muted-foreground">
          Click on the stars to rate your satisfaction with the resolution
        </p>
      </div>

      {/* Feedback Textarea */}
      {showFeedback && (
        <div className="space-y-2">
          <Label htmlFor="feedback">Additional Feedback (Optional)</Label>
          <Textarea
            id="feedback"
            placeholder="Share your thoughts on how we handled your grievance..."
            value={feedbackText}
            onChange={(e) => handleFeedbackChange(e.target.value)}
            disabled={disabled}
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Your feedback helps us improve our service quality
          </p>
        </div>
      )}
    </div>
  );
}

// Display-only rating component
interface SatisfactionDisplayProps {
  rating: number;
  feedback?: string;
  className?: string;
}

export function SatisfactionDisplay({ rating, feedback, className = '' }: SatisfactionDisplayProps) {
  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'text-green-600';
    if (rating >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`h-5 w-5 ${
                rating >= star ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-300'
              }`}
            />
          ))}
        </div>
        <span className={`font-medium ${getRatingColor(rating)}`}>
          {rating}/5
        </span>
      </div>

      {feedback && (
        <div className="rounded-lg bg-muted p-3">
          <p className="text-sm text-muted-foreground italic">{feedback}</p>
        </div>
      )}
    </div>
  );
}
