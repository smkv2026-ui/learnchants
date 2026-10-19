import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { playlistPct } from '@/lib/progress';
import type { Playlist } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { useCollection } from '@/hooks/useFirestore';
import { useMyGrants, useMyProgress } from '@/hooks/useLearner';
import { Button, CardSkeleton, EmptyState, ErrorState, Icon } from '@/components/ui';
import { Page } from '@/components/layout/Page';
import { PlaylistCard } from '@/components/learner/PlaylistCard';

const STEPS = [
  { icon: 'music' as const, title: 'Listen 3 times', text: 'Each verse loops three times so the sound settles in.' },
  { icon: 'mic' as const, title: 'Chant 3 times', text: 'Record yourself in three guided rounds.' },
  { icon: 'send' as const, title: 'Get guidance', text: 'Your teacher replies with corrections and approval.' },
];

export function HomePage() {
  const user = useAuth((s) => s.user);
  const playlists = useCollection<Playlist>(
    query(collection(db, 'playlists'), where('published', '==', true), orderBy('order', 'asc')),
    'published-playlists',
  );
  const progress = useMyProgress();
  const grants = useMyGrants();
  const progressBy = useMemo(() => new Map(progress.data.map((p) => [p.pid, p])), [progress.data]);
  const granted = useMemo(() => new Set(grants.data.map((g) => g.pid)), [grants.data]);
  const resume = [...progress.data].sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))[0];
  const firstName = user?.displayName?.split(' ')[0];

  return (
    <Page title="Home" wide>
      <section className="mandala-bg relative mb-10 overflow-hidden rounded-4xl px-6 py-10 sm:px-10 sm:py-14">
        <div className="hero-gradient absolute inset-0 -z-10" />
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm uppercase tracking-[.3em] text-primary">
          {firstName ? `Namaste, ${firstName}` : 'Namaste'} 🙏
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-3 max-w-2xl text-4xl font-semibold leading-tight sm:text-6xl"
        >
          Learn sacred chants, <span className="text-gold-gradient">one verse at a time</span>
        </motion.h1>
        <p className="mt-4 max-w-xl text-muted">Listen, repeat and receive gentle corrections from your teacher. Your progress grows with every approved verse.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {resume ? (
            <Link to={resume.lastVerseId ? `/p/${resume.pid}/v/${resume.lastVerseId}` : `/p/${resume.pid}`}>
              <Button size="lg" icon="play">Continue {resume.title ?? 'learning'}</Button>
            </Link>
          ) : user ? (
            <a href="#playlists">
              <Button size="lg" icon="sparkles">Choose a chant</Button>
            </a>
          ) : (
            <>
              <Link to="/signup">
                <Button size="lg" icon="sparkles">Start learning free</Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="secondary">I have an account</Button>
              </Link>
            </>
          )}
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
              className="glass flex items-start gap-3 rounded-2xl p-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon name={s.icon} />
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted">{s.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="playlists" aria-labelledby="pl-heading">
        <div className="mb-5 flex items-end justify-between">
          <h2 id="pl-heading" className="text-3xl font-semibold">Chants to learn</h2>
          {playlists.data.length > 0 && <p className="text-sm text-muted">{playlists.data.length} playlists</p>}
        </div>
        {playlists.error ? (
          <ErrorState message="Couldn't load playlists. Check your connection." onRetry={() => location.reload()} />
        ) : playlists.loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : playlists.data.length === 0 ? (
          <EmptyState title="No chants yet" message="Your teachers are preparing playlists. Please check back soon." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.data.map((p, i) => {
              const prog = progressBy.get(p.id);
              return (
                <PlaylistCard
                  key={p.id}
                  index={i}
                  playlist={p}
                  progress={prog ? playlistPct(prog) : null}
                  locked={p.access === 'paid' && !granted.has(p.id)}
                />
              );
            })}
          </div>
        )}
      </section>
    </Page>
  );
}
