import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { errorDetails } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { initialLoop, LOOP_COUNT, loopReducer, shouldReplay, type LoopState } from '@/lib/loop';
import { haptic } from '@/lib/celebrate';
import { Icon, IconButton, Spinner, Tabs, cn } from '@/components/ui';
import { analyserForElement, resumeAudio } from './audioGraph';
import { Waveform } from './Waveform';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

interface LoopPlayerProps {
  audioMediaId?: string | null;
  videoMediaId?: string | null;
  loops?: number;
  autoPlay?: boolean;
  onComplete?: () => void;
  onLocked?: () => void;
  compact?: boolean;
}

/**
 * Plays a verse exactly ``loops`` (3) times with a visible counter, pause /
 * restart and speed control. Used identically by learners and admin preview.
 */
export function LoopPlayer({ audioMediaId, videoMediaId, loops = LOOP_COUNT, autoPlay = true, onComplete, onLocked, compact }: LoopPlayerProps) {
  const [mode, setMode] = useState<'audio' | 'video'>(audioMediaId ? 'audio' : 'video');
  const mediaId = mode === 'audio' ? audioMediaId : videoMediaId;
  const url = useMediaUrl(mediaId);
  const el = useRef<HTMLMediaElement | null>(null);
  const [state, dispatch] = useReducer(loopReducer, loops, initialLoop);
  const stateRef = useRef<LoopState>(state);
  stateRef.current = state;
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [speed, setSpeed] = useState(1);
  const [pos, setPos] = useState({ t: 0, d: 0 });
  const [needsTap, setNeedsTap] = useState(false);
  const autoStarted = useRef(false);
  const resumeAt = useRef<number | null>(null);
  const locked = !!url.error && errorDetails(url.error)?.locked === true;

  useEffect(() => {
    if (locked) onLocked?.();
  }, [locked, onLocked]);

  useEffect(() => {
    dispatch({ type: 'reset', total: loops });
    autoStarted.current = false;
  }, [mediaId, loops]);

  useEffect(() => {
    if (el.current) el.current.playbackRate = speed;
  }, [speed, url.data?.url]);

  const play = useCallback(async (fromGesture: boolean) => {
    const m = el.current;
    if (!m) return;
    if (fromGesture) {
      await resumeAudio();
      if (!analyser) setAnalyser(analyserForElement(m));
    }
    m.playbackRate = speed;
    try {
      await m.play();
      setNeedsTap(false);
    } catch {
      setNeedsTap(true);
      dispatch({ type: 'pause' });
    }
  }, [analyser, speed]);

  // Auto-start the 3x loop when the verse opens.
  const onCanPlay = () => {
    if (resumeAt.current != null && el.current) {
      el.current.currentTime = resumeAt.current;
      resumeAt.current = null;
      if (stateRef.current.status === 'playing') void play(false);
      return;
    }
    if (autoPlay && !autoStarted.current && stateRef.current.status === 'idle') {
      autoStarted.current = true;
      dispatch({ type: 'start' });
      void play(false);
    }
  };

  const onEnded = () => {
    const prev = stateRef.current;
    const next = loopReducer(prev, { type: 'ended' });
    dispatch({ type: 'ended' });
    if (shouldReplay(prev, next) && el.current) {
      el.current.currentTime = 0;
      haptic(8);
      void play(false);
    } else if (next.status === 'done') {
      onComplete?.();
    }
  };

  const toggle = () => {
    const m = el.current;
    if (!m) return;
    if (state.status === 'playing' && !needsTap) {
      m.pause();
      dispatch({ type: 'pause' });
      return;
    }
    if (state.status === 'idle' || state.status === 'done') {
      dispatch({ type: 'start' });
      m.currentTime = 0;
    } else {
      dispatch({ type: 'resume' });
    }
    void play(true);
  };

  const restart = () => {
    if (!el.current) return;
    dispatch({ type: 'restart' });
    el.current.currentTime = 0;
    void play(true);
  };

  // Signed URLs expire; on a media error re-issue the URL and resume in place.
  const onError = () => {
    if (!el.current || url.isFetching) return;
    resumeAt.current = el.current.currentTime || 0;
    void url.refetch();
  };

  const playing = state.status === 'playing' && !needsTap;
  const hasBoth = !!audioMediaId && !!videoMediaId;

  if (!audioMediaId && !videoMediaId) {
    return (
      <div className="glass flex items-center gap-3 rounded-3xl p-5 text-muted">
        <Icon name="music" /> No recording has been added to this verse yet.
      </div>
    );
  }

  return (
    <div className={cn('glass relative overflow-hidden rounded-4xl', compact ? 'p-4' : 'p-5 sm:p-7')}>
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 animate-spin-slow rounded-full bg-[url('/mandala.svg')] bg-contain opacity-[.06]" />
      {hasBoth && (
        <div className="mb-4 flex justify-center">
          <Tabs
            items={[
              { id: 'audio', label: 'Audio', icon: 'music' },
              { id: 'video', label: 'Video', icon: 'video' },
            ]}
            value={mode}
            onChange={(m) => setMode(m)}
          />
        </div>
      )}

      {locked ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/15 text-primary">
            <Icon name="lock" size={28} />
          </span>
          <p className="font-semibold">This verse is part of a paid playlist</p>
          <p className="text-sm text-muted">Unlock the playlist to listen and practise.</p>
        </div>
      ) : url.isLoading ? (
        <div className="grid h-48 place-items-center text-muted">
          <Spinner size={28} />
        </div>
      ) : url.error ? (
        <div className="py-8 text-center text-sm text-danger">Could not load this recording. <button className="underline" onClick={() => url.refetch()}>Retry</button></div>
      ) : (
        <>
          {mode === 'video' ? (
            <video
              key={url.data?.url}
              ref={(n) => (el.current = n)}
              src={url.data?.url}
              playsInline
              preload="auto"
              onCanPlay={onCanPlay}
              onEnded={onEnded}
              onError={onError}
              onTimeUpdate={(e) => setPos({ t: e.currentTarget.currentTime, d: e.currentTarget.duration })}
              className="mb-4 aspect-video w-full rounded-3xl bg-black object-contain"
            />
          ) : (
            <audio
              key={url.data?.url}
              ref={(n) => (el.current = n)}
              src={url.data?.url}
              preload="auto"
              onCanPlay={onCanPlay}
              onEnded={onEnded}
              onError={onError}
              onTimeUpdate={(e) => setPos({ t: e.currentTarget.currentTime, d: e.currentTarget.duration })}
            />
          )}

          {/* Loop counter */}
          <div className="mb-3 flex flex-col items-center" aria-live="polite">
            <p className="text-xs uppercase tracking-[.25em] text-muted">Listening</p>
            <div className="num mt-1 flex items-baseline gap-1">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={state.current}
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -16, opacity: 0 }}
                  className="text-gold-gradient text-5xl font-bold tabular-nums"
                >
                  {Math.max(1, state.current)}
                </motion.span>
              </AnimatePresence>
              <span className="text-2xl text-muted">/ {state.total}</span>
            </div>
            <div className="mt-2 flex gap-2" aria-label={`Repetition ${Math.max(1, state.current)} of ${state.total}`}>
              {Array.from({ length: state.total }).map((_, i) => {
                const done = i < state.current - 1 || state.status === 'done';
                const active = i === state.current - 1 && state.status !== 'done';
                return (
                  <span
                    key={i}
                    className={cn(
                      'h-2.5 rounded-full transition-all duration-500',
                      done ? 'w-8 bg-gold-sheen' : active ? 'w-8 bg-primary/50' : 'w-2.5 bg-ink/15',
                    )}
                  />
                );
              })}
            </div>
          </div>

          {mode === 'audio' && <Waveform analyser={analyser} active={playing} height={compact ? 64 : 96} className="my-2" />}

          <div className="mt-2 flex items-center gap-3 text-xs tabular-nums text-muted">
            <span>{formatDuration(pos.t)}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-gold-sheen transition-[width] duration-200" style={{ width: `${pos.d ? (pos.t / pos.d) * 100 : 0}%` }} />
            </div>
            <span>{formatDuration(pos.d)}</span>
          </div>

          <div className="mt-5 flex items-center justify-center gap-4 sm:gap-6">
            <IconButton icon="restart" label="Restart from repetition 1" size="lg" variant="secondary" onClick={restart} />
            <div className="relative">
              {playing && <span className="absolute inset-0 animate-pulsering rounded-full bg-primary/40" />}
              <IconButton
                icon={playing ? 'pause' : 'play'}
                label={playing ? 'Pause' : state.status === 'done' ? 'Play 3 times again' : 'Play'}
                size="xl"
                variant="primary"
                onClick={toggle}
                className="relative !h-20 !w-20"
              />
            </div>
            <label className="relative">
              <span className="sr-only">Playback speed</span>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="glass h-14 w-14 cursor-pointer appearance-none rounded-full text-center text-sm font-semibold text-ink"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s} className="bg-elevated">
                    {s}x
                  </option>
                ))}
              </select>
            </label>
          </div>

          {needsTap && (
            <p className="mt-3 text-center text-sm text-muted">Tap play to start listening (autoplay was blocked by the browser).</p>
          )}
          {state.status === 'done' && (
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-center text-sm font-medium text-success">
              <Icon name="check" size={16} className="mr-1 inline" /> Listened {state.total} times. Now it's your turn to chant!
            </motion.p>
          )}
        </>
      )}
    </div>
  );
}

