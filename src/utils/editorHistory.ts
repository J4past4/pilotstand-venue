export interface EditorHistoryState<T> {
  stack: T[];
  index: number;
}

const DEFAULT_MAX_ENTRIES = 50;

export function cloneState<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createHistoryState<T>(initial: T): EditorHistoryState<T> {
  return {
    stack: [cloneState(initial)],
    index: 0,
  };
}

export function pushHistoryState<T>(
  state: EditorHistoryState<T>,
  next: T,
  options?: { maxEntries?: number; replaceTop?: boolean }
): EditorHistoryState<T> {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const cloned = cloneState(next);

  if (options?.replaceTop && state.stack.length > 0) {
    const truncated = state.stack.slice(0, state.index + 1);
    truncated[truncated.length - 1] = cloned;
    return {
      stack: truncated,
      index: truncated.length - 1,
    };
  }

  const sliced = state.stack.slice(0, state.index + 1);
  const updated = [...sliced, cloned].slice(-maxEntries);
  return {
    stack: updated,
    index: updated.length - 1,
  };
}

export function canUndoHistory<T>(state: EditorHistoryState<T>): boolean {
  return state.index > 0;
}

export function canRedoHistory<T>(state: EditorHistoryState<T>): boolean {
  return state.index < state.stack.length - 1;
}

export function undoHistoryState<T>(
  state: EditorHistoryState<T>
): { nextState: EditorHistoryState<T>; snapshot: T | null } {
  if (!canUndoHistory(state)) {
    return { nextState: state, snapshot: null };
  }
  const nextIndex = state.index - 1;
  return {
    nextState: {
      stack: state.stack,
      index: nextIndex,
    },
    snapshot: cloneState(state.stack[nextIndex]),
  };
}

export function redoHistoryState<T>(
  state: EditorHistoryState<T>
): { nextState: EditorHistoryState<T>; snapshot: T | null } {
  if (!canRedoHistory(state)) {
    return { nextState: state, snapshot: null };
  }
  const nextIndex = state.index + 1;
  return {
    nextState: {
      stack: state.stack,
      index: nextIndex,
    },
    snapshot: cloneState(state.stack[nextIndex]),
  };
}
