import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { canRecord, describeMediaError, pickMimeType, type MediaKind } from '@/lib/recorder';
import { formatDuration } from '@/lib/format';
import { haptic } from '@/lib/celebrate';
import { Button, Icon, IconButton, cn } from '@/components/ui';
import { analyserForStream, resumeAudio } from './audioGraph';
import { Waveform } from './Waveform';

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  url: string;
  fileName?: string;
}

type Phase = 'idle' | 'countdown' | 'recording' | 'review' | 'error';

interface RecorderProps {
  kind: MediaKind;
  /** Guided rounds (learners chant 3 times in one take). Omit for a free recording. */
  rounds?: number;
  maxSeconds?: number;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (rec: Recording) => void;
  onDiscard?: () => void;
}

/** Browser recorder with live waveform / camera preview, timer, re-record and preview. */
export function Recorder({ kind, rounds, maxSeconds = 600, confirmLabel = 'Use this recording', busy, onConfirm, onDiscard }: RecorderProps) {
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
        video: kind === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
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
        await new Promise((r) => setTimeout(r, 700));
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
    const mr = new MediaRecorder(s, mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined);
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

  return (
    <div className="glass relative overflow-hidden rounded-4xl p-5 sm:p-7">
      {kind === 'video' && (
        <video
          ref={preview}
          muted
          playsInline
          className={cn(
            'mb-4 aspect-video w-full -scale-x-100 rounded-3xl bg-black object-cover',
            phase !== 'countdown' && phase !== 'recording' && 'hidden',
          )}
        />
      )}

      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <p className="max-w-sm text-sm text-muted">
            {rounds
              ? `Chant the verse ${rounds} times in one recording. Tap “Next round” after each repetition.`
              : `Record ${kind === 'audio' ? 'audio' : 'video'} in your browser.`}
          </p>
          <button
            onClick={begin}
            className="group relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-maroon-400 to-maroon-600 text-white shadow-glow transition active:scale-95"
            aria-label={`Start recording ${kind}`}
          >
            <span className="absolute inset-0 animate-pulsering rounded-full bg-maroon-400/50" />
            <Icon name={kind === 'audio' ? 'mic' : 'video'} size={36} />
          </button>
          <p className="text-xs text-muted">We'll ask for {kind === 'audio' ? 'microphone' : 'camera and microphone'} permission.</p>
        </div>
      )}

      <AnimatePresence>
        {phase === 'countdown' && (
          <motion.div key={count} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="py-8 text-center">
            <span className="text-gold-gradient num text-7xl font-bold">{count}</span>
            <p className="mt-2 text-sm text-muted">Get ready…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {recording && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-danger" aria-live="polite">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" /> Recording · <span className="tabular-nums">{formatDuration(elapsed)}</span>
          </div>
          {rounds && (
            <div className="text-center" aria-live="polite">
              <p className="text-xs uppercase tracking-[.25em] text-muted">Round</p>
              <p className="num text-5xl font-bold">
                <span className="text-gold-gradient">{round}</span>
                <span className="text-2xl text-muted"> / {rounds}</span>
              </p>
              <div className="mt-2 flex justify-center gap-2">
                {Array.from({ length: rounds }).map((_, i) => (
                  <span key={i} className={cn('h-2.5 rounded-full transition-all', i < round - 1 ? 'w-8 bg-gold-sheen' : i === round - 1 ? 'w-8 bg-danger/70' : 'w-2.5 bg-ink/15')} />
                ))}
              </div>
            </div>
          )}
          {kind === 'audio' && <Waveform analyser={analyser} active height={88} />}
          <div className="flex items-center gap-4">
            {rounds ? (
              <>
                <IconButton icon="stop" label="Stop recording" size="lg" variant="secondary" onClick={stop} />
                <Button size="xl" icon={round >= rounds ? 'check' : 'chevron-right'} onClick={nextRound}>
                  {round >= rounds ? 'Finish' : 'Next round'}
                </Button>
              </>
            ) : (
              <button
                onClick={stop}
                aria-label="Stop recording"
                className="grid h-20 w-20 place-items-center rounded-full bg-danger text-white shadow-lg transition active:scale-95"
              >
                <Icon name="stop" size={30} />
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'review' && rec && (
        <div className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted">Listen back before you continue · {formatDuration(rec.durationSec)}</p>
          {kind === 'audio' ? (
            <audio src={rec.url} controls className="w-full" />
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
