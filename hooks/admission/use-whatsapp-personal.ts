// hooks/admission/use-whatsapp-personal.ts
// React Query hooks for BYOW WhatsApp personal connections

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const personalWhatsAppKeys = {
  all: ['whatsapp-personal'] as const,
  connection: (institutionId: string) =>
    ['whatsapp-personal', 'connection', institutionId] as const,
  messages: (institutionId: string) =>
    ['whatsapp-personal', 'messages', institutionId] as const,
  leadMessages: (institutionId: string, leadId: string) =>
    ['whatsapp-personal', 'messages', institutionId, leadId] as const,
};

// ---------------------------------------------------------------------------
// API helpers (client-side fetch)
// ---------------------------------------------------------------------------

async function fetchPersonalStatus(institutionId: string) {
  const res = await fetch(
    `/api/admission/whatsapp-personal/status?institution_id=${institutionId}`
  );
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

async function postPersonalConnect(institutionId: string) {
  const res = await fetch('/api/admission/whatsapp-personal/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution_id: institutionId }),
  });
  if (!res.ok) throw new Error('Failed to connect');
  return res.json();
}

async function postPersonalDisconnect(institutionId: string) {
  const res = await fetch('/api/admission/whatsapp-personal/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution_id: institutionId }),
  });
  if (!res.ok) throw new Error('Failed to disconnect');
  return res.json();
}

async function postPersonalSend(params: {
  institution_id: string;
  to: string;
  message: string;
  lead_id?: string;
  recipient_name?: string;
}) {
  const res = await fetch('/api/admission/whatsapp-personal/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to send');
  return res.json();
}

async function postPersonalSendBulk(params: {
  institution_id: string;
  recipients: { phone: string; message: string }[];
  delay_ms?: number;
}) {
  const res = await fetch('/api/admission/whatsapp-personal/send-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to send bulk');
  return res.json();
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Get personal WhatsApp connection status — auto-polls when connecting */
export function usePersonalWhatsAppStatus(
  institutionId: string | undefined,
  options?: { pollWhileConnecting?: boolean }
) {
  const pollWhileConnecting = options?.pollWhileConnecting ?? true;

  return useQuery({
    queryKey: personalWhatsAppKeys.connection(institutionId || ''),
    queryFn: () => fetchPersonalStatus(institutionId!),
    enabled: !!institutionId,
    staleTime: 10_000,
    refetchInterval: (query) => {
      if (!pollWhileConnecting) return false;
      const status = query.state.data?.status;
      // Poll every 3s while connecting/QR/authenticating — stop once ready or disconnected
      if (status === 'connecting' || status === 'qr_ready' || status === 'authenticated') {
        return 3_000;
      }
      return false;
    },
    refetchOnWindowFocus: false,
  });
}

/** Mutations for personal WhatsApp operations */
export function usePersonalWhatsAppMutations(institutionId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: personalWhatsAppKeys.connection(institutionId) });
  };

  const connect = useMutation({
    mutationFn: () => postPersonalConnect(institutionId),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('WhatsApp connection initiated — scan the QR code');
      } else {
        toast.error(data.message || 'Failed to connect');
      }
      invalidate();
    },
    onError: () => toast.error('Failed to connect personal WhatsApp'),
  });

  const disconnect = useMutation({
    mutationFn: () => postPersonalDisconnect(institutionId),
    onSuccess: () => {
      toast.success('Personal WhatsApp disconnected');
      invalidate();
    },
    onError: () => toast.error('Failed to disconnect'),
  });

  const sendMessage = useMutation({
    mutationFn: (params: { to: string; message: string; lead_id?: string; recipient_name?: string }) =>
      postPersonalSend({ institution_id: institutionId, ...params }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Message sent via personal WhatsApp');
      } else {
        toast.error(data.error || 'Failed to send');
      }
    },
    onError: () => toast.error('Failed to send message'),
  });

  const sendBulk = useMutation({
    mutationFn: (params: { recipients: { phone: string; message: string }[]; delay_ms?: number }) =>
      postPersonalSendBulk({ institution_id: institutionId, ...params }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Sent ${data.successCount}/${data.totalSent} messages`);
      } else {
        toast.error(data.error || 'Bulk send failed');
      }
    },
    onError: () => toast.error('Failed to send bulk messages'),
  });

  return { connect, disconnect, sendMessage, sendBulk };
}
