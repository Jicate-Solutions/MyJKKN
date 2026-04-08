'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Send, Loader2, CheckCircle,
  FileSpreadsheet, ChevronRight, ArrowLeft, Megaphone,
  Clock, Download, ChevronDown, ChevronUp, Upload, ImageIcon, Link2, FileText, Video,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

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
  components?: { type: string; text?: string; format?: string; example?: { header_handle?: string[] } }[];
}

function getTemplateHeader(t: ApprovedTemplate): { type: string; format?: string } | null {
  if (!t.components) return null;
  const header = t.components.find(c => c.type === 'HEADER');
  return header ? { type: header.type, format: header.format } : null;
}

function templateNeedsImage(t: ApprovedTemplate | null): boolean {
  if (!t) return false;
  const header = getTemplateHeader(t);
  return header?.format === 'IMAGE';
}

function templateNeedsVideo(t: ApprovedTemplate | null): boolean {
  if (!t) return false;
  const header = getTemplateHeader(t);
  return header?.format === 'VIDEO';
}

function templateNeedsDocument(t: ApprovedTemplate | null): boolean {
  if (!t) return false;
  const header = getTemplateHeader(t);
  return header?.format === 'DOCUMENT';
}

function templateNeedsMedia(t: ApprovedTemplate | null): boolean {
  return templateNeedsImage(t) || templateNeedsVideo(t) || templateNeedsDocument(t);
}

function getMediaConfig(t: ApprovedTemplate | null): { label: string; accept: string; maxMB: number; icon: typeof ImageIcon; placeholder: string } {
  if (templateNeedsVideo(t)) return { label: 'video', accept: 'video/mp4', maxMB: 16, icon: Video, placeholder: 'https://example.com/video.mp4' };
  if (templateNeedsDocument(t)) return { label: 'document', accept: 'application/pdf', maxMB: 100, icon: FileText, placeholder: 'https://example.com/brochure.pdf' };
  return { label: 'image', accept: 'image/jpeg,image/png,image/webp', maxMB: 5, icon: ImageIcon, placeholder: 'https://example.com/image.jpg' };
}

function getTemplateBody(t: ApprovedTemplate): string {
  if (!t.components) return '';
  const body = t.components.find(c => c.type === 'BODY');
  return body?.text || '';
}

function getTemplateVars(text: string): string[] {
  const matches = text.match(/\{\{(\d+)\}\}/g) || [];
  return matches.map(m => m.replace(/[{}]/g, ''));
}

interface BroadcastCampaign {
  campaign_id: string;
  campaign_name: string;
  template_name: string;
  created_by: string;
  created_at: string;
  sender_number: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  errors: string[];
}

// =============================================================================
// CSV Parser
// =============================================================================

