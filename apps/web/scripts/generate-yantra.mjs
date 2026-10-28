// Generates public/mandala.svg: a Sri Yantra-style line drawing.
//   node scripts/generate-yantra.mjs
// Layers from the outside in: bhupura (square with four T-gates, three lines),
// three girdle circles, 16-petal lotus, 8-petal lotus, nine interlocking
// triangles (4 upward, 5 downward) inside the inner circle, and the bindu.
// Strokes are black (currentColor); CSS tints it per theme.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const R = 100; // radius of the triangle circle
const f = (n) => Number(n.toFixed(2));
const out = [];

// Bhupura: three nested squares, each with a T-shaped gate on every side.
function bhupura(h, gate, depth) {
  const pts = [];
  const side = [
    [-h, -h], [-gate, -h], [-gate, -h - depth], [gate, -h - depth], [gate, -h], [h, -h],
  ];
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2;
    for (const [x, y] of side.slice(q === 0 ? 0 : 1)) {
      pts.push([x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
    }
  }
  return `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z"/>`;
}
for (const [i, h] of [182, 176, 170].entries()) out.push(bhupura(h, 34 + i * 3, 16 - i * 3));

// Girdles.
for (const r of [162, 158, 154]) out.push(`<circle r="${r}"/>`);

// Lotus petals: a pointed petal from radius r0 to r1, plus an inner vein.
function petals(n, r0, r1, width, offset = 0) {
  const w = (Math.PI / n) * width;
  const d = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + offset) * 2 * Math.PI) / n - Math.PI / 2;
    const p = (r, t) => `${f(r * Math.cos(t))} ${f(r * Math.sin(t))}`;
    const mid = r0 + (r1 - r0) * 0.55;
    d.push(`M${p(r0, a - w)}Q${p(mid, a - w * 1.15)} ${p(r1, a)}Q${p(mid, a + w * 1.15)} ${p(r0, a + w)}`);
    d.push(`M${p(r0 + 4, a)}L${p(r1 - 8, a)}`);
  }
  return `<path d="${d.join('')}"/>`;
}
out.push(`<circle r="150"/>`, petals(16, 126, 150, 1, 0.5), `<circle r="126"/>`);
out.push(petals(8, 104, 126, 1, 0), `<circle r="104"/>`);

// Nine triangles inscribed in r=R, using the traditional construction on a
// vertical diameter divided into 48 parts (marks 6, 12, 17, 20, 23, 27, 30, 36, 42).
// The four outer triangles span chords of the circle; each inner base ends on the
// sides of the previous opposite triangle, and each apex touches another base.
const y = (mark) => ((mark - 24) / 24) * R; // y grows downwards
const half = (yy) => Math.sqrt(R * R - yy * yy);
const tris = {};
const widthOn = (t, yy) => (t.hw * (yy - t.apex)) / (t.base - t.apex); // half-width of t at height yy
const add = (name, apexMark, baseMark, within) => {
  const apex = y(apexMark);
  const base = y(baseMark);
  const hw = within ? widthOn(tris[within], base) : half(base);
  tris[name] = { apex, base, hw };
  out.push(`<path d="M0 ${f(apex)}L${f(hw)} ${f(base)}L${f(-hw)} ${f(base)}Z"/>`);
};
add('D1', 48, 6);
add('U1', 0, 42);
add('D2', 42, 12);
add('U2', 6, 36);
add('D3', 36, 17, 'U1');
add('U3', 12, 30, 'D1');
add('D4', 30, 20, 'U2');
add('U4', 17, 27, 'D2');
add('D5', 27, 23, 'U3');
out.push(`<circle r="${R}"/>`, '<circle r="3" fill="currentColor"/>');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -200 400 400" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
${out.join('\n')}
</svg>
`;
writeFileSync(fileURLToPath(new URL('../public/mandala.svg', import.meta.url)), svg);
console.log('wrote public/mandala.svg');
