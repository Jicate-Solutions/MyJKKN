'use client';

/**
 * Proposals card for the client detail page — every proposal this client
 * received, with its status (draft / sent / approved / signed / rejected),
 * the amount involved, and one-click buttons to move it to the next step.
 * The server stamps sent_at / approved_at / signed_at on each transition,
 * so "how long approval takes" is always answerable from real timestamps.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileSignature, Plus, Send, CheckCircle2, PenLine, XCircle } from 'lucide-react';
import {
  useClientProposals,
  useCreateProposal,
  useAdvanceProposal,
  type Proposal,
  type ProposalStatus,
} from '@/hooks/solutions/use-proposals';
import { useSolutions } from '@/hooks/solutions/use-solutions';
import { useProspectsByClientId } from '@/hooks/solutions/use-prospects';

const STATUS_CONFIG: Record<ProposalStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  signed: { label: 'Signed', color: 'bg-purple-100 text-purple-800' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
};

/** The single next step each status offers. */
const NEXT_STEP: Partial<
  Record<ProposalStatus, { next: ProposalStatus; label: string; done: string }>
> = {
  draft: { next: 'sent', label: 'Send', done: 'Proposal marked as sent' },
  sent: { next: 'approved', label: 'Approve', done: 'Proposal approved' },
  approved: { next: 'signed', label: 'Mark Signed', done: 'Proposal signed' },
};

const NEXT_STEP_ICON: Partial<Record<ProposalStatus, typeof Send>> = {
  draft: Send,
  sent: CheckCircle2,
  approved: PenLine,
};

/** Sentinel for "not linked" — Radix Select forbids value="". */
const NONE = 'none';

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(value?: number | null): string | null {
  if (value === null || value === undefined) return null;
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function ProposalRow({ proposal }: { proposal: Proposal }) {
  const advanceProposal = useAdvanceProposal();
  const status = STATUS_CONFIG[proposal.status] ?? STATUS_CONFIG.draft;
  const step = NEXT_STEP[proposal.status];
  const StepIcon = NEXT_STEP_ICON[proposal.status];
  const canReject =
    proposal.status === 'draft' || proposal.status === 'sent' || proposal.status === 'approved';

  const handleAdvance = async (next: ProposalStatus, doneMessage: string) => {
    try {
      await advanceProposal.mutateAsync({ id: proposal.id, status: next });
      toast.success(doneMessage);
    } catch (error) {
      console.error('Failed to update proposal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update proposal');
    }
  };

  const timeline = [
    proposal.sent_at && `Sent ${formatDate(proposal.sent_at)}`,
    proposal.approved_at && `Approved ${formatDate(proposal.approved_at)}`,
    proposal.signed_at && `Signed ${formatDate(proposal.signed_at)}`,
  ].filter(Boolean);

  const amount = formatAmount(proposal.amount_inr);

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{proposal.title}</p>
          <Badge className={status.color}>{status.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {amount ?? 'No amount set'}
          {timeline.length > 0
            ? ` · ${timeline.join(' · ')}`
            : ` · Created ${formatDate(proposal.created_at)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {step && (
          <Button
            size="sm"
            variant="outline"
            disabled={advanceProposal.isPending}
            onClick={() => handleAdvance(step.next, step.done)}
          >
            {StepIcon && <StepIcon className="mr-1.5 h-3.5 w-3.5" />}
            {step.label}
          </Button>
        )}
        {canReject && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={advanceProposal.isPending}
            onClick={() => handleAdvance('rejected', 'Proposal rejected')}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}

interface ProposalsCardProps {
  clientId: string;
}

export function ProposalsCard({ clientId }: ProposalsCardProps) {
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [solutionId, setSolutionId] = useState(NONE);
  const [prospectId, setProspectId] = useState(NONE);
  const [notes, setNotes] = useState('');

  const { data: proposalsData, isLoading } = useClientProposals(clientId);
  const { data: solutionsData } = useSolutions({ client_id: clientId, limit: 50 });
  const { data: prospectsData } = useProspectsByClientId(clientId);
  const createProposal = useCreateProposal();

  const proposals: Proposal[] = proposalsData?.data ?? [];
  const solutions: Array<{ id: string; title: string }> =
    (solutionsData as { data?: Array<{ id: string; title: string }> } | undefined)?.data ?? [];
  // useProspectsByClientId may return a bare array or a paginated envelope.
  const prospects: Array<{ id: string; company_name: string; prospect_code?: string }> =
    Array.isArray(prospectsData)
      ? prospectsData
      : ((prospectsData as { data?: Array<{ id: string; company_name: string; prospect_code?: string }> } | undefined)?.data ?? []);

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setSolutionId(NONE);
    setProspectId(NONE);
    setNotes('');
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Give the proposal a title');
      return;
    }
    const parsedAmount = amount.trim() ? Number(amount) : undefined;
    if (parsedAmount !== undefined && (Number.isNaN(parsedAmount) || parsedAmount < 0)) {
      toast.error('Amount must be a number');
      return;
    }
    try {
      await createProposal.mutateAsync({
        client_id: clientId,
        title: title.trim(),
        amount_inr: parsedAmount,
        solution_id: solutionId !== NONE ? solutionId : undefined,
        prospect_id: prospectId !== NONE ? prospectId : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('Proposal created as draft');
      resetForm();
      setIsNewOpen(false);
    } catch (error) {
      console.error('Failed to create proposal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create proposal');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Proposals
          </CardTitle>
          <CardDescription>
            {isLoading
              ? 'Loading proposals...'
              : `${proposals.length} proposal${proposals.length !== 1 ? 's' : ''} for this client`}
          </CardDescription>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setIsNewOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Proposal
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : proposals.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            <FileSignature className="mx-auto h-8 w-8 mb-2" />
            <p>No proposals yet</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setIsNewOpen(true)}
            >
              Create First Proposal
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {proposals.map((proposal) => (
              <ProposalRow key={proposal.id} proposal={proposal} />
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Proposal</DialogTitle>
            <DialogDescription>
              Starts as a draft — send, approve, and mark it signed from the list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proposal-title">Title</Label>
              <Input
                id="proposal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is this proposal for?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-amount">Amount (INR)</Label>
              <Input
                id="proposal-amount"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 150000"
              />
            </div>
            {solutions.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Solution (optional)</Label>
                <Select value={solutionId} onValueChange={setSolutionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not linked</SelectItem>
                    {solutions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {prospects.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Prospect (optional)</Label>
                <Select value={prospectId} onValueChange={setProspectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not linked</SelectItem>
                    {prospects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.company_name}
                        {p.prospect_code ? ` (${p.prospect_code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="proposal-notes">Notes (optional)</Label>
              <Textarea
                id="proposal-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth remembering about this proposal"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsNewOpen(false)}
                disabled={createProposal.isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createProposal.isPending}>
                {createProposal.isPending ? 'Creating...' : 'Create Proposal'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
