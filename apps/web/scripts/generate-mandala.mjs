// Generates public/mandala.svg: a layered lotus mandala (line drawing).
//   node scripts/generate-mandala.mjs
// From the centre out: seed with dots, then rings of lotus petals (8, 12, 16, 24
// and 32 petals), each petal outlined twice with a vein, separated by dotted
// and beaded circles, finished with a scalloped rim. Strokes use currentColor;
// CSS tints the drawing per theme.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const f = (n) => Number(n.toFixed(2));
const pt = (r, t) => `${f(r * Math.cos(t))} ${f(r * Math.sin(t))}`;
const angle = (i, n, offset) => ((i + offset) * 2 * Math.PI) / n - Math.PI / 2;
const out = [];

// One ring of pointed lotus petals from radius r0 to r1.
// `bulge` widens the petal's belly; `inner` adds a second, smaller outline.
function lotus(n, r0, r1, { offset = 0, bulge = 1.25, inner = true, vein = true } = {}) {
  const w = Math.PI / n;
  const d = [];
  const petal = (a, s0, s1, k) => {
    const mid = s0 + (s1 - s0) * 0.5;
    return `M${pt(s0, a - w * k)}C${pt(mid, a - w * bulge * k)} ${pt(s1 - (s1 - s0) * 0.15, a - w * 0.35 * k)} ${pt(s1, a)}`
      + `C${pt(s1 - (s1 - s0) * 0.15, a + w * 0.35 * k)} ${pt(mid, a + w * bulge * k)} ${pt(s0, a + w * k)}`;
  };
  for (let i = 0; i < n; i++) {
    const a = angle(i, n, offset);
    d.push(petal(a, r0, r1, 1));
    if (inner) d.push(petal(a, r0 + (r1 - r0) * 0.12, r1 - (r1 - r0) * 0.22, 0.62));
    if (vein) d.push(`M${pt(r0 + (r1 - r0) * 0.2, a)}L${pt(r1 - (r1 - r0) * 0.38, a)}`);
  }
  return `<path d="${d.join('')}"/>`;
}
const dots = (n, r, size, offset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = angle(i, n, offset);
    return `<circle cx="${f(r * Math.cos(a))}" cy="${f(r * Math.sin(a))}" r="${size}" fill="currentColor" stroke="none"/>`;
  }).join('');
const circle = (r) => `<circle r="${r}"/>`;

// Seed.
out.push('<circle r="4" fill="currentColor" stroke="none"/>', circle(10), dots(8, 15, 1.4), circle(20));
// Rings of petals, alternating offsets so each ring sits between the petals below.
out.push(lotus(8, 20, 46), circle(46), dots(16, 51, 1.3, 0.5), circle(56));
out.push(lotus(12, 56, 84, { offset: 0.5 }), lotus(12, 56, 74, { inner: false, vein: false }), circle(84));
out.push(circle(88), dots(48, 92, 1.1), circle(96));
out.push(lotus(16, 96, 128, { offset: 0.5 }), lotus(16, 96, 114, { inner: false, vein: false }), circle(128));
out.push(lotus(24, 128, 152, { bulge: 1.15 }), circle(152), dots(72, 156, 1), circle(160));
out.push(lotus(32, 160, 182, { offset: 0.5, bulge: 1.1, inner: false }));
// Scalloped rim.
const scallops = 64;
out.push(`<path d="${Array.from({ length: scallops }, (_, i) => {
  const a0 = angle(i, scallops, 0), a1 = angle(i + 1, scallops, 0), am = (a0 + a1) / 2;
  return `M${pt(186, a0)}Q${pt(196, am)} ${pt(186, a1)}`;
}).join('')}"/>`, circle(186));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -200 400 400" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">
${out.join('\n')}
</svg>
`;
writeFileSync(fileURLToPath(new URL('../public/mandala.svg', import.meta.url)), svg);
console.log('wrote public/mandala.svg');
