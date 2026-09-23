// @vitest-environment jsdom

/**
 * The scheduled-questions UI, clicked. The repo is production-connected, so no
 * dev server is started for this lane; these tests press every button the
 * feature adds and check what each one asks the service to do:
 *   History → Repeat… → dialog → Save            (fn_ai_query_schedule_create)
 *   Scheduled tab → Pause / Resume / Run now / Delete / Latest answer
 * The service module is replaced by spies; the components are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const svc = vi.hoisted(() => ({
  listMySchedules: vi.fn(),
  createSchedule: vi.fn(),
  setScheduleActive: vi.fn(),
  deleteSchedule: vi.fn(),
  runScheduleNow: vi.fn(),
  getScheduleAnswer: vi.fn(),
  getPreviousScheduleAnswer: vi.fn(),
}));
vi.mock('@/lib/services/ai-query/schedules/schedule-service', async (orig) => ({
  ...(await orig<typeof import('../schedule-service')>()),
  ...svc,
}));

vi.mock('@/components/ai-query/ArtifactPanel', () => ({
  ArtifactPanel: ({ artifactId, open }: { artifactId: string | null; open: boolean }) =>
    open ? <div data-testid="artifact-panel">{artifactId}</div> : null,
}));

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({ rpc }) }));

import { toast } from 'sonner';
import { ChatHistorySheet } from '@/components/ai-query/ChatHistorySheet';
import { ScheduleList } from '@/components/ai-query/ScheduleList';
import type { AIQuerySchedule } from '../types';

function row(over: Partial<AIQuerySchedule> = {}): AIQuerySchedule {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    owner_id: 'u1',
    title: 'Weekly count',
    question: 'How many learners came today?',
    cadence: 'weekly',
    weekday: 1,
    day_of_month: null,
    time_ist: '09:00:00',
    channels: ['email', 'in_app'],
    active: true,
    next_run_at: '2026-09-28T03:30:00Z',
    last_run_at: '2026-09-21T03:35:00Z',
    last_job_id: 'job-1',
    last_status: 'delivered',
    consecutive_failures: 0,
    delivery_attempts: 1,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-21T03:40:00Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.listMySchedules.mockResolvedValue([row()]);
  svc.setScheduleActive.mockResolvedValue({ ok: true });
  svc.deleteSchedule.mockResolvedValue({ ok: true });
  svc.runScheduleNow.mockResolvedValue({ ok: true, status: 'queued' });
  svc.createSchedule.mockResolvedValue({ ok: true, id: 'new', next_run_at: '2026-09-28T03:30:00Z' });
  svc.getScheduleAnswer.mockResolvedValue({ status: 'done', answer: '**42** learners', completed_at: null });
  rpc.mockResolvedValue({
    data: [
      {
        conversation_id: 'c1',
        title: 'How many learners came today?',
        turn_count: 1,
        last_at: '2026-09-22T10:00:00Z',
        last_status: 'done',
      },
    ],
    error: null,
  });
});

afterEach(() => cleanup());

describe('Scheduled tab', () => {
  it('shows the plan in plain English and the next run', async () => {
    render(<ScheduleList />);
    expect(await screen.findByText('Weekly count')).toBeInTheDocument();
    expect(screen.getByText(/Sent every Monday at 9:00 am \(IST\) by email and MyJKKN\./)).toBeInTheDocument();
    expect(screen.getByText(/^Next:/)).toBeInTheDocument();
    expect(screen.getByText('Last answer sent')).toBeInTheDocument();
  });

  it('Pause asks to pause this schedule', async () => {
    render(<ScheduleList />);
    fireEvent.click(await screen.findByRole('button', { name: /Pause/ }));
    await waitFor(() => expect(svc.setScheduleActive).toHaveBeenCalledWith(row().id, false));
    expect(toast.success).toHaveBeenCalledWith('Paused.');
  });

  it('Resume shows on a paused schedule and asks to resume it', async () => {
    svc.listMySchedules.mockResolvedValue([row({ active: false, last_status: 'paused_failures' })]);
    render(<ScheduleList />);
    expect(await screen.findByText(/Paused after 3 failed runs/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    await waitFor(() => expect(svc.setScheduleActive).toHaveBeenCalledWith(row().id, true));
  });

  it('Run now asks for a run and explains when it will arrive', async () => {
    render(<ScheduleList />);
    fireEvent.click(await screen.findByRole('button', { name: /Run now/ }));
    await waitFor(() => expect(svc.runScheduleNow).toHaveBeenCalledWith(row().id));
    expect(toast.success).toHaveBeenCalledWith('Asked. The answer will reach you within about 15 minutes.');
  });

  it('Run now reports the daily limit in plain English', async () => {
    svc.runScheduleNow.mockResolvedValue({ ok: false, status: 'skipped_limit', cap: 50 });
    render(<ScheduleList />);
    fireEvent.click(await screen.findByRole('button', { name: /Run now/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("You have reached today's limit of 50 AI Assistant questions."),
    );
  });

  it('Run now is disabled while a run is still being answered', async () => {
    svc.listMySchedules.mockResolvedValue([row({ last_status: 'queued' })]);
    render(<ScheduleList />);
    expect(await screen.findByRole('button', { name: /Run now/ })).toBeDisabled();
  });

  it('Delete asks first, and only deletes after "Delete" is confirmed', async () => {
    render(<ScheduleList />);
    fireEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    expect(await screen.findByText('Delete this schedule?')).toBeInTheDocument();
    expect(svc.deleteSchedule).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByText('Delete this schedule?')).not.toBeInTheDocument());
    expect(svc.deleteSchedule).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Delete')!);
    await waitFor(() => expect(svc.deleteSchedule).toHaveBeenCalledWith(row().id));
  });

  it('Latest answer shows the last reply in place', async () => {
    render(<ScheduleList />);
    fireEvent.click(await screen.findByRole('button', { name: /Latest answer/ }));
    await waitFor(() => expect(svc.getScheduleAnswer).toHaveBeenCalledWith('job-1'));
    expect(await screen.findByText('42')).toBeInTheDocument();
  });

  it('while a new run is being answered, Latest answer still shows the previous answer', async () => {
    svc.listMySchedules.mockResolvedValue([row({ last_status: 'queued', last_job_id: 'job-2' })]);
    svc.getScheduleAnswer.mockResolvedValue({ status: 'pending', answer: null, artifacts: [], completed_at: null });
    svc.getPreviousScheduleAnswer.mockResolvedValue({ answer: 'Last week: **40** learners', artifacts: [], completed_at: null });
    render(<ScheduleList />);
    fireEvent.click(await screen.findByRole('button', { name: /Latest answer/ }));
    await waitFor(() => expect(svc.getPreviousScheduleAnswer).toHaveBeenCalledWith(row().id, 'job-2'));
    expect(await screen.findByText('A new answer is on its way. Here is the previous one:')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run now/ })).toBeDisabled();
  });

  it('with no earlier answer, a run in progress still says so', async () => {
    svc.listMySchedules.mockResolvedValue([row({ last_status: 'queued', last_job_id: 'job-2' })]);
    svc.getScheduleAnswer.mockResolvedValue({ status: 'running', answer: null, artifacts: [], completed_at: null });
    svc.getPreviousScheduleAnswer.mockResolvedValue(null);
    render(<ScheduleList />);
    fireEvent.click(await screen.findByRole('button', { name: /Latest answer/ }));
    expect(await screen.findByText('Still being answered.')).toBeInTheDocument();
  });

  it('a chart that came with the answer opens in the artifact panel', async () => {
    const chartId = '22222222-2222-4222-8222-222222222222';
    svc.getScheduleAnswer.mockResolvedValue({
      status: 'done',
      answer: 'See the chart.',
      artifacts: [{ id: chartId, type: 'chart', title: 'Attendance by week', is_sensitive: false }],
      completed_at: null,
    });
    render(<ScheduleList />);
    fireEvent.click(await screen.findByRole('button', { name: /Latest answer/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Attendance by week/ }));
    expect(await screen.findByTestId('artifact-panel')).toHaveTextContent(chartId);
  });

  it('an empty list tells the person how to start', async () => {
    svc.listMySchedules.mockResolvedValue([]);
    render(<ScheduleList />);
    expect(await screen.findByText('No scheduled questions yet.')).toBeInTheDocument();
  });
});

describe('History → Repeat… → Save', () => {
  it('Repeat… on a past chat opens the dialog for that question and Save creates the schedule', async () => {
    render(<ChatHistorySheet />);
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    const repeat = await screen.findByRole('button', { name: /Repeat the question/ });
    fireEvent.click(repeat);

    expect(await screen.findByText('Repeat this question')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('How many learners came today?');
    expect(screen.getByText(/First answer:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save schedule/ }));
    await waitFor(() =>
      expect(svc.createSchedule).toHaveBeenCalledWith({
        title: 'How many learners came today?',
        question: 'How many learners came today?',
        cadence: 'weekly',
        weekday: 1,
        day_of_month: null,
        time_ist: '09:00',
        channels: ['in_app', 'email'],
      }),
    );
  });

  it('unticking both channels blocks Save', async () => {
    render(<ChatHistorySheet />);
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Repeat the question/ }));
    await screen.findByText('Repeat this question');
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    expect(screen.getByText('Choose at least one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save schedule/ })).toBeDisabled();
  });

  it('a link with ?scheduled=<id> opens the sheet on the Scheduled tab', async () => {
    window.history.pushState({}, '', `/ai-query?scheduled=${row().id}`);
    render(<ChatHistorySheet />);
    expect(await screen.findByText('Weekly count')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Scheduled' })).toHaveAttribute('data-state', 'active');
    window.history.pushState({}, '', '/ai-query');
  });
});
