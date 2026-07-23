'use client';

// =====================================================================
// PromotionSuggestionsClient — Wave 3 M10 interactive island
// =====================================================================
// Renders the pending hr_policy_promotion_suggestions rows and handles
// the Director's approve / dismiss decisions. All mutations go through
// the browser Supabase client so RLS (super_admin/admin only) enforces
// authorization. Every action also writes an hr_policy_audit_log row
// under action='promote_to_global' so the audit trail captures both
// promote AND dismiss alongside Save/Publish events.
// =====================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, X, Globe, ShieldCheck, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import { createClientSupabaseClient } from '@/lib/supabase/client';

import type { PromotionSuggestionRow } from './types';

interface Props {
  rows: PromotionSuggestionRow[];
}

type DialogMode =
  | { kind: 'closed' }
  | { kind: 'promote'; row: PromotionSuggestionRow }
  | { kind: 'dismiss'; row: PromotionSuggestionRow };

export function PromotionSuggestionsClient({ rows }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogMode>({ kind: 'closed' });
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  const openPromote = (row: PromotionSuggestionRow) => {
    setReason('');
    setDialog({ kind: 'promote', row });
  };

  const openDismiss = (row: PromotionSuggestionRow) => {
    setReason('');
    setDialog({ kind: 'dismiss', row });
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialog({ kind: 'closed' });
    setReason('');
  };

  async function handleSubmit() {
    if (dialog.kind === 'closed') return;
    const trimmedReason = reason.trim();

    if (dialog.kind === 'dismiss' && trimmedReason.length === 0) {
      toast.error('Dismissal reason is required.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be signed in to act on a suggestion.');
        return;
      }

      const row = dialog.row;

      if (dialog.kind === 'promote') {
        // Step 1: Insert a new platform_policies row with scope_type='global'
        // and value/classification copied from the snapshot. We do not delete
        // the per-institution rows — those remain as explicit overrides until
        // a Director chooses to clean them up. fn_get_policy resolves
        // institution > global, so behavior is preserved.
        const { error: insertError } = await supabase
          .from('platform_policies')
          .insert({
            policy_key: row.policy_key,
            scope_type: 'global',
            scope_id: null,
            value: row.snapshot_value as never,
            classification: row.snapshot_classification,
            data_type: 'object',
            is_system: false,
            publication_state: 'published',
            updated_by: user.id,
          });

        if (insertError) {
          // 23505 = unique_violation; means a global row was created between
          // suggestion-time and now. Treat as benign and continue to mark
          // suggestion resolved.
          if (insertError.code !== '23505') {
            throw insertError;
          }
        }

        // Step 2: Look up the global row id for the audit log FK (NOT NULL).
        const { data: globalRow, error: lookupError } = await supabase
          .from('platform_policies')
          .select('id')
          .eq('policy_key', row.policy_key)
          .eq('scope_type', 'global')
          .is('scope_id', null)
          .single();

        if (lookupError || !globalRow) {
          throw lookupError ?? new Error('Global policy row not found after insert');
        }

        // Step 3: Audit-log the promotion. Reason falls back to a system
        // string when the Director leaves the optional reason blank.
        const auditReason =
          trimmedReason.length > 0
            ? trimmedReason
            : `Promoted to global on Director confirm. Identical across ${row.identical_institution_count} institution${row.identical_institution_count === 1 ? '' : 's'} for ${row.identical_days} days.`;

        const { error: auditError } = await supabase
          .from('hr_policy_audit_log')
          .insert({
            policy_id: globalRow.id,
            policy_key: row.policy_key,
            scope_type: 'global',
            scope_id: null,
            action: 'promote_to_global',
            old_value: null,
            new_value: row.snapshot_value as never,
            reason: auditReason,
            edited_by: user.id,
          });

        if (auditError) throw auditError;

        // Step 4: Mark suggestion approved.
        const { error: suggestionError } = await supabase
          .from('hr_policy_promotion_suggestions')
          .update({
            status: 'approved',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (suggestionError) throw suggestionError;

        toast.success('Promoted to global.', {
          description: `${row.policy_key} now has a global default.`,
        });
      } else {
        // dismiss flow
        // Audit-log the dismissal so future detectors / Directors can see
        // the reason. policy_id FK is NOT NULL — look up the institution
        // row we matched against (any row works for the FK; we use the
        // first one to keep the join meaningful).
        const { data: anyRow, error: lookupError } = await supabase
          .from('platform_policies')
          .select('id')
          .eq('policy_key', row.policy_key)
          .eq('scope_type', 'institution')
          .limit(1)
          .maybeSingle();

        if (lookupError) throw lookupError;

        if (anyRow) {
          const { error: auditError } = await supabase
            .from('hr_policy_audit_log')
            .insert({
              policy_id: anyRow.id,
              policy_key: row.policy_key,
              scope_type: 'institution',
              scope_id: null,
              action: 'promote_to_global',
              old_value: row.snapshot_value as never,
              new_value: null,
              reason: `[DISMISSED] ${trimmedReason}`,
              edited_by: user.id,
            });

          if (auditError) throw auditError;
        }

        const { error: suggestionError } = await supabase
          .from('hr_policy_promotion_suggestions')
          .update({
            status: 'denied',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            dismissal_reason: trimmedReason,
          })
          .eq('id', row.id);

        if (suggestionError) throw suggestionError;

        toast.success('Suggestion dismissed.', {
          description: `${row.policy_key} will not be promoted.`,
        });
      }

      setDialog({ kind: 'closed' });
      setReason('');
      startTransition(() => router.refresh());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Action failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((row) => (
          <SuggestionCard
            key={row.id}
            row={row}
            onPromote={() => openPromote(row)}
            onDismiss={() => openDismiss(row)}
          />
        ))}
      </div>

      <AlertDialog
        open={dialog.kind !== 'closed'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <AlertDialogContent>
          {dialog.kind === 'promote' && (
            <PromoteDialogContent
              row={dialog.row}
              reason={reason}
              setReason={setReason}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          )}
          {dialog.kind === 'dismiss' && (
            <DismissDialogContent
              row={dialog.row}
              reason={reason}
              setReason={setReason}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Suggestion card
// ---------------------------------------------------------------------------

function SuggestionCard({
  row,
  onPromote,
  onDismiss,
}: {
  row: PromotionSuggestionRow;
  onPromote: () => void;
  onDismiss: () => void;
}) {
  const snapshotJson = useMemo(
    () => JSON.stringify(row.snapshot_value, null, 2),
    [row.snapshot_value]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-mono break-all">
            {row.policy_key}
          </CardTitle>
          <Badge
            variant={row.snapshot_classification === 'major' ? 'default' : 'outline'}
            className="shrink-0"
          >
            {row.snapshot_classification}
          </Badge>
        </div>
        <CardDescription>
          Identical across{' '}
          <span className="font-medium text-foreground">
            {row.identical_institution_count} institution
            {row.identical_institution_count === 1 ? '' : 's'}
          </span>{' '}
          for{' '}
          <span className="font-medium text-foreground">
            {row.identical_days} day{row.identical_days === 1 ? '' : 's'}
          </span>
          . Suggested {formatTimestamp(row.suggested_at)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">
            Current shared value
          </Label>
          <pre className="mt-1 max-h-32 overflow-auto rounded-md border bg-muted p-2 text-xs font-mono">
            {snapshotJson}
          </pre>
        </div>
        <div className="flex gap-2">
          <Button onClick={onPromote} className="gap-1">
            <Globe className="h-4 w-4" />
            Promote to global
          </Button>
          <Button onClick={onDismiss} variant="outline" className="gap-1">
            <X className="h-4 w-4" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dialog contents
// ---------------------------------------------------------------------------

function PromoteDialogContent({
  row,
  reason,
  setReason,
  submitting,
  onSubmit,
}: {
  row: PromotionSuggestionRow;
  reason: string;
  setReason: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Promote to global default?
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-2 text-left">
            <p>
              This will create a global default for{' '}
              <code className="font-mono text-xs">{row.policy_key}</code>.
              Existing per-institution rows are kept as overrides; institutions
              that drop their override later will fall through to this default.
            </p>
            <p className="text-xs text-muted-foreground">
              The promotion is recorded in the audit log under{' '}
              <code>promote_to_global</code>. An optional note can be added below.
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-2">
        <Label htmlFor="promote-reason" className="text-sm">
          Optional note (audit log)
        </Label>
        <Textarea
          id="promote-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`e.g. confirmed with HR leads — every college uses the same ${row.snapshot_classification} default`}
          rows={3}
          disabled={submitting}
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Promoting...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Promote
            </>
          )}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

function DismissDialogContent({
  row,
  reason,
  setReason,
  submitting,
  onSubmit,
}: {
  row: PromotionSuggestionRow;
  reason: string;
  setReason: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const trimmed = reason.trim();
  const reasonInvalid = trimmed.length === 0;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          <X className="h-5 w-5 text-destructive" />
          Dismiss this suggestion?
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-2 text-left">
            <p>
              The system flagged{' '}
              <code className="font-mono text-xs">{row.policy_key}</code> as a
              candidate for promotion. Dismissing will keep the per-institution
              rows as-is and record your reason in the audit log.
            </p>
            <p className="text-xs text-muted-foreground">
              A reason is required so future Directors understand why this
              suggestion was rejected.
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-2">
        <Label htmlFor="dismiss-reason" className="text-sm">
          Dismissal reason (required)
        </Label>
        <Textarea
          id="dismiss-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Each institution must control this value independently for compliance reasons"
          rows={3}
          disabled={submitting}
        />
        {reasonInvalid && (
          <p className="text-xs text-destructive">A reason is required.</p>
        )}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onSubmit}
          disabled={submitting || reasonInvalid}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Dismissing...
            </>
          ) : (
            <>
              <X className="h-4 w-4 mr-2" />
              Dismiss
            </>
          )}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