function parseCSV(text: string): Record<string, string>[] {
  // Normalize line endings: \r\n (Windows/Excel) and \r (old Mac) → \n
  // Strip BOM (byte order mark) from Excel exports
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.trim().split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

/** Validate phone: must be numeric (after stripping +, spaces, dashes) and 10-15 digits */
function isValidPhoneClient(raw: string): boolean {
  const digits = raw.replace(/[\s+\-().]/g, '');
  if (!/^\d+$/.test(digits)) return false;
  return digits.length >= 10 && digits.length <= 15;
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

export function BroadcastTab({ institutionId, isSuperAdmin = false }: { institutionId: string; isSuperAdmin?: boolean }) {
  const [view, setView] = useState<'list' | 'wizard'>('list');
  const [step, setStep] = useState(1);
  const [campaignName, setCampaignName] = useState('');
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [uploadStats, setUploadStats] = useState<{ total: number; valid: number; invalid: number } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ApprovedTemplate | null>(null);
  const [varMapping, setVarMapping] = useState<Record<string, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [headerMediaMode, setHeaderMediaMode] = useState<'upload' | 'url'>('upload');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [contactSource, setContactSource] = useState<'csv' | 'leads'>('csv');
  const [scheduleDate, setScheduleDate] = useState('');
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: senderInfo } = useQuery({
    queryKey: ['wa-sender-info'],
    queryFn: async () => {
      const res = await fetch('/api/admission/chat/sender-info');
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch all WABA phone numbers for sender selection
  const { data: waNumbers } = useQuery({
    queryKey: ['wa-phone-numbers', institutionId],
    queryFn: async () => {
      const res = await fetch(`/api/admission/settings/whatsapp-numbers?institution_id=${institutionId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['wa-broadcast-campaigns', institutionId],
    queryFn: () => fetchCampaigns(institutionId),
    enabled: !!institutionId,
    refetchInterval: 10000,
  });

  // Resolve the selected sender's WABA ID for template filtering
  const selectedWabaId = (() => {
    if (!selectedPhoneNumberId || !waNumbers) return '';
    const found = (waNumbers as { phone_number_id: string; business_account_id: string }[])
      .find(n => n.phone_number_id === selectedPhoneNumberId);
    return found?.business_account_id || '';
  })();

  const { data: templates } = useQuery({
    queryKey: ['wa-broadcast-templates', selectedWabaId],
    queryFn: async () => {
      // Fetch templates from Meta Graph API for the selected WABA.
      // If a sender number is selected, fetch templates for that number's WABA only.
      const params = selectedWabaId ? `?business_account_id=${selectedWabaId}` : '';
      const res = await fetch(`/api/admission/chat/templates${params}`);
      if (!res.ok) throw new Error('Failed to load templates');
      const json = await res.json();
      return (json.data || []).filter((t: ApprovedTemplate) => t.status === 'APPROVED');
    },
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
    onError: (err: Error) => {
      toast.error(err.message || 'Broadcast failed');
      setShowConfirm(false);
    },
  });

  const resetWizard = () => {
    setStep(1);
    setCampaignName('');
    setContacts([]);
    setUploadStats(null);
    setSelectedTemplate(null);
    setShowConfirm(false);
    setHeaderMediaUrl('');
    setHeaderMediaMode('upload');
    setUploadedFileName('');
  };

  const handleMediaUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const config = getMediaConfig(selectedTemplate);
    const maxSize = config.maxMB * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File must be under ${config.maxMB}MB`);
      return;
    }

    setIsUploadingMedia(true);
    try {
      const supabase = createClientSupabaseClient();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const filePath = `broadcast/${institutionId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('admission-template-media')
        .upload(filePath, file, { cacheControl: '31536000', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('admission-template-media')
        .getPublicUrl(filePath);

      setHeaderMediaUrl(urlData.publicUrl);
      setUploadedFileName(file.name);
      toast.success(`${config.label.charAt(0).toUpperCase() + config.label.slice(1)} uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingMedia(false);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    }
  }, [institutionId, selectedTemplate]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) return;

    // Client-side pre-validation: detect phone column and filter rows with invalid phone data
    const headers = Object.keys(rows[0] || {});
    const phoneColGuess = headers.find(h => {
      const lc = h.toLowerCase().trim();
      return lc === 'phone' || lc === 'mobile' || lc === 'whatsapp' || lc === 'contact' || lc.startsWith('phone') || lc.startsWith('mobile');
    });
    let invalidCount = 0;
    if (phoneColGuess) {
      const validRows = rows.filter(row => {
        const phoneVal = row[phoneColGuess];
        if (!phoneVal || !isValidPhoneClient(phoneVal)) {
          invalidCount++;
          return false;
        }
        return true;
      });
      if (invalidCount > 0) {
        toast.warning(`${invalidCount} row(s) skipped: invalid phone numbers`);
      }
      if (validRows.length === 0) {
        toast.error('No valid phone numbers found in CSV');
        return;
      }
      uploadMutation.mutate(validRows, {
        onSuccess: (result) => {
          setContacts(result.contacts);
          setUploadStats({ total: result.total + invalidCount, valid: result.valid_count, invalid: result.invalid_count + invalidCount });
          if (!campaignName) setCampaignName(file.name.replace(/\.\w+$/, ''));
        },
      });
    } else {
      // No phone column detected client-side — let server handle detection and validation
      uploadMutation.mutate(rows, {
        onSuccess: (result) => {
          setContacts(result.contacts);
          setUploadStats({ total: result.total, valid: result.valid_count, invalid: result.invalid_count });
          if (!campaignName) setCampaignName(file.name.replace(/\.\w+$/, ''));
        },
      });
    }
  }, [uploadMutation]);

  const handleSend = () => {
    if (!selectedTemplate || contacts.length === 0) {
      toast.error('Missing template or contacts');
      return;
    }
    const validContacts = contacts.filter(c => c.phone && c.valid);
    if (validContacts.length === 0) {
      toast.error('No valid phone numbers to send to');
      return;
    }
    // Apply varMapping: convert CSV columns to ordered {{1}}, {{2}}, ... values
    const bodyVars = getTemplateVars(getTemplateBody(selectedTemplate));
    const mappedRecipients = validContacts.map(c => {
      const mappedVars: Record<string, string> = {};
      for (const varNum of bodyVars) {
        const csvCol = varMapping[varNum];
        mappedVars[varNum] = csvCol ? (c.variables[csvCol] || '') : '';
      }
      return { phone: c.phone, variables: mappedVars };
    });

    sendMutation.mutate({
      institution_id: institutionId,
      campaign_name: campaignName || `Broadcast ${new Date().toLocaleDateString('en-IN')}`,
      template_name: selectedTemplate.name,
      recipients: mappedRecipients,
      ...(headerMediaUrl ? { header_media_url: headerMediaUrl } : {}),
      ...(selectedPhoneNumberId ? { phone_number_id: selectedPhoneNumberId } : {}),
      ...(scheduleDate ? { scheduled_at: new Date(scheduleDate).toISOString() } : {}),
    } as Parameters<typeof sendMutation.mutate>[0]);
    setShowConfirm(false);
  };

  const exportCampaignCSV = async (c: BroadcastCampaign) => {
    try {
      // Fetch per-phone delivery detail
      const res = await fetch(`/api/admission/whatsapp-broadcast?institution_id=${institutionId}&campaign_id=${c.campaign_id}`);
      if (!res.ok) throw new Error('Failed to fetch details');
      const detail = await res.json();
      const recipients = detail.recipients || [];

      // Build detailed CSV with per-phone delivery report
      const headers = 'Phone,Status,Template,Sender,Sent At,Delivered At,Read At,Failed At,Error,WhatsApp Message ID';
      const rows = recipients.map((r: { phone: string; status: string; template: string; sender: string; sent_at: string; delivered_at: string; read_at: string; failed_at: string; error: string; whatsapp_message_id: string }) => {
        const fmt = (d: string) => d ? new Date(d).toLocaleString('en-IN') : '';
        return `"${r.phone}","${r.status}","${r.template}","${r.sender}","${fmt(r.sent_at)}","${fmt(r.delivered_at)}","${fmt(r.read_at)}","${fmt(r.failed_at)}","${(r.error || '').replace(/"/g, '""')}","${r.whatsapp_message_id || ''}"`;
      });

      // Add summary row at the end
      const summary = `\n\nCampaign Summary\nCampaign,"${c.campaign_name}"\nTemplate,"${c.template_name}"\nCreated By,"${c.created_by}"\nDate,"${new Date(c.created_at).toLocaleString('en-IN')}"\nTotal,${c.total}\nSent,${c.sent}\nDelivered,${c.delivered}\nRead,${c.read}\nFailed,${c.failed}\nDelivery Rate,"${c.total > 0 ? Math.round(((c.delivered + c.read) / c.total) * 100) : 0}%"`;

      const csv = headers + '\n' + rows.join('\n') + summary;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `broadcast-${c.campaign_name.replace(/[^a-zA-Z0-9]/g, '-')}-${c.campaign_id.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export campaign details');
    }
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

        {isSuperAdmin ? (
          <Button onClick={() => setView('wizard')} className="w-full">
            <Megaphone className="h-4 w-4 mr-2" /> New Broadcast
          </Button>
        ) : (
          <p className="text-xs text-center text-muted-foreground py-2">Only super admins can create broadcasts</p>
        )}

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
            {(campaigns || []).map(c => {
              const isExpanded = expandedCampaign === c.campaign_id;
              const deliveryPct = c.total > 0 ? Math.round(((c.delivered + c.read) / c.total) * 100) : 0;
              const allFailed = c.failed === c.total && c.total > 0;
              const dateStr = new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
              const timeStr = new Date(c.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
              return (
                <div key={c.campaign_id} className={`border rounded-lg p-3 ${allFailed ? 'border-red-300 dark:border-red-800' : ''}`}>
                  <div
                    className="flex items-center justify-between mb-2 cursor-pointer"
                    onClick={() => setExpandedCampaign(isExpanded ? null : c.campaign_id)}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      <p className="font-medium text-sm">{c.campaign_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {c.created_by && c.created_by !== 'Unknown' ? `by ${c.created_by}` : ''}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{dateStr}, {timeStr}</p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{c.template_name}</Badge>
                    {c.sender_number && <Badge variant="secondary" className="text-[10px] font-mono">{c.sender_number}</Badge>}
                    <span className="text-blue-600">{c.sent} sent</span>
                    <span className="text-green-600">{c.delivered} delivered</span>
                    <span className="text-emerald-600">{c.read} read</span>
                    {c.failed > 0 && <span className="text-red-600">{c.failed} failed</span>}
                    {c.pending > 0 && <span className="text-yellow-600">{c.pending} pending</span>}
                  </div>

                  {/* Delivery progress bar */}
                  <Progress value={deliveryPct} className="h-1.5 mt-2" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{deliveryPct}% delivery rate</p>

                  {/* Error banner if all failed */}
                  {allFailed && c.errors && c.errors.length > 0 && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
                      <p className="font-medium">All messages failed:</p>
                      {c.errors.map((err, i) => <p key={i} className="text-[10px] mt-0.5">{err}</p>)}
                    </div>
                  )}

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div className="grid grid-cols-5 gap-2 text-center text-xs">
                        <div><p className="font-bold">{c.total}</p><p className="text-muted-foreground">Total</p></div>
                        <div><p className="font-bold text-blue-600">{c.sent}</p><p className="text-muted-foreground">Sent</p></div>
                        <div><p className="font-bold text-green-600">{c.delivered}</p><p className="text-muted-foreground">Delivered</p></div>
                        <div><p className="font-bold text-emerald-600">{c.read}</p><p className="text-muted-foreground">Read</p></div>
                        <div><p className="font-bold text-red-600">{c.failed}</p><p className="text-muted-foreground">Failed</p></div>
                      </div>

                      {/* Error details in expanded view */}
                      {c.errors && c.errors.length > 0 && !allFailed && (
                        <div className="p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-xs">
                          <p className="font-medium text-red-700 dark:text-red-300">Failure reasons:</p>
                          {c.errors.map((err, i) => <p key={i} className="text-[10px] text-red-600 mt-0.5">{err}</p>)}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Campaign ID: {c.campaign_id.slice(0, 8)}...</span>
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => exportCampaignCSV(c)}>
                          <Download className="h-3 w-3 mr-1" /> Export CSV
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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

          {/* Source Toggle */}
          <div className="flex gap-2">
            <Button
              variant={contactSource === 'csv' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setContactSource('csv')}
            >
              <FileSpreadsheet className="h-3 w-3 mr-1.5" /> Upload CSV
            </Button>
            <Button
              variant={contactSource === 'leads' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => {
                setContactSource('leads');
                // Fetch all leads with wa_opt_in
                fetch(`/api/admission/leads/list?institution_id=${institutionId}&wa_opt_in=true&limit=500`)
                  .then(r => r.json())
                  .then(data => {
                    const leads = (data.data || data || []).map((l: Record<string, string>) => ({
                      phone: (l.phone || '').replace(/\D/g, ''),
                      name: l.full_name || l.name || '',
                      variables: { name: l.full_name || '', program: Array.isArray(l.interested_programs) ? l.interested_programs.join(', ') : (l.interested_programs || '') },
                      valid: !!(l.phone),
                    })).filter((c: ParsedContact) => c.valid && c.phone.length >= 10);
                    setContacts(leads);
                    setUploadStats({ total: leads.length, valid: leads.length, invalid: 0 });
                    setCampaignName('CRM Leads Broadcast');
                  })
                  .catch(() => toast.error('Failed to load leads'));
              }}
            >
              <Send className="h-3 w-3 mr-1.5" /> From CRM Leads
            </Button>
          </div>

          {contactSource === 'csv' && (
            <>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-orange-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Click to upload CSV</p>
                <p className="text-xs text-muted-foreground">Phone, Name, Variables</p>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  const csv = 'phone,name,program\n919894116664,Rahul Kumar,B.Pharm\n918056650788,Priya S,B.Tech CSE\n919080393732,Arun M,BDS';
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'whatsapp-broadcast-sample.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <FileSpreadsheet className="h-3 w-3 mr-1.5" />
                Download Sample CSV
              </Button>
            </>
          )}

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

      {/* Step 2: Sender Number + Template + Variable Mapping */}
      {step === 2 && (
        <div className="space-y-3">
          {/* Sender Number Selection — determines which templates are available */}
          {waNumbers && waNumbers.length > 1 && (
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800 space-y-1.5">
              <span className="text-green-600 text-xs font-medium">SEND FROM:</span>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-background font-mono"
                value={selectedPhoneNumberId}
                onChange={e => {
                  setSelectedPhoneNumberId(e.target.value);
                  setSelectedTemplate(null); // Reset template when sender changes (different WABA = different templates)
                  setHeaderMediaUrl('');
                  setUploadedFileName('');
                  setVarMapping({});
                }}
              >
                <option value="">Default ({senderInfo?.dedicated_number || 'Primary'})</option>
                {(waNumbers as { id: string; phone_number_id: string; display_number: string; verified_name: string; is_primary: boolean }[]).map((n) => (
                  <option key={n.id} value={n.phone_number_id}>
                    {n.display_number} — {n.verified_name}{n.is_primary ? ' (Primary)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-green-600/70">Templates shown below are approved for this sender number</p>
            </div>
          )}

          <p className="text-sm font-medium">Select a template</p>
          <div className="grid grid-cols-2 gap-2 max-h-[30vh] overflow-y-auto">
            {(templates || []).map((t: ApprovedTemplate) => (
              <div
                key={t.id}
                className={`border rounded-lg p-3 cursor-pointer transition-all hover:border-orange-500 text-sm ${
                  selectedTemplate?.id === t.id ? 'border-orange-600 bg-orange-50 dark:bg-orange-950' : ''
                }`}
                onClick={() => { setSelectedTemplate(t); setVarMapping({}); setHeaderMediaUrl(''); }}
              >
                <p className="font-medium text-xs">{t.name}</p>
                <Badge variant="outline" className="text-[10px] mt-1">{t.category}</Badge>
              </div>
            ))}
          </div>

          {/* Template Preview + Variable Mapping */}
          {selectedTemplate && (
            <div className="space-y-3">
              {/* Body Preview */}
              {getTemplateBody(selectedTemplate) && (
                <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-[10px] text-green-600 font-medium mb-1">MESSAGE PREVIEW</p>
                  <p className="text-xs whitespace-pre-wrap">{getTemplateBody(selectedTemplate)}</p>
                </div>
              )}

              {/* Variable Mapping */}
              {getTemplateVars(getTemplateBody(selectedTemplate)).length > 0 && contacts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Map CSV columns to template variables:</p>
                  {getTemplateVars(getTemplateBody(selectedTemplate)).map(v => {
                    const csvCols = contacts[0]?.variables ? Object.keys(contacts[0].variables) : [];
                    return (
                      <div key={v} className="flex items-center gap-2 text-xs">
                        <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-mono">{`{{${v}}}`}</span>
                        <span className="text-muted-foreground">&rarr;</span>
                        <select
                          className="border rounded px-2 py-1 text-xs flex-1 bg-background"
                          value={varMapping[v] || ''}
                          onChange={e => setVarMapping(prev => ({ ...prev, [v]: e.target.value }))}
                        >
                          <option value="">Select column...</option>
                          {csvCols.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}

                  {/* Live Preview with Sample Data */}
                  {Object.keys(varMapping).length > 0 && contacts[0] && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-[10px] text-blue-600 font-medium mb-1">SAMPLE MESSAGE (contact 1)</p>
                      <p className="text-xs whitespace-pre-wrap">
                        {getTemplateBody(selectedTemplate).replace(/\{\{(\d+)\}\}/g, (_: string, num: string) => {
                          const col = varMapping[num];
                          return col ? (contacts[0].variables[col] || `[${col}]`) : `{{${num}}}`;
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Header Media (for templates with IMAGE/VIDEO/DOCUMENT headers) */}
              {selectedTemplate && templateNeedsMedia(selectedTemplate) && (() => {
                const mc = getMediaConfig(selectedTemplate);
                const MediaIcon = mc.icon;
                const formatHint = mc.label === 'image' ? 'JPG, PNG, WebP' : mc.label === 'video' ? 'MP4' : 'PDF';
                return (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Header {mc.label} (required):</p>
                  <div className="flex gap-1 border rounded-md p-0.5 w-fit">
                    <button
                      type="button"
                      onClick={() => setHeaderMediaMode('upload')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${headerMediaMode === 'upload' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Upload className="h-3 w-3" /> Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeaderMediaMode('url')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${headerMediaMode === 'url' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Link2 className="h-3 w-3" /> Paste URL
                    </button>
                  </div>

                  {headerMediaMode === 'upload' ? (
                    <div className="space-y-1.5">
                      <input
                        ref={mediaInputRef}
                        type="file"
                        accept={mc.accept}
                        onChange={handleMediaUpload}
                        className="hidden"
                      />
                      {headerMediaUrl && uploadedFileName ? (
                        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md">
                          <MediaIcon className="h-4 w-4 text-green-600 shrink-0" />
                          <span className="text-xs text-green-700 truncate flex-1">{uploadedFileName}</span>
                          <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          <button
                            type="button"
                            onClick={() => { setHeaderMediaUrl(''); setUploadedFileName(''); }}
                            className="text-xs text-muted-foreground hover:text-destructive ml-1"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => mediaInputRef.current?.click()}
                          disabled={isUploadingMedia}
                        >
                          {isUploadingMedia ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading...</>
                          ) : (
                            <><MediaIcon className="h-3.5 w-3.5 mr-1.5" /> Choose {mc.label} ({formatHint} &mdash; max {mc.maxMB}MB)</>
                          )}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        type="url"
                        placeholder={mc.placeholder}
                        value={headerMediaUrl}
                        onChange={e => { setHeaderMediaUrl(e.target.value); setUploadedFileName(''); }}
                        className="text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">Paste a public {mc.label} URL (must be accessible by WhatsApp)</p>
                    </div>
                  )}
                </div>
                );
              })()}

              <Button
                onClick={() => setStep(3)}
                className="w-full"
                disabled={templateNeedsMedia(selectedTemplate) && !headerMediaUrl}
              >
                Use &quot;{selectedTemplate.name}&quot; <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Review + Schedule */}
      {step === 3 && (
        <div className="space-y-3">
          {/* Sender Number (read-only summary — selection is in Step 2) */}
          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800 space-y-1">
            <span className="text-green-600 text-xs font-medium">SEND FROM:</span>
            <p className="text-sm font-mono font-medium">
              {selectedPhoneNumberId
                ? (waNumbers as { phone_number_id: string; display_number: string; verified_name: string }[])
                    ?.find(n => n.phone_number_id === selectedPhoneNumberId)
                    ?.display_number || selectedPhoneNumberId
                : senderInfo?.dedicated_number || 'Default (Primary)'}
            </p>
          </div>

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

          {/* Schedule Option */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium">Schedule for later (optional)</p>
            </div>
            <Input
              type="datetime-local"
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
              className="text-xs"
              min={new Date().toISOString().slice(0, 16)}
            />
            {scheduleDate && (
              <p className="text-[10px] text-muted-foreground">
                Will be sent at {new Date(scheduleDate).toLocaleString('en-IN')}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setShowConfirm(true)} className="flex-1" size="lg">
              <Send className="h-4 w-4 mr-2" /> {scheduleDate ? 'Schedule' : 'Send Now'}
            </Button>
          </div>
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
