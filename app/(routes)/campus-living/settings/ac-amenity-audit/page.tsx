'use client';

/**
 * AC / Room-Category Audit — /campus-living/settings/ac-amenity-audit
 *
 * READ-ONLY visibility surface (PR ι-b). Decisions 26-29 (2026-05-28): AC is a
 * billable amenity ORTHOGONAL to room category. A prior backfill derived
 * category FROM AC (AC -> Premium, else Classic); that heuristic is
 * wrong-in-principle. This page surfaces rooms where category and AC presence
 * DIVERGE from that old heuristic so a warden can confirm the category is
 * intentionally what it is.
 *
 * No auto-fix — category stays Director-controlled. The AC fact already lives
 * in the amenity system (migration 2026052904000), independent of category.
 *
 * Permission gate: `campus_living.settings.edit` (or super-admin).
 */

import { useEffect, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Info } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  AcAmenityAuditService,
  type AcCategoryAuditRow,
} from '@/lib/services/campus-living/ac-amenity-audit-service';

export default function AcAmenityAuditPage() {
  const { permissions, isSuperAdmin } = usePermissions();
  const canView =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  const [rows, setRows] = useState<AcCategoryAuditRow[]>([]);
  const [divergentOnly, setDivergentOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await AcAmenityAuditService.getAudit(divergentOnly);
        if (active) {
          setRows(data);
          setError(null);
        }
      } catch {
        if (active) setError('Could not load the AC / category audit.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [canView, divergentOnly]);

  if (!canView) {
    return (
      <ContentLayout title="AC / Category Audit">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No access</AlertTitle>
          <AlertDescription>
            You need the campus-living settings permission to view this page.
            Contact your administrator.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="AC / Category Audit">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">AC / Room-Category Audit</h1>
          <p className="text-muted-foreground">
            Rooms where AC presence and room category disagree with the old
            &ldquo;AC = Premium&rdquo; assumption
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Category and AC are independent</AlertTitle>
          <AlertDescription>
            AC is now a separate billable amenity, unrelated to a room&rsquo;s
            category. A Classic room can have AC and a Premium room can be
            non-AC &mdash; both are valid. This list is for review only; there
            is nothing to fix unless a category looks wrong. The room category
            stays exactly as set by the Director.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-2">
          <Switch
            id="divergent-only"
            checked={divergentOnly}
            onCheckedChange={setDivergentOnly}
          />
          <Label htmlFor="divergent-only" className="text-sm">
            Show only rooms that diverge from the old AC = Premium rule
          </Label>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Block</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Has AC?</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Loading&hellip;
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No rooms to review &mdash; category and AC line up everywhere.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.room_id}>
                    <TableCell>{r.block_name ?? '—'}</TableCell>
                    <TableCell>{r.room_number ?? '—'}</TableCell>
                    <TableCell>{r.category_name ?? 'Uncategorised'}</TableCell>
                    <TableCell>
                      {r.has_ac ? (
                        <Badge variant="default">AC</Badge>
                      ) : (
                        <Badge variant="secondary">
                          {r.ac_status === 'cooler' ? 'Cooler' : 'Non-AC'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.diverges
                        ? 'Category & AC differ — independent, review only'
                        : 'Matches old rule'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </ContentLayout>
  );
}
