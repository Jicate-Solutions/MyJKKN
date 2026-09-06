import { NextRequest, NextResponse } from 'next/server';
import { generateMinutesHtmlPdf, closeBrowser } from '@/lib/utils/bos/meeting-minutes-html-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const {
      meeting,
      attendees,
      agendaItems,
      chairmanName,
      boardName,
      boardType,
      institutionName,
      institutionAddress,
      institutionAccreditation,
      secretaryName,
      principalName,
      principalTitle,
      contactCell,
      contactWeb,
      contactEmail,
      logoImage,
      rightLogoImage,
    } = body;

    const pdfBuffer = await generateMinutesHtmlPdf({
      meeting,
      attendees,
      agendaItems,
      chairmanName,
      boardName,
      boardType,
      institutionName,
      institutionAddress,
      institutionAccreditation,
      secretaryName,
      principalName,
      principalTitle,
      contactCell,
      contactWeb,
      contactEmail,
      logoImage,
      rightLogoImage,
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="minutes-meeting-${meeting.meeting_number}-${meeting.academic_year}.pdf"`,
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('PDF generation failed:', errorMsg, error);
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        detail: process.env.NODE_ENV === 'development' ? errorMsg : undefined
      },
      { status: 500 }
    );
  }
}

// Cleanup browser on server shutdown
process.on('exit', async () => {
  await closeBrowser();
});
