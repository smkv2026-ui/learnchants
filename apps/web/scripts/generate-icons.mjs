// Renders the logo, favicon and PWA icons from scripts/logo-source.webp (run: pnpm icons).
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const src = new URL('./logo-source.webp', import.meta.url).pathname;
const out = (p) => new URL(`../public/${p}`, import.meta.url).pathname;
await mkdir(out('icons'), { recursive: true });
const sq = (size) => sharp(src).resize(size, size, { fit: 'cover' });
await sq(256).webp({ quality: 85 }).toFile(out('logo.webp'));
await sq(64).png().toFile(out('favicon.png'));
await sq(192).png().toFile(out('icons/icon-192.png'));
await sq(512).png().toFile(out('icons/icon-512.png'));
await sq(512).png().toFile(out('icons/maskable-512.png')); // full-bleed art is maskable-safe
await sq(180).png().toFile(out('apple-touch-icon.png'));
console.log('icons written');
