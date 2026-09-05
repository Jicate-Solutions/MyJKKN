'use client';

/**
 * Placement observations — the client half.
 *
 * Shows the signed-in person their own observations and lets them add one. It
 * deliberately does NOT show anyone else's: a placement observation names a
 * workplace and sometimes a person inside it, and the RLS on the table says the
 * same thing. A learner seeing a colleague's observation of a third hospital
 * would be a disclosure nobody agreed to.
 *
 * Where an organisation has not signed, the row says so in words rather than
 * showing a blank. "Not named — the partner has not signed" is a state a person
 * can act on; an empty cell is a bug report waiting to happen.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, MapPin, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  PlacementService,
  PARTNER_KIND_LABEL,
  PLACEMENT_QUESTIONS,
  type PlacementObservation,
  type SignedPartner,
} from '@/lib/services/improvement/placement-service';
import { RecordPlacementDialog } from './record-placement-dialog';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unrecorded date';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PlacementsClient({
  currentUserId,
  currentUserName,
  institutionId,
}: {
  currentUserId: string;
  currentUserName: string;
  institutionId: string;
}) {
  const [rows, setRows] = useState<PlacementObservation[]>([]);
  const [partners, setPartners] = useState<SignedPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [mine, signed] = await Promise.all([
        PlacementService.listMine(supabase, currentUserId),
        PlacementService.listSignedPartners(supabase, institutionId),
      ]);
      setRows(mine);
      setPartners(signed);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not load your placement observations.'
      );
    } finally {
      setLoading(false);
    }
  }, [currentUserId, institutionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Placement observations
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            What you saw inside the hospital, school, pharmacy or workshop you
            were placed in. Not a report on the organisation — a record of what
            actually happens there, which nobody outside can see.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Record a visit
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your observations…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <MapPin className="text-muted-foreground mx-auto mb-3 h-7 w-7" />
            <p className="font-medium">Nothing recorded yet</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
              After your next placement, write down what you watched happen
              while it is still fresh. Four questions, and you may answer just
              one of them.
            </p>
            <Button className="mt-5" onClick={() => setDialogOpen(true)}>
              Record your first visit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">
                    {r.partner_name || PARTNER_KIND_LABEL[r.partner_kind]}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {formatWhen(r.observed_at)}
                  </span>
                  {!r.partner_name && (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                      <Lock className="h-3 w-3" />
                      Not named — the partner has not signed
                    </span>
                  )}
                  {r.raised_idea_id && (
                    <span className="text-xs font-medium text-emerald-700">
                      Became an improvement idea
                    </span>
                  )}
                </div>

                <dl className="space-y-2">
                  {PLACEMENT_QUESTIONS.map((q) => {
                    const value = r[q.key];
                    if (!value) return null;
                    return (
                      <div key={q.key}>
                        <dt className="text-muted-foreground text-xs">{q.label}</dt>
                        <dd className="text-sm whitespace-pre-wrap">{value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RecordPlacementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        institutionId={institutionId}
        signedPartners={partners}
        onRecorded={load}
      />

      <p className="text-muted-foreground text-xs">
        Signed in as {currentUserName}. Only you and the board managers for your
        institution can read these.
      </p>
    </div>
  );
}
