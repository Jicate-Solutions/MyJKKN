'use client';

// ============================================================================
// PrintCardButton — one-click "Print ID Card" for a single person.
// Created: 2026-07-24 — Phase 2 (one-click ID-card printing).
//
// Used on the learner profile detail page and the team-member detail page.
// Identity mapping: POST /api/id-cards/jobs needs profiles.id, so callers pass
//   • learnerId   (learners_profiles.id → resolved via profiles.learner_id), or
//   • profileId   (profiles.id already known, e.g. staff.profile_id), with an
//   • lookupEmail fallback (profiles.email) for team members without profile_id.
//
// Visibility is gated on id_cards.jobs.manage — hidden entirely without it,
// and hidden while permissions are still loading (no flash-deny/flash-allow).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { usePermissions } from '@/hooks/use-permissions';
import {
  enqueuePrintJob,
  fetchIdCardTemplates,
  getLastTemplateId,
  resolveProfileIdByEmail,
  resolveProfileIdForLearner,
  setLastTemplateId,
  type IdCardTemplateOption
} from '@/lib/services/id-cards/print-jobs-client';
import {
  activeTemplatesOnly,
  hasOnlyInactiveTemplates,
  pickPreferredPrintTemplate
} from '@/lib/services/id-cards/template-picker';

// TWO empty states, two remedies. "No template exists" and "templates exist but
// none is switched on" used to share one message, and the shared one pointed at
// a page with no create button — a dead end either way.
export const NO_TEMPLATES_MESSAGE =
  'No ID-card template exists yet. Set one up in Admin → ID Cards → ID Card Template.';

export const NO_ACTIVE_TEMPLATE_MESSAGE =
  'No active template for this college — activate one on Admin → ID Cards → ID Card Template. A template stays off until its verification print passes.';

const DEFAULT_NO_ACCOUNT_MESSAGE =
  'No account yet — ID card becomes available once the learner account is activated.';

// ──────────────────────────────────────────────────────────────────────────────
// Shared template-picker state (also used by BulkPrintDialog)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Shared template-picker state for every PRINT surface (this button, the bulk
 * dialog, and the cohort batch-print dialog that delegates to it).
 *
 * `templates` holds ACTIVE rows only. The query still returns everything —
 * filtering here rather than in PostgREST keeps one round trip AND keeps the
 * fact needed to tell the two empty states apart, which a `.eq('active', true)`
 * would have thrown away.
 */
