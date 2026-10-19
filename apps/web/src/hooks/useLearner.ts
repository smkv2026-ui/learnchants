import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Material, NodeDoc, PaymentRequest, Playlist, Progress, Verse, VerseStatus } from '@/lib/types';
import { useAuth, isAdminRole } from '@/stores/auth';
import { useCollection, useDoc } from './useFirestore';

export function useMyProgress() {
  const uid = useAuth((s) => s.user?.uid);
  return useCollection<Progress>(uid ? collection(db, 'users', uid, 'progress') : null, `progress-${uid}`);
}

export function useMyGrants() {
  const uid = useAuth((s) => s.user?.uid);
  return useCollection<{ uid: string; pid: string }>(
    uid ? query(collection(db, 'accessGrants'), where('uid', '==', uid)) : null,
    `grants-${uid}`,
  );
}

export function usePlaylist(pid: string | undefined) {
  return useDoc<Playlist>(pid ? doc(db, 'playlists', pid) : null);
}

export function useNodes(pid: string | undefined) {
  return useCollection<NodeDoc>(pid ? collection(db, 'playlists', pid, 'nodes') : null, `nodes-${pid}`);
}

export function useVerses(pid: string | undefined) {
  return useCollection<Verse>(pid ? collection(db, 'playlists', pid, 'verses') : null, `verses-${pid}`);
}

export function useMaterials(pid: string | undefined) {
  return useCollection<Material>(pid ? collection(db, 'playlists', pid, 'materials') : null, `materials-${pid}`);
}

export function useVerseStatuses(pid: string | undefined) {
  const uid = useAuth((s) => s.user?.uid);
  return useCollection<VerseStatus>(
    uid && pid ? collection(db, 'users', uid, 'progress', pid, 'verseStatus') : null,
    `vs-${uid}-${pid}`,
  );
}

export function usePlaylistProgress(pid: string | undefined) {
  const uid = useAuth((s) => s.user?.uid);
  return useDoc<Progress>(uid && pid ? doc(db, 'users', uid, 'progress', pid) : null);
}

export function useMyPaymentRequests(pid: string | undefined) {
  const uid = useAuth((s) => s.user?.uid);
  return useCollection<PaymentRequest>(
    uid && pid ? query(collection(db, 'paymentRequests'), where('uid', '==', uid), where('pid', '==', pid)) : null,
    `payreq-${uid}-${pid}`,
  );
}

/** Whether the signed-in user can play this playlist's media. */
export function useHasAccess(pid: string | undefined, playlist: Playlist | null | undefined): { access: boolean; loading: boolean } {
  const role = useAuth((s) => s.role);
  const uid = useAuth((s) => s.user?.uid);
  const grant = useDoc(uid && pid && playlist?.access === 'paid' ? doc(db, 'accessGrants', `${uid}_${pid}`) : null);
  if (!playlist) return { access: false, loading: true };
  if (isAdminRole(role) || playlist.access !== 'paid') return { access: true, loading: false };
  return { access: !!grant.data, loading: grant.loading };
}
