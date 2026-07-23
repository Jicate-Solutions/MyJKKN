'use client';

// Generic catalog browser — one component renders ANY registered catalog:
// registry metadata drives the table columns, search targets the catalog's
// label column server-side, and the add/edit dialog appears only for
// editor_mode='generic'. Linked catalogs redirect to their module editor.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Search } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  ReferenceCatalogService,
  type ReferenceCatalogMeta,
  type ReferenceCatalogRow,
  type ReferenceFieldConfig,
} from '@/lib/services/reference/reference-catalog-service';
import { ReferenceRowFormDialog } from './reference-row-form-dialog';

const PAGE_SIZE = 25;

interface ReferenceCatalogBrowserProps {
  catalogKey: string;
  initialOpenNew: boolean;
}

function listColumns(meta: ReferenceCatalogMeta): ReferenceFieldConfig[] {
  const configured = meta.columns_config.filter((f) => f.show_in_list);
  if (configured.length > 0) return configured;
  // readonly catalogs seed an empty config — fall back to the label column
  return [{ key: meta.label_column, label: 'Name', type: 'text' }];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** Map a select/fk raw value to its human label for table display. */
function displayValue(
  field: ReferenceFieldConfig,
  value: unknown,
  fkLabels: Record<string, Record<string, string>>
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'select') {
    const opt = (field.options ?? []).find((o) => o.value === String(value));
    return opt?.label ?? String(value);
  }
  if (field.type === 'fk') {
    return fkLabels[field.key]?.[String(value)] ?? '…';
  }
  return cellText(value);
}

export function ReferenceCatalogBrowser({
  catalogKey,
  initialOpenNew,
}: ReferenceCatalogBrowserProps) {
  const router = useRouter();

  const [meta, setMeta] = useState<ReferenceCatalogMeta | null>(null);
  const [rows, setRows] = useState<ReferenceCatalogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ReferenceCatalogRow | null>(null);
  const [fkLabels, setFkLabels] = useState<Record<string, Record<string, string>>>({});

  // metadata (redirects linked catalogs to their own module editor)
  useEffect(() => {
    let cancelled = false;
    ReferenceCatalogService.getCatalogMeta(catalogKey)
      .then((m) => {
        if (cancelled) return;
        if (m.editor_mode === 'linked' && m.external_route) {
          router.replace(m.external_route);
          return;
        }
        setMeta(m);
        if (initialOpenNew && m.editor_mode === 'generic') {
          setEditingRow(null);
          setDialogOpen(true);
        }
        // resolve fk value→label maps for table display
        const fkListFields = m.columns_config.filter(
          (f) => f.type === 'fk' && f.show_in_list
        );
        for (const f of fkListFields) {
          ReferenceCatalogService.getFkOptions(m.catalog_key, f.key)
            .then((opts) =>
              setFkLabels((prev) => ({
                ...prev,
                [f.key]: Object.fromEntries(opts.map((o) => [o.value, o.label])),
              }))
            )
            .catch(() => undefined); // cells fall back to '…'
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey]);

  const fetchRows = useCallback(() => {
    setLoading(true);
    ReferenceCatalogService.getRows(catalogKey, search, page, PAGE_SIZE)
      .then(({ rows: r, total: t }) => {
        setRows(r);
        setTotal(t);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [catalogKey, search, page]);

  useEffect(() => {
    if (meta) fetchRows();
  }, [meta, fetchRows]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const columns = meta ? listColumns(meta) : [];
  const canEdit = meta?.editor_mode === 'generic';

  return (
    <PermissionGuard module="reference.catalogs" action="view">
      <ContentLayout title={meta?.display_name ?? 'Reference catalog'}>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {meta?.display_name ?? '…'}
                {meta?.editor_mode === 'readonly' && (
                  <Badge variant="outline" className="ml-2 align-middle">
                    Read-only
                  </Badge>
                )}
              </h1>
              {meta?.description && (
                <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
              )}
            </div>
            {canEdit && (
              <Button
                onClick={() => {
                  setEditingRow(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New entry
              </Button>
            )}
          </div>

          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(searchInput);
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          {loadError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {loadError}
            </div>
          )}

          {loading || !meta ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="w-20 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length + (canEdit ? 2 : 1)}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No entries{search ? ` matching “${search}”` : ''}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        {columns.map((c) => (
                          <TableCell
                            key={c.key}
                            className={c.key === meta.label_column ? 'font-medium' : undefined}
                          >
                            {displayValue(c, row[c.key], fkLabels)}
                          </TableCell>
                        ))}
                        <TableCell>
                          {row.is_active === false ? (
                            <Badge variant="secondary">Inactive</Badge>
                          ) : (
                            <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-400">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingRow(row);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Edit
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'}
              {search ? ` · filtered by “${search}”` : ''}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </div>

        {meta && canEdit && (
          <ReferenceRowFormDialog
            meta={meta}
            row={editingRow}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSaved={fetchRows}
          />
        )}
      </ContentLayout>
    </PermissionGuard>
  );
}
