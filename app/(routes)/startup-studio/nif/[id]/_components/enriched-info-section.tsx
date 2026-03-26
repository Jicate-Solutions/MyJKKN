'use client';

import { useState } from 'react';
import { useUpdateNifCandidate } from '@/hooks/startup-studio';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Pencil, ExternalLink, FileText, Users, MapPin, Shield, Scale } from 'lucide-react';

interface EnrichedInfoSectionProps {
  candidate: any;
}

const KYC_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-blue-100 text-blue-800',
  verified: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const ENTHUSIASM_LABELS: Record<string, string> = {
  uninformed_optimism: 'Uninformed Optimism',
  informed_pessimism: 'Informed Pessimism',
  valley_of_despair: 'Valley of Despair',
  informed_optimism: 'Informed Optimism',
  success: 'Success / Completion',
};

const LEGAL_LABELS: Record<string, string> = {
  proprietorship: 'Proprietorship',
  partnership: 'Partnership',
  llp: 'LLP',
  private_limited: 'Private Limited',
  section_8: 'Section 8 Company',
  opc: 'One Person Company',
};

function InfoRow({ label, value, isLink }: { label: string; value: any; isLink?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
          {value.length > 50 ? value.slice(0, 50) + '...' : value} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <p className="text-sm font-medium">{value}</p>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = false }: { title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-primary transition-colors">
        <Icon className="h-4 w-4" />
        {title}
        <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pb-4 pl-6">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function EnrichedInfoSection({ candidate }: EnrichedInfoSectionProps) {
  const updateCandidate = useUpdateNifCandidate();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  const openEdit = () => {
    setForm({
      dipp_number: candidate?.dipp_number || '',
      incorporation_number: candidate?.incorporation_number || '',
      incorporation_date: candidate?.incorporation_date || '',
      legal_structure: candidate?.legal_structure || '',
      gst_number: candidate?.gst_number || '',
      pan_number: candidate?.pan_number || '',
      pitch_deck_url: candidate?.pitch_deck_url || '',
      elevator_pitch: candidate?.elevator_pitch || '',
      business_plan_url: candidate?.business_plan_url || '',
      customer_count: candidate?.customer_count || 0,
      market_sector: candidate?.market_sector || '',
      target_geography: candidate?.target_geography || '',
      patents_filed: candidate?.patents_filed || 0,
      patents_granted: candidate?.patents_granted || 0,
      trademarks: candidate?.trademarks || 0,
      allocated_space: candidate?.allocated_space || '',
      enthusiasm_curve: candidate?.enthusiasm_curve || '',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v !== '' && v !== null && v !== undefined) cleaned[k] = v;
    }
    await updateCandidate.mutateAsync({ id: candidate.id, data: cleaned });
    setEditOpen(false);
  };

  const hasRegistration = candidate?.dipp_number || candidate?.incorporation_number || candidate?.gst_number || candidate?.pan_number;
  const hasDocs = candidate?.pitch_deck_url || candidate?.elevator_pitch || candidate?.business_plan_url;
  const hasFounders = candidate?.founder_profiles?.length > 0;
  const hasMarket = candidate?.customer_count > 0 || candidate?.market_sector || candidate?.target_geography;
  const hasIP = candidate?.patents_filed > 0 || candidate?.patents_granted > 0 || candidate?.trademarks > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Startup Details</CardTitle>
          <div className="flex items-center gap-2">
            {candidate?.kyc_status && (
              <Badge variant="outline" className={KYC_COLORS[candidate.kyc_status] || ''}>
                KYC: {candidate.kyc_status}
              </Badge>
            )}
            {candidate?.enthusiasm_curve && (
              <Badge variant="outline">
                {ENTHUSIASM_LABELS[candidate.enthusiasm_curve] || candidate.enthusiasm_curve}
              </Badge>
            )}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-2 h-3 w-3" />Edit Details</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Startup Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label>DIPP Number</Label><Input value={form.dipp_number} onChange={e => setForm(f => ({ ...f, dipp_number: e.target.value }))} /></div>
                    <div><Label>Incorporation Number</Label><Input value={form.incorporation_number} onChange={e => setForm(f => ({ ...f, incorporation_number: e.target.value }))} /></div>
                    <div><Label>Incorporation Date</Label><Input type="date" value={form.incorporation_date} onChange={e => setForm(f => ({ ...f, incorporation_date: e.target.value }))} /></div>
                    <div>
                      <Label>Legal Structure</Label>
                      <Select value={form.legal_structure} onValueChange={v => setForm(f => ({ ...f, legal_structure: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(LEGAL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>GST Number</Label><Input value={form.gst_number} onChange={e => setForm(f => ({ ...f, gst_number: e.target.value }))} /></div>
                    <div><Label>PAN Number</Label><Input value={form.pan_number} onChange={e => setForm(f => ({ ...f, pan_number: e.target.value }))} /></div>
                    <div><Label>Pitch Deck URL</Label><Input value={form.pitch_deck_url} onChange={e => setForm(f => ({ ...f, pitch_deck_url: e.target.value }))} /></div>
                    <div><Label>Business Plan URL</Label><Input value={form.business_plan_url} onChange={e => setForm(f => ({ ...f, business_plan_url: e.target.value }))} /></div>
                    <div><Label>Customer Count</Label><Input type="number" value={form.customer_count} onChange={e => setForm(f => ({ ...f, customer_count: parseInt(e.target.value) || 0 }))} /></div>
                    <div><Label>Market Sector</Label><Input value={form.market_sector} onChange={e => setForm(f => ({ ...f, market_sector: e.target.value }))} /></div>
                    <div><Label>Target Geography</Label><Input value={form.target_geography} onChange={e => setForm(f => ({ ...f, target_geography: e.target.value }))} /></div>
                    <div><Label>Patents Filed</Label><Input type="number" value={form.patents_filed} onChange={e => setForm(f => ({ ...f, patents_filed: parseInt(e.target.value) || 0 }))} /></div>
                    <div><Label>Patents Granted</Label><Input type="number" value={form.patents_granted} onChange={e => setForm(f => ({ ...f, patents_granted: parseInt(e.target.value) || 0 }))} /></div>
                    <div><Label>Allocated Space</Label><Input value={form.allocated_space} onChange={e => setForm(f => ({ ...f, allocated_space: e.target.value }))} /></div>
                  </div>
                  <div>
                    <Label>Elevator Pitch</Label>
                    <Textarea value={form.elevator_pitch} onChange={e => setForm(f => ({ ...f, elevator_pitch: e.target.value }))} rows={3} />
                  </div>
                  <div>
                    <Label>Enthusiasm Curve</Label>
                    <Select value={form.enthusiasm_curve} onValueChange={v => setForm(f => ({ ...f, enthusiasm_curve: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select phase..." /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ENTHUSIASM_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSave} disabled={updateCandidate.isPending} className="w-full">
                    Save Details
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {hasRegistration && (
          <Section title="Registration & Legal" icon={Scale} defaultOpen>
            <InfoRow label="DIPP Number" value={candidate?.dipp_number} />
            <InfoRow label="Incorporation #" value={candidate?.incorporation_number} />
            <InfoRow label="Incorporation Date" value={candidate?.incorporation_date} />
            <InfoRow label="Legal Structure" value={candidate?.legal_structure ? LEGAL_LABELS[candidate.legal_structure] : null} />
            <InfoRow label="GST" value={candidate?.gst_number} />
            <InfoRow label="PAN" value={candidate?.pan_number} />
          </Section>
        )}

        {hasDocs && (
          <Section title="Documentation" icon={FileText}>
            <InfoRow label="Pitch Deck" value={candidate?.pitch_deck_url} isLink />
            <InfoRow label="Business Plan" value={candidate?.business_plan_url} isLink />
            {candidate?.elevator_pitch && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground">Elevator Pitch</p>
                <p className="text-sm">{candidate.elevator_pitch}</p>
              </div>
            )}
          </Section>
        )}

        {hasFounders && (
          <Section title={`Founders (${candidate.founder_profiles.length})`} icon={Users}>
            {candidate.founder_profiles.map((f: any, i: number) => (
              <div key={i} className="border rounded-md p-2">
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.role}{f.experience_years ? ` | ${f.experience_years}y exp` : ''}{f.domain ? ` | ${f.domain}` : ''}</p>
                {f.linkedin && <a href={f.linkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">LinkedIn</a>}
              </div>
            ))}
          </Section>
        )}

        {hasMarket && (
          <Section title="Market" icon={MapPin}>
            <InfoRow label="Customers" value={candidate?.customer_count > 0 ? candidate.customer_count : null} />
            <InfoRow label="Sector" value={candidate?.market_sector} />
            <InfoRow label="Geography" value={candidate?.target_geography} />
          </Section>
        )}

        {hasIP && (
          <Section title="Intellectual Property" icon={Shield}>
            <InfoRow label="Patents Filed" value={candidate?.patents_filed > 0 ? candidate.patents_filed : null} />
            <InfoRow label="Patents Granted" value={candidate?.patents_granted > 0 ? candidate.patents_granted : null} />
            <InfoRow label="Trademarks" value={candidate?.trademarks > 0 ? candidate.trademarks : null} />
          </Section>
        )}

        {!hasRegistration && !hasDocs && !hasFounders && !hasMarket && !hasIP && (
          <div className="py-8 text-center text-muted-foreground">
            <p>No detailed startup information yet.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={openEdit}>
              <Pencil className="mr-2 h-3 w-3" />Add Details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
