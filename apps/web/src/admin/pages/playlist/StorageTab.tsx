import { useState } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/errors';
import { driveConfigured, useDrive } from '@/lib/media/drive';
import { movePlaylistFiles, setPlaylistLocation, type FolderChoice } from '@/lib/ops/storage';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { useDoc } from '@/hooks/useFirestore';
import { Button, Card, Icon, Skeleton } from '@/components/ui';
import { DriveConnect } from '../../components/DriveConnect';
import { FolderChooser } from '../../components/FolderChooser';

export function StorageTab({ pid }: { pid: string }) {
  const { user, role } = useAuth();
  const admin = useDoc<{ ownerUid: string; storageFolderName?: string | null; storageFolderId?: string | null }>(doc(db, 'adminPlaylists', pid));
  const settings = useDoc<{ defaultFolderName?: string }>(user ? doc(db, 'adminSettings', user.uid) : null);
  const connected = useDrive((s) => !!s.token && s.expiresAt > Date.now());
  const [moveExisting, setMoveExisting] = useState(false);
  const [busy, setBusy] = useState(false);

  if (admin.loading) return <Skeleton className="h-48 w-full rounded-3xl" />;
  const isOwner = admin.data?.ownerUid === user?.uid || role === 'SUPER_ADMIN';
  const override = admin.data?.storageFolderName;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      toast.success(await fn());
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const apply = (c: FolderChoice | null) =>
    run(async () => {
      const res = await setPlaylistLocation(pid, c, moveExisting);
      return res.folderName ? `New files will go to “${res.folderName}”${res.moved ? ' (existing files moved)' : ''}` : 'Using your default location';
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-2xl font-semibold"><Icon name="drive" className="text-primary" /> Where files are stored</h2>
        <p className="text-sm text-muted">
          Without Google Drive, audio, video and PDFs are kept in the app's built-in storage (Firestore, up to 8 MB per file).
          With Drive connected, new teacher uploads go to your Drive, mirroring the structure <code className="rounded bg-ink/10 px-1">Root / Playlist / Section / … / Verse / audio|video</code>,
          and reviewed learner recordings are archived to <code className="rounded bg-ink/10 px-1">Playlist / _Learners / Name_id</code>.
        </p>
        <DriveConnect />
        {driveConfigured() && (
          <div className="rounded-2xl bg-ink/5 p-4 text-sm">
            <p className="text-muted">Drive folder for this playlist</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <Icon name="folder" className="text-primary" />
              {override ? `${override} (playlist override)` : `${settings.data?.defaultFolderName ?? 'LearnChants'} (default)`}
            </p>
          </div>
        )}
      </Card>

      {driveConfigured() && isOwner && (
        <Card className="space-y-4 p-5 sm:p-6">
          <h3 className="text-xl font-semibold">Use a different Drive folder for this playlist</h3>
          {!connected ? (
            <p className="text-sm text-muted">Connect Google Drive first.</p>
          ) : (
            <>
              <FolderChooser busy={busy} onChoose={(c) => void apply(c)} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" checked={moveExisting} onChange={(e) => setMoveExisting(e.target.checked)} />
                <span>
                  Also move existing files
                  <span className="block text-xs text-muted">By default only new uploads use the new location.</span>
                </span>
              </label>
              <div className="flex flex-wrap gap-2 border-t hairline pt-4">
                {override && <Button variant="ghost" disabled={busy} onClick={() => void apply(null)}>Revert to my default location</Button>}
                <Button
                  variant="secondary"
                  icon="refresh"
                  loading={busy}
                  onClick={() => void run(async () => ((await movePlaylistFiles(pid)) ? 'Existing files moved to the current location' : 'Files are already in the current location'))}
                >
                  Move existing files here now
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
      {driveConfigured() && !isOwner && <p className="text-sm text-warn">Only the teacher who created this playlist can change its Drive folder.</p>}
    </div>
  );
}
