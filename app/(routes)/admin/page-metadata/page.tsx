'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePageMetadata } from '@/hooks/use-page-metadata';
import { getPageRegistry, ICON_MAP } from '@/lib/navigation/page-registry';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { formatShortcutKey, DEFAULT_KEYBOARD_SHORTCUTS } from '@/lib/navigation/keyboard-shortcuts';
import { Search, Edit2, Trash2, Plus, FileText, Tag, X, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { PageEntry } from '@/lib/navigation/types';

export default function PageMetadataPage() {
  return (
    <PermissionGuard module="system" action="view">
      <ContentLayout title="Page Metadata">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'Page Metadata' },
          ]}
        />
        <PageMetadataContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

function PageMetadataContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPage, setEditingPage] = useState<PageEntry | null>(null);
  const [editKeywords, setEditKeywords] = useState<string[]>([]);
  const [editDescription, setEditDescription] = useState('');
  const [editSearchable, setEditSearchable] = useState(true);
  const [editShortcut, setEditShortcut] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');

  const { allMetadata, upsertMetadata, deleteMetadata, getMetadataForPath } = usePageMetadata();

  // Get all pages from the registry
  const allPages = useMemo(() => {
    try {
      return getPageRegistry();
    } catch {
      return [];
    }
  }, []);

  // Filter pages by search
  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return allPages;
    const q = searchQuery.toLowerCase();
    return allPages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q) ||
        p.module.toLowerCase().includes(q) ||
        p.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [allPages, searchQuery]);

  // Open edit dialog
  const handleEdit = (page: PageEntry) => {
    const meta = getMetadataForPath(page.path);
    setEditingPage(page);
    setEditKeywords(meta?.keywords || page.keywords);
    setEditDescription(meta?.description || page.description);
    setEditSearchable(meta?.isSearchable ?? true);
    setEditShortcut(meta?.shortcutKey || null);
    setKeywordInput('');
  };

  // Save metadata
  const handleSave = () => {
    if (!editingPage) return;
    upsertMetadata.mutate(
      {
        pagePath: editingPage.path,
        description: editDescription,
        keywords: editKeywords,
        isSearchable: editSearchable,
        shortcutKey: editShortcut,
        category: editingPage.module,
      },
      {
        onSuccess: () => {
          toast.success('Page metadata saved');
          setEditingPage(null);
        },
        onError: (err) => {
          toast.error('Failed to save: ' + (err as Error).message);
        },
      }
    );
  };

  // Add keyword
  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (kw && !editKeywords.includes(kw)) {
      setEditKeywords([...editKeywords, kw]);
      setKeywordInput('');
    }
  };

  // Remove keyword
  const removeKeyword = (keyword: string) => {
    setEditKeywords(editKeywords.filter((k) => k !== keyword));
  };

  return (
    <div className="space-y-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Page Search Metadata
            </CardTitle>
            <Badge variant="outline">{allPages.length} pages</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage keywords and descriptions to improve search results in the Ctrl+K command palette.
          </p>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pages by name, path, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-auto max-h-[600px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[250px]">Page</TableHead>
                  <TableHead className="w-[120px]">Module</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead className="w-[80px]">Shortcut</TableHead>
                  <TableHead className="w-[80px]">Custom</TableHead>
                  <TableHead className="w-[70px]">Searchable</TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPages.map((page) => {
                  const meta = getMetadataForPath(page.path);
                  const hasCustom = !!meta;
                  const IconComp = ICON_MAP[page.iconName] || FileText;

                  return (
                    <TableRow key={page.path} className="group">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <IconComp className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <div className="font-medium text-sm">{page.title}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {page.path}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {page.module}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[300px]">
                          {(meta?.keywords || page.keywords).slice(0, 5).map((kw) => (
                            <Badge
                              key={kw}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {kw}
                            </Badge>
                          ))}
                          {(meta?.keywords || page.keywords).length > 5 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              +{(meta?.keywords || page.keywords).length - 5}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {meta?.shortcutKey ? (
                          <kbd className="inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground dark:border-gray-600 dark:bg-gray-800">
                            {formatShortcutKey(meta.shortcutKey)}
                          </kbd>
                        ) : page.shortcut ? (
                          <kbd className="inline-flex h-5 items-center rounded border bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/50 dark:border-gray-700">
                            {page.shortcut}
                          </kbd>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasCustom ? (
                          <Badge className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
                            Custom
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Default</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          'inline-block h-2 w-2 rounded-full',
                          (meta?.isSearchable ?? true) ? 'bg-green-500' : 'bg-red-500'
                        )} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={() => handleEdit(page)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingPage} onOpenChange={(open) => !open && setEditingPage(null)}>
        <DialogContent className="max-w-lg dark:bg-gray-900 max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-4 w-4" />
              Edit Page Metadata
            </DialogTitle>
            <DialogDescription>
              Customize keywords and description to improve search results
            </DialogDescription>
          </DialogHeader>

          {editingPage && (
            <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
              {/* Page info (read-only) */}
              <div className="rounded-md bg-muted p-3">
                <div className="font-medium text-sm">{editingPage.title}</div>
                <div className="text-xs text-muted-foreground font-mono">{editingPage.path}</div>
                <Badge variant="outline" className="mt-1 text-[10px]">{editingPage.module}</Badge>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Describe what this page does..."
                  rows={2}
                />
              </div>

              {/* Keywords */}
              <div>
                <label className="text-sm font-medium mb-1 block">Keywords</label>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] p-2 rounded-md border bg-background">
                  {editKeywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="gap-1 text-xs">
                      {kw}
                      <button
                        onClick={() => removeKeyword(kw)}
                        className="hover:text-destructive"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                    placeholder="Add keyword..."
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={addKeyword}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* Searchable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Searchable</div>
                  <div className="text-xs text-muted-foreground">Show this page in search results</div>
                </div>
                <Switch checked={editSearchable} onCheckedChange={setEditSearchable} />
              </div>

              {/* Keyboard Shortcut */}
              <div>
                <label className="text-sm font-medium mb-1 flex items-center gap-1.5">
                  <Keyboard className="h-3.5 w-3.5" />
                  Keyboard Shortcut
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Press any key combination to assign, or pick from common shortcuts below
                </p>
                <ShortcutRecorder
                  value={editShortcut}
                  onChange={setEditShortcut}
                  currentPagePath={editingPage?.path || ''}
                  allMetadata={allMetadata}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPage(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={upsertMetadata.isPending}>
              {upsertMetadata.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shortcut Recorder Component ─────────────────────────────────────────────

const COMMON_SHORTCUTS = [
  'alt+a', 'alt+b', 'alt+c', 'alt+d', 'alt+e', 'alt+f',
  'alt+g', 'alt+h', 'alt+i', 'alt+j', 'alt+k', 'alt+l',
  'alt+m', 'alt+n', 'alt+o', 'alt+p', 'alt+q', 'alt+r',
  'alt+s', 'alt+t', 'alt+u', 'alt+v', 'alt+w', 'alt+x',
  'alt+y', 'alt+z',
];

function ShortcutRecorder({
  value,
  onChange,
  currentPagePath,
  allMetadata,
}: {
  value: string | null;
  onChange: (shortcut: string | null) => void;
  currentPagePath: string;
  allMetadata: PageMetadata[];
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKey, setRecordedKey] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  // Check if a shortcut key is already taken by another page
  const getConflict = useCallback(
    (shortcutKey: string): string | null => {
      // Check admin-assigned shortcuts in metadata
      const metaConflict = allMetadata.find(
        (m) => m.shortcutKey === shortcutKey && m.pagePath !== currentPagePath
      );
      if (metaConflict) return metaConflict.customTitle || metaConflict.pagePath;

      // Check hardcoded defaults
      const defaultConflict = DEFAULT_KEYBOARD_SHORTCUTS[shortcutKey];
      if (defaultConflict) return `${defaultConflict.label} (default)`;

      return null;
    },
    [allMetadata, currentPagePath]
  );

  // Parse keyboard event into shortcut string
  const parseEvent = (e: KeyboardEvent): string | null => {
    const key = e.key.toLowerCase();
    // Ignore modifier-only presses
    if (['control', 'shift', 'alt', 'meta'].includes(key)) return null;
    // Must have at least one modifier
    if (!e.altKey && !e.ctrlKey && !e.metaKey) return null;
    // Don't capture Tab, Escape, etc.
    if (['tab', 'escape', 'enter', 'backspace', 'delete'].includes(key)) return null;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(key.length === 1 ? key : key);

    return parts.join('+');
  };

  // Format for display
  const formatDisplay = (shortcut: string): string => {
    return shortcut
      .split('+')
      .map((p) => {
        if (p === 'ctrl') return 'Ctrl';
        if (p === 'alt') return 'Alt';
        if (p === 'shift') return 'Shift';
        return p.toUpperCase();
      })
      .join(' + ');
  };

  // Key recording handler
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape stops recording
      if (e.key === 'Escape') {
        setIsRecording(false);
        setRecordedKey(null);
        setConflict(null);
        e.stopPropagation();
        return;
      }

      const parsed = parseEvent(e);
      if (!parsed) return;

      e.preventDefault();
      e.stopPropagation();
      setRecordedKey(parsed);

      // Check for conflicts
      const conflictLabel = getConflict(parsed);
      setConflict(conflictLabel);

      if (!conflictLabel) {
        onChange(parsed);
        setIsRecording(false);
      }
    };

    // Use capture phase only for the recording input area
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, getConflict, onChange]);

  return (
    <div className="space-y-3" ref={inputRef}>
      {/* Recorder input */}
      <div
        onClick={() => { setIsRecording(true); setRecordedKey(null); setConflict(null); }}
        className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2.5 cursor-pointer transition-all',
          isRecording
            ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
            : 'border-border hover:border-primary/50',
        )}
      >
        <Keyboard className="h-4 w-4 text-muted-foreground shrink-0" />
        {isRecording ? (
          <span className="text-sm text-primary animate-pulse">
            Press any key combination...
          </span>
        ) : value ? (
          <kbd className="inline-flex items-center rounded border bg-muted px-2 py-0.5 font-mono text-sm font-medium dark:border-gray-600 dark:bg-gray-800">
            {formatDisplay(value)}
          </kbd>
        ) : (
          <span className="text-sm text-muted-foreground">
            Click to record shortcut
          </span>
        )}
        <div className="flex-1" />
        {value && !isRecording && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="h-6 px-2 text-destructive hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" /> Remove
          </Button>
        )}
      </div>

      {/* Conflict warning */}
      {conflict && isRecording && recordedKey && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs">
          <span className="text-amber-600 font-medium shrink-0">Conflict:</span>
          <span className="text-amber-700 dark:text-amber-400">
            <kbd className="font-mono bg-amber-500/10 px-1 rounded">{formatDisplay(recordedKey)}</kbd>
            {' '}is already assigned to <strong>{conflict}</strong>. Press a different combination.
          </span>
        </div>
      )}

      {/* Quick assign buttons */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">Quick assign</p>
        <div className="flex flex-wrap gap-1">
          {COMMON_SHORTCUTS.map((key) => {
            const conflictLabel = getConflict(key);
            const isCurrent = key === value;
            const isTaken = !!conflictLabel && !isCurrent;

            return (
              <button
                key={key}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isTaken) return;
                  setIsRecording(false);
                  setConflict(null);
                  setRecordedKey(null);
                  onChange(isCurrent ? null : key);
                }}
                disabled={isTaken}
                className={cn(
                  'h-7 px-1.5 rounded border font-mono text-[10px] transition-colors',
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary'
                    : isTaken
                    ? 'bg-muted/30 text-muted-foreground/30 border-border/30 cursor-not-allowed'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-primary/10 hover:border-primary/50 hover:text-foreground cursor-pointer'
                )}
                title={isTaken ? `Assigned to: ${conflictLabel}` : isCurrent ? 'Click to remove' : `Assign ${formatDisplay(key)}`}
              >
                {key.split('+').pop()?.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
