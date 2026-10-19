import { useQuery } from '@tanstack/react-query';
import { resolveMedia } from '@/lib/media';

/** Playable URL for a media id (Drive link or an object URL assembled from Firestore chunks). */
export function useMediaUrl(mediaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['media-url', mediaId],
    queryFn: () => resolveMedia(mediaId!),
    enabled: !!mediaId && enabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: (count, err) => count < 2 && !(err as { locked?: boolean }).locked,
  });
}
