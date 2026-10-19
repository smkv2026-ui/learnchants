import { motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/components/ui';

/** Animated page wrapper; also sets the document title. */
export function Page({ title, children, className, wide }: { title?: string; children: ReactNode; className?: string; wide?: boolean }) {
  useEffect(() => {
    document.title = title ? `${title} · Learn Chants` : 'Learn Chants';
  }, [title]);
  return (
    <motion.main
      id="main"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn('mx-auto w-full px-4 pb-28 pt-4 sm:px-6 sm:pb-16', wide ? 'max-w-7xl' : 'max-w-5xl', className)}
    >
      {children}
    </motion.main>
  );
}
