'use client';

import { useState } from 'react';
import {
  useCampaigns,
  useCampaignsCompare,
} from '@/hooks/admission/use-campaigns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AttributionModeToggle } from '@/components/admission/marketing/attribution-mode-toggle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import type { AttributionMode } from '@/types/admission/campaign';

export default function CompareCampaignsPage() {
  const [selected, setSelected] = useState<string[]>([]);
  // 'any' default keeps this view consistent with the campaign detail page
  // and the per-link capture_count — every lead a campaign has touched
  // counts (including re-captures merged into existing leads).
  const [mode, setMode] = useState<AttributionMode>('any');
  const { data: campaigns } = useCampaigns();
  const { data: compare } = useCampaignsCompare(selected, mode);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 5
          ? [...prev, id]
          : prev,
    );
  }

  return (
    <PermissionGuard module="admission.marketing" action="view">
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Compare campaigns</h1>

        <Card>
          <CardHeader>
            <CardTitle>Pick 2-5 campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(campaigns ?? []).map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2"
              >
                <Checkbox
                  checked={selected.includes(c.id)}
                  onCheckedChange={() => toggle(c.id)}
                  disabled={
                    !selected.includes(c.id) && selected.length >= 5
                  }
                />
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({c.source}, {c.status})
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <AttributionModeToggle value={mode} onChange={setMode} />

        {compare && compare.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Captures</TableHead>
                <TableHead className="text-right">Qualified</TableHead>
                <TableHead className="text-right">Applied</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">CPL</TableHead>
                <TableHead className="text-right">CPE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compare.map((r) => (
                <TableRow key={r.campaign_id}>
                  <TableCell>{r.campaign_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.clicks}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.captures}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.qualified}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.applied}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.enrolled}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.cpl ? `₹${r.cpl}` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.cpe ? `₹${r.cpe}` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PermissionGuard>
  );
}