export function useIdCardTemplates(enabled: boolean) {
  // null = still loading, [] = loaded and nothing is printable
  const [templates, setTemplates] = useState<IdCardTemplateOption[] | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  // Templates exist, but every one of them is still dark.
  const [inactiveOnly, setInactiveOnly] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    fetchIdCardTemplates()
      .then((rows) => {
        if (cancelled) return;
        setTemplates(activeTemplatesOnly(rows));
        setInactiveOnly(hasOnlyInactiveTemplates(rows));
        // Remembered choice, then the first active one, then nothing at all —
        // an inactive template can no longer win either path.
        const preferred = pickPreferredPrintTemplate(rows, getLastTemplateId());
        setSelectedTemplateId(preferred ? preferred.id : '');
      })
      .catch((err) => {
        console.error('[id-cards] Failed to load templates:', err);
        if (!cancelled) {
          setTemplates([]);
          setInactiveOnly(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const selectTemplate = useCallback((id: string) => {
    setSelectedTemplateId(id);
    setLastTemplateId(id);
  }, []);

  return { templates, selectedTemplateId, selectTemplate, inactiveOnly };
}

/** Which empty-state message a print surface should show, or null when fine. */
export function emptyTemplateMessage(
  templates: IdCardTemplateOption[] | null,
  inactiveOnly: boolean
): string | null {
  if (templates === null || templates.length > 0) return null;
  return inactiveOnly ? NO_ACTIVE_TEMPLATE_MESSAGE : NO_TEMPLATES_MESSAGE;
}

export function TemplateSelect({
  templates,
  value,
  onChange,
  className
}: {
  templates: IdCardTemplateOption[] | null;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={!templates || templates.length === 0}
    >
      <SelectTrigger className={className ?? 'h-9 w-[200px]'}>
        <SelectValue
          placeholder={templates === null ? 'Loading templates…' : 'Select template'}
        />
      </SelectTrigger>
      <SelectContent>
        {(templates ?? []).map((t) => (
          <SelectItem
            key={t.id}
            value={t.id}
            className={t.active ? undefined : 'text-muted-foreground'}
          >
            {t.active ? t.name : `${t.name} (inactive)`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// PrintCardButton
// ──────────────────────────────────────────────────────────────────────────────

interface PrintCardButtonProps {
  /** Display name used in toasts (e.g. "Priya R"). */
  personName: string;
  /** learners_profiles.id — resolved to profiles.id via profiles.learner_id. */
  learnerId?: string;
  /** profiles.id when already known (team members via staff.profile_id). */
  profileId?: string | null;
  /** Fallback lookup: profiles.email (team members without profile_id). */
  lookupEmail?: string | null;
  /** Tooltip shown when no account could be resolved. */
  noAccountMessage?: string;
}

export function PrintCardButton({
  personName,
  learnerId,
  profileId,
  lookupEmail,
  noAccountMessage
}: PrintCardButtonProps) {
  const { isSuperAdmin, canAccess, isLoading: permissionsLoading } = usePermissions();
  // Branch on the loading state FIRST — an unknown permission must not
  // flash-deny or flash-allow. While loading we render nothing (same visual
  // as denied, but we never render an actionable button that later vanishes).
  const canManageJobs =
    !permissionsLoading && (isSuperAdmin || canAccess('id_cards.jobs', 'manage'));

  const { templates, selectedTemplateId, selectTemplate, inactiveOnly } =
    useIdCardTemplates(canManageJobs);

  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!canManageJobs) return;
    let cancelled = false;

    async function resolve() {
      try {
        if (profileId) {
          if (!cancelled) setResolvedProfileId(profileId);
          return;
        }
        if (learnerId) {
          const id = await resolveProfileIdForLearner(learnerId);
          if (!cancelled && id) {
            setResolvedProfileId(id);
            return;
          }
        }
        if (lookupEmail) {
          const id = await resolveProfileIdByEmail(lookupEmail);
          if (!cancelled && id) {
            setResolvedProfileId(id);
            return;
          }
        }
        if (!cancelled) setResolvedProfileId(null);
      } catch (err) {
        console.error('[id-cards] Failed to resolve account for print job:', err);
        if (!cancelled) setResolvedProfileId(null);
      } finally {
        if (!cancelled) setResolving(false);
      }
    }

    setResolving(true);
    resolve();
    return () => {
      cancelled = true;
    };
  }, [canManageJobs, profileId, learnerId, lookupEmail]);

  const handlePrint = async () => {
    if (!resolvedProfileId || !selectedTemplateId || submitting) return;
    setSubmitting(true);
    const outcome = await enqueuePrintJob(resolvedProfileId, selectedTemplateId);
    setSubmitting(false);

    if (outcome.status === 'queued') {
      toast.success(`ID card for ${personName} queued for printing`);
    } else if (outcome.status === 'already_queued') {
      toast(`Already in the print queue`);
    } else {
      toast.error(outcome.message);
    }
  };

  // Completely hidden while permissions load or without id_cards.jobs.manage.
  if (!canManageJobs) return null;

  const noTemplates = templates !== null && templates.length === 0;
  const noAccount = !resolving && resolvedProfileId === null;
  const loading = resolving || templates === null;
  const disabled =
    loading || noTemplates || noAccount || !selectedTemplateId || submitting;

  const tooltipMessage = noTemplates
    ? emptyTemplateMessage(templates, inactiveOnly)
    : noAccount
      ? (noAccountMessage ?? DEFAULT_NO_ACCOUNT_MESSAGE)
      : null;

  const button = (
    <Button variant="outline" onClick={handlePrint} disabled={disabled}>
      {submitting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Printer className="mr-2 h-4 w-4" />
      )}
      Print ID Card
    </Button>
  );

  return (
    <div className="flex items-center gap-2">
      {!noTemplates && !noAccount && (
        <TemplateSelect
          templates={templates}
          value={selectedTemplateId}
          onChange={selectTemplate}
        />
      )}
      {tooltipMessage ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span wrapper: disabled buttons swallow pointer events */}
              <span tabIndex={0} className="inline-block">
                {button}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px]">
              {tooltipMessage}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}
    </div>
  );
}
