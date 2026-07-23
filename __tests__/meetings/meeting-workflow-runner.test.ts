// __tests__/meetings/meeting-workflow-runner.test.ts
//
// Unit suite for the PURE pieces of the Meeting Workflows runner (Module 4):
// template rendering + start-time formatting. The DB-touching runDueWorkflows
// path is covered by the manual test steps in NAV-WIRING-workflows.md (it needs
// a live service-role client + Resend/WhatsApp providers); here we lock the
// placeholder substitution + timezone formatting that the runner depends on.

import { describe, expect, it } from 'vitest';
import {
  formatStart,
  renderTemplate,
  type TemplateContext,
} from '@/lib/services/meetings/meeting-workflow-runner';

const CTX: TemplateContext = {
  attendee_name: 'Asha',
  start_time: 'Friday, 12 June 2026 at 9:30 am',
  host_name: 'Dr. Rao',
  cancel_url: 'https://app.example/meetings/cancel/tok123',
};

describe('renderTemplate', () => {
  it('substitutes all four supported placeholders', () => {
    const out = renderTemplate(
      'Hi {{attendee_name}}, your meeting with {{host_name}} is on {{start_time}}. Cancel: {{cancel_url}}',
      CTX
    );
    expect(out).toBe(
      'Hi Asha, your meeting with Dr. Rao is on Friday, 12 June 2026 at 9:30 am. Cancel: https://app.example/meetings/cancel/tok123'
    );
  });

  it('is tolerant of inner whitespace in the token', () => {
    expect(renderTemplate('Hello {{  attendee_name  }}', CTX)).toBe('Hello Asha');
  });

  it('substitutes repeated placeholders', () => {
    expect(renderTemplate('{{host_name}} & {{host_name}}', CTX)).toBe('Dr. Rao & Dr. Rao');
  });

  it('leaves unknown placeholders untouched (a typo stays visible)', () => {
    expect(renderTemplate('Hi {{atendee_name}}', CTX)).toBe('Hi {{atendee_name}}');
  });

  it('returns empty string for empty/falsey template', () => {
    expect(renderTemplate('', CTX)).toBe('');
  });

  it('does not interpret a single brace pair as a placeholder', () => {
    expect(renderTemplate('Use {braces} normally', CTX)).toBe('Use {braces} normally');
  });
});

describe('formatStart', () => {
  it('renders an ISO instant in IST (UTC+05:30) by default', () => {
    // 2026-06-12T04:00:00Z = 09:30 IST.
    const out = formatStart('2026-06-12T04:00:00.000Z');
    expect(out).toContain('2026');
    expect(out).toContain('9:30');
    // "Friday" — full dateStyle includes the weekday.
    expect(out.toLowerCase()).toContain('friday');
  });

  it('honours an explicit timezone', () => {
    // 2026-06-12T04:00:00Z in New York (EDT, UTC-4) = 00:00, i.e. 12:00 am.
    const out = formatStart('2026-06-12T04:00:00.000Z', 'America/New_York');
    expect(out).toContain('2026');
    expect(out.toLowerCase()).toContain('am');
  });

  it('falls back to IST without throwing on a bad timezone string', () => {
    const out = formatStart('2026-06-12T04:00:00.000Z', 'Not/AZone');
    expect(out).toContain('9:30');
  });
});
