// GET/POST /api/admission/chat/documents
// Document catalog management for WhatsApp counselors

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppDocumentCatalogService } from '@/lib/services/whatsapp/whatsapp-document-catalog-service';

// GET: List catalog documents
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Verify institution access
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (profile?.institution_id !== institutionId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const documents = await WhatsAppDocumentCatalogService.getCatalog(
      institutionId,
      category,
      search
    );

    return NextResponse.json({ data: documents });
  } catch (error) {
    console.error('[chat/documents] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create a new catalog document
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json({ error: 'No institution assigned' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, category, document_type, url, thumbnail_url, file_size_bytes } = body;

    if (!title || !category || !document_type || !url) {
      return NextResponse.json(
        { error: 'title, category, document_type, and url are required' },
        { status: 400 }
      );
    }

    const document = await WhatsAppDocumentCatalogService.createDocument({
      institution_id: profile.institution_id,
      title,
      description,
      category,
      document_type,
      url,
      thumbnail_url,
      file_size_bytes,
      created_by: user.id,
    });

    return NextResponse.json({ data: document }, { status: 201 });
  } catch (error) {
    console.error('[chat/documents] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create document' },
      { status: 500 }
    );
  }
}
