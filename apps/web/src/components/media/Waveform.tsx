import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Live waveform bars drawn from an AnalyserNode. When inactive (or no analyser)
 * a calm idle wave is shown so the UI never looks dead.
 */
export function Waveform({
  analyser,
  active,
  bars = 48,
  height = 96,
  className = '',
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  bars?: number;
  height?: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext('2d');
    if (!g) return;
    let raf = 0;
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 128);
    const levels = new Float32Array(bars);
    const draw = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== w * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#ffe08a');
      grad.addColorStop(0.5, '#f5a524');
      grad.addColorStop(1, '#c45a74');
      g.fillStyle = grad;
      if (analyser && active) analyser.getByteFrequencyData(data);
      const gap = 3;
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i++) {
        let target: number;
        if (analyser && active) {
          const idx = Math.floor((i / bars) * data.length * 0.75);
          target = data[idx] / 255;
        } else {
          target = reduced ? 0.12 : 0.1 + 0.08 * Math.sin(t / 600 + i / 3) * (active ? 2 : 1);
        }
        levels[i] += (target - levels[i]) * 0.25;
        const bh = Math.max(3, levels[i] * h * 0.95);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        g.globalAlpha = 0.55 + levels[i] * 0.45;
        g.beginPath();
        g.roundRect?.(x, y, bw, bh, bw / 2);
        if (!g.roundRect) g.rect(x, y, bw, bh);
        g.fill();
      }
      if (!reduced || active) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active, bars, reduced]);

  return <canvas ref={canvas} className={`block w-full ${className}`} style={{ height }} aria-hidden="true" />;
}
