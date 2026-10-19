import { useState } from 'react';
import { doc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { useDoc } from '@/hooks/useFirestore';
import { Button, Card, Icon, Skeleton } from '@/components/ui';
import { FolderChooser, type FolderChoice } from '../../components/FolderChooser';

export function StorageTab({ pid }: { pid: string }) {
  const { user, role } = useAuth();
  const admin = useDoc<{ ownerUid: string; storageFolderName?: string | null; storageFolderId?: string | null }>(doc(db, 'adminPlaylists', pid));
  const settings = useDoc<{ defaultFolderName?: string }>(user ? doc(db, 'adminSettings', user.uid) : null);
  const status = useQuery({ queryKey: ['drive-status'], queryFn: () => api.driveStatus({}) });
  const [moveExisting, setMoveExisting] = useState(false);
  const [busy, setBusy] = useState(false);

  if (admin.loading) return <Skeleton className="h-48 w-full rounded-3xl" />;
  const isOwner = admin.data?.ownerUid === user?.uid || role === 'SUPER_ADMIN';
  const override = admin.data?.storageFolderName;

  const apply = async (c: FolderChoice | null) => {
    setBusy(true);
    try {
      const res = await api.setStorageLocation({ scope: 'playlist', playlistId: pid, ...(c ?? {}), moveExisting });
      toast.success(res.folderName ? `New files will go to “${res.folderName}”${res.moved ? ' (existing files moved)' : ''}` : 'Using your default location');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h2 className="flex items-center gap-2 text-2xl font-semibold"><Icon name="drive" className="text-primary" /> Where this playlist's files live</h2>
        <p className="text-sm text-muted">
          Files are stored in the playlist owner's Google Drive, mirroring the structure: <code className="rounded bg-ink/10 px-1">Root / Playlist / Section / … / Verse / audio|video</code>.
          Learner recordings go to <code className="rounded bg-ink/10 px-1">Playlist / _Learners / Name_id</code>.
        </p>
        <div className="rounded-2xl bg-ink/5 p-4 text-sm">
          <p className="text-muted">Current location</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
            <Icon name="folder" className="text-primary" />
            {override ? `${override} (playlist override)` : `${isOwner ? settings.data?.defaultFolderName ?? 'LearnChants' : 'Owner’s default folder'} (default)`}
          </p>
        </div>
        {!isOwner && <p className="text-sm text-warn">Only the teacher who owns this playlist can change its storage location.</p>}
      </Card>

      {isOwner && (
        <Card className="space-y-4 p-6">
          <h3 className="text-xl font-semibold">Use a different folder for this playlist</h3>
          {status.isLoading ? <Skeleton className="h-20" /> : <FolderChooser mock={!!status.data?.mock} busy={busy} onChoose={(c) => void apply(c)} />}
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
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api.moveStorage({ playlistId: pid });
                  toast.success(r.moved ? 'Existing files moved to the current location' : 'Files are already in the current location');
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Move existing files here now
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
