'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  useFeedSettings,
  useUpsertFeedSetting,
  useCalendarCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/hooks/calendar/use-calendar';
import { CALENDAR_FEEDS } from '@/types/calendar';
import { getErrorMessage } from '@/lib/utils';
import type { CalendarCategory } from '@/types/calendar';
import { useTabParam } from '@/hooks/use-tab-param';

const CALENDAR_SETTINGS_TABS = ['feeds', 'categories', 'overrides'] as const;

// ─── helpers ────────────────────────────────────────────────────────────────

interface CategoryFormState {
  name: string;
  slug: string;
  color_code: string;
  sort_order: string;
}

const EMPTY_FORM: CategoryFormState = {
  name: '',
  slug: '',
  color_code: '#6366f1',
  sort_order: '0',
};

// ─── main component ──────────────────────────────────────────────────────────

export function SettingsAdmin() {
  const { toast } = useToast();
  const { isSuperAdmin, canAccess } = usePermissions();
  const canManage = isSuperAdmin || canAccess('calendar.config', 'manage');

  // URL-synced main tab (deep-linkable / favoritable).
  const [activeTab, setActiveTab] = useTabParam('feeds', CALENDAR_SETTINGS_TABS);

  // All hooks unconditionally at top-level
  const { data: feedSettings = [] } = useFeedSettings();
  const upsertFeedSetting = useUpsertFeedSetting();

  const { data: categories = [] } = useCalendarCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const { institutions } = useInstitutionsWithAccess();

  // Category dialog state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catEditing, setCatEditing] = useState<CalendarCategory | null>(null);
  const [catForm, setCatForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [catSubmitting, setCatSubmitting] = useState(false);

  // Per-institution overrides state
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  // ── feed helpers ────────────────────────────────────────────────────────

  function getGlobalEnabled(feedKey: string): boolean {
    const row = feedSettings.find(
      (r) => r.feed_key === feedKey && r.institution_id === null
    );
    return row ? row.is_enabled : true; // default ON
  }

  function getInstEnabled(feedKey: string, institutionId: string): boolean {
    const instRow = feedSettings.find(
      (r) => r.feed_key === feedKey && r.institution_id === institutionId
    );
    if (instRow) return instRow.is_enabled;
    // fall back to global
    return getGlobalEnabled(feedKey);
  }

  function handleGlobalToggle(feedKey: string, value: boolean) {
    upsertFeedSetting.mutate(
      { feedKey, institutionId: null, isEnabled: value },
      {
        onError: (err) =>
          toast({
            title: 'Failed to update feed setting',
            description: getErrorMessage(err),
            variant: 'destructive',
          }),
      }
    );
  }

  function handleInstToggle(feedKey: string, value: boolean) {
    if (!selectedInstitutionId) return;
    upsertFeedSetting.mutate(
      { feedKey, institutionId: selectedInstitutionId, isEnabled: value },
      {
        onError: (err) =>
          toast({
            title: 'Failed to update override',
            description: getErrorMessage(err),
            variant: 'destructive',
          }),
      }
    );
  }

  // ── category helpers ────────────────────────────────────────────────────

  function openNewCategoryDialog() {
    setCatEditing(null);
    setCatForm(EMPTY_FORM);
    setCatDialogOpen(true);
  }

  function openEditCategoryDialog(cat: CalendarCategory) {
    setCatEditing(cat);
    setCatForm({
      name: cat.name,
      slug: cat.slug,
      color_code: cat.color_code ?? '#6366f1',
      sort_order: String(cat.sort_order ?? 0),
    });
    setCatDialogOpen(true);
  }

  async function handleCategorySubmit() {
    setCatSubmitting(true);
    try {
      if (catEditing) {
        await updateCategory.mutateAsync({
          id: catEditing.id,
          updates: {
            name: catForm.name,
            slug: catForm.slug,
            color_code: catForm.color_code,
            sort_order: Number(catForm.sort_order),
          },
        });
        toast({ title: 'Category updated' });
      } else {
        await createCategory.mutateAsync({
          name: catForm.name,
          slug: catForm.slug,
          color_code: catForm.color_code,
          sort_order: Number(catForm.sort_order),
        });
        toast({ title: 'Category created' });
      }
      setCatDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to save category',
        description: getErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setCatSubmitting(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    try {
      await deleteCategory.mutateAsync(id);
      toast({ title: 'Category deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete category',
        description: getErrorMessage(err),
        variant: 'destructive',
      });
    }
  }

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Calendar Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure feed visibility, categories, and per-institution overrides.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
          <TabsTrigger value="feeds">Feeds</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="overrides">Per-institution overrides</TabsTrigger>
        </TabsList>

        {/* ── Feeds tab ─────────────────────────────────────────────────── */}
        <TabsContent value="feeds" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead className="w-32 text-center">Enabled (global)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CALENDAR_FEEDS.map((feed) => (
                  <TableRow key={feed.key}>
                    <TableCell className="font-medium">{feed.label}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={getGlobalEnabled(feed.key)}
                        onCheckedChange={(v) => handleGlobalToggle(feed.key, v)}
                        disabled={!canManage || upsertFeedSetting.isPending}
                        aria-label={`Toggle ${feed.label}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Categories tab ─────────────────────────────────────────────── */}
        <TabsContent value="categories" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              {categories.length} {categories.length === 1 ? 'category' : 'categories'}
            </p>
            {canManage && (
              <Button size="sm" onClick={openNewCategoryDialog}>
                New category
              </Button>
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="w-24">Color</TableHead>
                  <TableHead className="w-24">Sort</TableHead>
                  <TableHead className="w-20">Active</TableHead>
                  {canManage && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 6 : 5}
                      className="text-center text-muted-foreground py-8"
                    >
                      No categories yet.
                    </TableCell>
                  </TableRow>
                )}
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{cat.slug}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-4 rounded-full border"
                          style={{ backgroundColor: cat.color_code ?? undefined }}
                        />
                        <span className="text-xs text-muted-foreground">{cat.color_code}</span>
                      </div>
                    </TableCell>
                    <TableCell>{cat.sort_order}</TableCell>
                    <TableCell>
                      <span
                        className={
                          cat.is_active
                            ? 'text-green-600 text-sm font-medium'
                            : 'text-muted-foreground text-sm'
                        }
                      >
                        {cat.is_active ? 'Yes' : 'No'}
                      </span>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditCategoryDialog(cat)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteCategory(cat.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Per-institution overrides tab ──────────────────────────────── */}
        <TabsContent value="overrides" className="mt-4 space-y-4">
          <div className="max-w-sm">
            <Label htmlFor="inst-select">Institution</Label>
            <Select
              value={selectedInstitutionId}
              onValueChange={setSelectedInstitutionId}
            >
              <SelectTrigger id="inst-select" className="mt-1">
                <SelectValue placeholder="Select an institution…" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedInstitutionId ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feed</TableHead>
                    <TableHead className="w-32 text-center">Enabled</TableHead>
                    <TableHead className="w-32 text-center">Global default</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CALENDAR_FEEDS.map((feed) => {
                    const instRow = feedSettings.find(
                      (r) => r.feed_key === feed.key && r.institution_id === selectedInstitutionId
                    );
                    const isOverridden = instRow !== undefined;
                    return (
                      <TableRow key={feed.key}>
                        <TableCell className="font-medium">
                          {feed.label}
                          {isOverridden && (
                            <span className="ml-2 text-xs text-muted-foreground">(overridden)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={getInstEnabled(feed.key, selectedInstitutionId)}
                            onCheckedChange={(v) => handleInstToggle(feed.key, v)}
                            disabled={!canManage || upsertFeedSetting.isPending}
                            aria-label={`Toggle ${feed.label} for institution`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm text-muted-foreground">
                            {getGlobalEnabled(feed.key) ? 'On' : 'Off'}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an institution above to view and override its feed settings.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Category create/edit dialog ──────────────────────────────────── */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{catEditing ? 'Edit category' : 'New category'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={catForm.name}
                onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Public Holiday"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input
                id="cat-slug"
                value={catForm.slug}
                onChange={(e) => setCatForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="e.g. public-holiday"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cat-color">Color code</Label>
              <div className="flex gap-2 items-center">
                <input
                  id="cat-color-picker"
                  type="color"
                  value={catForm.color_code}
                  onChange={(e) => setCatForm((f) => ({ ...f, color_code: e.target.value }))}
                  className="h-9 w-12 cursor-pointer rounded border p-0.5"
                  aria-label="Pick a color"
                />
                <Input
                  id="cat-color"
                  value={catForm.color_code}
                  onChange={(e) => setCatForm((f) => ({ ...f, color_code: e.target.value }))}
                  placeholder="#6366f1"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cat-sort">Sort order</Label>
              <Input
                id="cat-sort"
                type="number"
                value={catForm.sort_order}
                onChange={(e) => setCatForm((f) => ({ ...f, sort_order: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCategorySubmit} disabled={catSubmitting || !catForm.name || !catForm.slug}>
              {catSubmitting ? 'Saving…' : catEditing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
