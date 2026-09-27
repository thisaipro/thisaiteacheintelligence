/* Ranking control. Three equivalent input paths:
   1. drag and drop (@dnd-kit, pointer + touch + keyboard sensors),
   2. tap a card, then tap a slot (the mobile default),
   3. keyboard: ↑/↓ choose a card, 1–4 place it, Delete takes it back
      (Space lifts a card for a keyboard drag; arrows move between slots).
   Every change is announced through an aria-live region. */
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { RANK_LABELS } from '../../model/bands';
import { useRunnerUI } from '../../model/runnerStore';
import type { ClientOption, Ranked } from '../../model/types';
import { RankSlot } from './RankSlot';

const short = (t: string) => (t.length > 60 ? t.slice(0, 57).trimEnd() + '…' : t);

/** Pure placement rule shared by every input path: moving onto a filled slot swaps. */
export function placeLabel(placed: Ranked, label: string, slot: number): Ranked {
  const next = placed.slice();
  const from = next.indexOf(label);
  if (from > -1) next[from] = null;
  const displaced = next[slot];
  next[slot] = label;
  if (displaced && from > -1) next[from] = displaced;
  return next;
}

/** Keyboard drag: arrows jump between the four slots (and back to the pool). */
const slotCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, droppableRects, collisionRect } = context;
  if (!active || !collisionRect) return undefined;
  const dir = event.code === 'ArrowDown' || event.code === 'ArrowRight' ? 1 : event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 0;
  if (!dir) return undefined;
  event.preventDefault();
  const targets = [...droppableRects.entries()]
    .filter(([id]) => String(id).startsWith('slot:'))
    .map(([, r]) => r)
    .sort((a, b) => a.top - b.top);
  const cy = collisionRect.top + collisionRect.height / 2;
  const next = dir > 0 ? targets.find((r) => r.top + r.height / 2 > cy + 2) : [...targets].reverse().find((r) => r.top + r.height / 2 < cy - 2);
  if (!next) return undefined;
  return { x: next.left, y: next.top + next.height / 2 - collisionRect.height / 2 };
};

function PoolCard({ option, picked, onPick }: { option: ClientOption; picked: boolean; onPick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'opt:' + option.label, data: { label: option.label } });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      role="button"
      data-card={option.label}
      className={'opt' + (picked ? ' picked' : '') + (isDragging ? ' dragging' : '')}
      aria-pressed={picked}
      aria-describedby="ta-rank-help"
      onClick={onPick}
    >
      <span className="grip" aria-hidden="true">⣿</span>
      <span>{option.text}</span>
    </button>
  );
}

