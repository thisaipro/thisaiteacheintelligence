import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { RankableOptionList, placeLabel } from '../components/runner/RankableOptionList';
import { useRunnerUI } from '../model/runnerStore';
import type { Ranked } from '../model/types';

const options = [
  { label: 'A', text: 'Calmly separates both children' },
  { label: 'B', text: 'Comforts only the calmer child' },
  { label: 'C', text: 'Assumes the usual suspect grabbed first' },
  { label: 'D', text: 'Praises one child in front of the other' },
];

function Harness({ onChange }: { onChange?: (r: Ranked) => void }) {
  const [placed, setPlaced] = useState<Ranked>([null, null, null, null]);
  return <RankableOptionList itemId="X-1" options={options} placed={placed} onChange={(r) => { setPlaced(r); onChange?.(r); }} />;
}

beforeEach(() => act(() => useRunnerUI.setState({ picked: null, announcement: '', noteOpen: false })));

describe('placeLabel', () => {
  it('places, moves and swaps', () => {
    expect(placeLabel([null, null, null, null], 'A', 2)).toEqual([null, null, 'A', null]);
    expect(placeLabel(['A', null, null, null], 'A', 3)).toEqual([null, null, null, 'A']);
    expect(placeLabel(['A', 'B', null, null], 'A', 1)).toEqual(['B', 'A', null, null]);
    expect(placeLabel(['A', null, null, null], 'C', 0)).toEqual(['C', null, null, null]);
  });
});

describe('RankableOptionList', () => {
  it('tap a card, then tap a slot', () => {
    let last: Ranked = [];
    render(<Harness onChange={(r) => (last = r)} />);
    fireEvent.click(screen.getByRole('button', { name: /Praises one child/ }));
    expect(screen.getByTestId('rank-announcer')).toHaveTextContent(/Selected/);
    fireEvent.click(screen.getByRole('button', { name: /Rank 1, Closest to what I'd do: empty/ }));
    expect(last).toEqual(['D', null, null, null]);
    expect(screen.getByTestId('rank-announcer')).toHaveTextContent('Placed “Praises one child in front of the other” at rank 1');
  });

  it('keyboard: number keys place the focused card; Delete takes it back; ↓ moves focus', () => {
    let last: Ranked = [];
    render(<Harness onChange={(r) => (last = r)} />);
    const card = screen.getByRole('button', { name: /Comforts only/ });
    card.focus();
    fireEvent.keyDown(card, { key: '3' });
    expect(last).toEqual([null, null, 'B', null]);
    const placed = screen.getByRole('button', { name: /Rank 3: Comforts only/ });
    fireEvent.keyDown(placed, { key: '1' });
    expect(last).toEqual(['B', null, null, null]);
    fireEvent.keyDown(screen.getByRole('button', { name: /Rank 1: Comforts only/ }), { key: 'Delete' });
    expect(last).toEqual([null, null, null, null]);
    const first = screen.getByRole('button', { name: /Calmly separates/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Comforts only/ }));
  });

  it('all four ranked announces completion', () => {
    render(<Harness />);
    for (const [name, key] of [[/Calmly/, '1'], [/Comforts/, '2'], [/Assumes/, '3'], [/Praises/, '4']] as const) {
      const b = screen.getAllByRole('button', { name }).find((el) => el.closest('.pool'))!;
      fireEvent.keyDown(b, { key });
    }
    expect(screen.getByTestId('rank-announcer')).toHaveTextContent('All four ranked.');
    expect(document.querySelector('.pool.empty')).not.toBeNull();
  });
});
