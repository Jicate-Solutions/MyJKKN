'use client';

// =====================================================================
// /admin/nav-config — Director's Approach 4 (2026-04-29)
// =====================================================================
// Filesystem auto-discovery (Agent M's lib/admin/nav-tree.ts) decides
// what /admin/* pages exist BY DEFAULT. This page is the override layer:
// super_admins can rename labels, recategorize, reorder, hide, or change
// icons for any auto-discovered page — no deploy, no PR.
//
// Backed by:
//   - Table:    public.platform_policies (key prefix `nav.admin.override.`)
//   - Helper:   public.fn_get_admin_nav_overrides()
//   - Service:  lib/services/admin/admin-nav-overrides-service.ts
//
// Wire-up: Agent M's nav-tree.ts must merge fn_get_admin_nav_overrides()
// results into the discovered nav. That's a follow-up coordinator
// commit AFTER M and P (this PR) both merge. Until then this UI is
// wired but overrides don't take visible effect.
//
// Permission: super_admin / admin only (PermissionGuard).
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  Database,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  useAdminNavOverrides,
  useDeleteAdminNavOverride,
  useUpsertAdminNavOverride,
  type AdminNavOverride,
} from '@/lib/services/admin/admin-nav-overrides-service';
import { usePermissions } from '@/hooks/use-permissions';

// ---------------------------------------------------------------------------
// Page wrapper — gated by PermissionGuard (super_admin / admin only).
// ---------------------------------------------------------------------------
export default function AdminNavConfigPage() {
  return (
    <PermissionGuard module="users" action="manage">
      <ContentLayout title="Admin Navigation Overrides">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'Navigation Overrides' },
          ]}
        />
        <AdminNavConfigContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
