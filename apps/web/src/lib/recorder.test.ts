import { describe, expect, it } from 'vitest';
import { describeMediaError, extensionFor, pickMimeType } from './recorder';

describe('recorder helpers', () => {
  it('prefers webm/opus and falls back to mp4 (Safari)', () => {
    expect(pickMimeType('audio', () => true)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType('audio', (t) => t.startsWith('audio/mp4'))).toBe('audio/mp4;codecs=mp4a.40.2');
    expect(pickMimeType('video', (t) => t === 'video/mp4')).toBe('video/mp4');
    expect(pickMimeType('audio', () => false)).toBeUndefined();
  });
  it('explains permission errors', () => {
    expect(describeMediaError(new DOMException('x', 'NotAllowedError'))).toMatch(/Permission denied/);
    expect(extensionFor('audio/mp4;codecs=x')).toBe('m4a');
  });
});
