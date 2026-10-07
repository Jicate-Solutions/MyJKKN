'use client';

// "Floors & Rooms" tab of the block detail page.
//
// Floors are hostel_floors rows (add / rename / activate / delete here); each
// card's numbers are derived from the block's rooms. Mutating controls render
// only for campus_living.blocks.edit — RLS on hostel_floors enforces the same
// key, so hiding a button is UX and the database is the wall.

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Building2, BedDouble, DoorOpen, Users, Plus, MoreVertical, Pencil, Power, Trash2,
} from 'lucide-react';
import { useDeleteFloor, useUpdateFloor } from '@/hooks/campus-living/use-hostel-floors';
import { FloorFormDialog, type FloorFormTarget } from './floor-form-dialog';

export type FloorSummaryRow = {
  floor: number;
  label: string;
  rooms: number;
  capacity: number;
  occupied: number;
  available?: number;
  studentRooms?: number;
  specialRooms?: number;
  attachedBathrooms?: number;
  byType?: Record<string, number>;
  byAC?: Record<string, number>;
  byCategory?: Record<string, number>;
  /** hostel_floors.id — null only for a floor with no row (not possible under the FK). */
  floor_id?: string | null;
  name?: string | null;
  is_active?: boolean;
};

export type BlockBreakdown = {
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  studentRooms: number;
  specialRooms: number;
  byType: Record<string, number>;
  byAC: Record<string, number>;
  byCategory: Record<string, number>;
};

const AC_LABELS: Record<string, string> = { ac: 'AC', non_ac: 'Non-AC', cooler: 'Cooler' };

interface FloorsTabProps {
  blockId: string;
  totalRooms: number;
  totalFloors: number;
  blockBreakdown: BlockBreakdown | null;
  floorSummary: FloorSummaryRow[];
  canEdit: boolean;
}