function AdminNavConfigContent() {
  const { isSuperAdmin } = usePermissions();
  const { data: overrides, isLoading, error } = useAdminNavOverrides();
  const upsertMutation = useUpsertAdminNavOverride();
  const deleteMutation = useDeleteAdminNavOverride();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminNavOverride | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedOverrides = useMemo(() => {
    if (!overrides) return [];
    return [...overrides].sort((a, b) => a.href.localeCompare(b.href));
  }, [overrides]);

  function openCreate() {
    setEditing({
      href: '/admin/',
      category: '',
      label: '',
      display_order: null,
      hidden: false,
      icon: '',
      description: '',
    });
    setEditorOpen(true);
  }

  function openEdit(row: AdminNavOverride) {
    setEditing({ ...row });
    setEditorOpen(true);
  }

  function handleSave(value: AdminNavOverride) {
    upsertMutation.mutate(value, {
      onSuccess: () => {
        toast.success(`Override saved for ${value.href}`);
        setEditorOpen(false);
        setEditing(null);
      },
      onError: (err) => {
        toast.error(`Save failed: ${err.message}`);
      },
    });
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Override removed; filesystem default re-applied.');
        setConfirmDeleteId(null);
      },
      onError: (err) => {
        toast.error(`Delete failed: ${err.message}`);
      },
    });
  }

  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load admin nav overrides</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Compass className="h-4 w-4" />
        <AlertTitle>How this works</AlertTitle>
        <AlertDescription>
          Filesystem auto-discovers admin pages by default. Add rows here
          to override category, rename labels, reorder, or hide pages —
          no deploy needed. Empty fields inherit the filesystem default.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Active overrides</CardTitle>
            <CardDescription>
              {sortedOverrides.length === 0
                ? 'No overrides — every admin page uses its filesystem default.'
                : `${sortedOverrides.length} override${sortedOverrides.length === 1 ? '' : 's'} configured.`}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={openCreate}
            disabled={!isSuperAdmin}
            aria-label="Add override"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Override
          </Button>
        </CardHeader>
        <CardContent>
          {sortedOverrides.length === 0 ? (
            <Alert>
              <Database className="h-4 w-4" />
              <AlertTitle>No overrides yet</AlertTitle>
              <AlertDescription>
                Click <strong>Add Override</strong> above to recategorize,
                rename, reorder, hide, or re-icon any auto-discovered
                admin page.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[260px]">Href</TableHead>
                  <TableHead className="w-[140px]">Category</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="w-[100px]">Order</TableHead>
                  <TableHead className="w-[80px]">Hidden</TableHead>
                  <TableHead className="w-[120px]">Icon</TableHead>
                  <TableHead className="w-[140px]">Last updated</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOverrides.map((row) => (
                  <TableRow key={row.id ?? row.href}>
                    <TableCell className="font-mono text-sm">
                      {row.href}
                    </TableCell>
                    <TableCell>
                      {row.category ? (
                        <Badge variant="secondary">{row.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground/50 italic text-xs">
                          (default)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.label ?? (
                        <span className="text-muted-foreground/50 italic">
                          (default)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.display_order ?? (
                        <span className="text-muted-foreground/50 italic">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.hidden ? (
                        <Badge variant="destructive" className="gap-1">
                          <EyeOff className="h-3 w-3" /> hidden
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/50 italic text-xs">
                          shown
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.icon ?? (
                        <span className="text-muted-foreground/50 italic">
                          (default)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.updated_at
                        ? format(new Date(row.updated_at), 'MMM d, HH:mm')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isSuperAdmin}
                          onClick={() => openEdit(row)}
                          aria-label={`Edit override for ${row.href}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isSuperAdmin || !row.id}
                          onClick={() =>
                            row.id && setConfirmDeleteId(row.id)
                          }
                          aria-label={`Delete override for ${row.href}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!isSuperAdmin && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You can view nav overrides but only{' '}
                <strong>super_admin</strong> can edit them.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Editor dialog (create + edit share the same form) */}
      <OverrideEditorDialog
        open={editorOpen}
        value={editing}
        saving={upsertMutation.isPending}
        canSave={isSuperAdmin}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <Dialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove override?</DialogTitle>
            <DialogDescription>
              The filesystem default for this page will re-apply on the
              next nav build. This action cannot be undone, but you can
              re-create the override at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                confirmDeleteId && handleDelete(confirmDeleteId)
              }
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor dialog — used for both Create and Edit
// ---------------------------------------------------------------------------
interface OverrideEditorDialogProps {
  open: boolean;
  value: AdminNavOverride | null;
  saving: boolean;
  canSave: boolean;
  onClose: () => void;
  onSave: (value: AdminNavOverride) => void;
}

function OverrideEditorDialog({
  open,
  value,
  saving,
  canSave,
  onClose,
  onSave,
}: OverrideEditorDialogProps) {
  const [draft, setDraft] = useState<AdminNavOverride | null>(value);

  // Sync draft whenever the dialog opens with a new value. Avoid
  // setState-during-render by gating on the open transition.
  useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  const isEditing = Boolean(value?.id);
  const hrefValid = draft?.href.startsWith('/admin/') ?? false;
  const formValid = hrefValid && draft != null;

  function patch(part: Partial<AdminNavOverride>) {
    setDraft((prev) => (prev ? { ...prev, ...part } : prev));
  }

  function submit() {
    if (!draft || !formValid) return;
    onSave({
      ...draft,
      // Normalize empty strings → null/undefined so the server doesn't
      // persist them as empty overrides.
      category:
        draft.category && draft.category.trim() !== ''
          ? draft.category.trim()
          : null,
      label:
        draft.label && draft.label.trim() !== '' ? draft.label.trim() : null,
      icon:
        draft.icon && draft.icon.trim() !== '' ? draft.icon.trim() : null,
      description:
        draft.description && draft.description.trim() !== ''
          ? draft.description.trim()
          : null,
      display_order:
        draft.display_order != null && Number.isFinite(draft.display_order)
          ? Number(draft.display_order)
          : null,
      hidden: draft.hidden === true,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit override' : 'Add override'}
          </DialogTitle>
          <DialogDescription>
            All fields except <strong>href</strong> are optional. Empty
            fields inherit the filesystem default.
          </DialogDescription>
        </DialogHeader>

        {draft && (
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="override-href">Href *</Label>
              <Input
                id="override-href"
                value={draft.href}
                onChange={(e) => patch({ href: e.target.value })}
                placeholder="/admin/notifications/recipients"
                className="font-mono text-sm"
                disabled={isEditing /* href = identity, can't change */}
                aria-invalid={!hrefValid}
              />
              {!hrefValid && (
                <p className="text-xs text-destructive">
                  Must start with <code>/admin/</code>
                </p>
              )}
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  Href is the row identity and cannot be changed. Delete
                  this override and create a new one to move it.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="override-category">Category</Label>
                <Input
                  id="override-category"
                  value={draft.category ?? ''}
                  onChange={(e) => patch({ category: e.target.value })}
                  placeholder="System"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="override-order">Display order</Label>
                <Input
                  id="override-order"
                  type="number"
                  value={
                    draft.display_order == null
                      ? ''
                      : String(draft.display_order)
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    patch({
                      display_order:
                        v === '' ? null : Number.parseInt(v, 10),
                    });
                  }}
                  placeholder="1"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="override-label">Label</Label>
              <Input
                id="override-label"
                value={draft.label ?? ''}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Digest Recipients (config)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="override-icon">Icon (lucide name)</Label>
                <Input
                  id="override-icon"
                  value={draft.icon ?? ''}
                  onChange={(e) => patch({ icon: e.target.value })}
                  placeholder="Bell"
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-end gap-2 pb-1.5">
                <Checkbox
                  id="override-hidden"
                  checked={draft.hidden === true}
                  onCheckedChange={(checked) =>
                    patch({ hidden: checked === true })
                  }
                />
                <Label htmlFor="override-hidden" className="cursor-pointer">
                  Hide from nav
                </Label>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="override-desc">Description (admin-facing)</Label>
              <Input
                id="override-desc"
                value={draft.description ?? ''}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Why this override exists; shown in the table."
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            aria-label="Cancel"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSave || !formValid || saving}
            aria-label="Save"
          >
            <Save className="h-4 w-4 mr-1" />
            {isEditing ? 'Save changes' : 'Add override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
