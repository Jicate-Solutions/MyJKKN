// hooks/admission/use-whatsapp-personal.ts
// React Query hooks for BYOW WhatsApp personal connections (department-based)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const personalWhatsAppKeys = {
  all: ['whatsapp-personal'] as const,
  connection: (departmentId: string) =>
    ['whatsapp-personal', 'connection', departmentId] as const,
  messages: (departmentId: string) =>
    ['whatsapp-personal', 'messages', departmentId] as const,
  leadMessages: (departmentId: string, leadId: string) =>
    ['whatsapp-personal', 'messages', departmentId, leadId] as const,
};

// ---------------------------------------------------------------------------
// API helpers (client-side fetch)
// ---------------------------------------------------------------------------

async function fetchPersonalStatus(departmentId: string) {
  const res = await fetch(
    `/api/whatsapp-personal/status?department_id=${departmentId}`
  );
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

async function postPersonalConnect(departmentId: string) {
  const res = await fetch('/api/whatsapp-personal/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ department_id: departmentId }),
  });
  if (!res.ok) throw new Error('Failed to connect');
  return res.json();
}

async function postPersonalDisconnect(departmentId: string) {
  const res = await fetch('/api/whatsapp-personal/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ department_id: departmentId }),
  });
  if (!res.ok) throw new Error('Failed to disconnect');
  return res.json();
}

async function postPersonalSend(params: {
  department_id: string;
  to: string;
  message: string;
  lead_id?: string;
  recipient_name?: string;
}) {
  const res = await fetch('/api/whatsapp-personal/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to send');
  return res.json();
}

async function postPersonalSendBulk(params: {
  department_id: string;
  recipients: { phone: string; message: string }[];
  delay_ms?: number;
}) {
  const res = await fetch('/api/whatsapp-personal/send-bulk', {
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
  departmentId: string | undefined,
  options?: { pollWhileConnecting?: boolean }
) {
  const pollWhileConnecting = options?.pollWhileConnecting ?? true;

  return useQuery({
    queryKey: personalWhatsAppKeys.connection(departmentId || ''),
    queryFn: () => fetchPersonalStatus(departmentId!),
    enabled: !!departmentId,
    staleTime: 10_000,
    refetchInterval: (query) => {
      if (!pollWhileConnecting) return false;
      const status = query.state.data?.status;
      if (status === 'connecting' || status === 'qr_ready' || status === 'authenticated') {
        return 3_000;
      }
      return false;
    },
    refetchOnWindowFocus: false,
  });
}

/** Mutations for personal WhatsApp operations */
export function usePersonalWhatsAppMutations(departmentId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: personalWhatsAppKeys.connection(departmentId) });
  };

  const connect = useMutation({
    mutationFn: () => postPersonalConnect(departmentId),
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
    mutationFn: () => postPersonalDisconnect(departmentId),
    onSuccess: () => {
      toast.success('Personal WhatsApp disconnected');
      invalidate();
    },
    onError: () => toast.error('Failed to disconnect'),
  });

  const sendMessage = useMutation({
    mutationFn: (params: { to: string; message: string; lead_id?: string; recipient_name?: string }) =>
      postPersonalSend({ department_id: departmentId, ...params }),
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
      postPersonalSendBulk({ department_id: departmentId, ...params }),
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
