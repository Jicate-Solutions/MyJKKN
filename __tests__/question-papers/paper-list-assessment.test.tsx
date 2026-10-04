// @vitest-environment jsdom
/**
 * The Question Papers list fetches by round NUMBER only, and every CIA setting
 * numbers its rounds from 1. Picking "Model Exam — Round 1" must not also list
 * the CIA "Round 1" paper for the same course (reports: a model paper "comes as
 * 30 instead of 75").
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IaQuestionPaper } from '@/types/ia-question-paper';

let listed: IaQuestionPaper[] = [];

vi.mock('@/hooks/question-papers/use-question-papers', () => ({
  useQuestionPapers: () => ({ data: listed, isLoading: false, isFetching: false }),
  useApprovePapers: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/services/question-papers/ia-paper-service', () => ({
  IaPaperService: { downloadPaperPdf: vi.fn(), downloadPapersZip: vi.fn() },
  papersZipName: () => 'papers.zip',
}));

import { PaperList } from '@/app/(routes)/academic/question-papers/_components/paper-list';

function paper(overrides: Partial<IaQuestionPaper>): IaQuestionPaper {
  return {
    id: 'p',
    institutions_id: 'inst-1',
    examination_session_id: 'sess-1',
    course_code: '24UZOC04',
    program_code: 'BSC-ZOO',
    semester: 3,
    cia_round: 1,
    set_number: 1,
    status: 'draft',
    authored: false,
    ...overrides,
  };
}

const ciaPaper = paper({
  id: 'cia-1',
  cia_setting_id: 'setting-cia',
  cia_round_name: 'CIA I',
  subject_title: 'Cell Biology — CIA I',
  max_marks: 30,
});
const modelPaper = paper({
  id: 'model-1',
  cia_setting_id: 'setting-model',
  cia_round_name: 'Model Exam',
  subject_title: 'Cell Biology — Model Exam',
  max_marks: 75,
});

function renderList(settingId: string | undefined) {
  render(
    <PaperList
      institutionId='inst-1'
      filters={{
        exam_session_id: 'sess-1',
        program_code: 'BSC-ZOO',
        semester: 3,
        setting_id: settingId,
        cia_round: settingId ? 1 : undefined,
      }}
      canExport={false}
      canApprove={false}
      onOpen={() => {}}
    />
  );
}

afterEach(() => {
  cleanup();
  listed = [];
});

describe('PaperList — Assessment / Round picks one assessment', () => {
  it('lists only the chosen assessment when two settings share a round number', () => {
    listed = [ciaPaper, modelPaper];
    renderList('setting-model');

    expect(screen.getByText('Cell Biology — Model Exam')).toBeInTheDocument();
    expect(screen.queryByText('Cell Biology — CIA I')).not.toBeInTheDocument();
  });

  it('keeps a paper that carries no setting (the generator may not stamp one)', () => {
    const unstamped = paper({ id: 'u-1', subject_title: 'Cell Biology — unstamped' });
    listed = [unstamped, ciaPaper];
    renderList('setting-model');

    expect(screen.getByText('Cell Biology — unstamped')).toBeInTheDocument();
    expect(screen.queryByText('Cell Biology — CIA I')).not.toBeInTheDocument();
  });

  it('shows every assessment, each labelled, before a round is picked', () => {
    listed = [ciaPaper, modelPaper];
    renderList(undefined);

    expect(screen.getByText('Cell Biology — CIA I')).toBeInTheDocument();
    expect(screen.getByText('Cell Biology — Model Exam')).toBeInTheDocument();
    expect(screen.getByText('CIA I')).toBeInTheDocument();
    expect(screen.getByText('Model Exam')).toBeInTheDocument();
  });
});
