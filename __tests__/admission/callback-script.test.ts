import { describe, it, expect } from 'vitest';
import { buildCallbackPrompt, fallbackCallbackScript, type CallbackScriptContext } from '@/lib/services/admission/callback-script';

const unknown: CallbackScriptContext = {
  college: 'JKKN College of Pharmacy',
  missed_count_7d: 3,
  ever_connected: false,
  called_at: '2026-10-10T04:30:00Z',
  known_enquiry: false,
  first_name: null,
  interested_programs: null,
  funnel_stage: null,
  city: null,
};

const known: CallbackScriptContext = {
  ...unknown,
  known_enquiry: true,
  first_name: 'Priya',
  interested_programs: ['B.Pharm', 'Pharm.D'],
  funnel_stage: 'follow_up_scheduled',
  city: 'Erode',
};

describe('callback script prompt', () => {
  it('tells the model the caller is unknown when there is no enquiry', () => {
    const { user } = buildCallbackPrompt(unknown);
    expect(user).toContain('not linked to any enquiry');
    expect(user).toContain('Missed calls from this number in the last 7 days: 3');
    expect(user).not.toContain('Priya');
  });

  it('passes only first name, programmes, stage and city for a known enquiry', () => {
    const { user } = buildCallbackPrompt(known);
    expect(user).toContain('Name on the enquiry: Priya');
    expect(user).toContain('Programmes of interest: B.Pharm, Pharm.D');
    expect(user).toContain('Enquiry stage: follow up scheduled');
    expect(user).toContain('City: Erode');
  });

  it('never contains a phone number', () => {
    const withNumber = { ...known, caller_number: '+919876543210' } as CallbackScriptContext;
    const { system, user } = buildCallbackPrompt(withNumber);
    expect(system + user).not.toMatch(/\d{10}/);
  });

  it('forbids promises about fees, seats and scholarships', () => {
    expect(buildCallbackPrompt(known).system).toMatch(/No promises about fees, seats, scholarships/);
  });
});

describe('fallback script', () => {
  it('is four lines and names the college', () => {
    const s = fallbackCallbackScript(unknown);
    expect(s.split('\n')).toHaveLength(4);
    expect(s).toContain('JKKN College of Pharmacy');
    expect(s).not.toContain('Am I speaking with');
  });

  it('uses the first name and programmes for a known enquiry', () => {
    const s = fallbackCallbackScript(known);
    expect(s).toContain('Am I speaking with Priya?');
    expect(s).toContain('B.Pharm, Pharm.D');
  });

  it('accepts a single programme given as text', () => {
    expect(fallbackCallbackScript({ ...known, interested_programs: 'B.Sc Nursing' })).toContain('B.Sc Nursing');
  });
});
