import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Short-lived signed streaming URL for a media id (never a Drive link). */
export function useMediaUrl(mediaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['media-url', mediaId],
    queryFn: () => api.getMediaUrl({ mediaId: mediaId! }),
    enabled: !!mediaId && enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 12 * 60 * 1000,
    retry: (count, err) => count < 2 && !String((err as Error).message).match(/locked|denied|permission/i),
  });
}
