'use client';

/**
 * Saved Views Control — save / load / delete a portfolio view preset.
 *
 * A "view" = the current display mode (grid | board | heatmap) plus the active
 * filter set. Personal views are persisted to localStorage, scoped to the
 * current browser only.
 *
 * SHARED VIEWS — TODO (needs a table): cross-user "shared" views require a
 * `project_portfolio_views` table (id, name, owner_id, is_shared, config jsonb,
 * institution_scope) + a service/hook + RLS. Out of scope for this PR; flagged
 * here so the next session can wire it. Until then only personal views exist.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bookmark, Plus, Trash2, Check } from 'lucide-react';

const STORAGE_KEY = 'projects:portfolio:saved-views:v1';

export interface PortfolioViewConfig {
  /** Display mode. */
  mode: string;
  /** Arbitrary serializable filter state. */
  filters: Record<string, unknown>;
}

export interface SavedView extends PortfolioViewConfig {
  id: string;
  name: string;
}

function loadViews(): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    return [];
  }
}

function persistViews(views: SavedView[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // localStorage may be unavailable (private mode); fail quietly.
  }
}

interface SavedViewsControlProps {
  /** The view to capture when the user clicks "Save current view". */
  current: PortfolioViewConfig;
  /** Apply a previously-saved view. */
  onApply: (view: SavedView) => void;
  /** Id of the currently-applied saved view, if any (for the check mark). */
  activeViewId?: string | null;
}

export function SavedViewsControl({
  current,
  onApply,
  activeViewId,
}: SavedViewsControlProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    setViews(loadViews());
  }, []);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Give the view a name');
      return;
    }
    const view: SavedView = {
      id: `view_${Date.now()}`,
      name: trimmed,
      mode: current.mode,
      filters: current.filters,
    };
    const next = [...views, view];
    setViews(next);
    persistViews(next);
    setName('');
    setNaming(false);
    setOpen(false);
    toast.success(`Saved view "${trimmed}"`);
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    persistViews(next);
    toast.success('View deleted');
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`gap-1.5 ${TAP_TARGET}`}>
          <Bookmark className="h-4 w-4" />
          Views
          {views.length > 0 && (
            <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[10px]">
              {views.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Personal saved views</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {views.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            No saved views yet. Save the current grid/board/heatmap + filters as a
            preset.
          </p>
        )}

        {views.map((v) => (
          <DropdownMenuItem
            key={v.id}
            className="flex items-center justify-between gap-2"
            onSelect={(e) => {
              e.preventDefault();
              onApply(v);
              setOpen(false);
            }}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {activeViewId === v.id && <Check className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{v.name}</span>
              <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                {v.mode}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Delete view ${v.name}`}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
              onClick={(e) => handleDelete(v.id, e)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {naming ? (
          <div className="flex items-center gap-1.5 p-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') {
                  setNaming(false);
                  setName('');
                }
              }}
              placeholder="View name"
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8" onClick={handleSave}>
              Save
            </Button>
          </div>
        ) : (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setNaming(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Save current view
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
