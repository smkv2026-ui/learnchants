import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorMessage } from '@/lib/errors';
import { isValidUpiId } from '@/lib/upi';
import { useAuth } from '@/stores/auth';
import { toast, useUi } from '@/stores/ui';
import { useDoc } from '@/hooks/useFirestore';
import { Button, Card, Icon, Switch, TextField } from '@/components/ui';
import { AdminHeader } from '../components/AdminLayout';
import { DriveConnect } from '../components/DriveConnect';
import { FolderChooser, type FolderChoice } from '../components/FolderChooser';
import { driveConfigured, useDrive } from '@/lib/media/drive';
import { setDefaultLocation } from '@/lib/ops/storage';

interface Settings {
  defaultFolderName?: string;
  driveStatus?: string;
  displayName?: string;
  upiId?: string;
  payeeName?: string;
}

export default function AdminSettingsPage() {
  const uid = useAuth((s) => s.user?.uid);
  const { theme, setTheme } = useUi();
  const settings = useDoc<Settings>(uid ? doc(db, 'adminSettings', uid) : null);
  const connected = useDrive((s) => !!s.token && s.expiresAt > Date.now());
  const [busy, setBusy] = useState(false);
  const [moveExisting, setMoveExisting] = useState(false);
  const [prefs, setPrefs] = useState({ displayName: '', upiId: '', payeeName: '' });

  useEffect(() => {
    if (settings.data) setPrefs({ displayName: settings.data.displayName ?? '', upiId: settings.data.upiId ?? '', payeeName: settings.data.payeeName ?? '' });
  }, [settings.data]);

  const choose = async (c: FolderChoice) => {
    setBusy(true);
    try {
      const res = await setDefaultLocation(c, moveExisting);
      toast.success(`New uploads will go to “${res.folderName}”${res.moved ? ` (${res.moved} playlist folders moved)` : ''}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    if (!uid) return;
    if (prefs.upiId && !isValidUpiId(prefs.upiId)) return toast.error('Enter a valid UPI ID');
    try {
      await setDoc(doc(db, 'adminSettings', uid), prefs, { merge: true });
      toast.success('Saved');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <AdminHeader title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-2xl font-semibold"><Icon name="drive" className="text-primary" /> Media storage</h2>
          <p className="text-sm text-muted">
            Files are kept in the app's built-in storage (up to 8 MB each) on the free plan. Optionally connect your Google Drive
            (permission <code>drive.file</code>: the app only sees files it creates or that you pick) to store teacher media and archive
            reviewed learner recordings there. Drive files are shared by link with learners who have access; the connection lasts for this browser session.
          </p>
          <DriveConnect />
        </Card>

        {driveConfigured() && (
          <Card className="space-y-5 p-5 sm:p-6">
            <h2 className="text-2xl font-semibold">Default Drive location</h2>
            <div className="rounded-2xl bg-ink/5 p-4">
              <p className="text-sm text-muted">New Drive uploads go to</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold"><Icon name="folder" className="text-primary" /> {settings.data?.defaultFolderName ?? 'LearnChants'} <span className="text-sm font-normal text-muted">/ Playlist / Section / … / Verse</span></p>
            </div>
            {connected ? (
              <>
                <FolderChooser busy={busy} onChoose={(c) => void choose(c)} />
                <Switch checked={moveExisting} onChange={setMoveExisting} label="Move existing files too" description="Off: only new uploads use the new location (playlists with their own folder are not affected)." />
              </>
            ) : (
              <p className="text-sm text-muted">Connect Google Drive to change the location.</p>
            )}
          </Card>
        )}

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold">Profile & UPI defaults</h2>
          <TextField label="Display name" value={prefs.displayName} onChange={(e) => setPrefs((p) => ({ ...p, displayName: e.target.value }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Default UPI ID" value={prefs.upiId} onChange={(e) => setPrefs((p) => ({ ...p, upiId: e.target.value }))} />
            <TextField label="Default payee name" value={prefs.payeeName} onChange={(e) => setPrefs((p) => ({ ...p, payeeName: e.target.value }))} />
          </div>
          <Button onClick={() => void savePrefs()}>Save</Button>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-2xl font-semibold">Appearance</h2>
          <Switch checked={theme === 'dark'} onChange={(v) => setTheme(v ? 'dark' : 'light')} label="Dark theme" />
        </Card>
      </div>
    </>
  );
}
