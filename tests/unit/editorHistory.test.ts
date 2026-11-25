import { describe, expect, it } from 'vitest';
import {
  canRedoHistory,
  canUndoHistory,
  createHistoryState,
  pushHistoryState,
  redoHistoryState,
  undoHistoryState,
} from '../../src/utils/editorHistory';

describe('editorHistory', () => {
  it('supports push, undo, redo, and branching after undo', () => {
    let h = createHistoryState({ count: 0 });
    expect(canUndoHistory(h)).toBe(false);
    expect(canRedoHistory(h)).toBe(false);

    h = pushHistoryState(h, { count: 1 });
    h = pushHistoryState(h, { count: 2 });
    expect(canUndoHistory(h)).toBe(true);
    expect(canRedoHistory(h)).toBe(false);

    const u1 = undoHistoryState(h);
    expect(u1.snapshot).toEqual({ count: 1 });
    h = u1.nextState;
    expect(canUndoHistory(h)).toBe(true);
    expect(canRedoHistory(h)).toBe(true);

    const r1 = redoHistoryState(h);
    expect(r1.snapshot).toEqual({ count: 2 });
    h = r1.nextState;
    expect(canRedoHistory(h)).toBe(false);

    // Undo once then push a new branch: redo stack should clear
    h = undoHistoryState(h).nextState;
    h = pushHistoryState(h, { count: 99 });
    expect(canRedoHistory(h)).toBe(false);
    expect(h.stack).toEqual([{ count: 0 }, { count: 1 }, { count: 99 }]);
  });

  it('caps history length at maxEntries and supports replaceTop coalescing', () => {
    let h = createHistoryState({ v: 0 });
    for (let i = 1; i <= 5; i += 1) {
      h = pushHistoryState(h, { v: i }, { maxEntries: 3 });
    }
    expect(h.stack).toEqual([{ v: 3 }, { v: 4 }, { v: 5 }]);
    expect(h.index).toBe(2);

    h = pushHistoryState(h, { v: 55 }, { replaceTop: true });
    expect(h.stack).toEqual([{ v: 3 }, { v: 4 }, { v: 55 }]);
    expect(h.index).toBe(2);
  });

  it('deep clones snapshots so external mutations do not corrupt history', () => {
    const original = { items: [{ id: 'a', x: 1 }] };
    const h = createHistoryState(original);
    original.items[0].x = 999;
    expect(h.stack[0].items[0].x).toBe(1);
  });
});
