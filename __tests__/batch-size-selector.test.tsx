// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(() => cleanup());

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import BatchSizeSelector from '@/app/(routes)/organizations/school-defaults/_components/batch-size-selector';

describe('BatchSizeSelector', () => {
  it('renders with default value', () => {
    render(<BatchSizeSelector value={50} onChange={() => {}} />);
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('calls onChange when value changes', () => {
    const onChange = vi.fn();
    render(<BatchSizeSelector value={50} onChange={onChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '100' } });

    expect(onChange).toHaveBeenCalledWith(100);
  });
});
