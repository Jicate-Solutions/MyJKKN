'use client';

// ============================================================================
// Item Library Browser — filters + table + edit dialog.
// Director-facing audit view for the 332-item Mess Menu library.
// ============================================================================

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import {
  useItemLibrary,
  useDeactivateItem,
  useReactivateItem,
  useMarkManyNativeReviewed,
} from '@/hooks/mess/use-item-library';
import {
  MESS_LIBRARY_CATEGORIES,
  type MessLibraryCategory,
  type MessLibrarySortOption,
  type MessMenuItemLibrary,
} from '@/types/mess-library';

import { ItemEditDialog } from './item-edit-dialog';

type ReviewFilter = 'any' | 'needs' | 'done';

const SORT_LABEL: Record<MessLibrarySortOption, string> = {
  popular: 'Most picked',
  newest: 'Newest first',
  alphabetical: 'A-Z (English)',
};

const CATEGORY_LABEL: Record<MessLibraryCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  tea: 'Tea / snacks',
  dinner: 'Dinner',
  sweet: 'Sweet',
  condiment: 'Condiment',
  beverage: 'Beverage',
  side: 'Side',
};

const PAGE_SIZE = 50;

export function ItemLibraryBrowser() {
  const { profile } = useAuth();
  const reviewerId = profile?.id ?? '';

  // ── filter state ──
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<MessLibraryCategory | 'all'>('all');
  const [review, setReview] = useState<ReviewFilter>('any');
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<MessLibrarySortOption>('alphabetical');
  const [page, setPage] = useState(1);

  // ── edit / create dialog state ──
  const [editing, setEditing] = useState<MessMenuItemLibrary | null>(null);
  const [creating, setCreating] = useState(false);

  // ── multi-select for bulk-review ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      category: category === 'all' ? undefined : category,
      needsNativeReview:
        review === 'needs' ? true : review === 'done' ? false : undefined,
      isActive: showArchived ? false : true,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, category, review, showArchived, sort, page]
  );

  const { data, isLoading, isFetching, isError, error, refetch } =
    useItemLibrary(filters);

  const deactivate = useDeactivateItem();
  const reactivate = useReactivateItem();
  const bulkReview = useMarkManyNativeReviewed();

  const items = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Selection helpers — only allow selecting visible rows.
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((i) => i.id));
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkReview = async () => {
    if (selectedIds.size === 0 || !reviewerId) return;
    await bulkReview.mutateAsync({
      ids: Array.from(selectedIds),
      reviewedBy: reviewerId,
    });
    clearSelection();
  };

  // Reset to page 1 whenever the filters narrow the result set.
  const onFilterChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
    clearSelection();
  };

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mess Menu Library</h1>
          <p className="text-sm text-muted-foreground">
            {total} item{total === 1 ? '' : 's'} in catalogue
            {isFetching && !isLoading ? ' — refreshing…' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleBulkReview}
              disabled={!reviewerId || bulkReview.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark {selectedIds.size} as reviewed
            </Button>
          )}
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add item
          </Button>
        </div>
      </div>

      {/* ── Filters row ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Search (English or Tamil)
          </label>
          <Input
            value={search}
            onChange={(e) => onFilterChange(setSearch)(e.target.value)}
            placeholder="idli, தோசை, sambar…"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Category
          </label>
          <Select
            value={category}
            onValueChange={(v) =>
              onFilterChange(setCategory)(v as MessLibraryCategory | 'all')
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {MESS_LIBRARY_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Review status
          </label>
          <Select
            value={review}
            onValueChange={(v) => onFilterChange(setReview)(v as ReviewFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="needs">Needs native review</SelectItem>
              <SelectItem value="done">Already reviewed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Sort by
          </label>
          <Select
            value={sort}
            onValueChange={(v) =>
              onFilterChange(setSort)(v as MessLibrarySortOption)
            }
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alphabetical">{SORT_LABEL.alphabetical}</SelectItem>
              <SelectItem value="popular">{SORT_LABEL.popular}</SelectItem>
              <SelectItem value="newest">{SORT_LABEL.newest}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1">
          <input
            id="show-archived"
            type="checkbox"
            checked={showArchived}
            onChange={(e) => onFilterChange(setShowArchived)(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="show-archived" className="text-sm">
            Show archived
          </label>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch('');
            setCategory('all');
            setReview('any');
            setShowArchived(false);
            setSort('alphabetical');
            setPage(1);
            clearSelection();
          }}
        >
          Reset filters
        </Button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36px]">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedIds.size === items.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-border"
                  aria-label="Select all visible rows"
                />
              </TableHead>
              <TableHead>English</TableHead>
              <TableHead>Tamil</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Dietary</TableHead>
              <TableHead className="text-right">Picks</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-destructive">
                  Failed to load library: {(error as Error)?.message || 'unknown error'}{' '}
                  <Button variant="link" size="sm" onClick={() => refetch()}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  No items match these filters.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className={!item.is_active ? 'opacity-60' : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="h-4 w-4 rounded border-border"
                      aria-label={`Select ${item.name_english}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.name_english}</TableCell>
                  <TableCell>
                    {item.name_tamil ? (
                      <span className="text-base">{item.name_tamil}</span>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">(not set)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{CATEGORY_LABEL[item.category]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.dietary_tags.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        item.dietary_tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.usage_count}</TableCell>
                  <TableCell>
                    {!item.is_active ? (
                      <Badge variant="destructive">Archived</Badge>
                    ) : item.needs_native_review ? (
                      <Badge variant="outline" className="border-amber-400 text-amber-700">
                        Needs review
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-400 text-emerald-700">
                        Reviewed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(item)}
                        aria-label="Edit item"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {item.is_active ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deactivate.mutate(item.id)}
                          disabled={deactivate.isPending}
                          aria-label="Archive item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => reactivate.mutate(item.id)}
                          disabled={reactivate.isPending}
                          aria-label="Restore item"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages} ({total} items total)
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
          >
            Next
          </Button>
        </div>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      {editing && (
        <ItemEditDialog
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          item={editing}
          reviewerId={reviewerId}
        />
      )}
      {creating && (
        <ItemEditDialog
          open={creating}
          onOpenChange={(open) => {
            if (!open) setCreating(false);
          }}
          item={null}
          reviewerId={reviewerId}
        />
      )}
    </div>
  );
}
