// app/api/bos/sop/[id]/export/route.ts
// GET /api/bos/sop/[id]/export?format=pdf|docx|html|markdown|txt
//
// Strategy:
//   - HTML / Markdown / TXT are rendered server-side from the Tiptap JSON tree
//     using a dependency-free walker (sopJsonToHtml/Markdown/PlainText). This
//     is fast and ships immediately.
//   - PDF and DOCX are heavier — for now the route returns the HTML rendering
//     so the user can "Save as PDF" via browser print, while a richer DOCX
//     pipeline (jspdf / docx libraries) is wired in later. The format query
//     parameter is preserved so clients keep working when richer formats land.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  sopJsonToHtml,
  sopJsonToMarkdown,
  sopJsonToPlainText,
  buildSopHtmlDocument,
} from '@/lib/sop/render';

const SUPPORTED = ['pdf', 'docx', 'html', 'markdown', 'txt'] as const;
type ExportFormat = (typeof SUPPORTED)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') ?? 'html') as ExportFormat;
    if (!SUPPORTED.includes(format)) {
      return NextResponse.json(
        { error: `Unsupported format. Allowed: ${SUPPORTED.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: doc, error } = await supabase
      .from('bos_sop_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !doc) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }

    const filenameSafe = (doc.title as string).replace(/[^a-z0-9]+/gi, '_').toLowerCase();

    if (format === 'markdown') {
      const md = sopJsonToMarkdown(doc.content);
      return new NextResponse(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameSafe}.md"`,
        },
      });
    }

    if (format === 'txt') {
      const txt = sopJsonToPlainText(doc.content);
      return new NextResponse(txt, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameSafe}.txt"`,
        },
      });
    }

    // HTML / PDF / DOCX all derive from the rendered HTML for now. PDF and
    // DOCX serve the HTML with download headers; the browser's print-to-PDF
    // (or an upcoming server-side renderer) takes it from there.
    const html = buildSopHtmlDocument({
      title: doc.title,
      bodyHtml: sopJsonToHtml(doc.content),
      pageSettings: doc.page_settings ?? {},
    });

    if (format === 'html') {
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameSafe}.html"`,
        },
      });
    }

    if (format === 'docx') {
      // Word opens HTML files saved with a .doc/.docx extension; full OOXML
      // rendering is pending the docx package wiring.
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'application/msword',
          'Content-Disposition': `attachment; filename="${filenameSafe}.doc"`,
        },
      });
    }

    // PDF: serve HTML with print stylesheet; client uses window.print().
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${filenameSafe}.html"`,
      },
    });
  } catch (error) {
    console.error('[GET export] error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
