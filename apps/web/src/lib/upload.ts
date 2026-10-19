import { api, type UploadSessionReq } from './api';

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  durationSec?: number | null;
  maxRetries?: number;
}

export interface UploadResult {
  mediaId: string;
  submissionId?: string;
}

type ChunkResponse = { status: number; range: string | null };

/** PUT one chunk with XHR (fetch has no upload progress events). */
function putChunk(
  url: string,
  body: Blob | null,
  contentRange: string,
  contentType: string,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<ChunkResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Range', contentRange);
    if (body) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader('Range') });
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort, { once: true });
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

/**
 * Upload bytes straight to Drive (or the mock endpoint) via a resumable session
 * created by ``create_upload_session``, then call ``finalize_upload``.
 * Chunks are retried with exponential backoff; on retry the server is asked how
 * many bytes it already has so the upload resumes where it stopped.
 */
export async function uploadMedia(
  blob: Blob,
  req: Omit<UploadSessionReq, 'size' | 'mimeType'> & { mimeType?: string },
  opts: UploadOptions = {},
): Promise<UploadResult> {
  const mimeType = (req.mimeType || blob.type || 'application/octet-stream').split(';')[0];
  const session = await api.createUploadSession({ ...req, mimeType, size: blob.size });
  const total = blob.size;
  const chunkSize = Math.max(256 * 1024, session.chunkSize || 4 * 1024 * 1024);
  const maxRetries = opts.maxRetries ?? 6;
  let offset = 0;
  let attempt = 0;
  opts.onProgress?.(0);

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total) - 1;
    try {
      const res = await putChunk(
        session.uploadUrl,
        blob.slice(offset, end + 1),
        `bytes ${offset}-${end}/${total}`,
        mimeType,
        (loaded) => opts.onProgress?.(Math.min(0.99, (offset + loaded) / total)),
        opts.signal,
      );
      if (res.status === 200 || res.status === 201) {
        offset = total;
        break;
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
        const probe = await putChunk(session.uploadUrl, null, `bytes */${total}`, mimeType, () => {}, opts.signal);
        if (probe.status === 200 || probe.status === 201) {
          offset = total;
        } else if (probe.status === 308) {
          offset = nextOffset(probe.range, 0);
        }
      } catch {
        /* keep current offset and retry */
      }
    }
  }
  opts.onProgress?.(1);
  // Drive may take a moment before the new file is searchable; retry finalize briefly.
  for (let i = 0; ; i++) {
    try {
      return await api.finalizeUpload({ mediaId: session.mediaId, durationSec: opts.durationSec ?? null });
    } catch (err) {
      if (i >= 4 || !String((err as Error).message).includes('not completed')) throw err;
      await sleep(800 * (i + 1));
    }
  }
}
