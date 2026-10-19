import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nextOffset, resumableUpload } from './upload';

type Handler = (range: string, body: Blob | null) => { status: number; range?: string } | 'network-error';

let handler: Handler;
const ranges: string[] = [];

class FakeXHR {
  status = 0;
  upload = { onprogress: null as null | ((e: { loaded: number }) => void) };
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  ontimeout: null | (() => void) = null;
  onabort: null | (() => void) = null;
  private headers: Record<string, string> = {};
  private resHeaders: Record<string, string> = {};
  open() {}
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  getResponseHeader(k: string) {
    return this.resHeaders[k] ?? null;
  }
  abort() {}
  send(body: Blob | null) {
    const r = this.headers['Content-Range'];
    ranges.push(r);
    const res = handler(r, body);
    setTimeout(() => {
      if (res === 'network-error') return this.onerror?.();
      this.status = res.status;
      if (res.range) this.resHeaders.Range = res.range;
      (this as unknown as { responseText: string }).responseText = res.status === 200 ? '{"id":"f1"}' : '';
      this.upload.onprogress?.({ loaded: body?.size ?? 0 });
      this.onload?.();
    }, 0);
  }
}

beforeEach(() => {
  ranges.length = 0;
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('nextOffset', () => {
  it('parses Range headers', () => {
    expect(nextOffset('bytes=0-262143', 0)).toBe(262144);
    expect(nextOffset(null, 7)).toBe(7);
  });
});

const opts = { chunkSize: 256 * 1024 };

describe('resumableUpload', () => {
  it('uploads in chunks and returns the final body', async () => {
    const size = 600 * 1024;
    handler = (range) => {
      const end = Number(/-(\d+)\//.exec(range)![1]);
      return end === size - 1 ? { status: 200 } : { status: 308, range: `bytes=0-${end}` };
    };
    const progress: number[] = [];
    const res = await resumableUpload('/s1', new Blob([new Uint8Array(size)], { type: 'audio/webm' }), { ...opts, onProgress: (p) => progress.push(p) });
    expect(res).toBe('{"id":"f1"}');
    expect(ranges).toEqual(['bytes 0-262143/614400', 'bytes 262144-524287/614400', 'bytes 524288-614399/614400']);
    expect(progress.at(-1)).toBe(1);
  });

  it('resumes from the server offset after a network error', async () => {
    const size = 512 * 1024;
    let failed = false;
    handler = (range) => {
      if (range.startsWith('bytes */')) return { status: 308, range: 'bytes=0-262143' };
      if (range.startsWith('bytes 262144') && !failed) {
        failed = true;
        return 'network-error';
      }
      const end = Number(/-(\d+)\//.exec(range)![1]);
      return end === size - 1 ? { status: 200 } : { status: 308, range: `bytes=0-${end}` };
    };
    await resumableUpload('/s1', new Blob([new Uint8Array(size)]), opts);
    expect(ranges).toEqual(['bytes 0-262143/524288', 'bytes 262144-524287/524288', 'bytes */524288', 'bytes 262144-524287/524288']);
  });

  it('fails fast on an expired session', async () => {
    handler = () => ({ status: 404 });
    await expect(resumableUpload('/s1', new Blob([new Uint8Array(10)]), opts)).rejects.toThrow(/expired/);
  });
});
