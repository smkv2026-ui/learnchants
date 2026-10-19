import { useEffect, useState } from 'react';
import {
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type Query,
} from 'firebase/firestore';
import type { WithId } from '@/lib/types';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Live document. Pass ``null`` to skip. ``key`` must change when the ref changes. */
export function useDoc<T = DocumentData>(ref: DocumentReference | null, key?: string): Live<WithId<T> | null> {
  const k = key ?? ref?.path ?? '';
  const [state, setState] = useState<Live<WithId<T> | null>>({ data: null, loading: !!ref, error: null });
  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      (snap) =>
        setState({ data: snap.exists() ? ({ id: snap.id, ...(snap.data() as T) } as WithId<T>) : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return state;
}

/** Live query. Pass ``null`` to skip. ``key`` must uniquely describe the query. */
export function useCollection<T = DocumentData>(q: Query | null, key: string): Live<WithId<T>[]> {
  const [state, setState] = useState<Live<WithId<T>[]>>({ data: [], loading: !!q, error: null });
  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) =>
        setState({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q ? key : '']);
  return state;
}
