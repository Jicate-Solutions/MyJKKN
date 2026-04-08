

// app/api/admission/whatsapp-personal/templates/route.ts
// CRUD API for personal WhatsApp message templates

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { WhatsAppPersonalTemplateService } from '@/lib/services/whatsapp/whatsapp-personal-template-service';
import type { PersonalTemplateCategory } from '@/types/whatsapp-personal';

export async function GET(request: NextRequest) {
  await connection();
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const institutionId = request.nextUrl.searchParams.get('institution_id');
  const category = request.nextUrl.searchParams.get('category') as PersonalTemplateCategory | null;

  if (!institutionId) {
    return NextResponse.json({ error: 'institution_id required' }, { status: 400 });
  }

  const templates = await WhatsAppPersonalTemplateService.getTemplates(
    institutionId,
    category || undefined
  );
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  await connection();
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { institution_id, name, category, content, is_default } = body;

  if (!institution_id || !name || !content) {
    return NextResponse.json(
      { error: 'institution_id, name, and content are required' },
      { status: 400 }
    );
  }

  const template = await WhatsAppPersonalTemplateService.createTemplate(
    { institution_id, name, category: category || 'general', content, is_default },
    user.id
  );

  if (!template) {
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
  return NextResponse.json({ template }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  await connection();
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await request.json();
  const template = await WhatsAppPersonalTemplateService.updateTemplate(id, body);

  if (!template) {
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
  return NextResponse.json({ template });
}

export async function DELETE(request: NextRequest) {
  await connection();
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const success = await WhatsAppPersonalTemplateService.deleteTemplate(id);
  return NextResponse.json({ success });
}
