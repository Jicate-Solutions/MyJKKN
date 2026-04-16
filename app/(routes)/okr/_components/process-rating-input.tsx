'use client';

// ============================================================================
// Process Rating Input Component
// 1-5 star rating for evaluating the quality of the process
// ============================================================================

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PROCESS_RATING_LABELS } from '@/types/okr';
import { useUpdateProcessRating } from '@/hooks/okr/use-key-results';

interface ProcessRatingInputProps {
  keyResultId: string;
  currentRating: number | null;
  currentNotes: string | null;
  onSuccess?: () => void;
  compact?: boolean;
}

export function ProcessRatingInput({
  keyResultId,
  currentRating,
  currentNotes,
  onSuccess,
  compact = false
}: ProcessRatingInputProps) {
  const [rating, setRating] = useState<number>(currentRating || 0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [notes, setNotes] = useState<string>(currentNotes || '');
  const [isOpen, setIsOpen] = useState(false);

  const updateRating = useUpdateProcessRating();

  const handleSave = async () => {
    if (rating < 1) return;

    await updateRating.mutateAsync({
      keyResultId,
      rating,
      notes: notes.trim() || undefined
    });

    setIsOpen(false);
    onSuccess?.();
  };

  const displayRating = hoverRating || rating;

  // Compact inline display
  if (compact && currentRating) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
          >
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={cn(
                    'h-3 w-3',
                    star <= currentRating
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-gray-300'
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              ({PROCESS_RATING_LABELS[currentRating]})
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <RatingForm
            rating={rating}
            setRating={setRating}
            hoverRating={hoverRating}
            setHoverRating={setHoverRating}
            displayRating={displayRating}
            notes={notes}
            setNotes={setNotes}
            onSave={handleSave}
            isPending={updateRating.isPending}
            onCancel={() => setIsOpen(false)}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={currentRating ? 'outline' : 'default'}
          size="sm"
          className={cn(
            'gap-2',
            !currentRating && 'bg-amber-500 hover:bg-amber-600'
          )}
        >
          <Star className={cn(
            'h-4 w-4',
            currentRating ? 'text-amber-400 fill-amber-400' : 'text-white'
          )} />
          {currentRating
            ? `Process: ${PROCESS_RATING_LABELS[currentRating]}`
            : 'Rate Process'
          }
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <RatingForm
          rating={rating}
          setRating={setRating}
          hoverRating={hoverRating}
          setHoverRating={setHoverRating}
          displayRating={displayRating}
          notes={notes}
          setNotes={setNotes}
          onSave={handleSave}
          isPending={updateRating.isPending}
          onCancel={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

// Internal form component
function RatingForm({
  rating,
  setRating,
  hoverRating,
  setHoverRating,
  displayRating,
  notes,
  setNotes,
  onSave,
  isPending,
  onCancel
}: {
  rating: number;
  setRating: (r: number) => void;
  hoverRating: number;
  setHoverRating: (r: number) => void;
  displayRating: number;
  notes: string;
  setNotes: (n: string) => void;
  onSave: () => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Rate the Process Quality</Label>
        <p className="text-xs text-muted-foreground mb-3">
          How well was the process executed, regardless of the result?
        </p>

        {/* Star Rating */}
        <div className="flex items-center justify-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className="p-1 transition-transform hover:scale-110 focus:outline-none"
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(star)}
            >
              <Star
                className={cn(
                  'h-8 w-8 transition-colors',
                  star <= displayRating
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-gray-300 hover:text-amber-200'
                )}
              />
            </button>
          ))}
        </div>

        {/* Rating Label */}
        <div className="text-center h-6">
          {displayRating > 0 && (
            <span className={cn(
              'text-sm font-medium px-3 py-1 rounded-full',
              displayRating >= 4 ? 'bg-emerald-100 text-emerald-700' :
              displayRating === 3 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            )}>
              {PROCESS_RATING_LABELS[displayRating]}
            </span>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label htmlFor="process-notes" className="text-sm font-medium">
          Notes (optional)
        </Label>
        <Textarea
          id="process-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What worked well? What could be improved?"
          className="mt-1.5 resize-none"
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={rating < 1 || isPending}
          className="bg-[#0b6d41] hover:bg-[#095432]"
        >
          {isPending ? 'Saving...' : 'Save Rating'}
        </Button>
      </div>
    </div>
  );
}

export default ProcessRatingInput;
