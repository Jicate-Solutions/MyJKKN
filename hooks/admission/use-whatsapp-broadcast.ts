// hooks/admission/use-whatsapp-broadcast.ts
// React Query hooks for WhatsApp Broadcast campaigns

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export interface BroadcastCampaign {
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

export interface BroadcastRecipient {
  phone: string;
  name?: string;
  lead_id?: string;
  variables?: Record<string, string>;
  message_content?: string;
}

export interface CreateBroadcastInput {
  institution_id: string;
  campaign_name: string;
  template_name?: string;
  template_id?: string;
  recipients: BroadcastRecipient[];
  scheduled_at?: string;
}

export interface ParsedContact {
  phone: string;
  name: string;
  variables: Record<string, string>;
  valid: boolean;
  error?: string;
}

export interface UploadResult {
  total: number;
  valid_count: number;
  invalid_count: number;
  contacts: ParsedContact[];
  errors: ParsedContact[];
  detected_columns: { phone: string; name: string | null; all: string[] };
}

export interface ApprovedTemplate {
  id: string;
  name: string;
  category: string;
  components: unknown;
  language: string;
  status: string;
  meta_template_id?: string;
}

// =============================================================================
// Query Keys
// =============================================================================

const broadcastKeys = {
  all: ['whatsapp-broadcast'] as const,
  campaigns: (institutionId: string) => [...broadcastKeys.all, 'campaigns', institutionId] as const,
  templates: (institutionId: string) => [...broadcastKeys.all, 'templates', institutionId] as const,
  stats: (institutionId: string) => [...broadcastKeys.all, 'stats', institutionId] as const,
};

// =============================================================================
// Fetch functions
// =============================================================================

async function fetchCampaigns(institutionId: string): Promise<BroadcastCampaign[]> {
  const res = await fetch(`/api/admission/whatsapp-broadcast?institution_id=${institutionId}`);
  if (!res.ok) throw new Error('Failed to fetch campaigns');
  const json = await res.json();
  return json.data || [];
}

async function fetchApprovedTemplates(institutionId: string): Promise<ApprovedTemplate[]> {
  const res = await fetch(`/api/admission/settings/whatsapp?action=templates&institution_id=${institutionId}`);
  if (!res.ok) {
    // Fallback: fetch from wa_templates directly
    const fallback = await fetch(`/api/admission/chat/templates/refresh-quality?institution_id=${institutionId}`);
    if (!fallback.ok) return [];
    const json = await fallback.json();
    return json.data || [];
  }
  const json = await res.json();
  return (json.data || []).filter((t: ApprovedTemplate) => t.status === 'APPROVED');
}

async function uploadContacts(rows: Record<string, string>[], columnMap?: Record<string, string>): Promise<UploadResult> {
  const res = await fetch('/api/admission/whatsapp-broadcast/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, column_map: columnMap }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

async function sendBroadcast(input: CreateBroadcastInput) {
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
// Hooks
// =============================================================================

export function useWhatsAppBroadcastCampaigns(institutionId: string | undefined) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: broadcastKeys.campaigns(institutionId || ''),
    queryFn: () => fetchCampaigns(institutionId!),
    enabled: !!institutionId,
    refetchInterval: 10000, // Auto-refresh every 10s for live stats
  });

  const stats = {
    totalCampaigns: data?.length || 0,
    totalMessages: data?.reduce((sum, c) => sum + c.total, 0) || 0,
    totalDelivered: data?.reduce((sum, c) => sum + c.delivered + c.read, 0) || 0,
    totalFailed: data?.reduce((sum, c) => sum + c.failed, 0) || 0,
    deliveryRate: 0,
  };

  const totalSent = data?.reduce((sum, c) => sum + c.sent + c.delivered + c.read, 0) || 0;
  if (totalSent > 0) {
    stats.deliveryRate = Math.round(((stats.totalDelivered) / totalSent) * 100);
  }

  return { campaigns: data || [], stats, isLoading, error, refetch };
}

export function useApprovedTemplates(institutionId: string | undefined) {
  return useQuery({
    queryKey: broadcastKeys.templates(institutionId || ''),
    queryFn: () => fetchApprovedTemplates(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useUploadContacts() {
  return useMutation({
    mutationFn: ({ rows, columnMap }: { rows: Record<string, string>[]; columnMap?: Record<string, string> }) =>
      uploadContacts(rows, columnMap),
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSendBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendBroadcast,
    onSuccess: (data) => {
      toast.success(`Broadcast sent: ${data.sent} messages delivered, ${data.failed} failed`);
      queryClient.invalidateQueries({ queryKey: broadcastKeys.all });
    },
    onError: (error: Error) => {
      toast.error(`Broadcast failed: ${error.message}`);
    },
  });
}
