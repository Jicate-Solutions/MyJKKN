// GET/PUT/DELETE /api/admission/chat/documents/[id]
// Individual document catalog operations

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppDocumentCatalogService } from '@/lib/services/whatsapp/whatsapp-document-catalog-service';

// GET: Get single document
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const document = await WhatsAppDocumentCatalogService.getDocument(id);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ data: document });
  } catch (error) {
    console.error('[chat/documents/[id]] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: Update document
export async function PUT(
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
    const { title, description, category, document_type, url, thumbnail_url, file_size_bytes, is_active } = body;

    const document = await WhatsAppDocumentCatalogService.updateDocument(id, {
      title,
      description,
      category,
      document_type,
      url,
      thumbnail_url,
      file_size_bytes,
      is_active,
    });

    return NextResponse.json({ data: document });
  } catch (error) {
    console.error('[chat/documents/[id]] PUT Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update document' },
      { status: 500 }
    );
  }
}

// DELETE: Delete document
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await WhatsAppDocumentCatalogService.deleteDocument(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chat/documents/[id]] DELETE Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete document' },
      { status: 500 }
    );
  }
}
