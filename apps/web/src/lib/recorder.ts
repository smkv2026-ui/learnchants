export type MediaKind = 'audio' | 'video';

const CANDIDATES: Record<MediaKind, string[]> = {
  audio: ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'],
  video: [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ],
};

/** Pick the first container/codec this browser can record (Safari → mp4/aac). */
export function pickMimeType(
  kind: MediaKind,
  isSupported: (t: string) => boolean = (t) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
): string | undefined {
  return CANDIDATES[kind].find((t) => isSupported(t));
}

export function canRecord(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export function describeMediaError(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Permission denied. Allow microphone/camera access in your browser settings to record.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone or camera was found on this device.';
  if (name === 'NotReadableError') return 'Your microphone or camera is being used by another app.';
  return 'Recording is not available on this device. You can attach a file instead.';
}

export function extensionFor(mime: string): string {
  const base = mime.split(';')[0];
  return (
    {
      'audio/webm': 'webm',
      'audio/mp4': 'm4a',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'video/webm': 'webm',
      'video/mp4': 'mp4',
    } as Record<string, string>
  )[base] ?? 'bin';
}
