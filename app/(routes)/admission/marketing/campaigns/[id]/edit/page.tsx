'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCampaign,
  useUpdateCampaign,
} from '@/hooks/admission/use-campaigns';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function CampaignEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: campaign } = useCampaign(id);
  const update = useUpdateCampaign(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDescription(campaign.description ?? '');
      setBudget(campaign.budget_inr?.toString() ?? '');
      setStartsAt(campaign.starts_at?.slice(0, 10) ?? '');
      setEndsAt(campaign.ends_at?.slice(0, 10) ?? '');
    }
  }, [campaign]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await update.mutateAsync({
      name,
      description: description || undefined,
      budget_inr: budget ? parseFloat(budget) : null,
      starts_at: startsAt || null,
      ends_at: endsAt || null,
    });
    router.push(`/admission/marketing/campaigns/${id}`);
  }

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <PermissionGuard module="admission.campaigns" action="edit">
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Edit campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label>Source</Label>
                <Input value={campaign.source} disabled />
                <p className="mt-1 text-xs text-muted-foreground">
                  Source is immutable. Create a new campaign to change it.
                </p>
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div>
                <Label>Budget (INR)</Label>
                <Input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start</Label>
                  <Input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End</Label>
                  <Input
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