export function FloorsTab({
  blockId,
  totalRooms,
  totalFloors,
  blockBreakdown,
  floorSummary,
  canEdit,
}: FloorsTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FloorFormTarget | null>(null);
  const [deleting, setDeleting] = useState<FloorSummaryRow | null>(null);
  const updateFloor = useUpdateFloor();
  const deleteFloor = useDeleteFloor();

  const takenNumbers = floorSummary.map((f) => f.floor);
  const suggestedNumber = takenNumbers.length > 0 ? Math.max(...takenNumbers) + 1 : 0;

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (f: FloorSummaryRow) => {
    if (!f.floor_id) return;
    setEditing({
      id: f.floor_id,
      floor_number: f.floor,
      name: f.name ?? null,
      is_active: f.is_active ?? true,
    });
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting?.floor_id) return;
    try {
      await deleteFloor.mutateAsync(deleting.floor_id);
      setDeleting(null);
    } catch {
      // The hook already toasted the real reason.
    }
  };

  return (
    <div className="space-y-3">
      {/* ── Block summary card ──────────────────────────────── */}
      {blockBreakdown && (
        <Card className="overflow-hidden border border-border/60 shadow-sm">
          <CardHeader className="px-5 py-3.5 border-b bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold leading-none">Block Summary</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {totalRooms} rooms · {totalFloors} floor{totalFloors !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                <Link href={`/campus-living/blocks/${blockId}/rooms`}>View All Rooms</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {/* KPI tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-muted/40 p-3.5">
                <p className="text-2xl font-bold tabular-nums leading-none">{blockBreakdown.totalBeds}</p>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium">Total Beds</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3.5">
                <p className="text-2xl font-bold tabular-nums leading-none text-blue-700">{blockBreakdown.occupiedBeds}</p>
                <p className="text-xs text-blue-600/70 mt-1.5 font-medium">Occupied</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3.5">
                <p className="text-2xl font-bold tabular-nums leading-none text-emerald-700">{blockBreakdown.availableBeds}</p>
                <p className="text-xs text-emerald-600/70 mt-1.5 font-medium">Available Beds</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3.5">
                <p className="text-2xl font-bold tabular-nums leading-none">{blockBreakdown.studentRooms}</p>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                  Student Rooms
                  {blockBreakdown.specialRooms > 0 && (
                    <span className="ml-1 text-amber-500">+{blockBreakdown.specialRooms} special</span>
                  )}
                </p>
              </div>
            </div>

            {/* Distribution chip rows */}
            {(Object.keys(blockBreakdown.byType).length > 0 ||
              Object.keys(blockBreakdown.byAC).length > 0 ||
              Object.keys(blockBreakdown.byCategory).length > 0) && (
              <div className="space-y-2.5 pt-3 border-t border-border/50">
                {Object.keys(blockBreakdown.byType).length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20 shrink-0">Type</span>
                    {Object.entries(blockBreakdown.byType).map(([type, count]) => (
                      <span key={type} className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 capitalize">
                        {type}
                        <span className="tabular-nums font-bold text-blue-900">{count}</span>
                      </span>
                    ))}
                  </div>
                )}
                {Object.keys(blockBreakdown.byAC).length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20 shrink-0">AC</span>
                    {Object.entries(blockBreakdown.byAC).map(([ac, count]) => (
                      <span key={ac} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
                        ac === 'ac' ? 'bg-sky-50 border-sky-100 text-sky-700' :
                        ac === 'cooler' ? 'bg-cyan-50 border-cyan-100 text-cyan-700' :
                        'bg-muted/60 border-border/60 text-muted-foreground'
                      }`}>
                        {AC_LABELS[ac] ?? ac}
                        <span className="tabular-nums font-bold">{count}</span>
                      </span>
                    ))}
                  </div>
                )}
                {Object.keys(blockBreakdown.byCategory).length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20 shrink-0">Category</span>
                    {Object.entries(blockBreakdown.byCategory).map(([cat, count]) => (
                      <span key={cat} className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 border border-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                        {cat}
                        <span className="tabular-nums font-bold text-violet-900">{count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Floors header + Add ──────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-sm font-semibold">
          Floors <span className="font-normal text-muted-foreground tabular-nums">({floorSummary.length})</span>
        </p>
        {canEdit && (
          <Button size="sm" className="h-8" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Floor
          </Button>
        )}
      </div>

      {/* ── Per-floor cards ──────────────────────────────────── */}
      {floorSummary.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No floors in this block yet.</p>
            {canEdit && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">Use “Add Floor”, then add rooms to it.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        floorSummary.map((floor) => {
          const pct = floor.capacity > 0 ? Math.round((floor.occupied / floor.capacity) * 100) : 0;
          const isEmpty = floor.rooms === 0;
          const inactive = floor.is_active === false;
          const freeBeds = floor.available ?? Math.max(floor.capacity - floor.occupied, 0);
          const hasBreakdown =
            Object.keys(floor.byType ?? {}).length > 0 ||
            Object.keys(floor.byAC ?? {}).length > 0 ||
            Object.keys(floor.byCategory ?? {}).length > 0;

          const barColor  = isEmpty ? 'bg-muted-foreground/30' : pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : pct >= 50 ? 'bg-emerald-500' : 'bg-blue-400';
          const pctColor  = pct >= 95 ? 'text-red-600'   : pct >= 80 ? 'text-orange-600' : pct >= 50 ? 'text-emerald-600' : 'text-blue-600';
          const badgeBg   = isEmpty ? 'bg-muted text-muted-foreground' : pct >= 95 ? 'bg-red-50 text-red-700' : pct >= 80 ? 'bg-orange-50 text-orange-700' : pct >= 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700';

          return (
            <Card
              key={floor.floor}
              className={`overflow-hidden border border-border/60 shadow-sm ${inactive ? 'opacity-70' : ''}`}
            >
              {/* Severity accent stripe */}
              <div className={`h-1 w-full ${barColor}`} />

              <CardContent className="p-5 space-y-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 h-9 w-9 rounded-lg ${badgeBg} flex items-center justify-center shrink-0 font-bold text-sm tabular-nums`}>
                      {floor.floor === 0 ? 'G' : floor.floor}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm leading-none">{floor.label}</p>
                        {inactive && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="tabular-nums">{floor.rooms}</span> room{floor.rooms !== 1 ? 's' : ''} ·{' '}
                        <span className="tabular-nums">{floor.occupied}</span>/<span className="tabular-nums">{floor.capacity}</span> beds occupied
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {!isEmpty && (
                      <div className="text-right">
                        <p className={`text-2xl font-bold tabular-nums leading-none ${pctColor}`}>{pct}%</p>
                        <p className="text-xs text-muted-foreground mt-0.5">full</p>
                      </div>
                    )}
                    <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                      <Link href={`/campus-living/blocks/${blockId}/rooms?floor=${floor.floor}`}>
                        View Rooms
                      </Link>
                    </Button>
                    {canEdit && floor.floor_id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Manage ${floor.label}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(floor)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit floor
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={updateFloor.isPending}
                            onClick={() => updateFloor.mutate({ id: floor.floor_id!, is_active: inactive })}
                          >
                            <Power className="mr-2 h-4 w-4" /> {inactive ? 'Activate' : 'Deactivate'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(floor)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete floor
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {isEmpty ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3.5 py-3">
                    <p className="text-xs text-muted-foreground">No rooms on this floor yet.</p>
                    {canEdit && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                        <Link href={`/campus-living/blocks/${blockId}/rooms/new?floor=${floor.floor}`}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add rooms
                        </Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Progress bar with endpoint labels */}
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                        <span>{floor.occupied} occupied</span>
                        <span>{freeBeds} free</span>
                      </div>
                    </div>

                    {/* Stat pills */}
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border/40 px-2.5 py-1 text-xs font-medium text-foreground">
                        <BedDouble className="h-3 w-3 text-muted-foreground" />
                        <span className="tabular-nums">{freeBeds}</span> beds free
                      </span>
                      {(floor.studentRooms ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                          <Users className="h-3 w-3" />
                          <span className="tabular-nums">{floor.studentRooms}</span> student
                        </span>
                      )}
                      {(floor.specialRooms ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                          <DoorOpen className="h-3 w-3" />
                          <span className="tabular-nums">{floor.specialRooms}</span> special
                        </span>
                      )}
                      {(floor.attachedBathrooms ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          <span className="tabular-nums">{floor.attachedBathrooms}</span> attached bath
                        </span>
                      )}
                    </div>

                    {/* Breakdown grid — only when data exists */}
                    {hasBreakdown && (
                      <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {Object.keys(floor.byType ?? {}).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Room Type</p>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(floor.byType ?? {}).map(([type, count]) => (
                                <span key={type} className="inline-flex items-center gap-1 rounded-md bg-white border border-blue-100 px-2 py-0.5 text-xs text-blue-800 capitalize shadow-sm">
                                  {type} <span className="font-bold tabular-nums">{count}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {Object.keys(floor.byAC ?? {}).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AC Status</p>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(floor.byAC ?? {}).map(([ac, count]) => (
                                <span key={ac} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs shadow-sm ${
                                  ac === 'ac'     ? 'bg-sky-50 border-sky-100 text-sky-800' :
                                  ac === 'cooler' ? 'bg-cyan-50 border-cyan-100 text-cyan-800' :
                                  'bg-white border-border/60 text-muted-foreground'
                                }`}>
                                  {AC_LABELS[ac] ?? ac} <span className="font-bold tabular-nums">{count}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {Object.keys(floor.byCategory ?? {}).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</p>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(floor.byCategory ?? {}).map(([cat, count]) => (
                                <span key={cat} className="inline-flex items-center gap-1 rounded-md bg-white border border-violet-100 px-2 py-0.5 text-xs text-violet-800 shadow-sm">
                                  {cat} <span className="font-bold tabular-nums">{count}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <FloorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        blockId={blockId}
        floor={editing}
        takenNumbers={takenNumbers}
        suggestedNumber={suggestedNumber}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && !deleteFloor.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.rooms > 0
                ? `This floor still has ${deleting.rooms} room${deleting.rooms !== 1 ? 's' : ''}. Move or delete them first — a floor can only be deleted when it is empty.`
                : 'This removes the floor from the block. You can add it again later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFloor.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteFloor.isPending || (deleting?.rooms ?? 0) > 0}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteFloor.isPending ? 'Deleting…' : 'Delete floor'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
