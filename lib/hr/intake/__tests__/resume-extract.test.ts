import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// No database and no real model in these tests: the model config lookup and the
// usage ledger are stubbed, and the Anthropic client is injected.
const recordChatCall = vi.fn(async () => undefined);
vi.mock('@/lib/services/platform/ai-clients/chat', () => ({
  resolveChatModel: vi.fn(async () => ({ provider: 'anthropic', model_id: 'claude-haiku-4-5', resolved: {} })),
  recordChatCall: (...args: unknown[]) => recordChatCall(...(args as [])),
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const extractRawText = vi.fn();
vi.mock('mammoth', () => ({ default: { extractRawText: (...a: unknown[]) => extractRawText(...a) } }));

import {
  createResumeExtractor,
  parseResumeReply,
  resumeKind,
  stripContactDetails,
  HR_RESUME_EXTRACT_FEATURE,
  MAX_RESUME_BYTES,
  RESUME_SYSTEM_PROMPT,
  type ResumeModelClient,
} from '@/lib/hr/intake/resume-extract';

type CreateArgs = Parameters<ResumeModelClient['messages']['create']>;

function reply(text: string) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 80 },
  } as unknown as Awaited<ReturnType<ResumeModelClient['messages']['create']>>;
}

const GOOD = JSON.stringify({
  qualification: 'M.Sc., Ph.D.',
  subject: 'Organic Chemistry',
  experience_years: 6,
  current_role: 'Lecturer, ABC College',
  summary: 'Chemistry lecturer with six years of undergraduate teaching and two published papers.',
});

function fakeClient(impl: (...args: CreateArgs) => Promise<unknown>) {
  const create = vi.fn(impl as (...args: CreateArgs) => Promise<never>);
  return { client: { messages: { create } } as ResumeModelClient, create };
}

const bytes = (n = 64) => new Uint8Array(n).fill(65);

beforeEach(() => {
  recordChatCall.mockClear();
  extractRawText.mockReset();
});

