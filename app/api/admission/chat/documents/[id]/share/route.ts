// POST /api/admission/chat/documents/[id]/share
// Share a catalog document to a WhatsApp conversation

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppDocumentCatalogService } from '@/lib/services/whatsapp/whatsapp-document-catalog-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { conversation_id, sender_id } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this document's institution
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    const doc = await WhatsAppDocumentCatalogService.getDocument(id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (doc.institution_id !== profile?.institution_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const message = await WhatsAppDocumentCatalogService.shareDocument({
      documentId: id,
      conversationId: conversation_id,
      senderId: sender_id || user.id,
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('[chat/documents/[id]/share] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to share document' },
      { status: 500 }
    );
  }
}
