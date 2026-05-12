'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateCampaignLink } from '@/hooks/admission/use-campaigns';
import { useCampaignableForms } from '@/hooks/admission/use-campaignable-forms';
import type { LeadSource } from '@/types/admission';

interface Props {
  campaignId: string;
  campaignSource: LeadSource;
  trigger?: React.ReactNode;
}

export function CreateLinkDialog({
  campaignId,
  campaignSource,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState('');
  const [name, setName] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [costInr, setCostInr] = useState('');

  const { data: forms } = useCampaignableForms(campaignSource);
  const create = useCreateCampaignLink(campaignId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      form_id: formId,
      name,
      utm_source: utmSource || undefined,
      utm_medium: utmMedium || undefined,
      utm_campaign: utmCampaign || undefined,
      utm_content: utmContent || undefined,
      cost_inr: costInr ? parseFloat(costInr) : undefined,
    });
    setOpen(false);
    setFormId('');
    setName('');
    setUtmSource('');
    setUtmMedium('');
    setUtmCampaign('');
    setUtmContent('');
    setCostInr('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>+ New Link</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create share link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Form</Label>
            <Select value={formId} onValueChange={setFormId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a form" />
              </SelectTrigger>
              <SelectContent>
                {(forms ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Only published forms with source={campaignSource} are shown.
            </p>
          </div>
          <div>
            <Label>Link name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Facebook creative A"
            />
          </div>
          <details className="space-y-2">
            <summary className="cursor-pointer text-sm">
              Advanced — UTM defaults &amp; cost
            </summary>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Input
                placeholder="utm_source"
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
              />
              <Input
                placeholder="utm_medium"
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
              />
              <Input
                placeholder="utm_campaign"
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
              />
              <Input
                placeholder="utm_content"
                value={utmContent}
                onChange={(e) => setUtmContent(e.target.value)}
              />
              <Input
                placeholder="cost_inr"
                value={costInr}
                onChange={(e) => setCostInr(e.target.value)}
                type="number"
              />
            </div>
          </details>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!formId || !name || create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
