// app/api/ai-pulse/quiz/suggest/route.ts
// ============================================
// AI PULSE — QUIZ AI-SUGGEST STUB (v1)
// ============================================
// Wave B.7. v1 returns 5 placeholder bilingual questions.
// Phase 2 will fetch transcript from startup_events.config.ai_pulse.recording_url
// and run an LLM pass (mirroring app/api/work-pulse/analyze/route.ts).
//
// Auth: standard authenticated user with `aiPulse:quiz.author` permission.
//       Permission key is in PR #716 (catalog) — withAuth resolves dynamically
//       via user_has_permission RPC, super_admin bypasses.
//
// Contract:
//   POST /api/ai-pulse/quiz/suggest
//   Body: { cycle_id: string }
//   Response: { questions: QuizQuestion[] }
// ============================================

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';

interface SuggestBody {
  cycle_id?: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Five placeholder bilingual questions calibrated to a generic AI Pulse
 * weekly cycle. Champion overrides every field — these just unblock the UX
 * (so Krishnaveni doesn't stare at an empty editor).
 */
function buildPlaceholderQuestions() {
  const seeds = [
    {
      en: 'What was the featured AI tool covered in this week\'s session?',
      ta: 'இந்த வாரத்தின் அமர்வில் முன்னிலைப்படுத்தப்பட்ட AI கருவி எது?',
      options: [
        { en: 'Tool A (correct option — edit me)', ta: 'கருவி A (சரியான விடை — திருத்துக)', correct: true },
        { en: 'Tool B', ta: 'கருவி B', correct: false },
        { en: 'Tool C', ta: 'கருவி C', correct: false },
        { en: 'Tool D', ta: 'கருவி D', correct: false },
      ],
    },
    {
      en: 'Which workflow did the host demonstrate using the featured tool?',
      ta: 'முன்னிலைப்படுத்தப்பட்ட கருவியைப் பயன்படுத்தி தொகுப்பாளர் என்ன பணிப்போக்கை விளக்கினார்?',
      options: [
        { en: 'Lesson plan generation', ta: 'பாடத் திட்டம் உருவாக்கம்', correct: true },
        { en: 'Image editing', ta: 'பட திருத்துதல்', correct: false },
        { en: 'Audio transcription', ta: 'ஒலிப் பதிவின் எழுத்துப்படுத்தல்', correct: false },
        { en: 'Code generation', ta: 'குறியீடு உருவாக்கம்', correct: false },
      ],
    },
    {
      en: 'What is the recommended first step before using any AI tool with student data?',
      ta: 'மாணவர் தரவுடன் ஏதேனும் AI கருவியைப் பயன்படுத்துவதற்கு முன் பரிந்துரைக்கப்படும் முதல் படி எது?',
      options: [
        { en: 'Anonymize personal information', ta: 'தனிப்பட்ட தகவலை அநாமதேயமாக்குக', correct: true },
        { en: 'Share login credentials', ta: 'உள்நுழைவு விவரங்களை பகிருங்கள்', correct: false },
        { en: 'Upload directly to public clouds', ta: 'பொது மேகங்களுக்கு நேரடியாகப் பதிவேற்றுக', correct: false },
        { en: 'Skip institutional approval', ta: 'நிறுவன ஒப்புதலைத் தவிர்க்கவும்', correct: false },
      ],
    },
    {
      en: 'Which JKKN policy governs externally-shared AI-generated content?',
      ta: 'வெளிப்புறமாக பகிரப்பட்ட AI-உருவாக்கப்பட்ட உள்ளடக்கத்தை எந்த JKKN கொள்கை நிர்வகிக்கிறது?',
      options: [
        { en: 'AI Acceptable Use Policy', ta: 'AI ஏற்கத்தக்க பயன்பாட்டுக் கொள்கை', correct: true },
        { en: 'Cafeteria Policy', ta: 'உணவகக் கொள்கை', correct: false },
        { en: 'Bus Routes Policy', ta: 'பேருந்து வழித்தடக் கொள்கை', correct: false },
        { en: 'Library Returns Policy', ta: 'நூலக திருப்பிக் கொடுத்தல் கொள்கை', correct: false },
      ],
    },
    {
      en: 'What action is expected from each section after this week\'s session?',
      ta: 'இந்த வாரத்தின் அமர்வுக்குப் பிறகு ஒவ்வொரு பிரிவிலிருந்தும் எதிர்பார்க்கப்படும் செயல் என்ன?',
      options: [
        { en: 'Submit a Domain-Sync artifact', ta: 'Domain-Sync வேலை சமர்ப்பிக்கவும்', correct: true },
        { en: 'Take a paid leave', ta: 'ஊதிய விடுப்பு எடுக்கவும்', correct: false },
        { en: 'Email the principal', ta: 'முதல்வருக்கு மின்னஞ்சல் அனுப்பவும்', correct: false },
        { en: 'Skip the next session', ta: 'அடுத்த அமர்வைத் தவிர்க்கவும்', correct: false },
      ],
    },
  ];

  return seeds.map((seed) => ({
    id: newId('q'),
    question_en: seed.en,
    question_ta: seed.ta,
    options: seed.options.map((o) => ({
      id: newId('opt'),
      text_en: o.en,
      text_ta: o.ta,
      is_correct: o.correct,
    })),
  }));
}

export const POST = withAuth(async (request) => {
  let body: SuggestBody = {};
  try {
    body = (await request.json()) as SuggestBody;
  } catch {
    body = {};
  }

  if (!body.cycle_id || typeof body.cycle_id !== 'string') {
    return NextResponse.json(
      { error: 'cycle_id (string) is required' },
      { status: 400 },
    );
  }

  // v1: deterministic stub. Phase 2 will:
  //   1. Read startup_events.config.ai_pulse.recording_url
  //   2. Pull transcript (Drive / Otter / etc.)
  //   3. Anthropic.messages.create({ ... }) with bilingual JSON-array contract
  //   4. Validate shape, return.
  const questions = buildPlaceholderQuestions();

  return NextResponse.json(
    {
      questions,
      stub: true,
      message:
        'v1 placeholder. Phase 2 will replace with transcript-grounded LLM output.',
    },
    { status: 200 },
  );
}, { requirePermission: 'aiPulse:quiz.author', allowApiKey: false });
