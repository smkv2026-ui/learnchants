import { useMediaUrl } from '@/hooks/useMediaUrl';
import { Spinner } from '@/components/ui';
import { CymaticsAudio } from './CymaticsAudio';

/** Player for submissions / replies (Firestore-stored file or Drive link); audio shows live cymatics. */
export function MediaPlayer({ mediaId, kind, size }: { mediaId: string; kind?: 'audio' | 'video' | null; size?: number }) {
  const url = useMediaUrl(mediaId);
  if (url.isLoading) return <div className="flex h-12 items-center text-muted"><Spinner /></div>;
  if (url.error || !url.data) return <p className="text-sm text-danger">Recording unavailable.</p>;
  const isVideo = kind === 'video' || url.data.mimeType?.startsWith('video/');
  return isVideo ? (
    <video src={url.data.url} controls playsInline preload="metadata" className="aspect-video w-full rounded-2xl bg-black" />
  ) : (
    <CymaticsAudio src={url.data.url} external={url.data.external} size={size} />
  );
}
