import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Circular cymatics (Chladni plate) driven by an AnalyserNode.
 *
 * Sand-like particles settle on the nodal lines of two superposed circular
 * plate modes, u = cos(nθ)·sin(mπr) + w·cos(n₂θ)·sin(m₂πr), which gives the
 * flower-like figures of real cymatics. The dominant frequency of the sound
 * picks the mode, and loudness shakes the sand, so the figure re-forms as the
 * verse moves between pitches and settles when it is quiet.
 */
// [n, m, n2, m2, w]
const MODES: [number, number, number, number, number][] = [
  [3, 2, 6, 3, 0.7], [4, 2, 8, 4, 0.8], [5, 3, 10, 4, 0.75], [6, 3, 12, 5, 0.7], [7, 3, 14, 5, 0.65],
  [8, 4, 16, 6, 0.6], [9, 4, 18, 6, 0.6], [10, 5, 20, 7, 0.55], [12, 5, 24, 7, 0.5], [14, 6, 28, 8, 0.5],
];
const IDLE_MODE = 3; // a calm six-fold figure while silent
const PARTICLES = 2600;

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

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    if (!el || !g) return;
    const css = getComputedStyle(document.documentElement);
    const gold = `rgb(${css.getPropertyValue('--chant').trim() || '233 199 123'})`;
    const violet = `rgb(${css.getPropertyValue('--primary').trim() || '96 152 255'})`;
    const accent = css.getPropertyValue('--accent').trim() || '236 52 112';

    // Particles in unit-disc coordinates.
    const px = new Float32Array(PARTICLES);
    const py = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      const r = Math.sqrt(Math.random()) * 0.98;
      const a = Math.random() * Math.PI * 2;
      px[i] = r * Math.cos(a);
      py[i] = r * Math.sin(a);
    }
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 128);
    let mode = IDLE_MODE;
    let candidate = IDLE_MODE;
    let candidateSince = 0;
    let energy = 0;
    let raf = 0;

    let n = 0, m = 0, n2 = 0, m2 = 0, w = 0;
    const u = (x: number, y: number) => {
      const r = Math.min(1, Math.hypot(x, y));
      const t = Math.atan2(y, x);
      return Math.cos(n * t) * Math.sin(m * Math.PI * r) + w * Math.cos(n2 * t) * Math.sin(m2 * Math.PI * r);
    };

    const step = (now: number) => {
      // --- listen
      let level = 0;
      if (analyser && active) {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        let peak = 0;
        let peakBin = 0;
        const usable = Math.floor(data.length * 0.7);
        for (let i = 1; i < usable; i++) {
          sum += data[i];
          if (data[i] > peak) {
            peak = data[i];
            peakBin = i;
          }
        }
        level = sum / (usable * 255);
        if (peak > 40) {
          // Log-scaled pitch → mode; change only after it holds for a moment.
          const next = Math.min(MODES.length - 1, Math.floor((Math.log(peakBin + 1) / Math.log(usable)) * MODES.length));
          if (next !== candidate) {
            candidate = next;
            candidateSince = now;
          } else if (next !== mode && now - candidateSince > 350) {
            mode = next;
          }
        }
      } else if (!active) {
        mode = IDLE_MODE;
      }
      energy += (level - energy) * 0.15;
      [n, m, n2, m2, w] = MODES[mode];

      // --- move sand towards the nodal lines (minimise u²), jitter with loudness
      const shake = 0.0025 + energy * 0.05;
      const pull = 0.012;
      const h = 0.004;
      for (let i = 0; i < PARTICLES; i++) {
        const x = px[i];
        const y = py[i];
        const v = u(x, y);
        const gx = (u(x + h, y) - u(x - h, y)) / (2 * h);
        const gy = (u(x, y + h) - u(x, y - h)) / (2 * h);
        const gl = Math.hypot(gx, gy) || 1;
        let nx = x - (pull * v * gx) / gl + (Math.random() - 0.5) * shake * Math.abs(v) * 4 + (Math.random() - 0.5) * shake * 0.3;
        let ny = y - (pull * v * gy) / gl + (Math.random() - 0.5) * shake * Math.abs(v) * 4 + (Math.random() - 0.5) * shake * 0.3;
        const rr = Math.hypot(nx, ny);
        if (rr > 0.985) {
          nx *= 0.985 / rr;
          ny *= 0.985 / rr;
        }
        px[i] = nx;
        py[i] = ny;
      }
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
      // Plate glow, brighter with loudness.
      const glow = g.createRadialGradient(c, c, 0, c, c, R);
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
      // Sand.
      const dot = Math.max(1, size / 200);
      for (let i = 0; i < PARTICLES; i++) {
        g.fillStyle = i % 5 === 0 ? violet : gold;
        g.globalAlpha = i % 5 === 0 ? 0.7 : 0.85;
        g.fillRect(c + px[i] * R - dot / 2, c + py[i] * R - dot / 2, dot, dot);
      }
      g.globalAlpha = 1;
    };

    if (reduced) {
      // Static figure: let the sand settle, draw once.
      for (let k = 0; k < 160; k++) step(0);
      draw();
      return;
    }
    // Start from a settled figure rather than noise.
    for (let k = 0; k < 120; k++) step(0);
    const loop = (t: number) => {
      step(t);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active, reduced]);

  return (
    <canvas
      ref={canvas}
      className={`block aspect-square ${className}`}
      style={{ width: size, maxWidth: '100%' }}
      aria-hidden="true"
    />
  );
}
