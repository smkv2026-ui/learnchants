import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { storageRoot } from '@/lib/media';
import { createFolder, findFolder, moveItem } from '@/lib/media/drive';
import { auditInBatchless, me } from './common';

export interface FolderChoice {
  folderId?: string;
  folderName?: string;
}

async function resolveFolder(c: FolderChoice): Promise<{ id: string; name: string }> {
  if (c.folderId) return { id: c.folderId, name: c.folderName ?? 'Selected folder' };
  if (!c.folderName?.trim()) throw new Error('Choose a folder or enter a folder name.');
  return (await findFolder(null, c.folderName)) ?? (await createFolder(c.folderName, null));
}

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 20).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Move an existing playlist folder (and everything in it) to the current storage root. */
export async function movePlaylistFiles(pid: string): Promise<boolean> {
  const u = me();
  const ref = doc(db, 'driveFolders', `${u.uid}__${await sha(`p:${pid}`)}`);
  const cached = await getDoc(ref);
  if (!cached.exists()) return false;
  const root = await storageRoot(pid);
  if (cached.data().parentId === root) return false;
  await moveItem(cached.data().folderId, root);
  await updateDoc(ref, { parentId: root });
  return true;
}

export async function setDefaultLocation(c: FolderChoice, moveExisting: boolean): Promise<{ folderName: string; moved: number }> {
  const u = me();
  const f = await resolveFolder(c);
  await setDoc(doc(db, 'adminSettings', u.uid), { defaultFolderId: f.id, defaultFolderName: f.name }, { merge: true });
  let moved = 0;
  if (moveExisting) {
    const mine = await getDocs(query(collection(db, 'adminPlaylists'), where('ownerUid', '==', u.uid)));
    for (const p of mine.docs) if (!p.data().storageFolderId && (await movePlaylistFiles(p.id))) moved++;
  }
  await auditInBatchless('storage.default.set', { folderName: f.name });
  return { folderName: f.name, moved };
}

export async function setPlaylistLocation(pid: string, c: FolderChoice | null, moveExisting: boolean): Promise<{ folderName: string | null; moved: boolean }> {
  const f = c ? await resolveFolder(c) : null;
  await updateDoc(doc(db, 'adminPlaylists', pid), { storageFolderId: f?.id ?? null, storageFolderName: f?.name ?? null });
  const moved = moveExisting ? await movePlaylistFiles(pid) : false;
  await auditInBatchless('storage.playlist.set', { pid, folderName: f?.name ?? null });
  return { folderName: f?.name ?? null, moved };
}
