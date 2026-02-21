// app/api/admission/chat/forms/route.ts
// CRUD API for WhatsApp in-chat form templates

import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppFormsService } from '@/lib/services/whatsapp/whatsapp-forms-service';
import type { WAFormType } from '@/lib/services/whatsapp/whatsapp-forms-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const formType = searchParams.get('form_type') as WAFormType | null;
    const isActive = searchParams.get('is_active');
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    const templates = await WhatsAppFormsService.getFormTemplates({
      institutionId,
      formType: formType || undefined,
      isActive: isActive !== null ? isActive === 'true' : undefined,
      category: category || undefined,
      search: search || undefined,
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[api/chat/forms] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch form templates' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'initialize') {
      const templates = await WhatsAppFormsService.initializePredefinedForms(body.institution_id);
      return NextResponse.json({ templates });
    }

    if (body.action === 'send') {
      const result = await WhatsAppFormsService.sendForm({
        formTemplateId: body.form_template_id,
        to: body.to,
        institutionId: body.institution_id,
        leadId: body.lead_id,
      });
      return NextResponse.json(result);
    }

    // Create new template
    const template = await WhatsAppFormsService.createFormTemplate(body);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('[api/chat/forms] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create form template' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const template = await WhatsAppFormsService.updateFormTemplate(id, updateData);
    return NextResponse.json({ template });
  } catch (error) {
    console.error('[api/chat/forms] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update form template' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await WhatsAppFormsService.deleteFormTemplate(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/chat/forms] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete form template' },
      { status: 500 }
    );
  }
}
