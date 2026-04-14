// lib/networker/client.ts
// Server-side API client for Networker (JKKN contact/relationship management)
// All calls are server-to-server — API key must never be exposed to browser

const NETWORKER_URL = process.env.NETWORKER_API_URL;
const NETWORKER_KEY = process.env.NETWORKER_API_KEY;

// ============================================
// TYPES
// ============================================

export interface NetworkerContact {
  id: string;
  name: string;
  organization: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  sector: string | null;
  temperature: 'hot' | 'warm' | 'cold' | null;
  location: string | null;
  lead_score: number | null;
  status: string | null;
  linkedin: string | null;
  website: string | null;
  whatsapp: boolean;
  notes: string | null;
  last_interaction: string | null;
  departments?: Array<{ id: string; name: string }>;
  tags?: Array<{ id: string; name: string; color: string }>;
}

export interface NetworkerContactDetail extends NetworkerContact {
  date_met: string | null;
  introduced_by: string | null;
  next_action: string | null;
  next_action_due: string | null;
  events?: Array<{ id: string; name: string; start_date: string | null }>;
  interactions?: Array<{
    id: string;
    channel: string;
    summary: string;
    interaction_date: string;
  }>;
}

export interface NetworkerSearchResult {
  success: boolean;
  data: NetworkerContact[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export type SolutionEventType =
  | 'solution.created'
  | 'solution.payment'
  | 'solution.completed';

export interface SolutionEventPayload {
  type: SolutionEventType;
  contact_id: string;
  solution_name: string;
  department_name: string;
  amount?: number;
  currency?: string;
  notes?: string;
  timestamp?: string;
}

export interface WebhookResponse {
  success: boolean;
  data?: {
    interaction_created: boolean;
    temperature_updated: boolean;
    new_temperature: string;
    contact_name: string;
  };
}

// ============================================
// HELPERS
// ============================================

function getHeaders(): Record<string, string> {
  if (!NETWORKER_KEY) {
    throw new Error('NETWORKER_API_KEY is not configured');
  }
  return {
    'x-api-key': NETWORKER_KEY,
    'Content-Type': 'application/json',
  };
}

function getBaseUrl(): string {
  if (!NETWORKER_URL) {
    throw new Error('NETWORKER_API_URL is not configured');
  }
  return NETWORKER_URL;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Search contacts in Networker
 * Used for the client picker in the solution creation form
 */
export async function searchContacts(
  query: string,
  limit = 20
): Promise<NetworkerSearchResult> {
  const url = `${getBaseUrl()}/api/contacts/search?q=${encodeURIComponent(query)}&limit=${limit}`;

  const res = await fetch(url, {
    headers: getHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Networker search failed (${res.status}): ${text || res.statusText}`
    );
  }

  return res.json();
}

/**
 * Get a single contact by ID with full detail
 * Used on solution detail page to show client info
 */
export async function getContact(
  id: string
): Promise<NetworkerContactDetail> {
  const url = `${getBaseUrl()}/api/contacts/${id}`;

  const res = await fetch(url, {
    headers: getHeaders(),
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Networker contact fetch failed (${res.status}): ${text || res.statusText}`
    );
  }

  const json = await res.json();
  return json.data;
}

/**
 * Notify Networker about a solution event (fire-and-forget)
 * Creates an interaction record on the contact's timeline
 * and optionally upgrades their temperature
 *
 * IMPORTANT: Call AFTER the primary DB operation succeeds.
 * This is best-effort — if Networker is down, the solution still exists.
 */
export async function notifySolutionEvent(
  event: SolutionEventPayload
): Promise<boolean> {
  try {
    const url = `${getBaseUrl()}/api/webhooks/solution-event`;

    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[networker] Webhook failed (${res.status}):`,
        text || res.statusText
      );
      return false;
    }

    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[networker] Webhook error:', message);
    return false;
  }
}

/**
 * Check if Networker integration is configured
 */
export function isNetworkerConfigured(): boolean {
  return Boolean(NETWORKER_URL && NETWORKER_KEY);
}
