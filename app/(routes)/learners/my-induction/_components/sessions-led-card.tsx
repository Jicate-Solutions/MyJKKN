'use client';

// "Sessions you led" — credit surface for people who presented an induction
// session (senior students + staff). Self-scoped via fn_induction_sessions_led
// (defaults to the caller). Renders nothing when you led none, so it never
// clutters a fresher's view.
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { InductionService, type SessionLedRow } from '@/lib/services/induction/induction-service';
import { Mic, CalendarDays, MapPin } from 'lucide-react';

export function SessionsLedCard() {
  const [rows, setRows] = useState<SessionLedRow[] | null>(null);

  useEffect(() => {
    InductionService.getSessionsLed().then(setRows).catch(() => setRows([]));
  }, []);

  // nothing led (or still loading) → render nothing
  if (!rows || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-emerald-600" />
          <CardTitle className="text-base">Sessions you led</CardTitle>
        </div>
        <CardDescription>
          Induction sessions you presented as a resource person — your contribution on record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((s) => (
          <div key={s.session_id} className="rounded-md border p-3">
            <div className="font-medium text-sm">{s.title || 'Session'}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {s.event_name && <span>{s.event_name}</span>}
              {s.start_at && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {new Date(s.start_at).toLocaleDateString()}
                </span>
              )}
              {s.venue_text && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{s.venue_text}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
