import { describe, expect, it } from 'vitest';
import { initialLoop, loopReducer, shouldReplay, type LoopAction, type LoopState } from './loop';

const run = (actions: LoopAction[], s: LoopState = initialLoop()) => actions.reduce(loopReducer, s);

describe('loopReducer', () => {
  it('plays exactly three times then stops', () => {
    let s = run([{ type: 'start' }]);
    expect(s).toEqual({ total: 3, current: 1, status: 'playing' });
    const replays: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const next = loopReducer(s, { type: 'ended' });
      replays.push(shouldReplay(s, next));
      s = next;
    }
    expect(replays).toEqual([true, true, false]);
    expect(s).toEqual({ total: 3, current: 3, status: 'done' });
    // extra ended events are ignored once done
    expect(loopReducer(s, { type: 'ended' })).toBe(s);
  });

  it('pause/resume keeps the count and ignores ended while paused', () => {
    const s = run([{ type: 'start' }, { type: 'ended' }, { type: 'pause' }]);
    expect(s.current).toBe(2);
    expect(loopReducer(s, { type: 'ended' })).toBe(s);
    expect(loopReducer(s, { type: 'resume' }).status).toBe('playing');
  });

  it('restart goes back to repetition 1, and start after done replays 3 more', () => {
    const done = run([{ type: 'start' }, { type: 'ended' }, { type: 'ended' }, { type: 'ended' }]);
    expect(done.status).toBe('done');
    expect(loopReducer(done, { type: 'start' })).toEqual({ total: 3, current: 1, status: 'playing' });
    const mid = run([{ type: 'start' }, { type: 'ended' }]);
    expect(loopReducer(mid, { type: 'restart' }).current).toBe(1);
  });

  it('reset supports a different count', () => {
    expect(loopReducer(initialLoop(), { type: 'reset', total: 5 })).toEqual({ total: 5, current: 0, status: 'idle' });
  });
});