describe('routing by file type', () => {
  it('classifies by mime type, then by extension', () => {
    expect(resumeKind('a.bin', 'application/pdf')).toBe('pdf');
    expect(resumeKind('cv.PDF', 'application/octet-stream')).toBe('pdf');
    expect(resumeKind('cv.jpg', '')).toBe('image');
    expect(resumeKind('x', 'image/png')).toBe('image');
    expect(resumeKind('cv.docx', 'application/octet-stream')).toBe('docx');
    expect(resumeKind('cv.doc', '')).toBe('doc');
    expect(resumeKind('cv.txt', 'text/plain')).toBe('unsupported');
    expect(resumeKind('cv.zip', 'application/zip')).toBe('unsupported');
  });

  it('sends a PDF as a document block, with no file name, under the HR feature key', async () => {
    const { client, create } = fakeClient(async () => reply(GOOD));
    const out = await createResumeExtractor({ client })({
      fileName: 'Ravi_9876543210.pdf',
      bytes: bytes(),
      mimeType: 'application/pdf',
    });
    expect(out).toEqual({
      qualification: 'M.Sc., Ph.D.',
      subject: 'Organic Chemistry',
      experience_years: 6,
      current_role: 'Lecturer, ABC College',
      summary: 'Chemistry lecturer with six years of undergraduate teaching and two published papers.',
    });
    const [params, options] = create.mock.calls[0];
    expect(params.model).toBe('claude-haiku-4-5');
    expect(params.system).toBe(RESUME_SYSTEM_PROMPT);
    const content = params.messages[0].content as Array<{ type: string; source?: { media_type: string } }>;
    expect(content[0].type).toBe('document');
    expect(content[0].source?.media_type).toBe('application/pdf');
    expect(JSON.stringify(params)).not.toContain('9876543210');
    expect(options?.timeout).toBe(30_000);
    expect(recordChatCall).toHaveBeenCalledTimes(1);
    expect(recordChatCall.mock.calls[0]).toEqual(
      expect.arrayContaining([HR_RESUME_EXTRACT_FEATURE, 'anthropic', 'claude-haiku-4-5']),
    );
  });

  it('sends a JPG or PNG as an image block', async () => {
    const { client, create } = fakeClient(async () => reply(GOOD));
    const read = createResumeExtractor({ client });
    await read({ fileName: 'scan.jpg', bytes: bytes(), mimeType: 'image/jpeg' });
    await read({ fileName: 'scan.png', bytes: bytes(), mimeType: 'application/octet-stream' });
    const media = create.mock.calls.map(
      ([p]) => (p.messages[0].content as Array<{ type: string; source?: { media_type: string } }>)[0],
    );
    expect(media.map((b) => b.type)).toEqual(['image', 'image']);
    expect(media.map((b) => b.source?.media_type)).toEqual(['image/jpeg', 'image/png']);
  });

  it('reads a DOCX locally and sends its text', async () => {
    extractRawText.mockResolvedValue({ value: 'Ph.D. in History. Eight years teaching.', messages: [] });
    const { client, create } = fakeClient(async () => reply(GOOD));
    const out = await createResumeExtractor({ client })({
      fileName: 'cv.docx',
      bytes: bytes(),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(out).not.toBeNull();
    const content = create.mock.calls[0][0].messages[0].content as Array<{ type: string; text?: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');
    expect(content[0].text).toContain('Eight years teaching.');
  });

  it('returns null without calling the model for .doc, unsupported, empty, too-large and empty-text files', async () => {
    const { client, create } = fakeClient(async () => reply(GOOD));
    const read = createResumeExtractor({ client });
    expect(await read({ fileName: 'cv.doc', bytes: bytes(), mimeType: 'application/msword' })).toBeNull();
    expect(await read({ fileName: 'cv.txt', bytes: bytes(), mimeType: 'text/plain' })).toBeNull();
    expect(await read({ fileName: 'cv.pdf', bytes: new Uint8Array(0), mimeType: 'application/pdf' })).toBeNull();
    expect(
      await read({ fileName: 'cv.pdf', bytes: new Uint8Array(MAX_RESUME_BYTES + 1), mimeType: 'application/pdf' }),
    ).toBeNull();
    expect(
      await read({ fileName: 'big.jpg', bytes: new Uint8Array(4 * 1024 * 1024), mimeType: 'image/jpeg' }),
    ).toBeNull();
    extractRawText.mockResolvedValue({ value: '   ', messages: [] });
    expect(await read({ fileName: 'blank.docx', bytes: bytes(), mimeType: '' })).toBeNull();
    extractRawText.mockRejectedValue(new Error('not a zip'));
    expect(await read({ fileName: 'broken.docx', bytes: bytes(), mimeType: '' })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('returns null when no API key is configured and no client is given', async () => {
    const saved = { a: process.env.ANTHROPIC_API_KEY, c: process.env.CLAUDE_API_KEY };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    try {
      const out = await createResumeExtractor()({ fileName: 'cv.pdf', bytes: bytes(), mimeType: 'application/pdf' });
      expect(out).toBeNull();
    } finally {
      if (saved.a !== undefined) process.env.ANTHROPIC_API_KEY = saved.a;
      if (saved.c !== undefined) process.env.CLAUDE_API_KEY = saved.c;
    }
  });
});

describe('cleaning the reply', () => {
  it('turns placeholders into null', () => {
    const out = parseResumeReply(
      JSON.stringify({
        qualification: 'N/A',
        subject: 'Not mentioned',
        experience_years: 'Not stated',
        current_role: '-',
        summary: '',
      }),
    );
    expect(out).toEqual({
      qualification: null,
      subject: null,
      experience_years: null,
      current_role: null,
      summary: null,
    });
    expect(parseResumeReply('{"qualification":"unknown","subject":"none","current_role":"—"}')).toMatchObject({
      qualification: null,
      subject: null,
      current_role: null,
    });
  });

  it('keeps experience_years only as a number from 0 to 60', () => {
    const years = (v: unknown) => parseResumeReply(JSON.stringify({ experience_years: v }))?.experience_years;
    expect(years(0)).toBe(0);
    expect(years(6.5)).toBe(6.5);
    expect(years(60)).toBe(60);
    expect(years('12 years')).toBe(12);
    expect(years(61)).toBeNull();
    expect(years(-1)).toBeNull();
    expect(years('about ten')).toBeNull();
    expect(years(null)).toBeNull();
    expect(years(true)).toBeNull();
  });

  it('strips emails, phone numbers and links from every string field', () => {
    const out = parseResumeReply(
      JSON.stringify({
        qualification: 'M.A. (ravi.k@gmail.com)',
        subject: 'History, Mobile: 98765 43210',
        current_role: 'Lecturer, XYZ College +91-98765-43210',
        summary: 'History lecturer (ravi [at] gmail [dot] com, linkedin.com/in/x https://x.io/ravi) with 8 years.',
      }),
    );
    expect(out?.qualification).toBe('M.A.');
    expect(out?.subject).toBe('History');
    expect(out?.current_role).toBe('Lecturer, XYZ College');
    expect(out?.summary).not.toMatch(/@|\[at\]|gmail|https?:|98765/);
    expect(out?.summary).toContain('History lecturer');
    // Year ranges and short numbers are not phone numbers.
    expect(stripContactDetails('Taught 2015 - 2019 at ABC, 120 learners')).toBe(
      'Taught 2015 - 2019 at ABC, 120 learners',
    );
    expect(stripContactDetails('Ph 2234567')).toBe('');
  });

  it('caps the summary at 160 characters and one sentence', () => {
    const long = `${'Experienced mathematics lecturer '.repeat(10)}with many years.`;
    const s1 = parseResumeReply(JSON.stringify({ summary: long }))?.summary ?? '';
    expect(s1.length).toBeLessThanOrEqual(160);
    expect(s1.endsWith('…')).toBe(true);
    const s2 = parseResumeReply(
      JSON.stringify({ summary: 'Holds an M.Sc. Physics and a Ph.D. from Anna University. Married, two sons.' }),
    )?.summary;
    expect(s2).toBe('Holds an M.Sc. Physics and a Ph.D. from Anna University.');
  });

  it('accepts a reply wrapped in a code fence', () => {
    expect(parseResumeReply('```json\n' + GOOD + '\n```')?.subject).toBe('Organic Chemistry');
  });

  it('returns null for a reply that is not a JSON object', () => {
    expect(parseResumeReply('Sorry, I cannot read this file.')).toBeNull();
    expect(parseResumeReply('{"qualification": "M.A.",')).toBeNull();
    expect(parseResumeReply('[1,2]')).toBeNull();
  });
});

describe('failures never reach the caller', () => {
  afterEach(() => vi.useRealTimers());

  it('bad JSON from the model → null, usage still recorded', async () => {
    const { client } = fakeClient(async () => reply('Here is the profile: qualification M.A.'));
    const out = await createResumeExtractor({ client })({ fileName: 'cv.pdf', bytes: bytes(), mimeType: 'application/pdf' });
    expect(out).toBeNull();
    expect(recordChatCall).toHaveBeenCalledTimes(1);
  });

  it('an API error (quota, auth) → null, failure recorded', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('429 rate_limit_error');
    });
    const out = await createResumeExtractor({ client })({ fileName: 'cv.pdf', bytes: bytes(), mimeType: 'application/pdf' });
    expect(out).toBeNull();
    expect(recordChatCall).toHaveBeenCalledTimes(1);
    const call = recordChatCall.mock.calls[0] as unknown[];
    expect(call[4]).toBeNull();
    expect(String(call[5])).toContain('429');
  });

  it('a model that never answers → null after the timeout (30 s by default)', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const { client } = fakeClient((_p, options) => {
      signal = options?.signal ?? undefined;
      return new Promise(() => {});
    });
    const pending = createResumeExtractor({ client })({ fileName: 'cv.pdf', bytes: bytes(), mimeType: 'application/pdf' });
    await vi.advanceTimersByTimeAsync(29_999);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(recordChatCall).toHaveBeenCalledTimes(1);
  });
});
