'use client';

import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Existing tags to suggest (distinct across staff). */
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Canonical tag form: trimmed, lowercased, internal whitespace collapsed.
 * Matches how the external API normalizes ?tags= so a tag set here is findable
 * there without case/spacing drift.
 */
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Free-form chip input for staff tags with reuse-suggestions.
 * - Type + Enter/comma to add; Backspace on empty input removes the last chip.
 * - Click a suggestion to add it. Suggestions exclude already-selected tags.
 * - Dedupe + normalize on add so stored tags stay consistent.
 *
 * Intentionally avoids Popover/cmdk: a plain input plus an absolutely-positioned
 * list (committed on `onMouseDown`, before the input blur) sidesteps the
 * focus-stealing/race issues nested overlays have caused elsewhere in the app.
 */
export function TagsInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Type a tag and press Enter…',
  disabled,
  id
}: TagsInputProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    setInput('');
    if (!tag) return;
    // Case-insensitive dedupe (tags are already lowercased, but be defensive).
    if (value.some((t) => t.toLowerCase() === tag)) return;
    onChange([...value, tag]);
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const filteredSuggestions = useMemo(() => {
    const q = normalizeTag(input);
    const selected = new Set(value.map((t) => t.toLowerCase()));
    return suggestions
      .filter((s) => !selected.has(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [suggestions, value, input]);

  const showDropdown = open && !disabled && filteredSuggestions.length > 0;

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="ml-0.5 rounded-full outline-none hover:text-destructive"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={input}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delay close so a suggestion's onMouseDown commits first.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          className="min-w-[8rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>

      {showDropdown && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {filteredSuggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                // onMouseDown (not onClick) fires before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(s);
                  inputRef.current?.focus();
                }}
                className="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
