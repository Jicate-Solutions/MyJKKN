'use client';

// ============================================================================
// /campus-living/mess/caterer-management — Caterer admin: rename, set gender_served (drives dispatch), edit phone (relocated from /admin/mess/caterers 2026-06-01)
// ============================================================================
// Director uses this page to:
//   • Rename the seed placeholders ("Boys Hostel Caterer" / "Girls Hostel
//     Caterer") to the real vendor names once contracts are signed.
//   • Set gender_served per caterer (boys | girls | both) so the menu editor
//     dispatches the right cooker per resident.
//   • Update phone / owner_name / contract dates.
//
// Lean MVP: inline edit via prompts rather than a full form dialog. Future
// PR can swap in a richer editor; this gets Director unblocked today.
// ============================================================================

import { useState } from 'react';
import { ChefHat, Pencil, Loader2, Check } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useAuth } from '@/hooks/use-auth';
import { useMessCaterers, useUpdateMessCaterer } from '@/hooks/campus-living/use-mess-caterers';
import type { GenderServed, MessCaterer } from '@/types/campus-living';

export const navMeta = { label: 'Mess Caterers', icon: 'ChefHat' } as const;

interface InlineRowProps {
  caterer: MessCaterer;
}

function CatererRow({ caterer }: InlineRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(caterer.name);
  const [phone, setPhone] = useState(caterer.phone);
  const [genderServed, setGenderServed] = useState<GenderServed | 'unset'>(
    (caterer.gender_served as GenderServed | null) ?? 'unset',
  );

  const update = useUpdateMessCaterer();

  const handleSave = async () => {
    await update.mutateAsync({
      id: caterer.id,
      payload: {
        name,
        phone,
        gender_served: genderServed === 'unset' ? null : genderServed,
      },
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <TableRow>
        <TableCell className="font-medium">{caterer.name}</TableCell>
        <TableCell>{caterer.phone}</TableCell>
        <TableCell>
          {caterer.gender_served ? (
            <Badge variant="outline">{caterer.gender_served}</Badge>
          ) : (
            <span className="text-xs italic text-muted-foreground">unset</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={caterer.status === 'active' ? 'default' : 'secondary'}>
            {caterer.status}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      </TableCell>
      <TableCell>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8" />
      </TableCell>
      <TableCell>
        <Select value={genderServed} onValueChange={(v) => setGenderServed(v as GenderServed | 'unset')}>
          <SelectTrigger className="h-8 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unset">unset</SelectItem>
            <SelectItem value="boys">boys</SelectItem>
            <SelectItem value="girls">girls</SelectItem>
            <SelectItem value="both">both</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant={caterer.status === 'active' ? 'default' : 'secondary'}>
          {caterer.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function MessCaterersPage() {
  const { profile } = useAuth();
  const institutionId = (profile?.institution_id as string | undefined) ?? undefined;

  const { data: result, isLoading } = useMessCaterers(institutionId);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <header className="mb-6 flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mess Caterers</h1>
            <p className="text-sm text-muted-foreground">
              Rename placeholder caterers, set gender_served, update contact info.
            </p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active caterers</CardTitle>
          </CardHeader>
          <CardContent>
            {!institutionId ? (
              <p className="text-sm text-muted-foreground">
                No institution context loaded.
              </p>
            ) : isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !result || result.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No caterers yet for this institution. (PR 2 seed for JKKN Dental
                creates 2 caterers — confirm the institution matches.)
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>gender_served</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.data.map((c) => (
                    <CatererRow key={c.id} caterer={c as MessCaterer} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
