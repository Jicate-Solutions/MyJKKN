'use client';

// ============================================================================
// Choose Your Menu — admin dish-demand board + return-arc trigger (Mode B)
// ----------------------------------------------------------------------------
// The "demand heatmap" the spec asks for: top-voted library dishes (net score
// + voters) so the chairperson can compose future menus from what residents
// actually want. Each row carries the return-arc CLOSER — "Thank voters" fires
// fn_mess_choose_recognize_voted_dish, which confers 'vote_landed' recognition
// on every upvoter, but ONLY if that dish is verifiably on a real menu cell for
// the chosen week (integrity, not theatre) and never double-recognises.
//
// Reads the same anon-revoked aggregate (fn_mess_choose_live_counts) the
// resident leaderboard uses, so per-resident votes never reach the client.
// ============================================================================

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Megaphone, Trophy } from 'lucide-react';
import {
  useLiveVoteCounts,
  useRecognizeVotedDish,
} from '@/hooks/campus-living/use-choose-your-menu';

/** Monday (local) of the current week — the default "which week did it land" value. */
function mondayOfThisWeek(): string {
  const d = new Date();
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const RECOGNIZE_ERROR: Record<string, string> = {
  not_authorized: 'You need menu-publish permission to do this.',
  dish_not_on_menu:
    'Add this dish to that week’s menu first — recognition only fires for dishes that actually landed.',
  invalid_dish: 'That dish was not found.',
  not_authenticated: 'Please sign in again.',
};

export function DishDemandCard() {
  const [week, setWeek] = useState(mondayOfThisWeek());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { data: leaderboard, isLoading } = useLiveVoteCounts(true, 20);
  const recognize = useRecognizeVotedDish();

  async function handleRecognize(itemId: string, dish: string) {
    setPendingId(itemId);
    try {
      const res = await recognize.mutateAsync({ itemId, weekStart: week });
      if (res.ok && (res.recognised ?? 0) > 0) {
        toast.success(`Recognised ${res.recognised} resident(s) who asked for ${res.dish ?? dish}.`);
      } else if (res.ok) {
        toast.info(`Everyone who voted for ${res.dish ?? dish} was already thanked for that week.`);
      } else {
        toast.error(RECOGNIZE_ERROR[res.error ?? ''] ?? `Could not recognise (${res.error}).`);
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-amber-600" />
          Choose Your Menu — dish demand
        </CardTitle>
        <CardDescription>
          What residents are voting for (net score · voters). When you put a
          top-voted dish on a week’s menu, click <strong>Thank voters</strong>{' '}
          to recognise everyone who asked for it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="demand-week">
            Landed on the week starting
          </label>
          <Input
            id="demand-week"
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className="w-44"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !leaderboard || leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No dish votes yet. Once residents start rating dishes, the demand
            board fills in here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Dish</TableHead>
                <TableHead className="text-right">Net score</TableHead>
                <TableHead className="text-right">Voters</TableHead>
                <TableHead className="text-right">Return-arc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((d, idx) => (
                <TableRow key={d.item_id}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{d.dish}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant={d.net_score > 0 ? 'secondary' : 'outline'}>
                      {d.net_score > 0 ? `+${d.net_score}` : d.net_score}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.voters}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={recognize.isPending && pendingId === d.item_id}
                      onClick={() => handleRecognize(d.item_id, d.dish)}
                    >
                      {recognize.isPending && pendingId === d.item_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Megaphone className="h-4 w-4" />
                      )}
                      <span className="ml-1.5">Thank voters</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
