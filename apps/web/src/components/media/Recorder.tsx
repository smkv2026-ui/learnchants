import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { canRecord, describeMediaError, pickMimeType, type MediaKind } from '@/lib/recorder';
import { formatDuration } from '@/lib/format';
import { haptic } from '@/lib/celebrate';
import { Button, Icon, cn } from '@/components/ui';
import { analyserForStream, resumeAudio } from './audioGraph';
import { Cymatics } from './Cymatics';
import { CymaticsAudio } from './CymaticsAudio';

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  url: string;
  fileName?: string;
}

const COUNT_MS = 700;

type Phase = 'idle' | 'countdown' | 'recording' | 'review' | 'error';

interface RecorderProps {
  kind: MediaKind;
  /** Guided rounds with a "Next round" counter. Omit for a single free recording. */
  rounds?: number;
  /** Instruction shown before recording starts. */
  hint?: string;
  maxSeconds?: number;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (rec: Recording) => void;
  onDiscard?: () => void;
}

/**
 * Browser recorder with live cymatics / camera preview, timer, re-record and preview.
 * Idle, countdown and recording share one fixed-size stage so nothing on the
 * screen jumps when recording starts.
 */
export function Recorder({ kind, rounds, hint, maxSeconds: maxSecondsProp, confirmLabel = 'Use this recording', busy, onConfirm, onDiscard }: RecorderProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(3);
  const [round, setRound] = useState(1);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [rec, setRec] = useState<Recording | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const tick = useRef<number>();
  const disposeAnalyser = useRef<() => void>();
  const preview = useRef<HTMLVideoElement>(null);
  // Bitrates keep recordings within the 8 MB built-in storage limit (~3 MB/min video, ~0.5 MB/min audio).
  const maxSeconds = maxSecondsProp ?? (kind === 'video' ? 150 : 600);

  const cleanup = () => {
    window.clearInterval(tick.current);
    disposeAnalyser.current?.();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setAnalyser(null);
  };

  useEffect(() => () => {
    cleanup();
    if (rec) URL.revokeObjectURL(rec.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = async () => {
    setError('');
    if (!canRecord()) {
      setError('Recording is not supported in this browser. Please attach a file instead.');
      setPhase('error');
      return;
    }
    try {
      await resumeAudio();
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: kind === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } : false,
      });
      stream.current = s;
      if (kind === 'video' && preview.current) {
        preview.current.srcObject = s;
        void preview.current.play().catch(() => undefined);
      }
      const a = analyserForStream(s);
      if (a) {
        setAnalyser(a.analyser);
        disposeAnalyser.current = a.dispose;
      }
      setPhase('countdown');
      for (let n = 3; n > 0; n--) {
        setCount(n);
        haptic(10);
        await new Promise((r) => setTimeout(r, COUNT_MS));
      }
      startRecording(s);
    } catch (err) {
      cleanup();
      setError(describeMediaError(err));
      setPhase('error');
    }
  };

  const startRecording = (s: MediaStream) => {
    const mimeType = pickMimeType(kind);
    const mr = new MediaRecorder(s, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 64_000,
      ...(kind === 'video' ? { videoBitsPerSecond: 350_000 } : {}),
    });
    chunks.current = [];
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    mr.onstop = () => {
      const type = (mr.mimeType || mimeType || (kind === 'audio' ? 'audio/webm' : 'video/webm')).split(';')[0];
      const blob = new Blob(chunks.current, { type });
      const durationSec = (performance.now() - startedAt.current) / 1000;
      cleanup();
      setRec({ blob, mimeType: type, durationSec, url: URL.createObjectURL(blob) });
      setPhase('review');
    };
    recorder.current = mr;
    mr.start(1000);
    startedAt.current = performance.now();
    setElapsed(0);
    setRound(1);
    setPhase('recording');
    tick.current = window.setInterval(() => {
      const sec = (performance.now() - startedAt.current) / 1000;
      setElapsed(sec);
      if (sec >= maxSeconds) stop();
    }, 250);
  };

  const stop = () => {
    haptic(20);
    if (recorder.current?.state !== 'inactive') recorder.current?.stop();
  };

  const nextRound = () => {
    haptic(15);
    if (rounds && round >= rounds) stop();
    else setRound((r) => r + 1);
  };

  const reRecord = () => {
    if (rec) URL.revokeObjectURL(rec.url);
    setRec(null);
    setPhase('idle');
    void begin();
  };

  const discard = () => {
    if (rec) URL.revokeObjectURL(rec.url);
    setRec(null);
    setPhase('idle');
    onDiscard?.();
  };

  const recording = phase === 'recording';

  const live = phase === 'idle' || phase === 'countdown' || phase === 'recording';
  const STAGE = 232;

  // One circular control that morphs: mic (idle) → 3·2·1 (countdown) → stop (recording).
  const control = (
    <motion.button
      layout
      type="button"
      onClick={phase === 'idle' ? begin : recording ? stop : undefined}
      disabled={phase === 'countdown'}
      aria-label={phase === 'idle' ? `Start recording ${kind}` : recording ? 'Stop recording' : `Recording starts in ${count}`}
      className={cn(
        'relative z-10 grid h-24 w-24 place-items-center rounded-full text-white shadow-glow transition-colors duration-500',
        recording ? 'bg-danger' : 'bg-gradient-to-br from-accent to-accent/70',
      )}
      whileTap={{ scale: 0.94 }}
    >
      {phase === 'idle' && <span className="absolute inset-0 animate-pulsering rounded-full bg-accent/50" />}
      {phase === 'countdown' && (
        <svg className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="47" fill="none" stroke="rgb(255 255 255 / .15)" strokeWidth="3" />
          <motion.circle
            cx="50" cy="50" r="47" fill="none" stroke="rgb(var(--chant))" strokeWidth="3" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: (3 * COUNT_MS) / 1000, ease: 'linear' }}
          />
        </svg>
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={phase === 'countdown' ? `c${count}` : phase}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.4 }}
          transition={{ duration: 0.25 }}
          className="grid place-items-center"
        >
          {phase === 'countdown' ? (
            <span className="num text-4xl font-bold">{count}</span>
          ) : (
            <Icon name={recording ? 'stop' : kind === 'audio' ? 'mic' : 'video'} size={recording ? 30 : 36} />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );

  const status = (
    <div className="flex h-6 items-center justify-center text-sm" aria-live="polite">
      {phase === 'idle' && <span className="text-muted">Tap the circle when you're ready</span>}
      {phase === 'countdown' && <span className="font-medium text-ink">Get ready…</span>}
      {recording && (
        <span className="flex items-center gap-2 font-semibold text-danger">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" /> Recording · <span className="tabular-nums">{formatDuration(elapsed)}</span>
        </span>
      )}
    </div>
  );

  return (
    <div className="glass relative overflow-hidden rounded-4xl p-5 sm:p-7">
      {kind === 'video' && (
        <div className={cn('relative mb-3 aspect-video w-full overflow-hidden rounded-3xl bg-black', !live && 'hidden')}>
          <video
            ref={preview}
            muted
            playsInline
            className={cn('h-full w-full -scale-x-100 object-cover transition-opacity duration-500', phase === 'idle' ? 'opacity-0' : 'opacity-100')}
          />
          {phase === 'idle' && <div className="absolute inset-0 bg-[url('/mandala.svg')] bg-[length:60%] bg-center bg-no-repeat opacity-[.12] [filter:var(--mandala-filter)]" />}
          <div className={cn('absolute inset-x-0 flex justify-center transition-all duration-500', recording ? 'bottom-4' : 'bottom-1/2 translate-y-1/2')}>
            {control}
          </div>
        </div>
      )}

      {live && (
        <div className="flex flex-col items-center gap-3 text-center">
          {(hint || rounds) && (
            // Stays in place (faded) after "start" so the stage below never jumps.
            <p className={cn('max-w-sm text-sm text-muted transition-opacity duration-500', phase !== 'idle' && 'opacity-0')} aria-hidden={phase !== 'idle'}>
              {hint ?? `Chant the verse ${rounds} times in one recording. Tap “Next round” after each repetition.`}
            </p>
          )}
          {kind === 'audio' && (
            <div className="relative grid place-items-center" style={{ width: STAGE, height: STAGE, maxWidth: '100%' }}>
              <div className={cn('absolute inset-0 transition-opacity duration-700', recording ? 'opacity-100' : phase === 'countdown' ? 'opacity-60' : 'opacity-30')}>
                <Cymatics analyser={analyser} active={recording} size={STAGE} />
              </div>
              {control}
            </div>
          )}
          {status}
          {rounds && recording ? (
            <div className="flex items-center gap-3">
              <span className="num text-sm text-muted">Round {round} / {rounds}</span>
              <Button size="sm" icon={round >= rounds ? 'check' : 'chevron-right'} onClick={nextRound}>
                {round >= rounds ? 'Finish' : 'Next round'}
              </Button>
            </div>
          ) : (
            <p className="h-5 text-xs text-muted">
              {phase === 'idle'
                ? `We'll ask for ${kind === 'audio' ? 'microphone' : 'camera and microphone'} permission.`
                : recording
                  ? 'Tap stop when you finish chanting.'
                  : 'Recording starts after the count.'}
            </p>
          )}
        </div>
      )}

      {phase === 'review' && rec && (
        <div className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted">Listen back before you continue · {formatDuration(rec.durationSec)}</p>
          {kind === 'audio' ? (
            <CymaticsAudio src={rec.url} size={200} />
          ) : (
            <video src={rec.url} controls playsInline className="aspect-video w-full rounded-3xl bg-black" />
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" icon="restart" onClick={reRecord} disabled={busy}>
              Re-record
            </Button>
            {onDiscard && (
              <Button variant="ghost" icon="trash" onClick={discard} disabled={busy}>
                Discard
              </Button>
            )}
            <Button icon="check" loading={busy} onClick={() => onConfirm(rec)}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div role="alert" className="flex flex-col items-center gap-3 py-4 text-center">
          <Icon name="alert" className="text-danger" size={28} />
          <p className="max-w-sm text-sm">{error}</p>
          <Button variant="secondary" icon="refresh" onClick={() => setPhase('idle')}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
