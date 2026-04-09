'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MapPin, Search } from 'lucide-react';
import type { MarathonRaceTrack } from '@/types/events-marathon';

interface LiveRunnerMapProps {
  runners: MarathonRaceTrack[];
  onSelectRunner: (bib: string) => void;
}

function formatElapsed(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPace(paceSeconds: number): string {
  if (!paceSeconds || paceSeconds <= 0) return '--:--';
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getRunnerStatusColor(runner: MarathonRaceTrack): string {
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  if (runner.updated_at < threeMinAgo) return 'text-red-600 bg-red-50';
  if (runner.pace_per_km > 480) return 'text-yellow-600 bg-yellow-50'; // slower than 8 min/km
  return 'text-green-600 bg-green-50';
}

function getRunnerStatusLabel(runner: MarathonRaceTrack): string {
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  if (runner.updated_at < threeMinAgo) return 'Stationary';
  if (runner.pace_per_km === 0 && runner.distance_km > 0) return 'Finished';
  if (runner.pace_per_km > 480) return 'Slow';
  return 'Active';
}

export function LiveRunnerMap({ runners, onSelectRunner }: LiveRunnerMapProps) {
  const [search, setSearch] = useState('');

  const filtered = runners.filter((r) =>
    r.bib.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Runner Positions
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {runners.length} tracking
          </Badge>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by BIB..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Map placeholder */}
        <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 mb-3 text-center text-xs text-muted-foreground bg-muted/30">
          Map visualization coming soon
        </div>

        {/* Runner data table */}
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="py-2 pr-2 font-medium text-xs text-muted-foreground">BIB</th>
                <th className="py-2 pr-2 font-medium text-xs text-muted-foreground">Distance</th>
                <th className="py-2 pr-2 font-medium text-xs text-muted-foreground">Pace</th>
                <th className="py-2 pr-2 font-medium text-xs text-muted-foreground">Elapsed</th>
                <th className="py-2 font-medium text-xs text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                    {search ? 'No runners matching search' : 'No runner data yet'}
                  </td>
                </tr>
              )}
              {filtered.map((runner) => (
                <tr
                  key={runner.id}
                  className="border-b border-muted/50 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => onSelectRunner(runner.bib)}
                >
                  <td className="py-2 pr-2 font-mono font-medium">{runner.bib}</td>
                  <td className="py-2 pr-2">{runner.distance_km.toFixed(2)} km</td>
                  <td className="py-2 pr-2 font-mono">{formatPace(runner.pace_per_km)} /km</td>
                  <td className="py-2 pr-2 font-mono">{formatElapsed(runner.elapsed_seconds)}</td>
                  <td className="py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getRunnerStatusColor(runner)}`}
                    >
                      {getRunnerStatusLabel(runner)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
