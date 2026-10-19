import confetti from 'canvas-confetti';

const COLORS = ['#ffe08a', '#f5a524', '#d9771a', '#c45a74', '#8b85e0'];

export function celebrate(big = false): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.vibrate) navigator.vibrate(big ? [30, 40, 60] : 25);
  confetti({ particleCount: big ? 160 : 90, spread: big ? 100 : 70, origin: { y: 0.7 }, colors: COLORS, disableForReducedMotion: true });
  if (big) {
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors: COLORS }), 250);
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors: COLORS }), 400);
  }
}

export function haptic(ms = 12): void {
  if (navigator.vibrate) navigator.vibrate(ms);
}
