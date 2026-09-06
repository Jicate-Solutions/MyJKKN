'use client';

// department-capability-register.tsx
// ---------------------------------------------------------------------------
// The screen where an activated solution department declares what it can do.
//
// It exists because the registry has 44 active departments and zero declared
// capabilities: the editor that used to write that column was deleted on
// 2026-04-02 along with the rest of the /solutions/departments tree, whose
// nomination workflow had become obsolete. Nothing has written the column
// since.
//
// The one design change from the deleted editor: it was a free-text tag box,
// so 'data-analytics' and 'data-analysis' could both exist and never match.
// This one picks from a per-institution catalogue, and adding to that
// catalogue is a deliberate act rather than a side effect of typing.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Database, Plus, RefreshCw, Tags } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useDepartmentCapabilities,
  type DepartmentCapability,
  type DepartmentCapabilityRow,
} from '@/hooks/use-department-capabilities';

const CATALOGUE_MIGRATION = '20260801181500_sh_department_capabilities_catalogue.sql';

// ============================================
// DECLARE DIALOG
// ============================================

function DeclareDialog({
  row,
  catalogue,
  open,
  onOpenChange,
  onSave,
  onAddCapability,
  saving,
}: {
  row: DepartmentCapabilityRow | null;
  catalogue: DepartmentCapability[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (row: DepartmentCapabilityRow, codes: string[]) => Promise<unknown>;
  onAddCapability: (institutionId: string, name: string) => Promise<DepartmentCapability>;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const { toast } = useToast();

  // Reset the working set whenever a different department opens the dialog.
  // Derived-state-during-render rather than an effect, so the checkboxes are
  // correct on the first paint instead of flashing the previous department's.
  // Clearing the key on close matters too: without it, cancelling with unsaved
  // ticks and reopening the SAME department would show the abandoned edits as
  // if they had been saved.
  if (row && dialogKey !== row.id) {
    setDialogKey(row.id);
    setSelected(row.capability_codes);
    setNewName('');
  } else if (!row && dialogKey !== null) {
    setDialogKey(null);
  }

  const options = useMemo(
    () =>
      row
        ? catalogue
            .filter((c) => c.institution_id === row.institution_id)
            .sort(
              (a, b) =>
                a.sort_order - b.sort_order ||
                a.capability_name.localeCompare(b.capability_name)
            )
        : [],
    [catalogue, row]
  );

  if (!row) return null;

  const toggle = (code: string) =>
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const created = await onAddCapability(row.institution_id, name);
      setSelected((prev) => (prev.includes(created.capability_code) ? prev : [...prev, created.capability_code]));
      setNewName('');
      toast({
        title: 'Added to the list',
        description: `"${created.capability_name}" is now available to every department in ${row.institution_name}.`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not add it',
        description: err instanceof Error ? err.message : 'Unknown problem',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleSave = async () => {
    try {
      await onSave(row, selected);
      toast({
        title: 'Saved',
        description:
          selected.length === 0
            ? `${row.department_name} now declares nothing.`
            : `${row.department_name} declares ${selected.length} ${selected.length === 1 ? 'capability' : 'capabilities'}.`,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Unknown problem',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.department_name}</DialogTitle>
          <DialogDescription>
            {row.institution_name} — tick everything this department can actually deliver
            for an outside client. This is what a problem gets matched against.
          </DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            This institution has no capability list yet. Add the first one below.
          </p>
        ) : (
          <ScrollArea className="max-h-[46vh] pr-3">
            <div className="space-y-3">
              {options.map((option) => (
                <label
                  key={option.id}
                  htmlFor={`cap-${option.id}`}
                  className="flex items-start gap-3 cursor-pointer rounded-md p-2 hover:bg-muted/50"
                >
                  <Checkbox
                    id={`cap-${option.id}`}
                    checked={selected.includes(option.capability_code)}
                    onCheckedChange={() => toggle(option.capability_code)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.capability_name}</span>
                    {option.description && (
                      <span className="block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="border-t pt-3 space-y-2">
          <Label htmlFor="new-capability" className="text-xs text-muted-foreground">
            Something missing? Add it to {row.institution_name}&apos;s list.
          </Label>
          <div className="flex gap-2">
            <Input
              id="new-capability"
              placeholder="e.g. Veterinary sample analysis"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleAdd}
              disabled={!newName.trim() || adding}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save declaration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// MAIN
// ============================================

export function DepartmentCapabilityRegister() {
  const {
    departments,
    catalogue,
    loading,
    error,
    catalogueMissing,
    savingId,
    refresh,
    saveCapabilities,
    addCatalogueEntry,
  } = useDepartmentCapabilities();

  const [editing, setEditing] = useState<DepartmentCapabilityRow | null>(null);

  const codeToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of catalogue) map.set(`${c.institution_id}:${c.capability_code}`, c.capability_name);
    return map;
  }, [catalogue]);

  const grouped = useMemo(() => {
    const byInstitution = new Map<string, DepartmentCapabilityRow[]>();
    for (const d of departments) {
      const list = byInstitution.get(d.institution_name) ?? [];
      list.push(d);
      byInstitution.set(d.institution_name, list);
    }
    return [...byInstitution.entries()];
  }, [departments]);

  const declared = departments.filter((d) => d.capability_codes.length > 0).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <p className="text-destructive">Could not load the capability register</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Coverage summary — the number this page exists to move. */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <p className="text-2xl font-semibold">
              {declared}
              <span className="text-base font-normal text-muted-foreground"> / {departments.length}</span>
            </p>
            <p className="text-xs text-muted-foreground">departments have declared something</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{catalogue.length}</p>
            <p className="text-xs text-muted-foreground">capabilities across all lists</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {catalogueMissing && (
        <Alert variant="destructive">
          <Database className="h-4 w-4" />
          <AlertTitle>The capability list is not installed yet</AlertTitle>
          <AlertDescription>
            The register below is read-only until an administrator applies the migration{' '}
            <span className="font-mono text-xs">{CATALOGUE_MIGRATION}</span>. Until then there
            is nothing to pick from, so no department can declare anything.
          </AlertDescription>
        </Alert>
      )}

      {departments.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No activated departments</AlertTitle>
          <AlertDescription>
            Nothing is registered as a solution department, so there is nothing to describe yet.
          </AlertDescription>
        </Alert>
      )}

      {grouped.map(([institutionName, rows]) => (
        <Card key={institutionName}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {institutionName}
              <Badge variant="secondary" className="text-xs font-normal">
                {rows.filter((r) => r.capability_codes.length > 0).length} of {rows.length} declared
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y">
            {rows.map((row) => (
              <div
                key={row.id}
                className="py-3 flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {row.department_name}
                    {row.department_code && (
                      <span className="ml-2 text-xs font-mono text-muted-foreground">
                        {row.department_code}
                      </span>
                    )}
                  </p>
                  {row.capability_codes.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Nothing declared — this department cannot be matched to a problem.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {row.capability_codes.map((code) => (
                        <Badge key={code} variant="secondary" className="text-xs font-normal">
                          <Check className="h-3 w-3 mr-1" />
                          {codeToName.get(`${row.institution_id}:${code}`) ?? code}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={catalogueMissing || savingId === row.id}
                  onClick={() => setEditing(row)}
                >
                  <Tags className="h-4 w-4 mr-1" />
                  {row.capability_codes.length === 0 ? 'Declare' : 'Edit'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <DeclareDialog
        row={editing}
        catalogue={catalogue}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSave={saveCapabilities}
        onAddCapability={addCatalogueEntry}
        saving={savingId !== null}
      />
    </div>
  );
}
