'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Edit, Eye, Trash2, Loader2, Search } from 'lucide-react';
import { useRoomEligibilityRules } from '@/hooks/campus-living/use-room-eligibility';
import { RoomEligibilityFormDialog } from './room-eligibility-form-dialog';
import { RoomRuleDetailDialog } from './room-rule-detail-dialog';
import {
  RoomRulesFiltersPanel,
  EMPTY_ROOM_RULE_FILTERS,
  countActiveRoomRuleFilters,
  roomRuleMatchesFilters,
} from './room-rules-filters';
import type { RoomEligibilityRuleRow } from '@/types/room-eligibility';

const scopeLabel = (r: RoomEligibilityRuleRow) =>
  r.room_count > 0
    ? `${r.room_count} room${r.room_count > 1 ? 's' : ''}`
    : r.floor != null
    ? r.floor === 0
      ? 'Ground floor'
      : `Floor ${r.floor}`
    : 'Whole block';

// Semesters are rendered separately from these — they're an ordered list, and
// that order is the auto-allocation fill priority worth surfacing.
const predicateParts = (r: RoomEligibilityRuleRow) =>
  [r.degree_name, r.department_name, r.program_name].filter(Boolean) as string[];

const floorLabel = (floor: number | null) =>
  floor == null ? 'Any' : floor === 0 ? 'Ground' : `Floor ${floor}`;

export function RoomRulesTable() {
  // null => list rules across ALL institutions; each rule carries its own.
  const { rows, loading, error, deleteRule } = useRoomEligibilityRules(null);
  const [filters, setFilters] = useState(EMPTY_ROOM_RULE_FILTERS);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<RoomEligibilityRuleRow | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editing, setEditing] = useState<RoomEligibilityRuleRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<RoomEligibilityRuleRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtering =
    countActiveRoomRuleFilters(filters) > 0 || search.trim().length > 0;
  const filteredRows = useMemo(
    () => rows.filter((r) => roomRuleMatchesFilters(r, filters, search)),
    [rows, filters, search]
  );

  const confirmDelete = async () => {
    if (!pendingDelete || deletingId) return;
    setDeletingId(pendingDelete.id);
    try {
      await deleteRule(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      // toast handled in service
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading rules…
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load rules</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        No physical-room rules yet. Rooms with no rule stay open to all eligible
        learners. Add a rule to reserve a block / floor / rooms for a cohort.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="h-9 w-full pl-8 sm:w-64"
          />
        </div>
        <div className="flex items-center gap-3">
          {filtering && (
            <span className="text-xs text-muted-foreground">
              Showing {filteredRows.length} of {rows.length} rules
            </span>
          )}
          <RoomRulesFiltersPanel
            rows={rows}
            value={filters}
            onChange={setFilters}
          />
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          No rules match the current search / filters.
        </div>
      ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Institution</TableHead>
            <TableHead>Block</TableHead>
            <TableHead>Floor</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Cohort</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRows.map((r) => {
            const parts = predicateParts(r);
            const semesters = r.semester_names ?? [];
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.institution_name ?? '—'}
                </TableCell>
                <TableCell className="font-medium">
                  {r.block_name ?? '—'}
                  {r.rule_name ? (
                    <span className="block text-xs text-muted-foreground">
                      {r.rule_name}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span className={r.floor == null ? 'text-muted-foreground' : ''}>
                    {floorLabel(r.floor)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{scopeLabel(r)}</Badge>
                </TableCell>
                <TableCell>
                  {parts.length === 0 && semesters.length === 0 ? (
                    <span className="text-muted-foreground">Any cohort</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {parts.map((p, i) => (
                        <Badge key={`p-${i}`} variant="secondary" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                      {/* Numbered only when the order actually carries meaning. */}
                      {semesters.map((name, i) => (
                        <Badge key={`s-${i}`} variant="secondary" className="text-xs">
                          {semesters.length > 1 ? `${i + 1}. ${name}` : name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={r.is_active ? 'default' : 'outline'}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setViewing(r);
                        setViewOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(r);
                        setEditOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(r)}
                      disabled={deletingId === r.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      )}

      {viewing && (
        <RoomRuleDetailDialog
          open={viewOpen}
          onOpenChange={(o) => {
            setViewOpen(o);
            if (!o) setViewing(null);
          }}
          rule={viewing}
        />
      )}

      {editing && (
        <RoomEligibilityFormDialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (!o) setEditing(null);
          }}
          mode="edit"
          rule={editing}
        />
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o && !deletingId) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Removing the rule re-opens the rooms it covered to all eligible
              learners. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