export function RankableOptionList({
  itemId, options, placed, onChange, locked,
}: { itemId: string; options: ClientOption[]; placed: Ranked; onChange: (next: Ranked) => void; locked?: boolean }) {
  const { picked, pick, announce, announcement } = useRunnerUI();
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const optBy = (l: string) => options.find((o) => o.label === l)!;
  const pool = options.filter((o) => !placed.includes(o.label));
  // Handlers read the latest ranking, not the last render's: two quick key presses
  // can land before the cache update re-renders this component.
  const latest = useRef({ itemId, placed, prop: placed });
  if (latest.current.itemId !== itemId || latest.current.prop !== placed) latest.current = { itemId, placed, prop: placed };
  const commit = (next: Ranked) => { latest.current = { ...latest.current, placed: next }; onChange(next); };
  const { setNodeRef: poolRef } = useDroppable({ id: 'pool' });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: slotCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  function place(label: string, slot: number) {
    if (locked) return;
    const next = placeLabel(latest.current.placed, label, slot);
    commit(next);
    pick(null);
    const left = 4 - next.filter(Boolean).length;
    announce(`Placed “${short(optBy(label).text)}” at rank ${slot + 1}, ${RANK_LABELS[slot].l}. ${left ? left + ' still to place.' : 'All four ranked.'}`);
  }
  function clear(slot: number) {
    const cur = latest.current.placed;
    if (locked || !cur[slot]) return;
    const label = cur[slot]!;
    const next = cur.slice();
    next[slot] = null;
    commit(next);
    announce(`Removed “${short(optBy(label).text)}” from rank ${slot + 1}.`);
  }

  function onDragStart(e: DragStartEvent) {
    setDragLabel(String(e.active.data.current?.label ?? ''));
    pick(null);
  }
  function onDragEnd(e: DragEndEvent) {
    const label = String(e.active.data.current?.label ?? '');
    setDragLabel(null);
    const over = e.over ? String(e.over.id) : null;
    if (!label || !over) return;
    if (over.startsWith('slot:')) place(label, Number(over.slice(5)));
    else if (over === 'pool') {
      const i = latest.current.placed.indexOf(label);
      if (i > -1) clear(i);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (!el || locked) return;
    const label = el.dataset.card!;
    const cards = [...(root.current?.querySelectorAll<HTMLElement>('[data-card]') ?? [])];
    const idx = cards.indexOf(el);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cards[(idx + (e.key === 'ArrowDown' ? 1 : -1) + cards.length) % cards.length]?.focus();
    } else if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      // From the pool, focus moves on to the next unplaced card so 1-2-3-4 can be typed
      // in sequence; a card being moved between ranks keeps focus.
      const unplaced = options.map((o) => o.label).filter((l) => !latest.current.placed.includes(l));
      const target = unplaced.includes(label) ? unplaced[(unplaced.indexOf(label) + 1) % unplaced.length] : label;
      place(label, Number(e.key) - 1);
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(target)}"]`)?.focus());
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const i = latest.current.placed.indexOf(label);
      if (i > -1) { e.preventDefault(); clear(i); }
    } else if (e.key === 'Escape' && picked) {
      pick(null);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragLabel(null)}
      accessibility={{ announcements: {
        onDragStart: ({ active }) => `Picked up “${short(optBy(String(active.data.current?.label)).text)}”. Use the arrow keys to move between ranks, Space to drop.`,
        onDragOver: ({ over }) => (over && String(over.id).startsWith('slot:') ? `Over rank ${Number(String(over.id).slice(5)) + 1}, ${RANK_LABELS[Number(String(over.id).slice(5))].l}.` : 'Not over a rank.'),
        onDragEnd: () => '',
        onDragCancel: () => 'Cancelled.',
      } }}>
      <div ref={root} onKeyDown={onKeyDown} data-item={itemId}>
        <div className="rankhead">
          <h3 id="ta-rank-title">Rank these four — 1 is closest to what you'd do</h3>
          <span className="hint">{pool.length ? 'Drag a card into a slot, or tap the card then tap the slot' : 'Drag any card to reorder'}</span>
        </div>
        <div ref={poolRef} className={'pool' + (pool.length ? '' : ' empty')} aria-label="Responses to rank" role="group">
          {pool.map((o) => (
            <PoolCard key={o.label} option={o} picked={picked === o.label}
              onPick={() => { if (locked) return; const next = picked === o.label ? null : o.label; pick(next); if (next) announce(`Selected “${short(o.text)}”. Now choose a rank, or press 1 to 4.`); }} />
          ))}
        </div>
        <div className="slots" role="list" aria-labelledby="ta-rank-title">
          {RANK_LABELS.map((r, i) => (
            <RankSlot key={i} index={i} label={r} option={placed[i] ? optBy(placed[i]!) : null} picked={picked} locked={locked}
              onPlacePicked={() => picked && place(picked, i)}
              onPickPlaced={(l) => { if (locked) return; pick(picked === l ? null : l); }}
              onClear={() => clear(i)} />
          ))}
        </div>
        <p className="kbdhint" id="ta-rank-help">
          Keyboard: <kbd>↑</kbd> <kbd>↓</kbd> choose a card · <kbd>1</kbd>–<kbd>4</kbd> place it · <kbd>Delete</kbd> take it back
        </p>
        <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="rank-announcer">{announcement}</div>
      </div>
      <DragOverlay>
        {dragLabel ? <div className="opt dragoverlay"><span className="grip" aria-hidden="true">⣿</span><span>{optBy(dragLabel).text}</span></div> : null}
      </DragOverlay>
    </DndContext>
  );
}
