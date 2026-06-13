#!/usr/bin/env node
/**
 * Test PDF generation directly with sample data.
 * Run: npm exec tsx -- scripts/test-pdf-generation.js
 *
 * This tests the Puppeteer-based PDF generator without requiring
 * authentication or navigating the web UI.
 */

import fs from 'fs';
import { generateMinutesHtmlPdf, closeBrowser } from '../lib/utils/bos/meeting-minutes-html-pdf';

const testParams = {
  meeting: {
    id: 'test-123',
    meeting_number: 1,
    academic_year: '2025-26',
    actual_date: new Date().toISOString(),
    scheduled_date: new Date().toISOString(),
    actual_start_time: '10:00',
    scheduled_time: '10:00',
    venue: 'Conference Room',
    minutes_content: {
      narrative_html: '<p>This is a test narrative with <strong>bold text</strong> and Tamil text: தமிழ்</p>'
    },
    minutes_summary: 'Test summary',
    board_type: 'BOS',
    board: {
      board_name: 'Board of Studies - Computer Science'
    }
  },
  attendees: [
    {
      attendance_status: 'present',
      member: {
        display_name: 'Dr. John Doe',
        display_designation: 'Professor',
        display_institution: 'JKKN College',
        address: 'Komarapalayam',
        member_type: 'chairman'
      }
    }
  ],
  agendaItems: [
    {
      item_number: 1,
      item_title: 'Approval of Minutes',
      sort_order: 1,
      discussion_notes: 'Minutes were approved unanimously',
      resolution_text: 'Approved'
    }
  ],
  chairmanName: 'Dr. John Doe',
  boardName: 'Computer Science',
  boardType: 'BOS',
  institutionName: 'J.K.K. NATARAJA COLLEGE',
  institutionAddress: 'Komarapalayam - 638 183, Tamil Nadu',
  secretaryName: 'Secretary',
  principalName: 'Principal'
};

console.log('Starting PDF generation test...');

(async () => {
  try {
    const pdfBuffer = await generateMinutesHtmlPdf(testParams);
    console.log('✓ PDF generated successfully');
    console.log('  Size:', pdfBuffer.length, 'bytes');

    // Save to file for inspection
    const outputPath = './test-output.pdf';
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log('✓ PDF saved to', outputPath);
  } catch (error) {
    console.error('✗ PDF generation failed');
    if (error instanceof Error) {
      console.error('  Error:', error.message);
      console.error('  Stack:', error.stack);
    } else {
      console.error('  Error:', error);
    }
    process.exit(1);
  } finally {
    await closeBrowser();
    console.log('Browser closed');
  }
})();
