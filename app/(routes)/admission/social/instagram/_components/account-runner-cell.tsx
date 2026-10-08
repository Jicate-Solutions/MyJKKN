'use client';

/**
 * "Runs this account" — the one team member who runs an Instagram account:
 * posts a learner's work from it and invites the learner as collaborator
 * (Director's ruling 2026-10-07). Stored in ig_accounts.connected_by, which
 * also decides who gets the "account went silent" alert.
 *
 * Everyone who can see the list sees the name. Only a user with
 * social.instagram.manage gets the Name / Change control; the server checks
 * the same permission again on save.
 */

import { useState } from 'react';
import { UserRound, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MemberPicker, type MemberPickerResult } from '@/components/cohort-core/member-picker';
import { setIgAccountRunner } from '@/services/instagram-service';

interface AccountRunnerCellProps {
  accountId: string;
  username: string;
  runnerId: string | null;
  runnerName: string | null;
  canManage: boolean;
  /** Called after a successful save so the list can refresh. */
  onSaved?: () => void;
}

export function AccountRunnerCell({
  accountId,
  username,
  runnerId,
  runnerName,
  canManage,
  onSaved,
}: AccountRunnerCellProps) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<MemberPickerResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setPicked(null);
    setError(null);
    setOpen(true);
  };

  const save = async (personId: string | null) => {
    setSaving(true);
    setError(null);
    try {
      const result = await setIgAccountRunner(accountId, personId);
      toast.success(
        result.connected_by
          ? `${result.connected_by_name || 'Team member'} now runs @${username}`
          : `Nobody is named for @${username} now`,
      );
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 min-w-[150px]">
      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {runnerId ? (
        <span className="truncate text-sm" title={runnerName ?? undefined}>
          {runnerName || 'Named (no display name)'}
        </span>
      ) : (
        <span className="whitespace-nowrap text-sm text-muted-foreground">Nobody named yet</span>
      )}

      {canManage && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={openDialog}
          aria-label={`${runnerId ? 'Change' : 'Name'} who runs @${username}`}
        >
          <Pencil className="mr-1 h-3 w-3" aria-hidden />
          {runnerId ? 'Change' : 'Name'}
        </Button>
      )}

      {canManage && (
        <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Who runs @{username}?</DialogTitle>
              <DialogDescription>
                This team member posts learners&apos; work from this account and invites
                the learner as collaborator. They also get the alert if the account goes
                quiet.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm">
                <span className="text-muted-foreground">Runs it now: </span>
                {runnerId ? runnerName || 'Named (no display name)' : 'Nobody named yet'}
              </p>
              <MemberPicker
                value={picked}
                onSelect={setPicked}
                onClear={() => setPicked(null)}
                teamMembersOnly
                placeholder="Search team members by name or email…"
                disabled={saving}
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              {runnerId && (
                <Button
                  variant="outline"
                  onClick={() => save(null)}
                  disabled={saving}
                  className="sm:mr-auto"
                >
                  Remove name
                </Button>
              )}
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => picked && save(picked.id)} disabled={!picked || saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
