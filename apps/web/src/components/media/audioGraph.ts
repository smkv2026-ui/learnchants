// WebAudio helpers shared by the player (media element source) and recorder (mic stream).
type Ctx = AudioContext;

let ctx: Ctx | null = null;
const sources = new WeakMap<HTMLMediaElement, { analyser: AnalyserNode }>();

export function audioContext(): Ctx | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Analyser for a media element (connected once; element audio still plays). */
export function analyserForElement(el: HTMLMediaElement): AnalyserNode | null {
  const existing = sources.get(el);
  if (existing) return existing.analyser;
  const c = audioContext();
  if (!c) return null;
  try {
    const src = c.createMediaElementSource(el);
    const analyser = c.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    src.connect(analyser);
    analyser.connect(c.destination);
    sources.set(el, { analyser });
    return analyser;
  } catch {
    return null;
  }
}

export function analyserForStream(stream: MediaStream): { analyser: AnalyserNode; dispose: () => void } | null {
  const c = audioContext();
  if (!c || !stream.getAudioTracks().length) return null;
  const src = c.createMediaStreamSource(stream);
  const analyser = c.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser); // not connected to destination: no echo
  return { analyser, dispose: () => src.disconnect() };
}

export async function resumeAudio(): Promise<void> {
  const c = audioContext();
  if (c && c.state === 'suspended') await c.resume().catch(() => undefined);
}
