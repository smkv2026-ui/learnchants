// Resumable (chunked) upload to a Google Drive upload session, with progress,
// retry with exponential backoff and resume from the server's offset.

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  maxRetries?: number;
  chunkSize?: number;
  headers?: Record<string, string>;
}

type ChunkResponse = { status: number; range: string | null; body: string };

function putChunk(
  url: string,
  body: Blob | null,
  contentRange: string,
  onProgress: (loaded: number) => void,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<ChunkResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Range', contentRange);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader('Range'), body: xhr.responseText });
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    xhr.send(body);
  });
}

/** Parse a resumable-upload ``Range: bytes=0-N`` header into the next offset. */
export function nextOffset(range: string | null, fallback: number): number {
  if (!range) return fallback;
  const m = /bytes=0-(\d+)/.exec(range);
  return m ? Number(m[1]) + 1 : fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PUT ``blob`` to a resumable session URI; resolves with the final response body. */
export async function resumableUpload(sessionUrl: string, blob: Blob, opts: UploadOptions = {}): Promise<string> {
  const total = blob.size;
  const chunkSize = Math.max(256 * 1024, opts.chunkSize ?? 4 * 1024 * 1024);
  const maxRetries = opts.maxRetries ?? 6;
  const headers = opts.headers ?? {};
  let offset = 0;
  let attempt = 0;
  opts.onProgress?.(0);
  while (true) {
    const end = Math.min(offset + chunkSize, total) - 1;
    try {
      const res = await putChunk(
        sessionUrl,
        blob.slice(offset, end + 1),
        `bytes ${offset}-${end}/${total}`,
        (loaded) => opts.onProgress?.(Math.min(0.99, (offset + loaded) / total)),
        headers,
        opts.signal,
      );
      if (res.status === 200 || res.status === 201) {
        opts.onProgress?.(1);
        return res.body;
      }
      if (res.status === 308) {
        offset = nextOffset(res.range, end + 1);
        attempt = 0;
        continue;
      }
      if (res.status === 404 || res.status === 410) throw new Error('Upload session expired. Please try again.');
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new Error(`Upload rejected (${res.status}).`);
      throw new Error(`retryable ${res.status}`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      if (!(err as Error).message.startsWith('retryable') && !['network', 'timeout'].includes((err as Error).message)) throw err;
      attempt += 1;
      if (attempt > maxRetries) throw new Error('Upload failed after several retries. Check your connection.');
      await sleep(Math.min(16000, 500 * 2 ** (attempt - 1)) + Math.random() * 300);
      try {
        const probe = await putChunk(sessionUrl, null, `bytes */${total}`, () => {}, headers, opts.signal);
        if (probe.status === 200 || probe.status === 201) {
          opts.onProgress?.(1);
          return probe.body;
        }
        if (probe.status === 308) offset = nextOffset(probe.range, 0);
      } catch {
        /* keep current offset and retry */
      }
    }
  }
}
