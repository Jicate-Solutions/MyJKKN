'use client';

// ============================================================
// _components/master-table-page.tsx
// Reusable master-table CRUD page for /cdc/admin/* masters.
// Used by: drive-types, offer-types, training-types,
//          workshop-types, industry-sectors, recruiters.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Power,
  PowerOff,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useCdcAdmin } from '@/hooks/cdc/use-cdc-admin';
import type { CdcMasterTable } from '@/types/admin/cdc';

// ── Types ─────────────────────────────────────────────────────────────────

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'textarea';
  required?: boolean;
  placeholder?: string;
  /**
   * For text/textarea fields: persist a blank ('' / whitespace) value as NULL
   * instead of ''. Opt-in so a blank optional tag doesn't become a phantom
   * value downstream (e.g. cdc_training_types.exam_family — deep-review R3 #2).
   */
  nullifyWhenBlank?: boolean;
}

export interface MasterTablePageProps {
  tableName: CdcMasterTable;
  title: string;
  description: string;
  breadcrumbs: { label: string; href: string }[];
  /** Field definitions for the add/edit modal — display_name always included. */
  extraFields?: FieldDef[];
  /** If provided, render this column header + value in the list. */
  extraListColumns?: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
}

// ── Component ─────────────────────────────────────────────────────────────

export function MasterTablePage({
  tableName,
  title,
  description,
  breadcrumbs,
  extraFields = [],
  extraListColumns = [],
}: MasterTablePageProps) {
  const { isCdcAdmin, isLoading: permsLoading } = useCdcAdmin();

  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const totalPages = Math.ceil(count / PAGE_SIZE);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  const isEditMode = !!editRow;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/cdc/masters/${tableName}?page=${p}&page_size=${PAGE_SIZE}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setRows(json.data ?? []);
      setCount(json.count ?? 0);
      setPage(p);
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableName]);

  useEffect(() => { load(1); }, [load]);

  // ── Modal helpers ────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditRow(null);
    const defaults: Record<string, any> = { display_name: '', description: '', is_active: true };
    for (const f of extraFields) {
      defaults[f.key] = f.type === 'boolean' ? false : f.type === 'number' ? '' : '';
    }
    setFormValues(defaults);
    setModalOpen(true);
  };

  const openEdit = (row: any) => {
    setEditRow(row);
    const vals: Record<string, any> = {
      display_name: row.display_name ?? '',
      description: row.description ?? '',
      is_active: row.is_active ?? true,
    };
    for (const f of extraFields) {
      vals[f.key] = row[f.key] ?? (f.type === 'boolean' ? false : f.type === 'number' ? '' : '');
    }
    setFormValues(vals);
    setModalOpen(true);
  };

  const handleFieldChange = (key: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async () => {
    if (!formValues.display_name?.trim()) {
      toast.error('Display name is required');
      return;
    }

    setSubmitting(true);
    try {
      let payload = { ...formValues };
      // Coerce number fields
      for (const f of extraFields) {
        if (f.type === 'number' && payload[f.key] !== '') {
          payload[f.key] = Number(payload[f.key]);
        }
        // Opt-in: store a blank text/textarea value as NULL, not '' (avoids
        // phantom empty-string tags — deep-review R3 #2).
        if (
          f.nullifyWhenBlank &&
          (f.type === 'text' || f.type === 'textarea') &&
          (typeof payload[f.key] !== 'string' || payload[f.key].trim() === '')
        ) {
          payload[f.key] = null;
        }
      }

      if (isEditMode) {
        const res = await fetch(`/api/admin/cdc/masters/${tableName}/${editRow.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Update failed');
        toast.success('Updated');
      } else {
        const res = await fetch(`/api/admin/cdc/masters/${tableName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Create failed');
        toast.success('Created');
      }

      setModalOpen(false);
      load(page);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (row: any) => {
    const newState = !row.is_active;
    try {
      const res = await fetch(`/api/admin/cdc/masters/${tableName}/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newState }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Toggle failed');
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: newState } : r)));
      toast.success(newState ? 'Activated' : 'Deactivated');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ── Gates ─────────────────────────────────────────────────────────────────
  if (permsLoading) {
    return (
      <ContentLayout title={title}>
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  if (!isCdcAdmin) {
    return (
      <ContentLayout title={title}>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>CDC master table editing requires super-admin or CDC Head role.</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const allFields: FieldDef[] = [
    { key: 'display_name', label: 'Display name', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    ...extraFields,
  ];

  return (
    <ContentLayout title={title}>
      <PageBreadcrumb items={breadcrumbs} />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {loadError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {count} row{count !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No rows yet. Add the first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Key</th>
                    {extraListColumns.map((col) => (
                      <th key={col.key} className="text-left px-4 py-3 font-medium">{col.label}</th>
                    ))}
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Updated</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        {row.display_name}
                        {row.is_system && (
                          <Badge variant="outline" className="ml-2 text-xs">system</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {row.config_key ?? row.id?.slice(0, 8)}
                      </td>
                      {extraListColumns.map((col) => (
                        <td key={col.key} className="px-4 py-3 text-muted-foreground">
                          {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <Badge variant={row.is_active ? 'default' : 'secondary'}>
                          {row.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                        {row.updated_at ? format(new Date(row.updated_at), 'd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={row.is_active ? 'Deactivate' : 'Activate'}
                            onClick={() => handleToggleActive(row)}
                          >
                            {row.is_active ? (
                              <PowerOff className="h-3.5 w-3.5 text-amber-600" />
                            ) : (
                              <Power className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => load(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditMode ? `Edit ${editRow?.display_name}` : `Add to ${title}`}</DialogTitle>
            <DialogDescription>
              {isEditMode ? 'Update the fields below and save.' : 'Fill in the details and add the new entry.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {allFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`field-${field.key}`}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>

                {field.type === 'boolean' ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`field-${field.key}`}
                      checked={Boolean(formValues[field.key])}
                      onCheckedChange={(v) => handleFieldChange(field.key, v)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {formValues[field.key] ? 'Yes' : 'No'}
                    </span>
                  </div>
                ) : field.type === 'textarea' ? (
                  <Textarea
                    id={`field-${field.key}`}
                    value={formValues[field.key] ?? ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                  />
                ) : (
                  <Input
                    id={`field-${field.key}`}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={formValues[field.key] ?? ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditMode ? 'Save changes' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
