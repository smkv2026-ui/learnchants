/** Pure state machine for "play exactly N times" (default 3) playback. */
export interface LoopState {
  total: number;
  /** 1-based index of the repetition in progress (or last finished). */
  current: number;
  status: 'idle' | 'playing' | 'paused' | 'done';
}

export type LoopAction =
  | { type: 'start' }
  | { type: 'ended' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'reset'; total?: number };

export const LOOP_COUNT = 3;

export function initialLoop(total = LOOP_COUNT): LoopState {
  return { total, current: 0, status: 'idle' };
}

export function loopReducer(state: LoopState, action: LoopAction): LoopState {
  switch (action.type) {
    case 'start':
      if (state.status === 'idle' || state.status === 'done') return { ...state, current: 1, status: 'playing' };
      return { ...state, status: 'playing' };
    case 'ended':
      if (state.status !== 'playing') return state;
      if (state.current < state.total) return { ...state, current: state.current + 1 };
      return { ...state, status: 'done' };
    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'playing' } : state;
    case 'restart':
      return { ...state, current: 1, status: 'playing' };
    case 'reset':
      return initialLoop(action.total ?? state.total);
  }
}

/** True when the media element should seek to 0 and play again after `ended`. */
export function shouldReplay(prev: LoopState, next: LoopState): boolean {
  return prev.status === 'playing' && next.status === 'playing' && next.current === prev.current + 1;
}
