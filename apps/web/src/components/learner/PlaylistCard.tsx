import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatInr } from '@/lib/upi';
import { htmlToText } from '@/lib/sanitize';
import type { Playlist, WithId } from '@/lib/types';
import { Badge, Icon, ProgressRing, TiltCard } from '@/components/ui';

const GRADIENTS = [
  // Om-logo hues: magenta-red core fading into electric blue and night.
  'from-[#c81848] via-[#3a1a8a] to-[#0a1450]',
  'from-[#1e3cd2] via-[#2a1470] to-[#7a0f3a]',
  'from-[#e8337a] via-[#5b2bd0] to-[#0b1a5c]',
  'from-[#2f6bff] via-[#1a1f6e] to-[#05071a]',
];

export function CoverArt({ playlist, className = '' }: { playlist: WithId<Playlist>; className?: string }) {
  const g = GRADIENTS[[...playlist.id].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
  if (playlist.coverUrl) {
    return <img src={playlist.coverUrl} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`relative grid h-full w-full place-items-center overflow-hidden bg-gradient-to-br ${g} ${className}`}>
      <img src="/mandala.svg" alt="" className="absolute h-[140%] w-[140%] animate-spin-slow opacity-20 invert" />
      <span lang="sa" className="relative px-4 text-center font-chant text-3xl text-gold-200 drop-shadow">
        {playlist.titleNative || playlist.title}
      </span>
    </div>
  );
}

export function PlaylistCard({
  playlist,
  progress,
  locked,
  index = 0,
}: {
  playlist: WithId<Playlist>;
  progress?: number | null;
  locked?: boolean;
  index?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.06, 0.4) }}>
      <Link to={`/p/${playlist.id}`} className="block rounded-3xl focus-visible:outline-offset-4" aria-label={`${playlist.title}${locked ? ' (locked)' : ''}`}>
        <TiltCard className="h-full">
          <div className="relative aspect-[16/10] overflow-hidden">
            <CoverArt playlist={playlist} className="transition duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute left-3 top-3 flex gap-2">
              {playlist.access === 'paid' ? (
                <Badge tone="gold" className="!bg-black/50 backdrop-blur">
                  <Icon name={locked ? 'lock' : 'unlock'} size={12} /> {formatInr(playlist.price)}
                </Badge>
              ) : (
                <Badge tone="success" className="!bg-black/50 backdrop-blur">Free</Badge>
              )}
            </div>
            {progress != null && (
              <div className="absolute bottom-3 right-3 rounded-full bg-black/50 p-1 text-white backdrop-blur">
                <ProgressRing value={progress} size={48} stroke={5} label={`${progress}% approved`} />
              </div>
            )}
          </div>
          <div className="p-5">
            <h3 className="text-2xl font-semibold leading-tight">{playlist.title}</h3>
            {playlist.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{htmlToText(playlist.description)}</p>}
            <div className="mt-4 flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Icon name="music" size={14} /> {playlist.verseCount ?? 0} verses
              </span>
              <span className="ml-auto flex items-center gap-1 font-semibold text-primary">
                {progress ? 'Continue' : 'Explore'} <Icon name="chevron-right" size={14} />
              </span>
            </div>
          </div>
        </TiltCard>
      </Link>
    </motion.div>
  );
}
