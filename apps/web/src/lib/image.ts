/** Downscale an image (cover art) client-side and encode as WebP/JPEG. */
export async function resizeImage(file: File, maxSize = 1400, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  const type = canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality));
}

/** Encode a cover image as a small data URL (Spark plan: no Cloud Storage), shrinking until it fits. */
export async function imageToDataUrl(file: Blob, maxChars = 380_000): Promise<string> {
  for (const [size, q] of [[960, 0.78], [800, 0.7], [640, 0.62], [480, 0.55]] as const) {
    const blob = await resizeImage(file as File, size, q);
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    if (url.length <= maxChars) return url;
  }
  throw new Error('This image is too detailed to store; please choose a smaller one.');
}
