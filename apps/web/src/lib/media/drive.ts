// Optional Google Drive storage, driven from the teacher's browser (no server).
// The teacher connects Drive for the session with Google Identity Services
// (scope drive.file); uploaded files are shared "anyone with the link" so learners
// can stream them with the API key. File ids are only stored in media docs that
// the Firestore rules reveal to people with access.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { collection, doc, getDoc, query, setDoc, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { resumableUpload } from '@/lib/upload';

const env = import.meta.env;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
export const DEFAULT_ROOT = 'LearnChants';

export function driveConfigured(): boolean {
  return !!(env.VITE_GOOGLE_CLIENT_ID && env.VITE_GOOGLE_API_KEY);
}

export function publicDriveUrl(fileId: string): string {
  return `${API}/files/${encodeURIComponent(fileId)}?alt=media&key=${env.VITE_GOOGLE_API_KEY}`;
}

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

interface DriveState {
  token: string | null;
  expiresAt: number;
  connect: () => Promise<string>;
  disconnect: () => void;
}

/** Session-only Drive access token (never stored). */
export const useDrive = create<DriveState>((set, get) => ({
  token: null,
  expiresAt: 0,
  connect: async () => {
    const s = get();
    if (s.token && s.expiresAt > Date.now() + 60_000) return s.token;
    if (!driveConfigured()) throw new Error('Google Drive is not configured for this site.');
    await loadScript('https://accounts.google.com/gsi/client');
    const token = await new Promise<{ access_token: string; expires_in: number }>((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: env.VITE_GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res: any) => (res.access_token ? resolve(res) : reject(new Error(res.error || 'Drive authorisation cancelled'))),
        error_callback: (e: any) => reject(new Error(e?.message || 'Drive authorisation cancelled')),
      });
      client.requestAccessToken({ prompt: '' });
    });
    set({ token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 });
    return token.access_token;
  },
  disconnect: () => {
    const t = get().token;
    if (t) window.google?.accounts?.oauth2?.revoke?.(t, () => undefined);
    set({ token: null, expiresAt: 0 });
  },
}));

export function driveConnected(): boolean {
  const s = useDrive.getState();
  return !!s.token && s.expiresAt > Date.now() + 30_000;
}

async function token(): Promise<string> {
  return useDrive.getState().connect();
}

async function driveFetch(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${await token()}` } });
  if ((res.status === 429 || res.status >= 500 || res.status === 403) && attempt < 4) {
    const body = res.status === 403 ? await res.clone().text() : '';
    if (res.status !== 403 || /rateLimit/i.test(body)) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 300));
      return driveFetch(url, init, attempt + 1);
    }
  }
  if (res.status === 401) {
    useDrive.setState({ token: null, expiresAt: 0 });
    throw new Error('Drive session expired. Click “Connect Google Drive” again.');
  }
  if (!res.ok) throw new Error(`Google Drive error ${res.status}`);
  return res;
}

const q = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
export const safeName = (n: string, fallback = 'Untitled') =>
  // eslint-disable-next-line no-control-regex -- strip control characters from Drive names
  (n || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 120) || fallback;

export async function findFolder(parentId: string | null, name: string): Promise<{ id: string; name: string } | null> {
  const query_ = `'${q(parentId ?? 'root')}' in parents and name = '${q(safeName(name))}' and mimeType = '${FOLDER}' and trashed = false`;
  const res = await driveFetch(`${API}/files?q=${encodeURIComponent(query_)}&fields=files(id,name)&pageSize=1`);
  const files = (await res.json()).files ?? [];
  return files[0] ?? null;
}

export async function createFolder(name: string, parentId: string | null): Promise<{ id: string; name: string }> {
  const res = await driveFetch(`${API}/files?fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safeName(name), mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  return res.json();
}

async function folderExists(id: string): Promise<{ name: string } | null> {
  try {
    const res = await driveFetch(`${API}/files/${id}?fields=name,trashed,mimeType`);
    const f = await res.json();
    return f.trashed || f.mimeType !== FOLDER ? null : f;
  } catch {
    return null;
  }
}

/** A stable segment of a mirrored path: entity key (ids, survive renames) + display name. */
export type Segment = [key: string, name: string];

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 20).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Idempotently create ``root/seg/...`` (folder ids cached in ``driveFolders``). */
export async function ensureFolderPath(ownerUid: string, rootId: string, segments: Segment[]): Promise<string> {
  let parent = rootId;
  let keyPath = '';
  for (const [key, name] of segments) {
    keyPath = keyPath ? `${keyPath}/${key}` : key;
    const ref = doc(db, 'driveFolders', `${ownerUid}__${await sha(keyPath)}`);
    const cached = await getDoc(ref);
    let id: string | null = null;
    if (cached.exists() && cached.data().parentId === parent) {
      const f = await folderExists(cached.data().folderId);
      if (f) {
        id = cached.data().folderId;
        if (f.name !== safeName(name)) await renameItem(id!, name);
      }
    }
    if (!id) id = (await findFolder(parent, name))?.id ?? (await createFolder(name, parent)).id;
    if (!cached.exists() || cached.data().folderId !== id || cached.data().parentId !== parent) {
      await setDoc(ref, { folderId: id, parentId: parent, keyPath, entityKey: key, ownerUid, name: safeName(name) });
    }
    parent = id!;
  }
  return parent;
}

export async function renameItem(id: string, name: string): Promise<void> {
  await driveFetch(`${API}/files/${id}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safeName(name) }),
  });
}

export async function moveItem(id: string, newParent: string): Promise<void> {
  const f = await (await driveFetch(`${API}/files/${id}?fields=parents`)).json();
  await driveFetch(`${API}/files/${id}?addParents=${newParent}&removeParents=${(f.parents ?? []).join(',')}&fields=id`, { method: 'PATCH' });
}

export async function trashItem(id: string): Promise<void> {
  await driveFetch(`${API}/files/${id}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  }).catch(() => undefined);
}

/** Upload a blob into ``folderId`` (resumable), share it by link, return the file id. */
export async function uploadFile(blob: Blob, folderId: string, name: string, onProgress?: (f: number) => void): Promise<string> {
  const init = await driveFetch(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': blob.type || 'application/octet-stream' },
    body: JSON.stringify({ name: safeName(name, 'file'), parents: [folderId] }),
  });
  const session = init.headers.get('Location');
  if (!session) throw new Error('Google Drive did not return an upload session.');
  const body = await resumableUpload(session, blob, { onProgress });
  const id = JSON.parse(body).id as string;
  await driveFetch(`${API}/files/${id}/permissions?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return id;
}

/** Cached folders for an entity (used to keep Drive names in sync after renames). */
export async function renameEntityFolders(ownerUid: string, entityKey: string, name: string): Promise<void> {
  if (!driveConnected()) return;
  const snap = await getDocs(query(collection(db, 'driveFolders'), where('entityKey', '==', entityKey), where('ownerUid', '==', ownerUid)));
  for (const d of snap.docs) {
    try {
      await renameItem(d.data().folderId, name);
      await setDoc(d.ref, { name: safeName(name) }, { merge: true });
    } catch {
      await deleteDoc(d.ref);
    }
  }
}
