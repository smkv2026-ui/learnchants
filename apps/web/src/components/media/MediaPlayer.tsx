import { useMediaUrl } from '@/hooks/useMediaUrl';
import { Spinner } from '@/components/ui';

/** Plain player for submissions / replies (fetches a short-lived signed URL). */
export function MediaPlayer({ mediaId, kind }: { mediaId: string; kind?: 'audio' | 'video' | null }) {
  const url = useMediaUrl(mediaId);
  if (url.isLoading) return <div className="flex h-12 items-center text-muted"><Spinner /></div>;
  if (url.error || !url.data) return <p className="text-sm text-danger">Recording unavailable.</p>;
  const isVideo = kind === 'video' || url.data.mimeType?.startsWith('video/');
  return isVideo ? (
    <video src={url.data.url} controls playsInline preload="metadata" className="aspect-video w-full rounded-2xl bg-black" />
  ) : (
    <audio src={url.data.url} controls preload="metadata" className="w-full" />
  );
}
