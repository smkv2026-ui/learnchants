import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Circular cymatics (Chladni plate) driven by an AnalyserNode.
 *
 * Sand-like particles settle on the nodal lines of two superposed circular
 * plate modes, u = cos(nθ)·sin(mπr) + w·cos(n₂θ)·sin(m₂πr), the flower-like
 * figures of real cymatics. In silence the sand gathers into a single dot (the
 * bindu); as the verse sounds, the figure blooms outwards with its loudness
 * (auto-gained so soft recordings still respond), the pitch picks the mode,
 * and each new syllable (spectral change) shakes the sand into place again.
 */
// [n, m, n2, m2, w]
const MODES: [number, number, number, number, number][] = [
  [3, 2, 6, 3, 0.7], [4, 2, 8, 4, 0.8], [5, 3, 10, 4, 0.75], [6, 3, 12, 5, 0.7], [7, 3, 14, 5, 0.65],
  [8, 4, 16, 6, 0.6], [9, 4, 18, 6, 0.6], [10, 5, 20, 7, 0.55], [12, 5, 24, 7, 0.5], [14, 6, 28, 8, 0.5],
];
const IDLE_MODE = 3; // six-fold figure used for the still (reduced-motion) image
const PARTICLES = 2600;
const DOT = 0.035; // radius of the silent bindu, as a fraction of the plate

export function Cymatics({
  analyser,
  active,
  size = 240,
  className = '',
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  size?: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  // Read each frame, so pausing lets the figure fold back into the dot smoothly.
  const live = useRef(active);
  live.current = active;

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    if (!el || !g) return;
    const css = getComputedStyle(document.documentElement);
    const gold = `rgb(${css.getPropertyValue('--chant').trim() || '233 199 123'})`;
    const violet = `rgb(${css.getPropertyValue('--primary').trim() || '96 152 255'})`;
    const accent = css.getPropertyValue('--accent').trim() || '236 52 112';

    // Particles live in pattern space (unit disc); they are drawn scaled by
    // `reach`, so the figure keeps its shape while it grows from the dot.
    const px = new Float32Array(PARTICLES);
    const py = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      const r = Math.sqrt(Math.random()) * 0.98;
      const a = Math.random() * Math.PI * 2;
      px[i] = r * Math.cos(a);
      py[i] = r * Math.sin(a);
    }
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 128);
    const prev = new Uint8Array(data.length);
    let mode = IDLE_MODE;
    let candidate = IDLE_MODE;
    let candidateSince = 0;
    let energy = 0; // 0..1 after auto-gain
    let reference = 0.05; // recent loud level, for auto-gain
    let flux = 0; // spectral change (new syllables)
    let reach = reduced ? 0.95 : DOT;
    let raf = 0;

    let [n, m, n2, m2, w] = MODES[IDLE_MODE];
    const u = (x: number, y: number) => {
      const r = Math.min(1, Math.hypot(x, y));
      const t = Math.atan2(y, x);
      return Math.cos(n * t) * Math.sin(m * Math.PI * r) + w * Math.cos(n2 * t) * Math.sin(m2 * Math.PI * r);
    };

    const listen = (now: number) => {
      let level = 0;
      let change = 0;
      if (analyser && live.current) {
        analyser.getByteFrequencyData(data);
        const usable = Math.floor(data.length * 0.75);
        let sum = 0;
        let weighted = 0;
        for (let i = 1; i < usable; i++) {
          sum += data[i];
          weighted += data[i] * i;
          const d = data[i] - prev[i];
          if (d > 0) change += d;
          prev[i] = data[i];
        }
        level = sum / (usable * 255);
        change /= usable * 255;
        if (level > 0.01) {
          // Pitch (spectral centroid, log-scaled) → mode, after holding ~120 ms.
          const centroid = weighted / sum;
          const next = Math.max(0, Math.min(MODES.length - 1, Math.floor((Math.log(centroid) / Math.log(usable)) * MODES.length * 1.15 - 1)));
          if (next !== candidate) {
            candidate = next;
            candidateSince = now;
          } else if (next !== mode && now - candidateSince > 120) {
            mode = next;
          }
        }
      }
      // Auto-gain: compare with the recent loudest level so soft audio still blooms.
      reference = Math.max(level, reference * 0.997, 0.04);
      const target = level < 0.008 ? 0 : Math.min(1, level / reference);
      energy += (target - energy) * (target > energy ? 0.4 : 0.14); // fast attack, quicker release so it breathes per syllable
      flux += (Math.min(1, change * 25) - flux) * 0.3;
      const goal = DOT + (0.97 - DOT) * Math.pow(energy, 1.4);
      reach += (goal - reach) * (goal > reach ? 0.3 : 0.1);
      [n, m, n2, m2, w] = MODES[mode];
    };

    // Move sand towards the nodal lines (minimise u²); loudness and new syllables shake it.
    const settle = () => {
      const shake = 0.0012 + energy * 0.01 + flux * 0.03;
      const pull = 0.02;
      const h = 0.004;
      for (let i = 0; i < PARTICLES; i++) {
        const x = px[i];
        const y = py[i];
        const v = u(x, y);
        const gx = (u(x + h, y) - u(x - h, y)) / (2 * h);
        const gy = (u(x, y + h) - u(x, y - h)) / (2 * h);
        const gl = Math.hypot(gx, gy) || 1;
        const jitter = shake * (Math.abs(v) * 4 + 0.3);
        let nx = x - (pull * v * gx) / gl + (Math.random() - 0.5) * jitter;
        let ny = y - (pull * v * gy) / gl + (Math.random() - 0.5) * jitter;
        const rr = Math.hypot(nx, ny);
        if (rr > 0.985) {
          nx *= 0.985 / rr;
          ny *= 0.985 / rr;
        }
        px[i] = nx;
        py[i] = ny;
      }
    };

    const step = (now: number) => {
      listen(now);
      settle();
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = el.clientWidth;
      if (el.width !== Math.round(size * dpr)) {
        el.width = Math.round(size * dpr);
        el.height = Math.round(size * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      const c = size / 2;
      const R = c * 0.94;
      // Glow that follows the bloom, brighter with loudness.
      const glow = g.createRadialGradient(c, c, 0, c, c, Math.max(R * reach * 1.15, 8));
      glow.addColorStop(0, `rgb(${accent} / ${0.1 + energy * 0.5})`);
      glow.addColorStop(0.6, `rgb(${accent} / ${0.04 + energy * 0.15})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(c, c, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = gold;
      g.globalAlpha = 0.35;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(c, c, R + 3, 0, Math.PI * 2);
      g.stroke();
      // Sand, scaled by the current bloom (a single bright dot in silence).
      const dot = Math.max(1, size / 200);
      const S = R * reach;
      for (let i = 0; i < PARTICLES; i++) {
        g.fillStyle = i % 5 === 0 ? violet : gold;
        g.globalAlpha = i % 5 === 0 ? 0.7 : 0.85;
        g.fillRect(c + px[i] * S - dot / 2, c + py[i] * S - dot / 2, dot, dot);
      }
      g.globalAlpha = 1;
    };

    if (reduced) {
      // Static figure: let the sand settle, draw once.
      for (let k = 0; k < 160; k++) settle();
      draw();
      return;
    }
    // Start from a settled figure (shown as the dot until sound arrives).
    for (let k = 0; k < 120; k++) settle();
    const loop = (t: number) => {
      step(t);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyser, reduced]);

  return (
    <canvas
      ref={canvas}
      className={`block aspect-square ${className}`}
      style={{ width: size, maxWidth: '100%' }}
      aria-hidden="true"
    />
  );
}
