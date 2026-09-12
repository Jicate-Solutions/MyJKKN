'use client';

// proposal-edit-dialog.tsx — direct edit of an event proposal's date + details.
//
// WHY THIS EXISTS. Until now the only way to change a proposal's date was to
// *ask* for one: /events/propose/[id]/status offered "Request a date", which
// files a row in event_date_requests. There was no screen anywhere that could
// set event_proposals.event_date — so a super admin who owned the proposal
// still had to queue behind a request nobody could answer.
//
// ONE implementation, two mount points (a second copy would be the failure):
//   • /events/proposals            — the admin list, row action
//   • /events/propose/[id]/status  — where the wait is actually felt
//
// Authority mirrors the event_proposals_update RLS policy exactly:
//   is_super_admin() OR is_admin()
//   OR (proposer_id = auth.uid() AND status IN ('submitted','reviewing'))
// RLS remains the gate. This only decides whether to offer the button, and any
// refusal is rendered verbatim (rule #27 — never a silent no-op or redirect).
//
// Writes go direct to the table, matching the approve/reject path already in
// proposals-client.tsx. No new RPC, no new migration: the UPDATE policy above
// already admits the people this serves.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';
import {
  EventProposalAudience,
  EventProposalBudgetBand,
  EventProposalStatus,
  EVENT_PROPOSAL_AUDIENCE_OPTIONS,
  EVENT_PROPOSAL_BUDGET_BANDS,
} from '@/types/events';

/** The subset this control reads and writes. */
export interface EditableProposal {
  id: string;
  title: string;
  event_date: string | null;
  venue: string | null;
  audience: EventProposalAudience[] | null;
  expected_attendance: number | null;
  budget_band: EventProposalBudgetBand | null;
  status: EventProposalStatus;
  proposer_id: string;
}

const SELECT_COLUMNS =
  'id, title, event_date, venue, audience, expected_attendance, budget_band, status, proposer_id';

/** A proposer may still edit only while the proposal is undecided. */
const PROPOSER_EDITABLE_STATUSES: EventProposalStatus[] = ['submitted', 'reviewing'];

interface ProposalEditDialogProps {
  proposalId: string;
  /** Row already in hand (the admin list has it) — skips the fetch. */
  initial?: EditableProposal | null;
  /**
   * Caller's own admin determination, where it already computed one server-side.
   * Kept as a prop rather than re-derived here: this component must not
   * hardcode role names, and there is no client-side is_admin() equivalent.
   */
  viewerIsAdmin?: boolean;
  /** Fired with the saved row so a list can update in place. */
  onSaved?: (updated: EditableProposal) => void;
  buttonSize?: 'sm' | 'default';
  buttonVariant?: 'outline' | 'ghost' | 'default';
}

export function ProposalEditDialog({
  proposalId,
  initial = null,
  viewerIsAdmin = false,
  onSaved,
  buttonSize = 'sm',
  buttonVariant = 'outline',
}: ProposalEditDialogProps) {
  const supabase = createClientSupabaseClient();
  const { isSuperAdmin, userProfile } = usePermissions();

  const [proposal, setProposal] = useState<EditableProposal | null>(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form state — seeded from the proposal each time the dialog opens.
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [venue, setVenue] = useState('');
  const [audience, setAudience] = useState<EventProposalAudience[]>([]);
  const [expectedAttendance, setExpectedAttendance] = useState('');
  const [budgetBand, setBudgetBand] = useState<EventProposalBudgetBand | ''>('');

  const loadProposal = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('event_proposals')
      .select(SELECT_COLUMNS)
      .eq('id', proposalId)
      .maybeSingle();
    if (data) setProposal(data as EditableProposal);
  }, [proposalId, supabase]);

  useEffect(() => {
    if (initial) { setProposal(initial); return; }
    if (!proposalId) return;
    void loadProposal();
  }, [initial, proposalId, loadProposal]);

  const seedForm = (p: EditableProposal) => {
    setTitle(p.title ?? '');
    setEventDate(p.event_date ?? '');
    setVenue(p.venue ?? '');
    setAudience(p.audience ?? []);
    setExpectedAttendance(
      p.expected_attendance === null || p.expected_attendance === undefined
        ? ''
        : String(p.expected_attendance)
    );
    setBudgetBand(p.budget_band ?? '');
    setSaveError(null);
  };

  const canEdit =
    !!proposal &&
    (isSuperAdmin ||
      viewerIsAdmin ||
      (!!userProfile?.id &&
        proposal.proposer_id === userProfile.id &&
        PROPOSER_EDITABLE_STATUSES.includes(proposal.status)));

  // Nothing to offer — render nothing rather than a button that will be refused.
  if (!canEdit || !proposal) return null;

  const toggleAudience = (opt: EventProposalAudience) => {
    setAudience(prev => (prev.includes(opt) ? prev.filter(a => a !== opt) : [...prev, opt]));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError('An event needs a title.');
      return;
    }

    const attendance = expectedAttendance.trim();
    if (attendance && (!/^\d+$/.test(attendance) || Number(attendance) < 1)) {
      setSaveError('Expected attendance must be a whole number of 1 or more.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    const { data, error } = await (supabase as any)
      .from('event_proposals')
      .update({
        title: title.trim(),
        event_date: eventDate || null,
        venue: venue.trim() || null,
        audience,
        expected_attendance: attendance ? Number(attendance) : null,
        budget_band: budgetBand || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    if (!data) {
      // RLS returned no row: the update was refused, or the row moved out of
      // reach. Say so — an empty result must never read as success.
      setSaveError(
        'The change was not saved — you may no longer have access to edit this proposal. Contact the event coordinator.'
      );
      return;
    }

    const updated = data as EditableProposal;
    setProposal(updated);
    onSaved?.(updated);
    setOpen(false);
  };

  return (
    <>
      <Button
        size={buttonSize}
        variant={buttonVariant}
        onClick={() => { seedForm(proposal); setOpen(true); }}
        aria-label={`Edit details for ${proposal.title}`}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Edit details
      </Button>

      <Dialog
        open={open}
        onOpenChange={(isOpen) => { if (!saving) setOpen(isOpen); }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit event details</DialogTitle>
            <DialogDescription>
              Set the date and details directly. Anyone tracking this proposal sees the change
              straight away.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="proposal-title">Event title</Label>
              <Input
                id="proposal-title"
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Annual Sports Day"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="proposal-date">Date</Label>
                <Input
                  id="proposal-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Leave empty if the date is still open.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proposal-venue">Venue</Label>
                <Input
                  id="proposal-venue"
                  value={venue}
                  maxLength={200}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g., Main Auditorium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Who is it for?</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Audience selection">
                {EVENT_PROPOSAL_AUDIENCE_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleAudience(opt)}
                    aria-pressed={audience.includes(opt)}
                    className={[
                      'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      audience.includes(opt)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-input hover:bg-accent',
                    ].join(' ')}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proposal-attendance">Expected attendance</Label>
              <Input
                id="proposal-attendance"
                type="number"
                min="1"
                value={expectedAttendance}
                onChange={(e) => setExpectedAttendance(e.target.value)}
                placeholder="e.g., 200"
                className="max-w-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Budget required</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Budget band selection">
                {EVENT_PROPOSAL_BUDGET_BANDS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBudgetBand(budgetBand === value ? '' : value)}
                    aria-pressed={budgetBand === value}
                    className={[
                      'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      budgetBand === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-input hover:bg-accent',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {saveError && (
              <p
                className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
                role="alert"
              >
                {saveError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ProposalEditDialog;
