'use client';

/**
 * LC-005: Client-side actions for Selection page
 * Create election dialog and status management
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { useCreateElection } from '@/hooks/learners-council/use-lc-selection';
import type { ElectionType } from '@/types/learners-council';

interface SelectionClientActionsProps {
  userId: string;
}

export function SelectionClientActions({ userId }: SelectionClientActionsProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ElectionType>('yuva_selection');
  const [termId, setTermId] = useState('');
  const [nomOpen, setNomOpen] = useState('');
  const [nomClose, setNomClose] = useState('');
  const [voteOpen, setVoteOpen] = useState('');
  const [voteClose, setVoteClose] = useState('');

  const createElection = useCreateElection();

  const handleCreate = () => {
    if (!title || !termId || !nomOpen || !nomClose) return;

    createElection.mutate(
      {
        data: {
          title,
          type,
          term_id: termId,
          nominations_open_at: new Date(nomOpen).toISOString(),
          nominations_close_at: new Date(nomClose).toISOString(),
          voting_open_at: voteOpen ? new Date(voteOpen).toISOString() : undefined,
          voting_close_at: voteClose ? new Date(voteClose).toISOString() : undefined
        },
        userId
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle('');
          setTermId('');
          setNomOpen('');
          setNomClose('');
          setVoteOpen('');
          setVoteClose('');
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Election
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Election</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Election Title</Label>
            <Input
              id="title"
              placeholder="e.g., YUVA Chapter Chair Selection 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ElectionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yuva_selection">YUVA Selection</SelectItem>
                  <SelectItem value="lc_progression">LC Progression</SelectItem>
                  <SelectItem value="executive_rotation">Executive Rotation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="term">Term ID</Label>
              <Input
                id="term"
                placeholder="Term UUID"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nomOpen">Nominations Open</Label>
              <Input
                id="nomOpen"
                type="datetime-local"
                value={nomOpen}
                onChange={(e) => setNomOpen(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomClose">Nominations Close</Label>
              <Input
                id="nomClose"
                type="datetime-local"
                value={nomClose}
                onChange={(e) => setNomClose(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="voteOpen">Voting Opens (Optional)</Label>
              <Input
                id="voteOpen"
                type="datetime-local"
                value={voteOpen}
                onChange={(e) => setVoteOpen(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voteClose">Voting Closes (Optional)</Label>
              <Input
                id="voteClose"
                type="datetime-local"
                value={voteClose}
                onChange={(e) => setVoteClose(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleCreate}
            disabled={!title || !termId || !nomOpen || !nomClose || createElection.isPending}
          >
            {createElection.isPending ? 'Creating...' : 'Create Election'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
