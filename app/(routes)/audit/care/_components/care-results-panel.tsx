// app/(routes)/audit/care/_components/care-results-panel.tsx
// Post-completion results: gap rules fired, two-scorer variance, and the
// corrective-move composer. Rules suggest DRAFT findings — nothing is filed
// until the owner confirms in the dialog (spec §6 no-silent-auto-filing).
// Mechanism is mandatory: "a move without a mechanism defaults to habit".
//
// FRAMEWORK-AWARE (additive for CARRE v2.0): pass framework="CARRE" to read
// the v2 gap rules (adds the Respect override) and show the operative verdict
// (the Respect override supersedes the additive band). Default framework="CARE"
// uses the v1 rules unchanged.

'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Check, FileWarning, Scale, ShieldAlert } from 'lucide-react';
import { AuditFindingService } from '@/lib/services/audit';
import {
  gapRules as careGapRules,
  variance as careVariance,
  varianceFindings as careVarianceFindings,
} from '@/lib/services/audit/care-scoring-service';
import {
  gapRules as carreGapRules,
  variance as carreVariance,
  varianceFindings as carreVarianceFindings,
  carreIndex,
} from '@/lib/services/audit/carre-scoring-service';

type ScoreInput = { parameter_code: string; score: number };

/** Minimal finding shape both the CARE and CARRE rule engines satisfy. */
interface PanelFinding {
  rule: string;
  parameter_code: string;
  severity: 'red' | 'yellow';
  title: string;
  note: string;
}

interface PanelVarianceItem {
  parameter_code: string;
  owner_score: number;
  participant_score: number;
  delta: number;
}

const RULE_LABELS: Record<string, string> = {
  floor: 'Floor rule',
  median: 'Median rule',
  system: 'System rule',
  variance: 'Variance rule',
  respect: 'Respect override',
};

const CODE_PREFIX_RE = /^CARR?E-/;

