'use client';

// ============================================================================
// ItemPicker — library-backed multi-select for menu cell editing.
// ============================================================================
// Used by `cell-edit-dialog.tsx`. Pulls from the 332-item library shipped in
// PR #1094 (Director audits via /admin/mess/library).
//
// UX flow:
//   1. Optional category filter (defaults to the cell's meal_type when supplied).
//   2. Debounced search input — hits ItemLibraryService.searchItems().
//   3. Results render with English + Tamil + dietary chips.
//   4. Clicking an item adds its Tamil string (or English fallback) to the
//      `selected` list above. Click again to remove. The picker is multi-select.
//
// On selection, the caller is responsible for:
//   • Updating items_tamil + items_english arrays.
//   • Calling useIncrementUsageCount() once per item picked (to drive the
//     library's "popular" sort).
// ============================================================================

import { useMemo, useState, useEffect } from 'react';
import { Search, Loader2, Plus, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useItemSearch } from '@/hooks/mess/use-item-library';
import {
  MESS_LIBRARY_CATEGORIES,
  type MessLibraryCategory,
  type MessMenuItemLibrary,
} from '@/types/mess-library';

interface PickedItem {
  /** Library row id — used for incrementing usage_count. */
  libraryId: string;
  tamil: string | null;
  english: string;
}

interface ItemPickerProps {
  /** Already-picked items (chips shown above the search box). */
  picked: PickedItem[];
  /** Called when caller should mutate the picked list (add/remove). */
  onPickedChange: (next: PickedItem[]) => void;
  /** Default category filter (cell's meal type). User can override. */
  defaultCategory?: MessLibraryCategory;
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function ItemPicker({ picked, onPickedChange, defaultCategory }: ItemPickerProps) {
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<MessLibraryCategory | 'any'>(defaultCategory ?? 'any');

  // Debounce the search query so we don't flood the library service on
  // every keystroke. 250ms matches the library admin browser cadence.
  const flushDebouncedQuery = useMemo(
    () => debounce((q: string) => setDebouncedQuery(q), 250),
    [],
  );
  useEffect(() => {
    flushDebouncedQuery(rawQuery);
  }, [rawQuery, flushDebouncedQuery]);

  const { data: results, isFetching } = useItemSearch(debouncedQuery, {
    category: category === 'any' ? undefined : category,
    limit: 20,
  });

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.libraryId)), [picked]);

  const handleAdd = (item: MessMenuItemLibrary) => {
    if (pickedIds.has(item.id)) return; // already in list
    onPickedChange([
      ...picked,
      { libraryId: item.id, tamil: item.name_tamil, english: item.name_english },
    ]);
  };

  const handleRemove = (libraryId: string) => {
    onPickedChange(picked.filter((p) => p.libraryId !== libraryId));
  };

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {picked.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <Badge key={p.libraryId} variant="secondary" className="gap-1 pr-1">
              <span className="text-sm">
                {p.tamil ? `${p.tamil}` : p.english}
                {p.tamil && p.english ? ` · ${p.english}` : ''}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(p.libraryId)}
                className="rounded-sm p-0.5 hover:bg-muted"
                aria-label={`Remove ${p.english}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No items selected yet.</p>
      )}

      {/* Search + category */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search library (English or Tamil)…"
            className="pl-8"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
          />
        </div>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as MessLibraryCategory | 'any')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any category</SelectItem>
            {MESS_LIBRARY_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      <div className="rounded-md border border-border max-h-64 overflow-auto">
        {!debouncedQuery.trim() ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Type to search the library.
          </p>
        ) : isFetching ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        ) : !results || results.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No matches. You can still type free-text items in the cell editor.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {results.map((item) => {
              const isPicked = pickedIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {item.name_english}
                      {item.name_tamil ? (
                        <span className="ml-2 text-muted-foreground">· {item.name_tamil}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {item.category}
                      </Badge>
                      {(item.dietary_tags ?? []).map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                      {item.needs_native_review ? (
                        <Badge variant="outline" className="text-[10px] text-amber-700">
                          needs-native-review
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isPicked ? 'secondary' : 'default'}
                    onClick={() => (isPicked ? handleRemove(item.id) : handleAdd(item))}
                  >
                    {isPicked ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export type { PickedItem };
