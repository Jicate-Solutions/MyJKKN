'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  MessageSquare, Upload, Send, Loader2, CheckCircle,
  FileSpreadsheet, ChevronRight, ArrowLeft, Megaphone, BarChart3,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface ParsedContact {
  phone: string;
  name: string;
  variables: Record<string, string>;
  valid: boolean;
  error?: string;
}

interface ApprovedTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
}

interface BroadcastCampaign {
  campaign_id: string;
  campaign_name: string;
  template_name: string;
  created_at: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
}

// =============================================================================
// CSV Parser
// =============================================================================

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchCampaigns(institutionId: string): Promise<BroadcastCampaign[]> {
  const res = await fetch(`/api/admission/whatsapp-broadcast?institution_id=${institutionId}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

async function uploadContacts(rows: Record<string, string>[]) {
  const res = await fetch('/api/admission/whatsapp-broadcast/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

async function sendBroadcast(input: {
  institution_id: string;
  campaign_name: string;
  template_name: string;
  recipients: { phone: string; variables?: Record<string, string> }[];
}) {
  const res = await fetch('/api/admission/whatsapp-broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Broadcast failed');
  }
  return res.json();
}

// =============================================================================
// BroadcastTab Component
// =============================================================================

export function BroadcastTab({ institutionId }: { institutionId: string }) {
  const [view, setView] = useState<'list' | 'wizard'>('list');
  const [step, setStep] = useState(1);
  const [campaignName, setCampaignName] = useState('');
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [uploadStats, setUploadStats] = useState<{ total: number; valid: number; invalid: number } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ApprovedTemplate | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['wa-broadcast-campaigns', institutionId],
    queryFn: () => fetchCampaigns(institutionId),
    enabled: !!institutionId,
    refetchInterval: 10000,
  });

  const { data: templates } = useQuery({
    queryKey: ['wa-broadcast-templates', institutionId],
    queryFn: async () => {
      const res = await fetch(`/api/admission/settings/whatsapp?action=templates&institution_id=${institutionId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data || []).filter((t: ApprovedTemplate) => t.status === 'APPROVED');
    },
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadContacts,
    onError: (err: Error) => toast.error(err.message),
  });

  const sendMutation = useMutation({
    mutationFn: sendBroadcast,
    onSuccess: (data) => {
      toast.success(`Broadcast sent: ${data.sent} delivered, ${data.failed} failed`);
      queryClient.invalidateQueries({ queryKey: ['wa-broadcast-campaigns'] });
      setView('list');
      resetWizard();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetWizard = () => {
    setStep(1);
    setCampaignName('');
    setContacts([]);
    setUploadStats(null);
    setSelectedTemplate(null);
    setShowConfirm(false);
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) return;
    uploadMutation.mutate(rows, {
      onSuccess: (result) => {
        setContacts(result.contacts);
        setUploadStats({ total: result.total, valid: result.valid_count, invalid: result.invalid_count });
        setCampaignName(file.name.replace(/\.\w+$/, ''));
      },
    });
  }, [uploadMutation]);

  const handleSend = () => {
    if (!selectedTemplate || contacts.length === 0) return;
    sendMutation.mutate({
      institution_id: institutionId,
      campaign_name: campaignName || `Broadcast ${new Date().toLocaleDateString('en-IN')}`,
      template_name: selectedTemplate.name,
      recipients: contacts.map(c => ({ phone: c.phone, variables: c.variables })),
    });
    setShowConfirm(false);
  };

  // Stats
  const totalMessages = campaigns?.reduce((s, c) => s + c.total, 0) || 0;
  const totalDelivered = campaigns?.reduce((s, c) => s + c.delivered + c.read, 0) || 0;

  // ==========================================================================
  // LIST VIEW
  // ==========================================================================
  if (view === 'list') {
    return (
      <div className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{campaigns?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Campaigns</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{totalMessages}</p>
            <p className="text-xs text-muted-foreground">Messages</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{totalDelivered}</p>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </div>
        </div>

        <Button onClick={() => setView('wizard')} className="w-full">
          <Megaphone className="h-4 w-4 mr-2" /> New Broadcast
        </Button>

        {/* Campaign List */}
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (campaigns || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No broadcasts yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(campaigns || []).map(c => (
              <div key={c.campaign_id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{c.campaign_name}</p>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-xs">{c.template_name}</Badge>
                  <span>{c.total} sent</span>
                  <span className="text-green-600">{c.delivered + c.read} delivered</span>
                  {c.failed > 0 && <span className="text-red-600">{c.failed} failed</span>}
                </div>
                <Progress value={c.total > 0 ? ((c.delivered + c.read) / c.total * 100) : 0} className="h-1 mt-2" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // WIZARD VIEW
  // ==========================================================================
  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" onClick={() => { if (step === 1) setView('list'); else setStep(step - 1); }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
              step === s ? 'bg-orange-600 text-white' : step > s ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
            }`}>
              {step > s ? <CheckCircle className="h-3 w-3" /> : s}
            </div>
            <span className={`text-xs ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
              {s === 1 ? 'Upload' : s === 2 ? 'Template' : 'Send'}
            </span>
            {s < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-3">
          <Input
            value={campaignName}
            onChange={e => setCampaignName(e.target.value)}
            placeholder="Campaign name (e.g., April Fee Reminder)"
          />
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-orange-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Click to upload CSV</p>
            <p className="text-xs text-muted-foreground">Phone, Name, Variables</p>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </div>

          {uploadMutation.isPending && (
            <div className="flex items-center gap-2 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> Parsing...</div>
          )}

          {uploadStats && (
            <div className="flex gap-2">
              <Badge variant="outline">Total: {uploadStats.total}</Badge>
              <Badge className="bg-green-100 text-green-800">Valid: {uploadStats.valid}</Badge>
              {uploadStats.invalid > 0 && <Badge variant="destructive">Invalid: {uploadStats.invalid}</Badge>}
            </div>
          )}

          {contacts.length > 0 && (
            <>
              <div className="max-h-40 overflow-y-auto border rounded">
                <Table>
                  <TableHeader><TableRow><TableHead>Phone</TableHead><TableHead>Name</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {contacts.slice(0, 5).map((c, i) => (
                      <TableRow key={i}><TableCell className="font-mono text-xs">{c.phone}</TableCell><TableCell className="text-xs">{c.name || '—'}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {contacts.length > 5 && <p className="text-xs text-muted-foreground">+{contacts.length - 5} more</p>}
              <Button onClick={() => setStep(2)} className="w-full">
                Continue with {contacts.length} contacts <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
        </div>
      )}

      {/* Step 2: Template */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Select a template</p>
          <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
            {(templates || []).map((t: ApprovedTemplate) => (
              <div
                key={t.id}
                className={`border rounded-lg p-3 cursor-pointer transition-all hover:border-orange-500 text-sm ${
                  selectedTemplate?.id === t.id ? 'border-orange-600 bg-orange-50 dark:bg-orange-950' : ''
                }`}
                onClick={() => setSelectedTemplate(t)}
              >
                <p className="font-medium text-xs">{t.name}</p>
                <Badge variant="outline" className="text-[10px] mt-1">{t.category}</Badge>
              </div>
            ))}
          </div>
          {selectedTemplate && (
            <Button onClick={() => setStep(3)} className="w-full">
              Use &quot;{selectedTemplate.name}&quot; <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Campaign</p>
              <p className="text-sm font-medium">{campaignName || 'Untitled'}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Template</p>
              <p className="text-sm font-medium">{selectedTemplate?.name}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Recipients</p>
              <p className="text-sm font-medium">{contacts.length}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="text-sm font-medium">{selectedTemplate?.category}</p>
            </div>
          </div>
          <Button onClick={() => setShowConfirm(true)} className="w-full" size="lg">
            <Send className="h-4 w-4 mr-2" /> Send Broadcast
          </Button>
        </div>
      )}

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Broadcast</DialogTitle>
            <DialogDescription>
              Send &quot;{selectedTemplate?.name}&quot; to {contacts.length} contacts. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><Send className="h-4 w-4 mr-2" /> Confirm Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