export function CareResultsPanel({
  cycleId,
  ownerScores,
  participantScores,
  institutionId,
  requesterId,
  framework = 'CARE',
}: {
  cycleId: string;
  ownerScores: ScoreInput[];
  participantScores: ScoreInput[];
  institutionId: string | null;
  requesterId: string | null;
  framework?: 'CARE' | 'CARRE';
}) {
  const isCarre = framework === 'CARRE';

  const suggestions = useMemo<PanelFinding[]>(() => {
    if (isCarre) {
      const rules = carreGapRules(ownerScores);
      const varItems = carreVariance(ownerScores, participantScores);
      return [...rules, ...carreVarianceFindings(varItems)];
    }
    const rules = careGapRules(ownerScores);
    const varItems = careVariance(ownerScores, participantScores);
    return [...rules, ...careVarianceFindings(varItems)];
  }, [isCarre, ownerScores, participantScores]);

  const varItems = useMemo<PanelVarianceItem[]>(
    () =>
      isCarre
        ? carreVariance(ownerScores, participantScores)
        : careVariance(ownerScores, participantScores),
    [isCarre, ownerScores, participantScores],
  );

  const operativeVerdict = useMemo(
    () => (isCarre ? carreIndex(ownerScores).operativeVerdict : null),
    [isCarre, ownerScores],
  );
  const respectFrozen = useMemo(
    () => (isCarre ? carreIndex(ownerScores).respectFrozen : false),
    [isCarre, ownerScores],
  );

  const [filed, setFiled] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState<PanelFinding | null>(null);

  const operativeStrip =
    isCarre && operativeVerdict ? (
      <div
        className={
          respectFrozen
            ? 'rounded-md border border-red-300 bg-red-50 p-3 text-xs dark:border-red-800 dark:bg-red-950'
            : 'rounded-md border bg-muted/40 p-3 text-xs'
        }
      >
        <p className={respectFrozen ? 'flex items-start gap-2 text-red-800 dark:text-red-200' : 'flex items-start gap-2'}>
          {respectFrozen && <ShieldAlert className="h-4 w-4 flex-shrink-0" />}
          <span>
            <strong>Operative verdict:</strong> {operativeVerdict}
            {respectFrozen && ' — the Respect override supersedes the additive Index band.'}
          </span>
        </p>
      </div>
    ) : null;

  if (suggestions.length === 0 && varItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            No gap rules fired
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {operativeStrip}
          <p className="text-xs text-muted-foreground">
            No pillar below 8, no median-coverage flag, no habit-dependent (score 1)
            items{isCarre ? ', no Respect override' : ''}
            {participantScores.length > 0 ? ', and no scorer variance ≥ 2' : ''}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileWarning className="h-4 w-4 text-amber-600" />
          Gap rules &amp; corrective moves
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {operativeStrip}

        {varItems.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950">
            <p className="flex items-start gap-2">
              <Scale className="h-4 w-4 flex-shrink-0 text-amber-700" />
              <span>
                <strong>Scorers disagree by ≥ 2 on {varItems.length} item{varItems.length > 1 ? 's' : ''}</strong>{' '}
                ({varItems.map((v) => `${v.parameter_code.replace(CODE_PREFIX_RE, '')} (${v.owner_score} vs ${v.participant_score})`).join(', ')}).
                The framework treats variance as a Clarity finding — the system is
                not legible — before debating whose score is right.
              </span>
            </p>
          </div>
        )}

        <div className="rounded-md border divide-y">
          {suggestions.map((s, i) => {
            const key = `${s.rule}:${s.parameter_code}:${i}`;
            const isFiled = filed.has(key);
            return (
              <div key={key} className="flex items-start gap-3 p-3">
                <Badge
                  variant="outline"
                  className={
                    s.severity === 'red'
                      ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200 flex-shrink-0'
                      : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 flex-shrink-0'
                  }
                >
                  {RULE_LABELS[s.rule] ?? s.rule}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.title}</div>
                  <p className="text-xs text-muted-foreground">{s.note}</p>
                </div>
                {isFiled ? (
                  <Badge variant="outline" className="flex-shrink-0 text-emerald-700 border-emerald-300">
                    <Check className="h-3 w-3 mr-1" />
                    Filed
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0"
                    onClick={() => setComposing(s)}
                  >
                    Corrective move…
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          Suggested findings are drafts — nothing is filed until you confirm a
          corrective move. Each move needs an owner, a mechanism, and a date.
        </p>
      </CardContent>

      {composing && (
        <CorrectiveMoveDialog
          suggestion={composing}
          cycleId={cycleId}
          institutionId={institutionId}
          requesterId={requesterId}
          onClose={() => setComposing(null)}
          onFiled={() => {
            const i = suggestions.indexOf(composing);
            setFiled((prev) => new Set(prev).add(`${composing.rule}:${composing.parameter_code}:${i}`));
            setComposing(null);
          }}
        />
      )}
    </Card>
  );
}

// ============================================================================
// Corrective-move dialog — the framework's template line:
// Pillar · Lowest item · Move (one sentence) · Owner · Mechanism · Re-audit date
// ============================================================================

function CorrectiveMoveDialog({
  suggestion,
  cycleId,
  institutionId,
  requesterId,
  onClose,
  onFiled,
}: {
  suggestion: PanelFinding;
  cycleId: string;
  institutionId: string | null;
  requesterId: string | null;
  onClose: () => void;
  onFiled: () => void;
}) {
  const [move, setMove] = useState('');
  const [owner, setOwner] = useState('');
  const [mechanism, setMechanism] = useState('');
  const [reAuditDate, setReAuditDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFile = !!institutionId && !!requesterId;

  async function handleFile() {
    setError(null);
    if (!move.trim()) {
      setError('Write the move — one sentence.');
      return;
    }
    if (!owner.trim()) {
      setError('Name the owner of this corrective move.');
      return;
    }
    if (!mechanism.trim()) {
      setError('Name the mechanism (CAMU / MyJKKN / Google Chat / calendar). A move without a mechanism defaults to habit — score 1, the score this audit exists to eliminate.');
      return;
    }
    if (!canFile) {
      setError('Your profile has no institution — findings need one. Contact the platform team.');
      return;
    }
    setSubmitting(true);
    try {
      await AuditFindingService.log(
        {
          audit_cycle_id: cycleId,
          parameter_code: suggestion.parameter_code,
          severity: suggestion.severity,
          institution_id: institutionId!,
          notes: [
            suggestion.title,
            '',
            suggestion.note,
            '',
            `Corrective move: ${move.trim()}`,
            `Owner: ${owner.trim()}`,
            `Mechanism: ${mechanism.trim()}`,
            reAuditDate ? `Re-audit date: ${reAuditDate}` : null,
          ]
            .filter((line): line is string => line !== null)
            .join('\n'),
        },
        { requesterId: requesterId! },
      );
      toast.success('Corrective move filed as a finding');
      onFiled();
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not file the finding.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Corrective move — {suggestion.parameter_code}</DialogTitle>
          <DialogDescription className="text-xs">{suggestion.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="cm-move">Move (one sentence)</Label>
            <Textarea
              id="cm-move"
              value={move}
              onChange={(e) => setMove(e.target.value)}
              rows={2}
              className="mt-1 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cm-owner">Owner</Label>
              <Input
                id="cm-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="mt-1"
                placeholder="Who carries this?"
              />
            </div>
            <div>
              <Label htmlFor="cm-date">Re-audit date</Label>
              <Input
                id="cm-date"
                type="date"
                value={reAuditDate}
                onChange={(e) => setReAuditDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cm-mechanism">
              Mechanism it lives in <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cm-mechanism"
              value={mechanism}
              onChange={(e) => setMechanism(e.target.value)}
              className="mt-1"
              placeholder="CAMU / MyJKKN / Google Chat / calendar"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              A move without a mechanism defaults to habit.
            </p>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleFile} disabled={submitting}>
            {submitting ? 'Filing…' : 'File as finding'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
