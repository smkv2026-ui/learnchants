// Renders the PWA icons from public/favicon.svg (run: pnpm icons).
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
const maskable = await readFile(new URL('../public/maskable.svg', import.meta.url));
await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true });
const out = (p) => new URL(`../public/${p}`, import.meta.url).pathname;
await sharp(svg, { density: 512 }).resize(192, 192).png().toFile(out('icons/icon-192.png'));
await sharp(svg, { density: 512 }).resize(512, 512).png().toFile(out('icons/icon-512.png'));
await sharp(maskable, { density: 512 }).resize(512, 512).png().toFile(out('icons/maskable-512.png'));
await sharp(maskable, { density: 512 }).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
console.log('icons written');
