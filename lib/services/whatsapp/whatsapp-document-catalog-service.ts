// WhatsApp Document Catalog Service
// Centralized shareable document management for admission counselors
// Gap 9 — P2 Valuable

import { createClient } from '@supabase/supabase-js';
import { WhatsAppChatService, type ChatMessage } from './whatsapp-chat-service';

// =============================================================================
// Types
// =============================================================================

export interface CatalogDocument {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  category: string;
  document_type: string;
  url: string;
  thumbnail_url: string | null;
  file_size_bytes: number | null;
  share_count: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentParams {
  institution_id: string;
  title: string;
  description?: string;
  category: string;
  document_type: string;
  url: string;
  thumbnail_url?: string;
  file_size_bytes?: number;
  created_by: string;
}

export interface UpdateDocumentParams {
  title?: string;
  description?: string;
  category?: string;
  document_type?: string;
  url?: string;
  thumbnail_url?: string;
  file_size_bytes?: number;
  is_active?: boolean;
}

export interface ShareDocumentParams {
  documentId: string;
  conversationId: string;
  senderId: string;
}

// =============================================================================
// Service
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppDocumentCatalogService {
  /**
   * Get catalog documents for an institution, with optional filtering
   */
  static async getCatalog(
    institutionId: string,
    category?: string,
    search?: string
  ): Promise<CatalogDocument[]> {
    const supabase = getServiceClient();

    let query = supabase
      .from('wa_document_catalog')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('share_count', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch catalog: ${error.message}`);
    return (data as CatalogDocument[]) || [];
  }

  /**
   * Get a single document by ID
   */
  static async getDocument(documentId: string): Promise<CatalogDocument | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_document_catalog')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch document: ${error.message}`);
    }
    return data as CatalogDocument;
  }

  /**
   * Create a new catalog document
   */
  static async createDocument(params: CreateDocumentParams): Promise<CatalogDocument> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_document_catalog')
      .insert({
        institution_id: params.institution_id,
        title: params.title,
        description: params.description || null,
        category: params.category,
        document_type: params.document_type,
        url: params.url,
        thumbnail_url: params.thumbnail_url || null,
        file_size_bytes: params.file_size_bytes || null,
        created_by: params.created_by,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Failed to create document: ${error.message}`);
    return data as CatalogDocument;
  }

  /**
   * Update an existing catalog document
   */
  static async updateDocument(id: string, params: UpdateDocumentParams): Promise<CatalogDocument> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_document_catalog')
      .update({ ...params, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to update document: ${error.message}`);
    return data as CatalogDocument;
  }

  /**
   * Delete a catalog document (soft-delete by setting is_active=false)
   */
  static async deleteDocument(id: string): Promise<void> {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from('wa_document_catalog')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to delete document: ${error.message}`);
  }

  /**
   * Share a document to a WhatsApp conversation
   * Sends via WhatsApp API and increments share_count
   */
  static async shareDocument(params: ShareDocumentParams): Promise<ChatMessage> {
    const doc = await this.getDocument(params.documentId);
    if (!doc) throw new Error('Document not found');

    let message: ChatMessage;

    if (doc.document_type === 'pdf' || doc.document_type === 'image') {
      // Send as media via WhatsApp chat service
      const mediaType = doc.document_type === 'pdf' ? 'document' : 'image';
      message = await WhatsAppChatService.sendMessage(
        params.conversationId,
        params.senderId,
        {
          media_url: doc.url,
          media_type: mediaType,
          caption: doc.title,
          filename: doc.document_type === 'pdf' ? `${doc.title}.pdf` : undefined,
        }
      );
    } else if (doc.document_type === 'video') {
      message = await WhatsAppChatService.sendMessage(
        params.conversationId,
        params.senderId,
        {
          media_url: doc.url,
          media_type: 'video',
          caption: doc.title,
        }
      );
    } else {
      // Link — send as text message
      const text = doc.description
        ? `${doc.title}\n\n${doc.description}\n\n${doc.url}`
        : `${doc.title}\n\n${doc.url}`;
      message = await WhatsAppChatService.sendMessage(
        params.conversationId,
        params.senderId,
        { text }
      );
    }

    // Increment share count
    const supabase = getServiceClient();
    await supabase
      .from('wa_document_catalog')
      .update({
        share_count: doc.share_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.documentId);

    return message;
  }

  /**
   * Get most popular documents by share count
   */
  static async getPopularDocuments(
    institutionId: string,
    limit: number = 10
  ): Promise<CatalogDocument[]> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_document_catalog')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('share_count', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch popular documents: ${error.message}`);
    return (data as CatalogDocument[]) || [];
  }
}
