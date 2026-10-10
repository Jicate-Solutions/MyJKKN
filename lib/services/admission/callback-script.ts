// lib/services/admission/callback-script.ts
// The short call script a counsellor sees on "Call back now".
//
// Input is exactly what fn_callback_script_context returns: the college, how often
// and when the person called, and — only for a known enquiry — first name,
// programmes of interest, stage and city. No phone number reaches the model.

export interface CallbackScriptContext {
  college: string | null;
  missed_count_7d: number | null;
  ever_connected: boolean | null;
  called_at: string | null;
  known_enquiry: boolean;
  first_name: string | null;
  interested_programs: string[] | string | null;
  funnel_stage: string | null;
  city: string | null;
}

function programmes(ctx: CallbackScriptContext): string | null {
  const p = ctx.interested_programs;
  if (!p) return null;
  const list = Array.isArray(p) ? p : [p];
  const clean = list.map((x) => String(x).trim()).filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

function calledWhen(iso: string | null): string {
  if (!iso) return 'recently';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'recently';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildCallbackPrompt(ctx: CallbackScriptContext): { system: string; user: string } {
  const system = [
    'You write a short phone script for an admission counsellor at a JKKN college in Tamil Nadu, India.',
    'The counsellor is returning a call that the college missed.',
    'Write exactly 4 short lines the counsellor can say: greeting with the college name and that they are returning the call,',
    'one question to learn what the caller needs, one helpful line based on what is known, and a clear next step (visit, application or a follow-up time).',
    'Plain, warm, simple English. No promises about fees, seats, scholarships or results. Never invent facts.',
    'Say "learner" instead of "student". Output only the 4 lines, no headings.',
  ].join(' ');

  const facts: string[] = [
    `College: ${ctx.college ?? 'JKKN'}`,
    `Missed calls from this number in the last 7 days: ${ctx.missed_count_7d ?? 1}`,
    `Last call: ${calledWhen(ctx.called_at)}`,
    `Ever spoken to us before: ${ctx.ever_connected ? 'yes' : 'no'}`,
  ];
  if (ctx.known_enquiry) {
    if (ctx.first_name) facts.push(`Name on the enquiry: ${ctx.first_name}`);
    const p = programmes(ctx);
    if (p) facts.push(`Programmes of interest: ${p}`);
    if (ctx.funnel_stage) facts.push(`Enquiry stage: ${ctx.funnel_stage.replace(/_/g, ' ')}`);
    if (ctx.city) facts.push(`City: ${ctx.city}`);
  } else {
    facts.push('This number is not linked to any enquiry yet, so we do not know who they are.');
  }

  return { system, user: facts.join('\n') };
}

/** Used when the AI call fails, so the counsellor can still call. */
export function fallbackCallbackScript(ctx: CallbackScriptContext): string {
  const college = ctx.college ?? 'JKKN';
  const name = ctx.known_enquiry && ctx.first_name ? ` Am I speaking with ${ctx.first_name}?` : '';
  const p = ctx.known_enquiry ? programmes(ctx) : null;
  return [
    `Hello, this is the admission office of ${college}. You called us and we missed it, so I am calling you back.${name}`,
    'How can I help you today?',
    p ? `I see you were interested in ${p}. I can tell you about the course and the next steps.` : 'I can tell you about our programmes and how to apply.',
    'Would you like to visit the campus, or shall I send you the application link?',
  ].join('\n');
}
