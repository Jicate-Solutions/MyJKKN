'use client';

// app/(routes)/events/tournament/[id]/passes/_components/tournament-passes-board.tsx
//
// Printable QR entry-pass board for a sports tournament. Mirrors the visual shape
// of the shared marathon board (components/events/shared/qr-board.tsx) — searchable
// card grid, generated/count header, per-card download — but reads the tournament
// passes API (which returns each QR inline as a PNG data URL), because that "shared"
// board is hard-wired to the marathon model (BIB numbers + events_registrations +
// /api/events/marathon/... image routes) and cannot render tournament entries.
//
// Each pass encodes the entry's access_code (or its id) so a gate scanner can
// resolve the entry at check-in. Uses JKKN LEARNER terminology in user copy.

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Download,
  Printer,
  QrCode,
  Search,
  Trophy,
  Users,
} from 'lucide-react';

export interface TournamentPass {
  id: string;
  entry_name: string;
  entry_type?: string;
  division_id: string;
  division_label: string;
  institution_name: string | null;
  is_external: boolean;
  seed: number | null;
  status: string;
  code: string;
  qr: string; // PNG data URL
}

const statusTone: Record<string, string> = {
  confirmed: 'border-green-200 bg-green-50 text-green-700',
  registered: 'border-blue-200 bg-blue-50 text-blue-700',
};

function shortCode(code: string): string {
  // UUIDs are long; show a scan-friendly short tail for the printed pass.
  return code.length > 8 ? code.slice(-8).toUpperCase() : code.toUpperCase();
}

export function TournamentPassesBoard({
  passes,
  eventName,
}: {
  passes: TournamentPass[];
  eventName: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (searchQuery.length < 2) return passes;
    const q = searchQuery.toLowerCase();
    return passes.filter(
      (p) =>
        p.entry_name?.toLowerCase().includes(q) ||
        p.division_label?.toLowerCase().includes(q) ||
        p.institution_name?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q)
    );
  }, [passes, searchQuery]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  const handleDownloadSingle = (pass: TournamentPass) => {
    const link = document.createElement('a');
    link.href = pass.qr;
    const safeName = pass.entry_name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
    link.download = `pass-${safeName}-${shortCode(pass.code)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Header + actions (hidden when printing) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h3 className="text-base font-semibold">Entry Passes</h3>
          <p className="text-sm text-muted-foreground">
            {passes.length} active {passes.length === 1 ? 'entry' : 'entries'}
            <span> &middot; scan at the gate to check learners in</span>
          </p>
        </div>
        <Button size="sm" onClick={handlePrint} disabled={!passes.length} className="gap-1.5">
          <Printer className="h-4 w-4" />
          Print all passes
        </Button>
      </div>

      {/* Search (hidden when printing) */}
      <Card className="print:hidden">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by entry, division, institution or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary" className="whitespace-nowrap">
              <Users className="mr-1 h-3 w-3" />
              {filtered.length}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Print-only header band */}
      <div className="hidden print:block">
        <h2 className="text-lg font-bold">{eventName} — Entry Passes</h2>
        <p className="text-sm text-gray-600">{filtered.length} passes</p>
      </div>

      {/* Grid / empty state */}
      {filtered.length === 0 ? (
        <Card className="print:hidden">
          <CardContent className="py-16 text-center text-muted-foreground">
            <QrCode className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">
              {searchQuery.length >= 2
                ? `No entries match "${searchQuery}"`
                : 'No active entries to issue passes for.'}
            </p>
            <p className="mt-1 text-sm">
              Passes are issued for registered and confirmed entries. Withdrawn or
              disqualified entries are excluded.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 print:grid-cols-3 print:gap-3">
          {filtered.map((pass) => (
            <Card
              key={pass.id}
              className="group overflow-hidden transition-shadow hover:shadow-md print:border print:shadow-none print:break-inside-avoid"
            >
              <CardContent className="flex flex-col items-center gap-2 p-3">
                <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pass.qr}
                    alt={`Entry pass QR for ${pass.entry_name}`}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                  <div className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs shadow-sm"
                      onClick={() => handleDownloadSingle(pass)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      Download
                    </Button>
                  </div>
                </div>

                <div className="w-full space-y-1 text-center">
                  <p className="truncate text-sm font-semibold" title={pass.entry_name}>
                    {pass.entry_name}
                  </p>
                  {pass.division_label && (
                    <p className="flex items-center justify-center gap-1 truncate text-xs text-muted-foreground">
                      <Trophy className="h-3 w-3 shrink-0" />
                      <span className="truncate">{pass.division_label}</span>
                    </p>
                  )}
                  {pass.institution_name && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {pass.institution_name}
                      {pass.is_external && ' (external)'}
                    </p>
                  )}
                  <div className="flex items-center justify-center gap-1.5">
                    {pass.seed != null && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        Seed {pass.seed}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`px-1.5 py-0 text-[10px] capitalize ${
                        statusTone[pass.status] ?? 'text-muted-foreground'
                      }`}
                    >
                      {pass.status}
                    </Badge>
                  </div>
                  <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
                    {shortCode(pass.code)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
