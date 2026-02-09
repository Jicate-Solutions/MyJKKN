'use server';

import {
  searchContacts,
  getContact,
  isNetworkerConfigured,
  type NetworkerContact,
  type NetworkerContactDetail,
} from '@/lib/networker/client';

/**
 * Search Networker contacts (server action — keeps API key server-side)
 * Called from the NetworkerContactPicker component with debounce
 */
export async function searchNetworkerContacts(
  query: string
): Promise<{
  success: boolean;
  data: NetworkerContact[];
  total: number;
  error?: string;
}> {
  if (!isNetworkerConfigured()) {
    return { success: false, data: [], total: 0, error: 'Networker not configured' };
  }

  if (!query || query.length < 2) {
    return { success: true, data: [], total: 0 };
  }

  try {
    const result = await searchContacts(query, 10);
    return {
      success: true,
      data: result.data,
      total: result.pagination.total,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[solutions/actions] Networker search failed:', message);
    return { success: false, data: [], total: 0, error: message };
  }
}

/**
 * Get a single Networker contact by ID (server action)
 * Used on solution detail page to show live client info
 */
export async function getNetworkerContact(
  contactId: string
): Promise<{
  success: boolean;
  data: NetworkerContactDetail | null;
  error?: string;
}> {
  if (!isNetworkerConfigured()) {
    return { success: false, data: null, error: 'Networker not configured' };
  }

  try {
    const contact = await getContact(contactId);
    return { success: true, data: contact };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[solutions/actions] Networker contact fetch failed:', message);
    return { success: false, data: null, error: message };
  }
}
